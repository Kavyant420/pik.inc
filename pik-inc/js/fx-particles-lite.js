/* ============================================================================
   PIK//NEXUS — fx-particles-lite.js
   A deliberately cheap ambient particle field (the "life" layer):
     - one fixed canvas behind the shell, max 26 nodes, DPR-capped at 1.5
     - drifts + soft links between near nodes; pauses when the tab is hidden
       or when PIKGuard reports a low-FPS device (perf-guard integration)
     - fully disabled under prefers-reduced-motion
   Zero dependencies; ~4 KB. Never blocks the main thread for >2ms/frame.
   ========================================================================= */
(function (global) {
  "use strict";

  var COUNT = 26, LINK_DIST = 130, DPR_CAP = 1.5;

  var Particles = {
    started: false,
    _raf: 0, _nodes: [], _cv: null, _ctx: null, _w: 0, _h: 0,

    start: function () {
      if (this.started) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var cv = document.createElement("canvas");
      cv.className = "nx-particles";
      cv.setAttribute("aria-hidden", "true");
      document.body.appendChild(cv);
      this._cv = cv; this._ctx = cv.getContext("2d", { alpha: true });
      this.started = true;

      var self = this;
      this._resize = function () {
        var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
        self._w = cv.width = Math.floor(innerWidth * dpr);
        self._h = cv.height = Math.floor(innerHeight * dpr);
        cv.style.width = innerWidth + "px";
        cv.style.height = innerHeight + "px";
        self._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      this._resize();
      addEventListener("resize", this._resize, { passive: true });

      var w = function () { return self._w / (Math.min(window.devicePixelRatio || 1, DPR_CAP)); };
      var h = function () { return self._h / (Math.min(window.devicePixelRatio || 1, DPR_CAP)); };
      for (var i = 0; i < COUNT; i++) {
        this._nodes.push({
          x: Math.random() * w(), y: Math.random() * h(),
          vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
          r: 0.7 + Math.random() * 1.6, hue: Math.random() < 0.22 ? 168 : 265
        });
      }

      document.addEventListener("visibilitychange", function () {
        if (document.hidden) self.stop(); else self.startLoop();
      });
      this.startLoop();
    },

    startLoop: function () {
      if (this._raf) return;
      var self = this;
      function frame() {
        self._raf = requestAnimationFrame(frame);
        /* yield to perf-guard: skip frames on struggling devices */
        if (global.PIKGuard && PIKGuard.isStressed && PIKGuard.isStressed()) return;
        self._tick();
      }
      this._raf = requestAnimationFrame(frame);
    },

    stop: function () {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
    },

    _tick: function () {
      var ctx = this._ctx, W = innerWidth, H = innerHeight;
      ctx.clearRect(0, 0, W, H);
      var n = this._nodes, i, j;
      for (i = 0; i < n.length; i++) {
        var p = n[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
      }
      /* links */
      ctx.lineWidth = 0.6;
      for (i = 0; i < n.length; i++) {
        for (j = i + 1; j < n.length; j++) {
          var dx = n[i].x - n[j].x, dy = n[i].y - n[j].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            var a = (1 - Math.sqrt(d2) / LINK_DIST) * 0.16;
            ctx.strokeStyle = "hsla(168,70%,60%," + a.toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(n[i].x, n[i].y);
            ctx.lineTo(n[j].x, n[j].y);
            ctx.stroke();
          }
        }
      }
      /* nodes */
      for (i = 0; i < n.length; i++) {
        var q = n[i];
        ctx.fillStyle = "hsla(" + q.hue + ",80%,66%,0.5)";
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, 6.2832);
        ctx.fill();
      }
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    /* start after first paint so boot stays snappy */
    setTimeout(function () { Particles.start(); }, 1200);
  });

  global.PIKParticles = Particles;
})(window);
