const PIKAnonymity = (() => {
  const KEY_ID = "pik.anon.identity";
  const KEY_LOG = "pik.anon.activity";
  const KEY_ROUTE = "pik.anon.route";
  const MAX_LOG = 40;

  const RELAYS = [
    { name: "FREEDOM-1 · Frankfurt", ip: "45.147.31.92" },
    { name: "FREEDOM-2 · Amsterdam", ip: "185.222.58.141" },
    { name: "FALLEXIT-A · Singapore", ip: "103.152.220.7" },
    { name: "TORNODE-3 · Zurich", ip: "193.11.166.38" },
    { name: "PRIVOXY-NY · New York", ip: "198.98.51.14" },
    { name: "ANONIZE-SV · California", ip: "208.113.215.60" },
    { name: "NORDPASS-7 · Oslo", ip: "89.45.235.17" },
    { name: "CLOAKNET-X · Tokyo", ip: "45.76.190.203" },
    { name: "GUARDUML-X · London", ip: "80.67.172.162" },
    { name: "OPENHOP-R · São Paulo", ip: "177.54.144.9" }
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

  function pickRelays(count = 3) {
    const shuffled = [...RELAYS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  function buildRoute() {
    const hops = pickRelays(3);
    const route = {
      entry: { name: "Your device", ip: "masked · 0.0.0.0" },
      hops,
      exit: { name: "Public relay exit", ip: hops[hops.length - 1].ip },
      builtAt: new Date().toISOString()
    };
    store(KEY_ROUTE, route);
    return route;
  }

  function getRoute() {
    let route = read(KEY_ROUTE, null);
    if (!route) route = buildRoute();
    return route;
  }

  function rotateRoute() {
    return buildRoute();
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
        row.querySelector(".hop-name").textContent = hop.name;
        row.querySelector(".hop-ip").textContent = hop.ip;
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

  return { ensureIdentity, logActivity, getActivity, getRoute, rotateRoute, clearAll, renderInto, RELAYS };
})();
