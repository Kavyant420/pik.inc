/* PIK performance governor — adaptive glass quality + FPS-aware FX.
   Runs before first paint (deferred scripts) and exposes PIKPerf. */
const PIKPerf = (() => {
  const KEY = "pik.ui.perf.mode";

  function safeGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }

  function safeSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  }

  function reducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function coarsePointer() {
    return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  }

  function lowCores() {
    return (navigator.hardwareConcurrency || 8) <= 4;
  }

  function lowMemory() {
    return (navigator.deviceMemory || 8) <= 4;
  }

  function initialTier() {
    const saved = safeGet(KEY);
    if (saved === "full" || saved === "lite") return saved;
    if (reducedMotion()) return "lite";
    if (coarsePointer() && (lowCores() || lowMemory())) return "lite";
    return "full";
  }

  function applyTier(tier, persist) {
    const root = document.documentElement;
    if (tier === "lite") root.setAttribute("data-perf", "lite");
    else root.removeAttribute("data-perf");
    if (persist !== false) safeSet(KEY, tier);
    document.dispatchEvent(new CustomEvent("pik:perftier", { detail: { tier } }));
  }

  let sampling = false;
  let frames = 0;
  let last = 0;
  let slowWindows = 0;
  let downgraded = false;

  function sample(now) {
    if (!sampling) return;
    if (document.hidden) {
      frames = 0;
      last = 0;
      requestAnimationFrame(sample);
      return;
    }
    frames++;
    if (!last) last = now;
    const elapsed = now - last;
    if (elapsed >= 1000) {
      const fps = (frames * 1000) / elapsed;
      frames = 0;
      last = now;
      if (fps < 36) slowWindows++;
      else slowWindows = Math.max(0, slowWindows - 1);
      if (!downgraded && slowWindows >= 2 && initialTierIsFull()) {
        downgraded = true;
        applyTier("lite", false);
        slowWindows = 0;
      }
    }
    requestAnimationFrame(sample);
  }

  function initialTierIsFull() {
    return !document.documentElement.hasAttribute("data-perf");
  }

  function startSampling() {
    if (sampling || reducedMotion()) return;
    sampling = true;
    requestAnimationFrame(sample);
  }

  function bindVisibility() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (window.PIK3D && PIK3D.isRunning && PIK3D.isRunning()) PIK3D.stop(true);
      } else {
        if (window.PIK3D && PIK3D.start && initialTierIsFull()) PIK3D.start();
      }
    });
  }

  function setMode(mode) {
    const normalized = mode === "lite" ? "lite" : "full";
    if (normalized === "full") downgraded = false;
    applyTier(normalized, true);
  }

  function getMode() {
    return document.documentElement.hasAttribute("data-perf") ? "lite" : "full";
  }

  applyTier(initialTier(), false);
  bindVisibility();

  return {
    init() {
      startSampling();
    },
    setMode,
    getMode,
    reducedMotion
  };
})();

if (typeof window !== "undefined") {
  window.PIKPerf = PIKPerf;
}
