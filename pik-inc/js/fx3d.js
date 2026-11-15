const PIK3D = (() => {
  let raf = null;
  let canvas = null;
  let ctx2d = null;
  let particles = [];
  let rings = [];
  let mx = 0, my = 0, tx = 0, ty = 0;
  let running = false;
  let listenersBound = false;

  function reduced() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function lite() {
    return document.documentElement.getAttribute("data-perf") === "lite";
  }

  function suppressedByHost() {
    const root = document.documentElement;
    return (
      root.classList.contains("has-blackhole-gl") ||
      root.getAttribute("data-fx") === "off"
    );
  }

  function init() {
    if (!listenersBound) {
      listenersBound = true;
      let spotRaf = null;
      window.addEventListener(
        "pointermove",
        ev => {
          tx = (ev.clientX / (innerWidth || 1) - 0.5) * 2;
          ty = (ev.clientY / (innerHeight || 1) - 0.5) * 2;
          if (spotRaf) return;
          spotRaf = requestAnimationFrame(() => {
            spotRaf = null;
            const s = document.documentElement.style;
            s.setProperty("--mx", (((tx + 1) / 2) * 100).toFixed(1) + "%");
            s.setProperty("--my", (((ty + 1) / 2) * 100).toFixed(1) + "%");
          });
        },
        { passive: true }
      );

      /* Yield automatically if @blackhole mounts WebGL or user disables FX */
      if (typeof MutationObserver === "function") {
        const mo = new MutationObserver(() => {
          if (suppressedByHost()) {
            if (running) stop(true);
          } else if (!reduced() && !lite() && !running && ctx2d) {
            start();
          }
        });
        mo.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class", "data-fx", "data-perf"]
        });
      }
    }

    if (reduced()) return;
    canvas = document.querySelector(".fx-canvas");
    if (!canvas) return;
    ctx2d = canvas.getContext("2d", { alpha: true });
    if (!ctx2d) return;
    resize();

    let resizeRaf = null;
    window.addEventListener(
      "resize",
      () => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = null;
          resize();
          invalidateColors();
        });
      },
      { passive: true }
    );

    if (!suppressedByHost() && !lite()) {
      start();
    }
  }

  function resize() {
    if (!canvas || !ctx2d) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildScene();
  }

  function accentColor() {
    const s = getComputedStyle(document.documentElement);
    return {
      a: s.getPropertyValue("--pik-accent").trim() || "#ffffff",
      b: s.getPropertyValue("--pik-accent-alt").trim() || "#a3a3a3"
    };
  }

  function parseColorToRgb(val) {
    const str = String(val || "").trim();
    const rgbMatch = str.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (rgbMatch) {
      return [Math.round(+rgbMatch[1]), Math.round(+rgbMatch[2]), Math.round(+rgbMatch[3])];
    }
    const m = str.replace("#", "");
    const v = m.length === 3 ? m.split("").map(c => c + c).join("") : m;
    const n = parseInt(v, 16);
    if (Number.isNaN(n)) return [255, 255, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function buildScene() {
    const count = lite() ? 24 : 56;
    particles = Array.from({ length: count }, () => spawn());
    rings = [
      { r: Math.min(innerWidth, innerHeight) * 0.32, tilt: 0.5, speed: 0.00032, phase: 0 },
      { r: Math.min(innerWidth, innerHeight) * 0.42, tilt: -0.35, speed: -0.0002, phase: 2 },
      { r: Math.min(innerWidth, innerHeight) * 0.22, tilt: 0.9, speed: 0.00046, phase: 4 }
    ];
  }

  function spawn() {
    return {
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      z: Math.random() * 0.8 + 0.2,
      vx: (Math.random() - 0.5) * 0.11,
      vy: (Math.random() - 0.5) * 0.11,
      size: Math.random() * 1.7 + 0.4
    };
  }

  let cachedCols = null;
  function cols() {
    if (!cachedCols) {
      cachedCols = accentColor();
      cachedCols.rgbA = parseColorToRgb(cachedCols.a);
      cachedCols.rgbB = parseColorToRgb(cachedCols.b);
    }
    return cachedCols;
  }
  function invalidateColors() {
    cachedCols = null;
  }

  function neighborLinks(list, cell) {
    const grid = new Map();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const key = Math.floor(p.x / cell) + "," + Math.floor(p.y / cell);
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, (bucket = []));
      bucket.push(i);
    }
    const links = [];
    for (const [key, bucket] of grid) {
      const [gx, gy] = key.split(",").map(Number);
      for (let dx = 0; dx <= 1; dx++) {
        for (let dy = dx === 0 ? 0 : -1; dy <= 1; dy++) {
          const other = grid.get(gx + dx + "," + (gy + dy));
          if (!other) continue;
          for (let a = 0; a < bucket.length; a++) {
            const startIdx = other === bucket ? a + 1 : 0;
            for (let b = startIdx; b < other.length; b++) {
              links.push([bucket[a], other[b]]);
            }
          }
        }
      }
    }
    return links;
  }

  function frame(now) {
    if (!running || suppressedByHost()) {
      running = false;
      return;
    }
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
      ctx2d.strokeStyle = "rgba(" + r1 + "," + g1 + "," + b1 + "," + (0.09 - i * 0.02) + ")";
      ctx2d.lineWidth = 1;
      ctx2d.stroke();
      const ang = now * ring.speed + ring.phase;
      const px = Math.cos(ang) * ring.r;
      const py = Math.sin(ang) * ring.r;
      ctx2d.beginPath();
      ctx2d.arc(px, py, 2.2 - i * 0.4, 0, Math.PI * 2);
      ctx2d.fillStyle = "rgba(" + r1 + "," + g1 + "," + b1 + ",0.45)";
      ctx2d.fill();
      ctx2d.restore();
    });
  }

  function drawParticles() {
    const c = cols();
    const [ra, ga, ba] = c.rgbA;
    const [rb, gb, bb] = c.rgbB;
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
      ctx2d.fillStyle = "rgba(" + cr + "," + cg + "," + cb + "," + (0.14 * p.z + 0.04) + ")";
      ctx2d.fill();
    }
    const links = neighborLinks(particles, 110);
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
      ctx2d.strokeStyle = "rgba(" + cr + "," + cg + "," + cb + "," + (0.045 * (1 - d2 / 12000)) + ")";
      ctx2d.stroke();
    }
  }

  function start() {
    if (running || !ctx2d || reduced() || suppressedByHost() || lite()) return;
    invalidateColors();
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function stop(clear) {
    running = false;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    if (clear !== false && ctx2d) ctx2d.clearRect(0, 0, innerWidth, innerHeight);
  }

  function isRunning() {
    return running;
  }

  document.addEventListener("pik:themechange", invalidateColors);

  return { init, start, stop, isRunning };
})();

if (typeof window !== "undefined") {
  window.PIK3D = PIK3D;
}
