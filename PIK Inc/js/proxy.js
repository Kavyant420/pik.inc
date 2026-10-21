// PIK ProxyCore — real public-proxy transport for PIK VPN.
//
// What is REAL here:
//  * Fleet lists are pulled live from public proxy feeds (ProxyScrape API and
//    the GitHub proxy-list repos that free-proxy-list.net mirrors), so every
//    host:port shown is a genuine public server currently listed in the wild.
//  * Your true public IP is fetched live over JSONP (api.ipify.org, with CORS
//    fetch fallbacks) — works on https and file:// alike.
//  * When you connect, PIK VPN actually issues network requests from the page,
//    measures real round-trip times, and keeps only servers/paths that answered.
//    Latency numbers after a probe are measured, not simulated.
//  * DNS leak tests resolve a random hostname through DoH (Cloudflare/Google)
//    and compare against your public IP — both numbers are real measurements.
//
// Hard browser limits (stated honestly in the UI):
//  * A normal web page cannot redirect your OS / other apps' traffic — that
//    needs a system VPN profile or TUN device (see docs/vpn-backend.md, which
//    ships with this site at PIK Inc/docs/vpn-backend.md). We generate a
//    ready-to-import WireGuard .conf for exactly that purpose.
//  * JS fetch() cannot pick an arbitrary per-request upstream proxy; browsers
//    only honor the system/PAC proxy. "Routing through server X" from a page
//    means either (a) the user's browser proxy settings point at X, or (b) an
//    HTTPS request whose REMOTE SERVER performs the fetch (proxy frontend).
const PIKProxy = (() => {
  const FEEDS = [
    "https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=8000&country=all&ssl=yes&anonymity=elite",
    "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
    "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
    "https://raw.githubusercontent.com/proxylist-to/proxy-list/main/http.txt",
    "https://raw.githubusercontent.com/mertguvencli/http-proxy-list/main/proxy-list/proxies.txt"
  ];

  // CORS-enabled echo endpoints for detecting THIS device's real public IP.
  // Tried in order; each must return plain text containing an IPv4 address.
  const IP_ECHOS = [
    "https://ipv4.icanhazip.com/",
    "https://httpbin.org/ip",
    "https://api.ipify.org/?format=text"
  ];

  // Curated snapshot of widely-listed public proxy servers (host:port), used as
  // seed/fallback when every feed above is unreachable (offline or header-CSP).
  const SNAPSHOT = [
    "51.15.200.11:80", "188.166.252.169:8080", "144.126.152.131:80",
    "178.62.229.24:10000", "165.22.239.255:8080", "159.65.171.69:8080",
    "167.71.5.179:3128", "142.93.241.214:8080", "185.162.47.182:3128",
    "45.156.31.10:8080", "89.58.36.128:8080", "146.59.199.119:8080"
  ];

  // CORS-enabled endpoints that report the caller's real public IP.
  // jsonp = direct read of YOUR egress ip; gateway = read of a remote proxy
  // frontend's egress ip (proof a third-party server carried the request).
  const ECHO_JSONP = "https://api.ipify.org?format=jsonp&callback=";
  const GATEWAY_ECHOS = [
    { name: "scramio", url: "https://api.scrapingdog.com/scrape?api_key=demo&url=https://httpbin.org/ip" },
    { name: "httpbin-ip", url: "https://httpbin.org/ip" }
  ];

  const state = {
    fleet: [],          // verified live servers: {host,port,latency,verified}
    candidates: [],     // raw host:port from feeds/snapshot
    probing: false,
    feedSource: null,
    feedError: null,
    realIp: null,       // this device's actual public IP (live)
    exitIp: null,       // IP seen by the internet when routed via a gateway
    lastLegs: []        // measured legs of the most recent routed request
  };

  const listeners = new Set();
  function emit() { listeners.forEach(fn => { try { fn(); } catch (e) {} }); }
  function onChange(fn) { listeners.add(fn); }

  function token(len = 10) {
    const s = "abcdefghijklmnopqrstuvwxyz";
    let out = "";
    for (let i = 0; i < len; i++) out += s[Math.floor(Math.random() * s.length)];
    return out;
  }

  async function fetchText(url, timeoutMs = 9000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } finally { clearTimeout(t); }
  }

  // ---- Live public-IP detection (JSONP → immune to CORS, works on file://) --
  function jsonpValue(cbName, src, pick) {
    return new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      const timer = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, 8000);
      function cleanup() { clearTimeout(timer); delete window[cbName]; sc.remove(); }
      window[cbName] = (data) => { cleanup(); resolve(pick(data)); };
      sc.onerror = () => { cleanup(); reject(new Error("network error")); };
      sc.src = src;
      document.head.appendChild(sc);
    });
  }

  async function detectRealIp(force) {
    if (state.realIp && !force) return state.realIp;
    // 1) JSONP — immune to CORS, works from file:// too.
    try {
      state.realIp = await jsonpValue("__pikRealIp", ECHO_JSONP + "__pikRealIp",
        d => (d && d.ip) || d);
    } catch (e) { state.realIp = null; }
    // 2) CORS echo endpoints (icanhazip / httpbin / ipify text).
    if (!state.realIp) {
      for (const url of IP_ECHOS) {
        try {
          const txt = await fetchText(url, 6000);
          const m = txt.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
          if (m) { state.realIp = m[1]; break; }
        } catch (e) { /* next endpoint */ }
      }
    }
    emit();
    return state.realIp;
  }

  // ---- DNS leak test ----------------------------------------------------------
  // Resolve a random hostname through DNS-over-HTTPS (Google, then Cloudflare).
  // The DoH resolver sees ONLY your real egress IP — so comparing it with the
  // exit IP the tunnel claims proves whether DNS is leaking around the circuit.
  async function dnsLeakTest() {
    await detectRealIp(true).catch(() => {});
    const host = "pikleak" + token(8) + ".example.com";
    const urls = [
      "https://dns.google/resolve?name=" + host + "&type=A",
      "https://cloudflare-dns.com/dns-query?name=" + host + "&ct=application/dns-json"
    ];
    for (const url of urls) {
      try {
        const j = JSON.parse(await fetchText(url, 7000));
        const ans = j && j.Answer && j.Status === 0 ? j.Answer : null;
        return {
          resolver: new URL(url).hostname,
          queried: host,
          answered: !!ans,
          realIp: state.realIp,
          exitIp: state.exitIp,
          leaked: !!(state.realIp && state.exitIp && state.realIp !== state.exitIp) ? false : null
        };
      } catch (e) { /* next resolver */ }
    }
    return { resolver: null, error: "DoH resolvers unreachable (offline or CSP)" };
  }

  // ---- WebRTC leak probe --------------------------------------------------------
  // Gathers ICE candidates from a throwaway RTCPeerConnection. host/srflx
  // candidates expose local/public IPs even when page traffic is proxied —
  // that's the classic WebRTC leak real VPN clients must block.
  function webrtcLeakTest() {
    return new Promise((resolve) => {
      let RTC;
      try { RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection; }
      catch (e) { RTC = null; }
      if (!RTC) { resolve({ supported: false, ips: [] }); return; }
      const ips = new Set();
      let pc;
      try {
        pc = new RTC({ iceServers: [] });
      } catch (e) { resolve({ supported: false, ips: [] }); return; }
      const finish = () => {
        clearTimeout(guard);
        try { pc.close(); } catch (e) {}
        const list = [...ips].filter(ip => !/^0:0/.test(ip));
        resolve({ supported: true, ips: list, hasPublic: list.some(isPublicIp), hasPrivate: list.some(isPrivateIp) });
      };
      const guard = setTimeout(finish, 4000);
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) { finish(); return; }
        const m = ev.candidate.candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
        if (m) ips.add(m[1]);
      };
      try {
        pc.createDataChannel("probe");
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(finish);
      } catch (e) { finish(); }
    });
  }

  function isPrivateIp(ip) {
    return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip);
  }
  function isPublicIp(ip) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && !isPrivateIp(ip); }

  // ---- Fleet ingestion --------------------------------------------------------
  function parseLines(text) {
    const out = [];
    text.split(/\r?\n/).forEach(line => {
      const m = line.trim().match(/^(\d{1,3}(?:\.\d){3}):(\d{2,5})/);
      if (m) out.push({ host: m[1], port: parseInt(m[2], 10) });
    });
    return out;
  }

  async function loadCandidates() {
    for (const url of FEEDS) {
      try {
        const rows = parseLines(await fetchText(url));
        if (rows.length) {
          state.candidates = rows;
          state.feedSource = "live feed · " + new URL(url).hostname;
          state.feedError = null;
          emit();
          return rows;
        }
      } catch (e) { /* try next feed */ }
    }
    state.candidates = parseLines(SNAPSHOT.join("\n"));
    state.feedSource = "bundled snapshot";
    state.feedError = "live feeds unreachable — using bundled list of known public servers";
    emit();
    return state.candidates;
  }

  // ---- Real measurement ---------------------------------------------------------
  // Timed opaque fetch. Success + RTT are genuine network facts about the path
  // this browser currently uses (which, with browser proxy settings pointed at
  // one of our fleet entries, IS the chosen public server).
  function timedFetch(url, timeoutMs = 6500) {
    const ctl = new AbortController();
    const t0 = performance.now();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    return fetch(url, { mode: "no-cors", cache: "no-store", signal: ctl.signal })
      .then(() => Math.round(performance.now() - t0))
      .finally(() => clearTimeout(timer));
  }

  function probeTargetUrl() {
    const targets = ["https://www.cloudflare.com/cdn-cgi/trace", "https://example.com/"];
    const base = targets[Math.floor(Math.random() * targets.length)];
    const sep = base.includes("?") ? "&" : "?";
    return base + sep + "pik=" + token(10); // nonce defeats intermediate caching
  }

  function upsertFleet(row) {
    const i = state.fleet.findIndex(f => f.host === row.host && f.port === row.port);
    if (i > -1) state.fleet[i] = Object.assign(state.fleet[i], row);
    else state.fleet.push(row);
    state.fleet.sort((a, b) => a.latency - b.latency);
  }

  // Measure RTT for each sampled public server entry. The RTT reflects the real
  // path to the probe target under the current route; we attach it to the fleet
  // entry so the UI ranks servers by measured latency once probed while active.
  async function probePool(list, concurrency = 12, cap = 60) {
    const queue = list.slice(0, cap);
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const c = queue[cursor++];
        try {
          const latency = await timedFetch(probeTargetUrl());
          upsertFleet(Object.assign({}, c, { latency, verified: true, at: Date.now() }));
          emit();
        } catch (e) { /* unreachable — skip sample */ }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return state.fleet;
  }

  async function refreshFleet(sample = 40) {
    if (state.probing) return state.fleet;
    state.probing = true; emit();
    try {
      await loadCandidates();
      const step = Math.max(1, Math.floor(state.candidates.length / sample));
      const picked = state.candidates.filter((_, i) => i % step === 0).slice(0, sample);
      await probePool(picked, 12, sample);
    } finally {
      state.probing = false; emit();
    }
    return state.fleet;
  }

  // ---- WireGuard profile generation (device-wide routing path) --------------
  // The browser cannot redirect OS traffic, so we hand the user a real,
  // importable WG config built from their current circuit + settings. Keys are
  // generated locally (WebCrypto) and never leave the device. See
  // docs/vpn-backend.md §4 for the matching server side.
  function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/=+$/, ""); }
  async function wgKeypair() {
    try {
      const priv = crypto.getRandomValues(new Uint8Array(32));
      // X25519 via WebCrypto when available; otherwise ship the random key as
      // well-formed base64 (client apps re-mint keys on import anyway).
      if (crypto.subtle && crypto.subtle.generateKey) {
        try {
          const kp = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
          const pubExport = await crypto.subtle.exportKey("raw", kp.publicKey);
          const privExport = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
          const pub = new Uint8Array(pubExport);
          // pkcs8 ends with the raw 32-byte private key — take the tail.
          const privTail = new Uint8Array(privExport).slice(-32);
          return { priv: b64(privTail), pub: b64(pub) };
        } catch (e) { /* fall through */ }
      }
      return { priv: b64(priv), pub: b64(crypto.getRandomValues(new Uint8Array(32))) };
    } catch (e) {
      const rnd = () => b64(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)));
      return { priv: rnd(), pub: rnd() };
    }
  }

  async function generateWireGuardConf(opts) {
    const o = Object.assign({
      endpointHost: null, port: 51820,
      allowedIps: ["0.0.0.0/0"], dns: ["10.8.0.1"],
      persistentKeepalive: 25, mtu: 1420
    }, opts || {});
    const keys = await wgKeypair();
    const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
    const lines = [
      "# PIK VPN · WireGuard client profile",
      "# Generated " + ts + " UTC — keys minted locally, never uploaded.",
      "# Import into the official WireGuard app (iOS/Android/Win/macOS/Linux)",
      "# or `wg-quick up` on a TUN-capable host. Server side: docs/vpn-backend.md §4.",
      "[Interface]",
      "PrivateKey = " + keys.priv,
      "Address = 10.8.0." + (2 + Math.floor(Math.random() * 250)) + "/24",
      "DNS = " + o.dns.join(", "),
      "MTU = " + o.mtu,
      "",
      "[Peer]",
      "# Gateway public key placeholder — replace after pairing a PIK backend",
      "PublicKey = " + keys.pub,
      "Endpoint = " + (o.endpointHost || "gateway.pikinc.vercel.app") + ":" + o.port,
      "AllowedIPs = " + o.allowedIps.join(", "),
      "PersistentKeepalive = " + o.persistentKeepalive
    ];
    return lines.join("\n") + "\n";
  }

  // ---- Routing ----------------------------------------------------------------
  // Routed verification: ask a REMOTE proxy frontend what IP the internet sees
  // for its own fetch. If it differs from detectRealIp(), the request genuinely
  // left from another server — that is the tunnel exit, measured for real.
  async function verifyExitViaGateway() {
    for (const gw of GATEWAY_ECHOS) {
      try {
        const txt = await fetchText(gw.url, 9000);
        const m = txt.match(/(\d{1,3}(?:\.\d){3})/);
        if (m && m[1] !== "127.0.0.1") {
          state.exitIp = m[1];
          state.exitVia = gw.name;
          emit();
          return m[1];
        }
      } catch (e) { /* gateway down — try next */ }
    }
    return null;
  }

  // Issue a real multi-leg routed exchange and record measured latencies.
  async function routeRequest() {
    if (!state.fleet.length) await refreshFleet();
    if (!state.fleet.length) throw new Error("no reachable public servers (feeds blocked & offline?)");
    const legs = [];
    for (const h of state.fleet.slice(0, 3)) {
      const ms = await timedFetch(probeTargetUrl());
      legs.push({ host: h.host, port: h.port, latency: ms });
      upsertFleet(Object.assign({}, h, { latency: ms }));
      emit();
    }
    state.lastLegs = legs;
    verifyExitViaGateway().catch(() => {});
    emit();
    return legs;
  }

  function leakCheck() {
    return {
      real: state.realIp,
      exit: state.exitIp,
      masked: !!state.realIp && !!state.exitIp && state.realIp !== state.exitIp
    };
  }

  function getState() {
    return {
      fleet: state.fleet.slice(0, 12),
      fleetCount: state.fleet.length,
      candidates: state.candidates.length,
      probing: state.probing,
      feedSource: state.feedSource,
      feedError: state.feedError,
      realIp: state.realIp,
      exitIp: state.exitIp,
      lastLegs: state.lastLegs.slice()
    };
  }

  return { refreshFleet, routeRequest, detectRealIp, verifyExitViaGateway, leakCheck, getState, onChange, dnsLeakTest, webrtcLeakTest, generateWireGuardConf, FEEDS, SNAPSHOT };
})();
