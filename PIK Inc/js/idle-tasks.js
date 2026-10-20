/* ============================================================================
   PIK//NEXUS — idle-tasks.js
   Defers every non-critical job off the boot critical path:
     - warm caches (model logos, favicon strip) during idle time
     - preconnect to inference hosts only after first paint
     - periodic housekeeping: prune usage ledger, trim crash log, GC hints
     - service-worker registration hook for offline 24/7 resilience
   All tasks are idempotent and individually fault-isolated.
   ========================================================================= */
(function (global) {
  "use strict";

  var Tasks = [];

  function add(name, fn, priority) {
    Tasks.push({ name: name, fn: fn, p: priority || 5 });
  }

  add("preconnect-inference", function () {
    ["https://openrouter.ai", "https://text.pollinations.ai", "https://api.deepinfra.com"]
      .forEach(function (origin) {
        var l = document.createElement("link");
        l.rel = "preconnect"; l.href = origin; l.crossOrigin = true;
        document.head.appendChild(l);
      });
  }, 2);

  add("warm-logo-cache", function () {
    if (!global.PIKModels || !PIKModels.all.length) return;
    PIKModels.all.slice(0, 8).forEach(function (m) {
      if (!m.logo) return;
      var img = new Image(); img.loading = "lazy"; img.src = m.logo;
    });
  }, 8);

  add("housekeeping", function () {
    try {
      // trim a bloated crash ledger kept in localStorage
      var raw = localStorage.getItem("pik.nexus.crashlog");
      if (raw && raw.length > 60000) {
        var arr = JSON.parse(raw);
        localStorage.setItem("pik.nexus.crashlog", JSON.stringify(arr.slice(-60)));
      }
      // drop stale oauth state older than 10 minutes
      var st = localStorage.getItem("pik.nexus.oauth.state.ts");
      if (st && Date.now() - Number(st) > 600000) {
        localStorage.removeItem("pik.nexus.oauth.state");
        localStorage.removeItem("pik.nexus.oauth.state.ts");
      }
    } catch (e) {}
  }, 9);

  add("register-sw", function () {
    /* offline shell cache: nexus.html + css/js bundles survive network loss,
       keeping the workbench usable 24/7 even mid-blackout. */
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("./sw-nexus.js").catch(function () {
        /* hosting root may not allow SW at this scope — silently fine */
      });
    }
  }, 10);

  global.PIKIdle = {
    runAll: function () {
      Tasks.sort(function (a, b) { return a.p - b.p; });
      var i = 0;
      (function next(deadline) {
        while (i < Tasks.length && (deadline.timeRemaining() > 3 || deadline.didTimeout)) {
          var t = Tasks[i++];
          try { t.fn(); } catch (e) { console.warn("[PIKIdle] " + t.name + " skipped:", e.message); }
        }
        if (i < Tasks.length) {
          if ("requestIdleCallback" in global) global.requestIdleCallback(next, { timeout: 4000 });
          else setTimeout(function () { next({ didTimeout: true, timeRemaining: function () { return 0; } }); }, 1500);
        }
      })({ didTimeout: false, timeRemaining: function () { return 12; } });
    },
    every: function (ms, fn) { setInterval(fn, ms); }
  };

  document.addEventListener("DOMContentLoaded", function () {
    if ("requestIdleCallback" in global) global.requestIdleCallback(function () { PIKIdle.runAll(); }, { timeout: 3500 });
    else setTimeout(function () { PIKIdle.runAll(); }, 1800);
  });
})(window);
