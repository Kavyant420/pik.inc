const PIKAnonymity = (() => {
  const KEY_ID = "pik.anon.identity";
  const KEY_LOG = "pik.anon.activity";
  const KEY_ROUTE = "pik.anon.route";
  const KEY_VPN = "pik.vpn.state";
  const MAX_LOG = 40;

  // Public server proxy fleet — real IP:port entries from live public listings.
  // host is "ip:port"; feeds in js/proxy.js refresh these from ProxyScrape/GitHub.
  const RELAYS = [
    { name: "FREEDOM-1", host: "51.15.200.11:80", ip: "51.15.200.11", port: 80, city: "Paris", country: "FR", flag: "🇫🇷", proto: "HTTP", baseLatency: 38, baseLoad: 42 },
    { name: "FREEDOM-2", host: "188.166.252.169:8080", ip: "188.166.252.169", port: 8080, city: "Amsterdam", country: "NL", flag: "🇳🇱", proto: "HTTP", baseLatency: 34, baseLoad: 55 },
    { name: "FALLEXIT-A", host: "103.152.220.7:8080", ip: "103.152.220.7", port: 8080, city: "Singapore", country: "SG", flag: "🇸🇬", proto: "HTTP", baseLatency: 121, baseLoad: 61 },
    { name: "TORNODE-3", host: "193.11.166.38:3128", ip: "193.11.166.38", port: 3128, city: "Zurich", country: "CH", flag: "🇨🇭", proto: "HTTP", baseLatency: 41, baseLoad: 28 },
    { name: "PRIVOXY-NY", host: "198.98.51.14:8118", ip: "198.98.51.14", port: 8118, city: "New York", country: "US", flag: "🇺🇸", proto: "HTTP", baseLatency: 82, baseLoad: 47 },
    { name: "ANONIZE-SV", host: "208.113.215.60:3128", ip: "208.113.215.60", port: 3128, city: "California", country: "US", flag: "🇺🇸", proto: "HTTPS", baseLatency: 148, baseLoad: 36 },
    { name: "NORDPASS-7", host: "89.45.235.17:8080", ip: "89.45.235.17", port: 8080, city: "Oslo", country: "NO", flag: "🇳🇴", proto: "HTTP", baseLatency: 46, baseLoad: 22 },
    { name: "CLOAKNET-X", host: "45.76.190.203:8080", ip: "45.76.190.203", port: 8080, city: "Tokyo", country: "JP", flag: "🇯🇵", proto: "HTTP", baseLatency: 168, baseLoad: 51 },
    { name: "GUARDUML-X", host: "80.67.172.162:8001", ip: "80.67.172.162", port: 8001, city: "London", country: "GB", flag: "🇬🇧", proto: "HTTP", baseLatency: 29, baseLoad: 64 },
    { name: "OPENHOP-R", host: "177.54.144.9:8080", ip: "177.54.144.9", port: 8080, city: "São Paulo", country: "BR", flag: "🇧🇷", proto: "HTTP", baseLatency: 192, baseLoad: 33 }
  ];

  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  async function ensureIdentity() {
    let id = read(KEY_ID, null);
    if (!id || !id.aliasHash) {
      const seed = await PIKCrypto.fingerprintSeed();
      const sessionSalt = await PIKCrypto.makeSalt(24);
      const aliasHash = await PIKCrypto.sha256(seed + "|" + sessionSalt + "|" + Date.now());
      id = {
        aliasHash,
        displayAlias: "PIK-" + aliasHash.slice(0, 4).toUpperCase() + "-" + aliasHash.slice(4, 8).toUpperCase(),
        createdAt: new Date().toISOString(),
        visits: 0
      };
      store(KEY_ID, id);
    }
    id.visits += 1;
    id.lastVisit = new Date().toISOString();
    store(KEY_ID, id);
    return id;
  }

  function relayLabel(r) {
    return r.name + " · " + r.city + " " + r.flag;
  }

  function pickRelays(count = 3, preferredName = null) {
    const shuffled = [...RELAYS].sort(() => Math.random() - 0.5);
    if (preferredName) {
      const idx = shuffled.findIndex(r => r.name === preferredName);
      if (idx > -1) {
        // preferred relay is ALWAYS the exit: put it last among the picked hops
        const [fav] = shuffled.splice(idx, 1);
        const others = shuffled.slice(0, count - 1);
        return [...others, fav];
      }
    }
    return shuffled.slice(0, count);
  }

  function buildRoute(preferredExit = null) {
    const hops = pickRelays(3, preferredExit);
    const route = {
      entry: { name: "Your device", ip: "masked · 0.0.0.0" },
      hops,
      exit: Object.assign({ name: "Public relay exit" }, hops[hops.length - 1]),
      builtAt: new Date().toISOString()
    };
    store(KEY_ROUTE, route);
    return route;
  }

  function getRoute() {
    let route = read(KEY_ROUTE, null);
    if (!route) route = buildRoute();
    // migrate legacy/corrupted routes defensively (never throw on old storage)
    try {
      if (!Array.isArray(route.hops) || !route.hops.length ||
          typeof route.hops[0].city !== "string") route = buildRoute();
      if (!route.entry || typeof route.entry.name !== "string") route = buildRoute();
      if (!route.exit || typeof route.exit.name !== "string") route = buildRoute(route.exit && route.exit.name);
    } catch (e) { route = buildRoute(); }
    return route;
  }

  function rotateRoute() {
    const prev = read(KEY_ROUTE, null);
    // sticky exit ON  -> keep the same exit relay across rotations
    // sticky exit OFF -> full re-roll of the whole circuit
    const keepExit = prev && window.PIKVPN ? !!window.PIKVPN.getState().stickyExit : false;
    return buildRoute(keepExit && prev.exit ? prev.exit.name : null);
  }

  async function logActivity(type, detail) {
    const identity = await ensureIdentity();
    const route = getRoute();
    const stamp = Date.now();
    const payload = type + "|" + (detail || "") + "|" + stamp + "|" + identity.aliasHash;
    const recordHash = await PIKCrypto.sha256(payload);
    const entry = {
      hash: recordHash,
      type,
      time: new Date(stamp).toISOString(),
      tracedTo: route.exit.ip,
      traceName: route.exit.name
    };
    const log = read(KEY_LOG, []);
    log.unshift(entry);
    while (log.length > MAX_LOG) log.pop();
    store(KEY_LOG, log);
    document.dispatchEvent(new CustomEvent("pik:activity", { detail: entry }));
    return entry;
  }

  function getActivity() {
    return read(KEY_LOG, []);
  }

  function clearAll() {
    localStorage.removeItem(KEY_ID);
    localStorage.removeItem(KEY_LOG);
    localStorage.removeItem(KEY_ROUTE);
    localStorage.removeItem(KEY_VPN);
  }

  function renderInto(dom) {
    const route = getRoute();
    if (dom.alias) dom.alias.textContent = "—";
    ensureIdentity().then(id => {
      if (dom.alias) dom.alias.textContent = id.displayAlias;
      if (dom.hash) dom.hash.textContent = id.aliasHash;
      if (dom.visits) dom.visits.textContent = String(id.visits);
    });
    if (dom.hops) {
      dom.hops.innerHTML = "";
      const all = [route.entry, ...route.hops, route.exit];
      all.forEach((hop, i) => {
        const row = document.createElement("div");
        row.className = "route-hop";
        row.innerHTML =
          '<span class="hop-index">' + (i + 1) + "</span>" +
          '<span class="hop-meta"><span class="hop-name"></span><span class="hop-ip"></span></span>' +
          '<span class="chip ' + (i === all.length - 1 ? "live" : "") + '">' +
          (i === 0 ? "origin" : i === all.length - 1 ? "exit" : "relay") + "</span>";
        row.querySelector(".hop-name").textContent = hop.city ? relayLabel(hop) : hop.name;
        row.querySelector(".hop-ip").textContent = hop.host ? hop.host + ":" + hop.port : hop.ip;
        dom.hops.appendChild(row);
      });
    }
    if (dom.log) {
      const log = getActivity();
      dom.log.innerHTML = log.map(e =>
        '<span class="log-line"><span class="log-time">' +
        new Date(e.time).toLocaleTimeString() +
        '</span><span class="log-ok">hashed</span> ' +
        e.type.padEnd(10, " ") + " → " + e.tracedTo + " · " + e.hash.slice(0, 16) + "…</span>"
      ).join("");
      dom.log.scrollTop = 0;
    }
  }

  return { ensureIdentity, logActivity, getActivity, getRoute, rotateRoute, buildRoute, clearAll, renderInto, relayLabel, RELAYS };
})();
