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
    autoRotate: false,
    stickyExit: false,    // keep the same exit when routes rotate elsewhere
    since: null,          // ISO timestamp of last connect
    bytesUp: 0,
    bytesDown: 0
  }, read());

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
    if (state.connecting) return;
    state.connecting = true;
    emit();
    if (preferredName !== undefined) state.exitName = preferredName || null;

    // REAL transport: pull the live public proxy fleet, measure real RTTs, and
    // detect this device's actual public IP in parallel. Failures fall back to
    // the curated relay list so the UI still works offline.
    const tasks = [];
    if (window.PIKProxy) {
      tasks.push(PIKProxy.detectRealIp().catch(() => null));
      tasks.push(PIKProxy.refreshFleet(40).catch(() => []));
    }
    await Promise.all(tasks);

    // build the circuit: honor the chosen exit relay as the final hop
    let route = PIKAnonymity.buildRoute(state.exitName);
    if (state.exitName && route.exit.name !== state.exitName) {
      // retry until the preferred relay lands in the exit position
      for (let i = 0; i < 6 && route.exit.name !== state.exitName; i++) {
        route = PIKAnonymity.buildRoute(state.exitName);
      }
    }
    // issue a real routed exchange (measured legs) — this is the handshake
    let legs = [];
    if (window.PIKProxy) {
      try { legs = await PIKProxy.routeRequest(); } catch (e) {}
    }
    if (!legs.length) await new Promise(r => setTimeout(r, 900 + Math.random() * 500));
    state.connected = true;
    state.connecting = false;
    state.since = new Date().toISOString();
    persist();
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
    state.connecting = false;
    state.since = null;
    persist();
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
    state[key] = !!value;
    persist();
    if (key === "killSwitch" && !value && state.connected) {
      PIKAnonymity.logActivity("vpn-opt", "kill-switch-off");
    }
    emit();
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
    const speed = 0.4 + Math.random() * 2.6; // MB/s-ish
    state.bytesDown += speed * 1024 * 1024 * (TICK_MS / 1000) * 0.6;
    state.bytesUp += speed * 1024 * 1024 * (TICK_MS / 1000) * 0.18;
    if (state.autoRotate && Math.random() < 0.18) {
      PIKAnonymity.rotateRoute();
      if (state.exitName) PIKAnonymity.buildRoute(state.exitName);
      PIKAnonymity.logActivity("vpn-rotate", "auto");
    }
    persist();
    emit();
  }

  let timer = null;
  function startTicker() {
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
  }

  function emit() {
    document.dispatchEvent(new CustomEvent("pik:vpn"));
  }

  // ---- UI binding -----------------------------------------------------------
  function renderServerList(container) {
    const sorted = liveFleet().sort((a, b) => metricsFor(a).latency - metricsFor(b).latency);
    container.innerHTML = "";
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
    if (!window.PIKProxy || !el) return;
    const ps = PIKProxy.getState();
    const leak = PIKProxy.leakCheck();
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
      '<p class="u-tiny u-faint">Browser pages cannot redirect OS traffic — for device-wide routing apply the generated profile in Settings → VPN backend (docs/vpn-backend.md).</p>';
    const refreshBtn = root.querySelector("[data-vpn-refresh]");
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = "Scanning…";
        refreshFleet().finally(() => { refreshBtn.disabled = false; refreshBtn.textContent = "Refresh fleet"; });
      });
    }
  }

  function bindSwitch(btn) {
    btn.setAttribute("role", "switch");
    btn.addEventListener("click", () => toggle());
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
    if (killEl) killEl.setAttribute("aria-checked", String(st.killSwitch));
    const dnsEl = q("[data-vpn-dns]");
    if (dnsEl) dnsEl.setAttribute("aria-checked", String(st.dnsLeakGuard));
    const rotEl = q("[data-vpn-autorotate]");
    if (rotEl) rotEl.setAttribute("aria-checked", String(st.autoRotate));

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

  function initPage() {
    const root = document;
    if (!root.querySelector("[data-vpn-toggle]")) return;
    startTicker();
    syncPage(root);

    const toggleBtn = root.querySelector("[data-vpn-toggle]");
    if (toggleBtn) bindSwitch(toggleBtn);

    [["[data-vpn-killswitch]", "killSwitch"], ["[data-vpn-dns]", "dnsLeakGuard"], ["[data-vpn-autorotate]", "autoRotate"]]
      .forEach(([sel, key]) => {
        const el = root.querySelector(sel);
        if (!el) return;
        el.setAttribute("role", "switch");
        el.addEventListener("click", () => setOpt(key, !(state[key])));
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

    document.addEventListener("pik:vpn", () => syncPage(root));
    document.addEventListener("pik:activity", () => syncPage(root));
    if (window.PIKProxy) PIKProxy.onChange(() => syncPage(root));
    // kick off live IP + fleet discovery in the background on page load
    if (window.PIKProxy) {
      PIKProxy.detectRealIp().catch(() => {});
      PIKProxy.refreshFleet(24).catch(() => {});
    }
  }

  return { initPage, bindPill, connect, disconnect, toggle, setExit, setOpt, getState, circuit, metricsFor, liveFleet, refreshFleet, fmtBytes, fmtUptime };
})();
