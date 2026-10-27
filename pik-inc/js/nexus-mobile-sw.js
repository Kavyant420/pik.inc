/* ============================================================================
   PIK//NEXUS — nexus-mobile-sw.js   (NEW file — mobile offline registrar)
   Registers the MOBILE service worker for nexus-mobile.html only.
   The desktop page never loads this script and keeps using the untouched
   sw-nexus.js registered by idle-tasks.js.

   Registration ladder (each step is optional, failures fall through):
     1. /sw-nexus-mobile.html  -> root-scoped worker (full offline shell)
     2. ./js/sw-nexus-mobile.js -> ./js/-scoped worker (warm cache fallback)
     3. give up silently — the app still works online, exactly like before.
   ========================================================================= */
(function (global) {
  "use strict";

  function register(url, scope) {
    return navigator.serviceWorker.register(url, scope ? { scope: scope } : undefined);
  }

  function init() {
    if (!("serviceWorker" in navigator)) return;
    // workers require a secure context (https or localhost) — same rule as desktop
    if (location.protocol !== "https:" && location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1") return;

    // Only ever run this on the mobile page itself.
    if (!/nexus-mobile\.html$/i.test(location.pathname)) return;

    var attempts = [
      ["./sw-nexus-mobile.html", null],       // root scope when hosting allows .html workers
      ["./js/sw-nexus-mobile.js", "./js/"]    // safe nested scope fallback
    ];

    (function next(i) {
      if (i >= attempts.length) return;        // offline is a bonus, never an error
      register(attempts[i][0], attempts[i][1])
        .then(function () {
          global.PIKNexusMobileSW = { registered: attempts[i][0] };
        })
        .catch(function () { next(i + 1); });
    })(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // defer slightly so the core boot path keeps priority on slow phones
    setTimeout(init, 1500);
  }
})(window);
