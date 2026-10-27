const PIK3D = (() => {
  let raf = null;
  let canvas = null;
  let ctx2d = null;
  let particles = [];
  let rings = [];
  let mx = 0, my = 0, tx = 0, ty = 0;
  let running = false;

  function reduced() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function lite() {
    return document.documentElement.getAttribute("data-perf") === "lite";
  }

  function init() {
    if (reduced()) return;
    canvas = document.querySelector(".fx-canvas");
    if (!canvas) return;
    ctx2d = canvas.getContext("2d", { alpha: true });
    resize();
    /* rAF-coalesced resize — avoids rebuilding the scene on every drag frame */
    let resizeRaf = null;
    window.addEventListener("resize", () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        resize();
        invalidateColors();
      });
    }, { passive: true });
    /* pointer state only — no per-move style writes (was thrashing :root) */
    window.addEventListener("pointermove", ev => {
      tx = (ev.clientX / innerWidth - 0.5) * 2;
      ty = (ev.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    /* spotlight vars, rAF-coalesced to one write per frame */
    let spotRaf = null;
    window.addEventListener("pointermove", () => {
      if (spotRaf) return;
      spotRaf = requestAnimationFrame(() => {
        spotRaf = null;
        const s = document.documentElement.style;
        s.setProperty("--mx", ((tx + 1) / 2 * 100).toFixed(1) + "%");
        s.setProperty("--my", ((ty + 1) / 2 * 100).toFixed(1) + "%");
      });
    }, { passive: true });
    start();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildScene();
  }

  function accentColor() {
    const s = getComputedStyle(document.documentElement);
    return {
      a: s.getPropertyValue("--pik-accent").trim() || "#4fe3c1",
      b: s.getPropertyValue("--pik-accent-alt").trim() || "#9d8cff"
    };
  }

  function hexToRgb(hex) {
    const m = hex.replace("#", "");
    const v = m.length === 3 ? m.split("").map(c => c + c).join("") : m;
    const n = parseInt(v, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function buildScene() {
    const count = lite() ? 26 : 64;
    particles = Array.from({ length: count }, () => spawn());
    rings = [
      { r: Math.min(innerWidth, innerHeight) * 0.32, tilt: 0.5, speed: 0.00035, phase: 0 },
      { r: Math.min(innerWidth, innerHeight) * 0.42, tilt: -0.35, speed: -0.00022, phase: 2 },
      { r: Math.min(innerWidth, innerHeight) * 0.22, tilt: 0.9, speed: 0.0005, phase: 4 }
    ];
  }

  function spawn() {
    return {
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      z: Math.random() * 0.8 + 0.2,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      size: Math.random() * 1.8 + 0.4
    };
  }

  /* Cache accent colors — getComputedStyle every frame was a layout thrash. */
  let cachedCols = null;
  function cols() {
    if (!cachedCols) {
      cachedCols = accentColor();
      cachedCols.rgbA = hexToRgb(cachedCols.a);
      cachedCols.rgbB = hexToRgb(cachedCols.b);
    }
    return cachedCols;
  }
  function invalidateColors() { cachedCols = null; }

  /* Spatial-grid neighbor pass replaces the O(n²) link loop. */
  function neighborLinks(particles, cell) {
    const grid = new Map();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const key = Math.floor(p.x / cell) + "," + Math.floor(p.y / cell);
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, (bucket = []));
      bucket.push(i);
    }
    const links = [];
    for (const [key, bucket] of grid) {
      const [gx, gy] = key.split(",").map(Number);
      for (let dx = 0; dx <= 1; dx++) {
        for (let dy = (dx === 0 ? 0 : -1); dy <= 1; dy++) {
          const other = grid.get(gx + dx + "," + (gy + dy));
          if (!other) continue;
          for (let a = 0; a < bucket.length; a++) {
            const start = other === bucket ? a + 1 : 0;
            for (let b = start; b < other.length; b++) {
              links.push([bucket[a], other[b]]);
            }
          }
        }
      }
    }
    return links;
  }

  function frame(now) {
    if (!running) return;
    ctx2d.clearRect(0, 0, innerWidth, innerHeight);
    mx += (tx - mx) * 0.04;
    my += (ty - my) * 0.04;
    drawRings(now);
    drawParticles();
    raf = requestAnimationFrame(frame);
  }

  function drawRings(now) {
    const cx = innerWidth * 0.78 + mx * 26;
    const cy = innerHeight * 0.34 + my * 18;
    const c = cols();
    const [r1, g1, b1] = c.rgbA;
    rings.forEach((ring, i) => {
      ctx2d.save();
      ctx2d.translate(cx, cy);
      ctx2d.rotate(ring.tilt);
      ctx2d.scale(1, 0.34);
      ctx2d.beginPath();
      ctx2d.arc(0, 0, ring.r, 0, Math.PI * 2);
      ctx2d.strokeStyle = "rgba(" + r1 + "," + g1 + "," + b1 + "," + (0.1 - i * 0.02) + ")";
      ctx2d.lineWidth = 1;
      ctx2d.stroke();
      const ang = now * ring.speed + ring.phase;
      const px = Math.cos(ang) * ring.r;
      const py = Math.sin(ang) * ring.r;
      ctx2d.beginPath();
      ctx2d.arc(px, py, 2.4 - i * 0.5, 0, Math.PI * 2);
      ctx2d.fillStyle = "rgba(" + r1 + "," + g1 + "," + b1 + ",0.5)";
      ctx2d.fill();
      ctx2d.restore();
    });
  }

  function drawParticles() {
    const c = cols();
    const [ra, ga, ba] = c.rgbA;
    const [rb, gb, bb] = c.rgbB;
    /* batch dot fills by rounded color to cut state changes */
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx + mx * p.z * 0.35;
      p.y += p.vy + my * p.z * 0.35;
      if (p.x < -10) p.x = innerWidth + 10;
      if (p.x > innerWidth + 10) p.x = -10;
      if (p.y < -10) p.y = innerHeight + 10;
      if (p.y > innerHeight + 10) p.y = -10;
      const mix = p.z;
      const cr = Math.round(ra + (rb - ra) * mix);
      const cg = Math.round(ga + (gb - ga) * mix);
      const cb = Math.round(ba + (bb - ba) * mix);
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.size * p.z, 0, Math.PI * 2);
      ctx2d.fillStyle = "rgba(" + cr + "," + cg + "," + cb + "," + (0.16 * p.z + 0.05) + ")";
      ctx2d.fill();
    }
    /* spatial-grid links: O(n·k) instead of O(n²) */
    const cell = 110;
    const links = neighborLinks(particles, cell);
    ctx2d.lineWidth = 0.6;
    for (let l = 0; l < links.length; l++) {
      const p = particles[links[l][0]];
      const q = particles[links[l][1]];
      const dx = p.x - q.x, dy = p.y - q.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 12000) continue;
      const mix = (p.z + q.z) * 0.5;
      const cr = Math.round(ra + (rb - ra) * mix);
      const cg = Math.round(ga + (gb - ga) * mix);
      const cb = Math.round(ba + (bb - ba) * mix);
      ctx2d.beginPath();
      ctx2d.moveTo(p.x, p.y);
      ctx2d.lineTo(q.x, q.y);
      ctx2d.strokeStyle = "rgba(" + cr + "," + cg + "," + cb + "," + (0.05 * (1 - d2 / 12000)) + ")";
      ctx2d.stroke();
    }
  }

  function start() {
    if (running || !ctx2d) return;
    invalidateColors();
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function stop(clear) {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    if (clear !== false && ctx2d) ctx2d.clearRect(0, 0, innerWidth, innerHeight);
  }

  function isRunning() {
    return running;
  }

  /* Re-read theme accents when settings change them. */
  document.addEventListener("pik:themechange", invalidateColors);

  return { init, start, stop, isRunning };
})();
