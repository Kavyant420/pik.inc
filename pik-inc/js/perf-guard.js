/* ============================================================================
   PIK//NEXUS — perf-guard.js
   Ultra-light frame governor for the workbench. Runs before everything else:
     - samples rAF cadence and exposes PIKGuard.smooth() (true while healthy)
     - pauses non-essential animation loops when the tab is hidden
     - coalesces bursty DOM writes through PIKGuard.batch(fn)
     - exposes PIKGuard.scheduleIdle -> requestIdleCallback with fallback
   No dependencies, no layout thrash (reads batched before writes).
   ========================================================================= */
(function (global) {
  "use strict";

  var G = {
    smooth: true,
    fps: 60,
    _samples: [],
    _hidden: false,
    _idleQ: [],
    _rafId: 0,
    onPause: null,   // callback(true|false) — FX layers subscribe
    onDegrade: null  // callback(fps) — fired once when sustained drop detected
  };

  var last = 0, degraded = false, lowStreak = 0;

  function tick(now) {
    if (last) {
      var dt = now - last;
      var fps = dt > 0 ? Math.min(240, 1000 / dt) : 60;
      G._samples.push(fps);
      if (G._samples.length > 40) G._samples.shift();
      var sum = 0;
      for (var i = 0; i < G._samples.length; i++) sum += G._samples[i];
      G.fps = Math.round(sum / G._samples.length);
      G.smooth = G.fps >= 38;
      if (G.fps < 30) { lowStreak++; } else { lowStreak = 0; }
      if (lowStreak > 90 && !degraded) {
        degraded = true;
        document.documentElement.setAttribute("data-perf", "lite");
        if (G.onDegrade) { try { G.onDegrade(G.fps); } catch (e) {} }
      }
    }
    last = now;
    if (!G._hidden) G._rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    cancelAnimationFrame(G._rafId);
    last = 0;
    G._rafId = requestAnimationFrame(tick);
  }

  G.init = function () {
    startLoop();
    document.addEventListener("visibilitychange", function () {
      G._hidden = document.hidden;
      if (G._hidden) cancelAnimationFrame(G._rafId);
      else startLoop();
      if (G.onPause) { try { G.onPause(G._hidden); } catch (e) {} }
    });
    /* flush idle queue opportunistically */
    setInterval(function () { G._flushIdle(); }, 1200);
  };

  /* write-coalescing: many small DOM mutations collapse into one frame */
  var pending = new Set(), scheduled = false;
  G.batch = function (fn) {
    pending.add(fn);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      var jobs = Array.from(pending);
      pending.clear();
      for (var i = 0; i < jobs.length; i++) {
        try { jobs[i](); } catch (e) { console.warn("[PIKGuard] batch job failed:", e); }
      }
    });
  };

  G.scheduleIdle = function (fn, timeoutMs) {
    if ("requestIdleCallback" in global) {
      return global.requestIdleCallback(function (d) { fn(d); }, { timeout: timeoutMs || 2500 });
    }
    var id = setTimeout(function () { fn({ didTimeout: false, timeRemaining: function () { return 8; } }); }, 200);
    return id;
  };

  /* memory pressure hint (Chrome only) — FX layers can listen */
  if ("performance" in global && "memory" in performance) {
    setInterval(function () {
      var m = performance.memory;
      var ratio = m.usedJSHeapSize / Math.max(1, m.jsHeapSizeLimit);
      document.dispatchEvent(new CustomEvent("pik:mempressure", { detail: { ratio: ratio } }));
    }, 15000);
  }

  function flushNow() { /* exported noop kept for API symmetry */ }
  G._flushIdle = flushNow;

  global.PIKGuard = G;
})(window);
