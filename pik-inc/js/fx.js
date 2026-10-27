/* ============================================================================
   PIK//NEXUS — fx.js
   Premium motion layer:
     - pointer-reactive 3D tilt (perspective cards, model picker, prompt well)
     - cursor spotlight that paints glass edges
     - thinking orb: a CSS-3D rotating core whose speed/complexity scales with
       the Low -> Medium -> High -> Max ladder
     - particle constellation canvas behind the hero (grey on black, 85:15)
     - scroll reveals + magnetic buttons (uiverse-style micro-interactions)
   ========================================================================= */
(function (global) {
  "use strict";

  var FX = {
    init() {
      this.tilt();
      this.spotlight();
      this.reveals();
      this.magnetic();
      this.constellation(document.querySelector("[data-fx='stars']"));
      this.orb(document.querySelector("[data-fx='orb']"), "high");
    },

    /* ---------- 3D tilt ---------- */
    tilt() {
      document.addEventListener("pointermove", function (e) {
        var el = e.target.closest ? e.target.closest(".fx-tilt") : null;
        if (!el) return;
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        var max = parseFloat(el.dataset.tiltMax || 10);
        el.style.transform = "perspective(900px) rotateX(" + (-py * max).toFixed(2) +
          "deg) rotateY(" + (px * max).toFixed(2) + "deg) translateZ(6px)";
        el.style.setProperty("--tilt-x", ((px + 0.5) * 100).toFixed(1) + "%");
        el.style.setProperty("--tilt-y", ((py + 0.5) * 100).toFixed(1) + "%");
      });
      document.addEventListener("pointerout", function (e) {
        var el = e.target.closest ? e.target.closest(".fx-tilt") : null;
        if (el && !el.contains(e.relatedTarget)) el.style.transform = "";
      }, true);
    },

    /* ---------- cursor spotlight over glass panels ---------- */
    spotlight() {
      document.addEventListener("pointermove", function (e) {
        var el = e.target.closest ? e.target.closest(".fx-spot") : null;
        if (!el) return;
        var r = el.getBoundingClientRect();
        el.style.setProperty("--spot-x", (e.clientX - r.left) + "px");
        el.style.setProperty("--spot-y", (e.clientY - r.top) + "px");
      });
    },

    /* ---------- reveal-on-scroll ---------- */
    reveals() {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("is-revealed"); io.unobserve(en.target); }
        });
      }, { threshold: 0.12 });
      document.querySelectorAll(".fx-reveal").forEach(function (n) { io.observe(n); });
    },

    /* ---------- magnetic buttons ---------- */
    magnetic() {
      document.querySelectorAll(".fx-magnet").forEach(function (btn) {
        btn.addEventListener("pointermove", function (e) {
          var r = btn.getBoundingClientRect();
          var x = (e.clientX - r.left - r.width / 2) * 0.25;
          var y = (e.clientY - r.top - r.height / 2) * 0.35;
          btn.style.transform = "translate(" + x + "px," + y + "px)";
        });
        btn.addEventListener("pointerleave", function () { btn.style.transform = ""; });
      });
    },

    /* ---------- particle constellation (grey dust on black) ---------- */
    constellation(canvas) {
      if (!canvas) return;
      var ctx = canvas.getContext("2d");
      var dpr = Math.min(2, devicePixelRatio || 1);
      var W, H, pts = [];
      function size() {
        W = canvas.width = canvas.offsetWidth * dpr;
        H = canvas.height = canvas.offsetHeight * dpr;
      }
      size(); addEventListener("resize", size);
      var N = 70;
      for (var i = 0; i < N; i++) {
        pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .18 * dpr, vy: (Math.random() - .5) * .18 * dpr, r: (Math.random() * 1.4 + .4) * dpr });
      }
      var mouse = { x: -1e5, y: -1e5 };
      canvas.parentElement.addEventListener("pointermove", function (e) {
        var r = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - r.left) * dpr; mouse.y = (e.clientY - r.top) * dpr;
      });
      (function tick() {
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < N; i++) {
          var p = pts[i];
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, 6.283);
          ctx.fillStyle = "rgba(200,200,205,.5)";
          ctx.fill();
          for (var j = i + 1; j < N; j++) {
            var q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
            var lim = 110 * dpr;
            if (d2 < lim * lim) {
              ctx.strokeStyle = "rgba(150,150,158," + (0.16 * (1 - Math.sqrt(d2) / lim)).toFixed(3) + ")";
              ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
            }
          }
          var mdx = p.x - mouse.x, mdy = p.y - mouse.y, md = Math.sqrt(mdx * mdx + mdy * mdy);
          if (md < 160 * dpr) {
            ctx.strokeStyle = "rgba(220,220,226," + (0.3 * (1 - md / (160 * dpr))).toFixed(3) + ")";
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
          }
        }
        requestAnimationFrame(tick);
      })();
    },

    /* ---------- thinking orb: CSS 3D core driven by effort level ---------- */
    orb(el, level) {
      if (!el) return;
      el.setAttribute("data-level", level || "low");
      var speeds = { low: 14, medium: 9, high: 5.5, max: 3 };
      var s = speeds[level] || 14;
      el.style.setProperty("--orb-spin", s + "s");
      el.style.setProperty("--orb-pulse", (s * 0.9) + "s");
      // spawn extra rings at higher levels
      var want = { low: 1, medium: 2, high: 3, max: 5 }[level] || 1;
      var have = el.querySelectorAll(".orb__ring").length;
      while (have < want) {
        var ring = document.createElement("span");
        ring.className = "orb__ring orb__ring--" + (have + 1);
        el.appendChild(ring);
        have++;
      }
      while (have > want) {
        el.querySelector(".orb__ring:last-of-type").remove();
        have--;
      }
      el.setAttribute("data-level", level);
    },

    /* ---------- ripple click (uiverse signature) ---------- */
    ripple() {
      document.addEventListener("click", function (e) {
        var t = e.target.closest("[data-ripple]");
        if (!t) return;
        var r = t.getBoundingClientRect();
        var sp = document.createElement("span");
        sp.className = "ripple";
        sp.style.left = (e.clientX - r.left) + "px";
        sp.style.top = (e.clientY - r.top) + "px";
        t.appendChild(sp);
        setTimeout(function () { sp.remove(); }, 650);
      });
    }
  };

  global.PIKFX = FX;
})(window);
