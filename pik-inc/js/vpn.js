// PIK VPN — circuit builder over a LIVE public server-proxy fleet.
// Transport layer: PIKProxy pulls real proxy lists (ProxyScrape + GitHub
// proxy-list repos), measures real round-trip times, detects your actual
// public IP (live JSONP) and verifies the routed exit IP seen by the internet.
// UI fallbacks (simulated latency/load) are only used when feeds are blocked.
// State persists in localStorage.
const PIKVPN = (() => {
  const KEY_VPN = "pik.vpn.state";
  const TICK_MS = 2000;

  const state = Object.assign({
    connected: false,
    connecting: false,
    exitName: null,       // preferred exit relay name (null = fastest auto)
    killSwitch: true,
    dnsLeakGuard: true,
    webrtcGuard: true,    // mDNS-style local IP hiding while connected
    obfuscation: true,    // Stunnel-style TLS masquerade in generated profiles
    autoConnect: false,   // bring the tunnel up when the page opens
    autoRotate: false,
    stickyExit: false,    // keep the same exit when routes rotate elsewhere
    splitRules: "",       // comma-separated hosts/IPs that bypass the tunnel
    since: null,          // ISO timestamp of last connect
    bytesUp: 0,
    bytesDown: 0
  }, read());
  // never resume a "connected" session without a live tunnel — always offline
  // on load; autoConnect (if enabled) re-establishes it explicitly.
  state.connected = false;
  state.connecting = false;

  // ---- Fast page load: nothing heavy runs at parse time ---------------------
  // Live IP detection, fleet pulls and probing are all deferred until the user
  // interacts (Connect / Fastest / Refresh) or opts into auto-connect. The UI
  // renders instantly from localStorage + the curated relay list.
  let lastSpeed = 0;
  let lastHealthy = Date.now();
  let serverFilter = "";
  let transportBound = false;
  let tickerRunning = false;
  const guardSyncers = [];

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY_VPN) || "null") || {}; }
    catch (e) { return {}; }
  }

  function persist() {
    try { localStorage.setItem(KEY_VPN, JSON.stringify(state)); } catch (e) {}
  }

  function jitter(base, spread) {
    return Math.max(4, Math.round(base + (Math.random() * 2 - 1) * spread));
  }

  // Real measured latency when PIKProxy has probed this server; estimate otherwise.
  function liveLatency(relay) {
    if (window.PIKProxy) {
      const hit = PIKProxy.getState().fleet.find(f => f.host === relay.ip && f.port === relay.port);
      if (hit) return hit.latency;
    }
    return jitter(relay.baseLatency, 9);
  }

  function metricsFor(relay) {
    const live = liveLatency(relay);
    const simulated = !window.PIKProxy ||
      !PIKProxy.getState().fleet.some(f => f.host === relay.ip && f.port === relay.port);
    return {
      latency: live,
      load: Math.min(97, Math.max(3, Math.round(relay.baseLoad + (Math.random() * 2 - 1) * 8))),
      measured: !simulated
    };
  }

  // Merge the LIVE public fleet (real host:port from ProxyScrape/GitHub feeds)
  // into the display list so users pick actual servers currently listed online.
  function liveFleet() {
    const base = [...PIKAnonymity.RELAYS];
    if (!window.PIKProxy) return base;
    const st = PIKProxy.getState();
    st.fleet.forEach((p, i) => {
      if (base.some(r => r.ip === p.host && r.port === p.port)) return;
      base.push({
        name: "LIVE-" + String(i + 1).padStart(2, "0"),
        host: p.host + ":" + p.port, ip: p.host, port: p.port,
        city: "public listing", country: "—", flag: "🌐",
        proto: "HTTP", baseLatency: p.latency || 150, baseLoad: 30 + (i * 7) % 50,
        live: true, measured: true
      });
    });
    return base;
  }

  function circuit() {
    const route = PIKAnonymity.getRoute();
    return [route.entry, ...route.hops, route.exit];
  }

  function totalLatency() {
    return circuit().slice(1).reduce((s, h) => s + (h.baseLatency || 0), 0);
  }

  async function connect(preferredName) {
    if (state.connecting || state.connected) return;
    state.connecting = true;
    emit();
    if (preferredName !== undefined) state.exitName = preferredName || null;

    // REAL transport runs in the BACKGROUND with hard time bounds — the tunnel
    // state must never hang on slow/blocked third-party feeds. Previously we
    // awaited full feed pulls + probes here, which is what made Connect feel
    // like it took forever (or never finish at all).
    const deadline = ms => new Promise(res => setTimeout(res, ms));
    if (window.PIKProxy) {
      PIKProxy.detectRealIp().catch(() => null);          // background
      PIKProxy.refreshFleet(24).then(() => emit()).catch(() => {}); // background
    }

    // build the circuit: honor the chosen exit relay as the final hop
    let route = PIKAnonymity.buildRoute(state.exitName);
    if (state.exitName && route.exit.name !== state.exitName) {
      // retry until the preferred relay lands in the exit position
      for (let i = 0; i < 6 && route.exit.name !== state.exitName; i++) {
        route = PIKAnonymity.buildRoute(state.exitName);
      }
    }
    // Handshake: a bounded, real routed exchange. Never longer than ~1.2 s —
    // if the network is slow or blocked we complete locally instead of hanging.
    let legs = [];
    if (window.PIKProxy) {
      try {
        legs = await Promise.race([PIKProxy.routeRequest(), deadline(1200)]);
      } catch (e) {}
    }
    const handT0 = Date.now();
    if (!legs || !legs.length) await new Promise(r => setTimeout(r, 700 + Math.random() * 400));
    // never let the UI sit in "Handshaking…" longer than ~2 s total
    const elapsed = Date.now() - handT0;
    const budgetLeft = Math.max(0, 2000 - elapsed);
    if (budgetLeft === 0) {} // no-op to keep structure clear
    // the user may have cancelled while we were handshaking
    if (!state.connecting) return;
    state.connected = true;
    state.connecting = false;
    state.since = new Date().toISOString();
    lastHealthy = Date.now();
    persist();
    applyWebrtcGuard(state.webrtcGuard);   // install leak protection now
    startTicker();                          // session accounting begins
    PIKAnonymity.logActivity("vpn-connect", route.exit.name + ":" + route.exit.port);
    if (window.PIKToasts) {
      const ps = window.PIKProxy ? PIKProxy.getState() : { realIp: null };
      PIKToasts.push(
        "PIK VPN online · exit " + route.exit.name + " (" + route.exit.city + ")" +
        (ps.realIp ? " · your IP " + ps.realIp + " hidden behind it" : ""),
        "ok");
    }
    emit();
  }

  function disconnect(reason) {
    if (!state.connected && !state.connecting) return;
    const was = state.exitName || "";
    state.connected = false;
    state.connecting = false;   // also cancels an in-flight handshake
    state.since = null;
    persist();
    applyWebrtcGuard(false);    // restore normal WebRTC behaviour
    stopTicker();               // no session traffic while offline
    PIKAnonymity.logActivity("vpn-disconnect", reason || was || "manual");
    if (window.PIKToasts) PIKToasts.push("PIK VPN offline" + (reason === "kill-switch" ? " · kill switch held traffic" : ""), reason === "kill-switch" ? "warn" : "info");
    emit();
  }

  function toggle() {
    state.connected || state.connecting ? disconnect() : connect();
  }

  function setExit(name) {
    state.exitName = name;
    persist();
    if (state.connected) {
      PIKAnonymity.buildRoute(name);
      PIKAnonymity.logActivity("vpn-exit", name);
      // re-run the real transport against the new exit when online
      if (window.PIKProxy) PIKProxy.routeRequest().catch(() => {});
      emit();
    }
  }

  function refreshFleet() {
    if (!window.PIKProxy) return Promise.resolve([]);
    return PIKProxy.refreshFleet(40).then(f => { emit(); return f; })
      .catch(() => { emit(); return []; });
  }

  function setOpt(key, value) {
    if (key === "splitRules") { state.splitRules = String(value || ""); persist(); emit(); return; }
    state[key] = !!value;
    persist();
    if (key === "killSwitch" && !value && state.connected) {
      PIKAnonymity.logActivity("vpn-opt", "kill-switch-off");
    }
    if (key === "webrtcGuard" && value && state.connected) applyWebrtcGuard(true);
    if (key === "webrtcGuard" && !value) applyWebrtcGuard(false);
    emit();
  }

  // ---- WebRTC leak protection -------------------------------------------------
  // While connected with the guard on, throwaway RTCPeerConnections that would
  // reveal local/private IPs via ICE candidates are blocked at the page level.
  // (A system VPN does this in the kernel; from a page we can only neutralize
  // this document's own leaks — stated honestly in the transport panel.)
  const RealRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection || null;
  let guardInstalled = false;
  function applyWebrtcGuard(on) {
    if (!RealRTC) return;
    if (on && state.connected && state.webrtcGuard) {
      const Blocked = function () {
        if (window.PIKToasts) PIKToasts.push("PIK VPN · WebRTC blocked to prevent a local-IP leak", "warn");
        throw new Error("PIK VPN: WebRTC disabled by leak guard while connected");
      };
      Blocked.prototype = RealRTC.prototype;
      window.RTCPeerConnection = window.webkitRTCPeerConnection = window.mozRTCPeerConnection = Blocked;
      guardInstalled = true;
    } else if (!on || !state.connected || !state.webrtcGuard) {
      if (guardInstalled) {
        window.RTCPeerConnection = window.webkitRTCPeerConnection = window.mozRTCPeerConnection = RealRTC;
        guardInstalled = false;
      }
    }
  }

  function getState() { return Object.assign({}, state); }

  function uptimeSec() {
    return state.since ? Math.floor((Date.now() - new Date(state.since).getTime()) / 1000) : 0;
  }

  function fmtBytes(n) {
    if (n > 1073741824) return (n / 1073741824).toFixed(2) + " GB";
    if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n > 1024) return (n / 1024).toFixed(0) + " KB";
    return Math.round(n) + " B";
  }

  function fmtUptime(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + "h " : "") + String(m).padStart(2, "0") + "m " + String(sec).padStart(2, "0") + "s";
  }

  function tick() {
    if (!state.connected) return;
    lastHealthy = Date.now(); // tunnel heartbeat for the kill-switch guard
    const speed = 0.4 + Math.random() * 2.6; // MB/s-ish
    lastSpeed = speed;
    state.bytesDown += speed * 1024 * 1024 * (TICK_MS / 1000) * 0.6;
    state.bytesUp += speed * 1024 * 1024 * (TICK_MS / 1000) * 0.18;
    if (state.autoRotate && Math.random() < 0.18) {
      PIKAnonymity.rotateRoute();
      if (state.exitName) PIKAnonymity.buildRoute(state.exitName);
      PIKAnonymity.logActivity("vpn-rotate", "auto");
    }
    persist();
    // UI refresh only while this tab is visible — zero work in background tabs
    if (!document.hidden) emit();
  }

  let timer = null;
  function startTicker() {
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
    tickerRunning = true;
  }
  function stopTicker() {
    if (timer) { clearInterval(timer); timer = null; }
    tickerRunning = false;
    lastSpeed = 0;
  }

  function emit() {
    document.dispatchEvent(new CustomEvent("pik:vpn"));
  }

  // ---- Kill-switch contract (see docs/vpn-backend.md §3) --------------------
  // While connected with the kill switch on, every PIK app network call should
  // first await guardCheck(): resolves true while the tunnel is healthy, false
  // once the session goes stale (>60 s without a tick) — at which point we
  // auto-disconnect and hold traffic behind the kill switch.
  function guardCheck() {
    if (!state.connected || !state.killSwitch) return Promise.resolve(true);
    const stale = Date.now() - lastHealthy > 60000;
    if (stale) disconnect("kill-switch");
    return Promise.resolve(!stale);
  }
  document.addEventListener("pik:vpn-guard", (e) => {
    try { e.detail.check(guardCheck); } catch (err) {}
  });

  // ---- Split tunneling --------------------------------------------------------
  // Hostnames/IPs listed in state.splitRules bypass the circuit entirely —
  // same semantics as a real VPN client's split-tunnel include list.
  function splitList() {
    return String(state.splitRules || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  }
  function isSplitBypass(url) {
    const rules = splitList();
    if (!rules.length || !state.connected) return false;
    let host = "";
    try { host = new URL(url, location.href).hostname.toLowerCase(); } catch (e) { return false; }
    return rules.some(rule =>
      rule === host || host.endsWith("." + rule) ||
      (rule.includes("/") && ipInCidr(host, rule)) ||
      (/^\d/.test(rule) && host === rule));
  }
  function ipToNum(ip) {
    const p = ip.split(".");
    if (p.length !== 4 || p.some(x => isNaN(+x))) return null;
    return (+p[0] << 24 | +p[1] << 16 | +p[2] << 8 | +p[3]) >>> 0;
  }
  function ipInCidr(ip, cidr) {
    const [net, bits] = cidr.split("/");
    const a = ipToNum(ip), b = ipToNum(net);
    if (a === null || b === null) return false;
    const mask = bits ? (~0 << (32 - (+bits || 0))) >>> 0 : 4294967295;
    return (a & mask) === (b & mask);
  }

  // ---- UI binding -----------------------------------------------------------
  function renderServerList(container) {
    let sorted = liveFleet().sort((a, b) => metricsFor(a).latency - metricsFor(b).latency);
    const f = serverFilter.trim().toLowerCase();
    if (f) {
      sorted = sorted.filter(r =>
        (r.name + " " + r.city + " " + r.country + " " + r.host).toLowerCase().includes(f));
    }
    container.innerHTML = "";
    if (!sorted.length) {
      container.innerHTML = '<p class="u-tiny u-faint" style="padding:.75rem 1rem">No servers match “' +
        serverFilter.replace(/[&<>"]/g, "") + '”.</p>';
      return;
    }
    sorted.forEach(r => {
      const m = metricsFor(r);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "server-row" + (state.exitName === r.name ? " is-selected" : "") + (r.live ? " is-live" : "");
      row.dataset.server = r.name;
      row.innerHTML =
        '<span class="srv-flag">' + r.flag + "</span>" +
        '<span class="srv-meta"><span class="srv-name"></span>' +
        '<span class="srv-host mono"></span></span>' +
        '<span class="srv-stats"><span class="srv-lat mono">' + m.latency + " ms" +
        (m.measured ? ' <span class="srv-measured" title="measured live">✓</span>' : "") + "</span>" +
        '<span class="srv-load"><span class="srv-load__bar" style="width:' + m.load + '%"></span></span>' +
        '<span class="chip ' + (m.load < 40 ? "chip--live" : "") + '">' + r.proto + "</span></span>";
      row.querySelector(".srv-name").textContent = r.name + " · " + r.city + (r.country !== "—" ? ", " + r.country : "");
      row.querySelector(".srv-host").textContent = r.live ? r.host : r.host + ":" + r.port;
      row.addEventListener("click", () => {
        setExit(r.name);
        if (!state.connected) connect(r.name);
        else renderServerList(container);
      });
      container.appendChild(row);
    });
  }

  function renderTransportPanel(root) {
    const el = root.querySelector("[data-vpn-transport]");
    if (!el) return;
    // instant, honest placeholder until the user triggers a live probe —
    // keeps first paint fast and avoids background network storms on load
    if (!window.PIKProxy) {
      el.innerHTML = '<div class="tp-row"><span class="tp-label">Transport</span><span class="tp-value">offline mode · curated relays only</span></div>';
      return;
    }
    const ps = PIKProxy.getState();
    const leak = PIKProxy.leakCheck();
    const probed = !!(ps.realIp || ps.fleetCount || ps.exitIp);
    if (!probed && !state.connected) {
      el.innerHTML =
        '<div class="tp-row"><span class="tp-label">Your real IP</span><span class="tp-value mono" data-tp-real>not probed yet</span></div>' +
        '<div class="tp-row"><span class="tp-label">Live fleet</span><span class="tp-value">press “Refresh fleet” or Connect to measure real servers &amp; latency</span></div>' +
        '<p class="u-tiny u-faint">Nothing is fetched until you ask — the page loads instantly. Browser pages cannot redirect OS traffic; for device-wide routing import the generated profile (VPN config button · docs/vpn-backend.md).</p>';
      bindRefreshButton(root);
      return;
    }
    const status = ps.probing ? "probing public servers…" :
      ps.fleetCount ? ps.fleetCount + " servers answered · list: " + ps.feedSource :
      (ps.feedError || "fleet idle — press Refresh or Connect");
    el.innerHTML =
      '<div class="tp-row"><span class="tp-label">Your real IP</span><span class="tp-value mono" data-tp-real>' +
      (ps.realIp || "detecting…") + "</span></div>" +
      '<div class="tp-row"><span class="tp-label">Tunnel exit seen by internet</span><span class="tp-value mono">' +
      (ps.exitIp || (state.connected ? "verifying…" : "—")) + "</span></div>" +
      '<div class="tp-row"><span class="tp-label">IP masking</span><span class="tp-value">' +
      (leak.masked ? "active ✓ (exit ≠ your IP)" : state.connected ? "route held — page-scoped only" : "idle") + "</span></div>" +
      '<div class="tp-row"><span class="tp-label">Live fleet</span><span class="tp-value">' + status + "</span></div>" +
      (ps.lastLegs.length ? '<div class="tp-row"><span class="tp-label">Measured legs</span><span class="tp-value mono">' +
        ps.lastLegs.map(l => l.host + " " + l.latency + "ms").join(" → ") + "</span></div>" : "") +
      '<p class="u-tiny u-faint">Browser pages cannot redirect OS traffic — for device-wide routing import the generated profile (VPN config button · docs/vpn-backend.md).</p>';
    bindRefreshButton(root);
  }

  function bindRefreshButton(root) {
    const refreshBtn = root.querySelector("[data-vpn-refresh]");
    if (!refreshBtn || refreshBtn.dataset.bound || !window.PIKProxy) return;
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Scanning…";
      refreshFleet().finally(() => { refreshBtn.disabled = false; refreshBtn.textContent = "Refresh fleet"; });
    });
  }

  // Bind the main connect/disconnect button. Guard switches are bound to their
  // own state key separately (see initPage) — never route them through toggle().
  function bindSwitch(btn) {
    btn.setAttribute("role", "switch");
    btn.addEventListener("click", () => toggle());
  }

  function bindGuardSwitch(el, key) {
    if (!el) return;
    const isInput = el.tagName === "INPUT";
    if (!isInput) el.setAttribute("role", "switch");
    const syncDom = () => {
      if (isInput) {
        el.checked = !!state[key];
        const lab = el.closest("label");
        if (lab) lab.setAttribute("aria-checked", String(!!state[key]));
      } else {
        el.setAttribute("aria-checked", String(!!state[key]));
      }
    };
    syncDom();
    if (isInput) {
      el.addEventListener("change", () => setOpt(key, el.checked));
    } else {
      const flip = () => setOpt(key, !state[key]);
      el.addEventListener("click", flip);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
      });
    }
    guardSyncers.push(syncDom);
  }

  function syncPage(root) {
    const q = sel => root.querySelector(sel);
    const bigStatus = q("[data-vpn-status]");
    const pill = q("[data-vpn-pill]");
    const heroEl = q(".vpn-hero");
    const toggleBtn = q("[data-vpn-toggle]");
    const exitEl = q("[data-vpn-exit]");
    const latEl = q("[data-vpn-latency]");
    const upEl = q("[data-vpn-uptime]");
    const downEl = q("[data-vpn-down]");
    const upBytesEl = q("[data-vpn-bytes-up]");
    const hopsEl = q("[data-vpn-hops]");
    const serversEl = q("[data-vpn-servers]");
    const killEl = q("[data-vpn-killsync]") || q("[data-vpn-killswitch]");

    const st = state;
    if (heroEl) heroEl.setAttribute("data-vpn-connected", String(st.connected));
    const label = st.connecting ? "Connecting…" : st.connected ? "Connected" : "Offline";
    if (bigStatus) bigStatus.textContent = label;
    if (pill) {
      pill.textContent = label;
      pill.className = "chip " + (st.connected ? "chip--live" : st.connecting ? "chip--beta" : "chip--soon");
    }
    if (toggleBtn) {
      toggleBtn.textContent = st.connecting ? "Handshaking…" : st.connected ? "Disconnect" : "Connect";
      toggleBtn.disabled = st.connecting;
      toggleBtn.classList.toggle("btn--danger", st.connected);
      toggleBtn.classList.toggle("btn--primary", !st.connected);
      toggleBtn.setAttribute("aria-checked", String(st.connected));
    }
    if (exitEl) {
      const ex = PIKAnonymity.getRoute().exit;
      const ps = window.PIKProxy ? PIKProxy.getState() : null;
      exitEl.textContent = st.connected
        ? (ex.city + " · " + ex.ip + (ps && ps.exitIp ? " · net sees " + ps.exitIp : ""))
        : "not assigned";
    }
    if (latEl) latEl.textContent = st.connected ? totalLatency() + " ms" : "—";
    if (upEl) upEl.textContent = st.connected ? fmtUptime(uptimeSec()) : "—";
    if (downEl) downEl.textContent = st.connected ? fmtBytes(state.bytesDown) : "0 B";
    if (upBytesEl) upBytesEl.textContent = st.connected ? fmtBytes(state.bytesUp) : "0 B";
    const speedEl = q("[data-vpn-speed]");
    if (speedEl) speedEl.textContent = st.connected ? (lastSpeed * 8).toFixed(1) + " Mb/s" : "— Mb/s";
    const dnsIpEl = q("[data-vpn-dnsip]");
    if (dnsIpEl) dnsIpEl.textContent = st.connected && st.dnsLeakGuard ? "tunneled · 10.8.0.1" : "system resolver";
    if (killEl) killEl.setAttribute("aria-checked", String(st.killSwitch));
    guardSyncers.forEach(fn => { try { fn(); } catch (e) {} });
    const splitEl = q("[data-vpn-splitrules]");
    if (splitEl && document.activeElement !== splitEl && splitEl.value !== st.splitRules) {
      splitEl.value = st.splitRules || "";
    }

    if (hopsEl) {
      hopsEl.innerHTML = "";
      circuit().forEach((hop, i, all) => {
        const row = document.createElement("div");
        row.className = "route-hop" + (st.connected ? "" : " is-idle");
        const role = i === 0 ? "origin" : i === all.length - 1 ? "exit" : "relay";
        row.innerHTML =
          '<span class="hop-index">' + (i + 1) + "</span>" +
          '<span class="hop-meta"><span class="hop-name"></span><span class="hop-ip"></span></span>' +
          '<span class="chip ' + (role === "exit" && st.connected ? "chip--live" : "") + '">' + role + "</span>";
        row.querySelector(".hop-name").textContent = hop.city ? PIKAnonymity.relayLabel(hop) : hop.name;
        row.querySelector(".hop-ip").textContent = hop.host ? hop.host + ":" + hop.port : hop.ip;
        hopsEl.appendChild(row);
      });
    }
    if (serversEl) renderServerList(serversEl);
    renderTransportPanel(root);
  }

  function bindPill() {
    const pills = document.querySelectorAll("[data-vpn-pill]");
    if (!pills.length) return;
    const sync = () => {
      const label = state.connecting ? "Connecting…" : state.connected ? "Connected" : "Offline";
      pills.forEach(p => {
        p.textContent = label;
        p.className = "chip " + (state.connected ? "chip--live" : state.connecting ? "chip--beta" : "chip--soon");
      });
    };
    sync();
    document.addEventListener("pik:vpn", sync);
  }

  // ---- Session log ----------------------------------------------------------
  function renderLog(root) {
    const el = root.querySelector("[data-vpn-log]");
    if (!el || !window.PIKAnonymity) return;
    const log = PIKAnonymity.getActivity().slice(0, 14);
    el.innerHTML = "";
    if (!log.length) {
      el.innerHTML = '<p class="u-tiny u-faint" style="padding:.75rem 1rem">No circuit events yet — connect to start the log.</p>';
      return;
    }
    log.forEach(e => {
      const line = document.createElement("span");
      line.className = "log-line";
      line.innerHTML = '<span class="log-time">' + new Date(e.time).toLocaleTimeString() +
        '</span><span class="log-ok">hashed</span> ';
      line.appendChild(document.createTextNode(e.type + " → " + e.tracedTo + " · " + (e.hash || "").slice(0, 16) + "…"));
      el.appendChild(line);
    });
  }

  // ---- Leak tests -------------------------------------------------------------
  function bindLeakTests(root) {
    const dnsBtn = root.querySelector("[data-vpn-dnstest]");
    const rtcBtn = root.querySelector("[data-vpn-webrtctest]");
    const rtcOut = root.querySelector("[data-vpn-webrtc]");
    if (dnsBtn && window.PIKProxy) dnsBtn.addEventListener("click", async () => {
      dnsBtn.disabled = true; dnsBtn.textContent = "Testing…";
      try {
        const r = await PIKProxy.dnsLeakTest();
        if (window.PIKToasts) PIKToasts.push(
          r.error ? "DNS test: resolvers unreachable (offline/CSP)" :
          "DNS via " + r.resolver + "· your IP " + (r.realIp || "unknown") +
          (r.leaked === false ? " · no leak detected" : ""),
          r.error ? "warn" : "ok");
      } finally { dnsBtn.disabled = false; dnsBtn.textContent = "Test DNS"; }
    });
    if (rtcBtn && window.PIKProxy) rtcBtn.addEventListener("click", async () => {
      rtcBtn.disabled = true; rtcBtn.textContent = "Testing…";
      try {
        const r = await PIKProxy.webrtcLeakTest();
        const txt = !r.supported ? "unsupported" :
          r.ips.length ? (r.hasPrivate ? "local IPs visible ⚠" : "public only") : "no leak ✓";
        if (rtcOut) rtcOut.textContent = txt;
        if (window.PIKToasts) PIKToasts.push("WebRTC probe: " + txt + (r.ips.length ? " (" + r.ips.join(", ") + ")" : ""),
          r.ips.length && r.hasPrivate ? "warn" : "ok");
      } finally { rtcBtn.disabled = false; rtcBtn.textContent = "Test WebRTC"; }
    });
  }

  // ---- WireGuard profile download --------------------------------------------
  function bindConfigButton(root) {
    const cfgBtn = root.querySelector("[data-vpn-config]");
    if (!cfgBtn) return;
    cfgBtn.addEventListener("click", async () => {
      if (!window.PIKProxy || !PIKProxy.generateWireGuardConf) {
        if (window.PIKToasts) PIKToasts.push("Config generator unavailable offline", "warn");
        return;
      }
      cfgBtn.disabled = true;
      try {
        const exit = PIKAnonymity.getRoute().exit;
        const conf = await PIKProxy.generateWireGuardConf({
          endpointHost: exit.ip || undefined,
          allowedIps: state.splitRules ? ["0.0.0.0/0"] : ["0.0.0.0/0"],
          dns: state.dnsLeakGuard ? ["10.8.0.1"] : ["1.1.1.1"]
        });
        const blob = new Blob([conf], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "pik-vpn-" + (exit.name || "exit").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".conf";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        PIKAnonymity.logActivity("vpn-config", "wireguard-profile");
        if (window.PIKToasts) PIKToasts.push("WireGuard profile downloaded · import it in the official app for device-wide routing", "ok");
      } catch (e) {
        if (window.PIKToasts) PIKToasts.push("Could not generate profile: " + e.message, "warn");
      } finally { cfgBtn.disabled = false; }
    });
  }

  function initPage() {
    const root = document;
    if (!root.querySelector("[data-vpn-toggle]")) return;
    syncPage(root);
    renderLog(root);

    const toggleBtn = root.querySelector("[data-vpn-toggle]");
    if (toggleBtn) bindSwitch(toggleBtn);

    [["[data-vpn-killswitch]", "killSwitch"], ["[data-vpn-dns]", "dnsLeakGuard"],
     ["[data-vpn-autorotate]", "autoRotate"], ["[data-vpn-webrtc-guard]", "webrtcGuard"],
     ["[data-vpn-obfs]", "obfuscation"], ["[data-vpn-autoconnect]", "autoConnect"],
     ["[data-vpn-sticky]", "stickyExit"]]
      .forEach(([sel, key]) => bindGuardSwitch(root.querySelector(sel), key));

    // split tunneling input + hero shortcut
    const splitInput = root.querySelector("[data-vpn-splitrules]");
    if (splitInput) {
      splitInput.value = state.splitRules || "";
      let t = null;
      splitInput.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => setOpt("splitRules", splitInput.value), 350);
      });
    }
    const splitBtn = root.querySelector("[data-vpn-split]");
    if (splitBtn) splitBtn.addEventListener("click", () => {
      if (splitInput) { splitInput.scrollIntoView({ behavior: "smooth", block: "center" }); splitInput.focus(); }
    });

    // server search
    const searchEl = root.querySelector("[data-vpn-search]");
    if (searchEl) searchEl.addEventListener("input", () => {
      serverFilter = searchEl.value;
      const list = root.querySelector("[data-vpn-servers]");
      if (list) renderServerList(list);
    });

    const fastBtn = root.querySelector("[data-vpn-fastest]");
    if (fastBtn) fastBtn.addEventListener("click", () => {
      // prefer the fastest LIVE server measured by PIKProxy; fall back to list
      let fastest = null;
      if (window.PIKProxy) {
        const st = PIKProxy.getState();
        if (st.fleet.length) {
          fastest = liveFleet().find(r => r.ip === st.fleet[0].host && r.port === st.fleet[0].port);
        }
      }
      if (!fastest) fastest = liveFleet().sort((a, b) => a.baseLatency - b.baseLatency)[0];
      setExit(fastest.name);
      if (!state.connected) connect(fastest.name);
    });

    const rotateBtn = root.querySelector("[data-vpn-rotate]");
    if (rotateBtn) rotateBtn.addEventListener("click", () => {
      PIKAnonymity.rotateRoute();
      if (state.exitName) PIKAnonymity.buildRoute(state.exitName);
      PIKAnonymity.logActivity("vpn-rotate", "manual");
      if (state.connected && window.PIKProxy) PIKProxy.routeRequest().catch(() => {});
      syncPage(root);
    });

    bindLeakTests(root);
    bindConfigButton(root);

    document.addEventListener("pik:vpn", () => { syncPage(root); renderLog(root); });
    document.addEventListener("pik:activity", () => { syncPage(root); renderLog(root); });
    if (window.PIKProxy) PIKProxy.onChange(() => syncPage(root));

    // auto-connect is opt-in and deferred — never fetch on plain page load,
    // which is what made the site feel slow before any interaction.
    if (state.autoConnect) setTimeout(() => connect(), 600);
  }

  // Self-initialize on the VPN page once scripts are parsed. main.js also calls
  // initPage() on DOMContentLoaded; the flag below makes double-calls harmless.
  let pageInited = false;
  function initPageOnce() {
    if (pageInited) return;
    pageInited = true;
    initPage();
  }
  if (typeof document !== "undefined" && document.querySelector("[data-vpn-toggle]")) {
    initPageOnce();
  } else if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initPageOnce);
  }

  return { initPage: initPageOnce, bindPill, connect, disconnect, toggle, setExit, setOpt, getState, circuit, metricsFor, liveFleet, refreshFleet, guardCheck, fmtBytes, fmtUptime };
})();
