const PIKSettings = (() => {
  const KEY = "pik.ui.settings";

  function load() {
    try {
      return Object.assign({ theme: "midnight", density: "normal", perf: "full", fx: true }, JSON.parse(localStorage.getItem(KEY)));
    } catch (e) {
      return { theme: "midnight", density: "normal", perf: "full", fx: true };
    }
  }

  function save(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function apply() {
    const s = load();
    const root = document.documentElement;
    if (s.theme && s.theme !== "midnight") root.setAttribute("data-theme", s.theme);
    else root.removeAttribute("data-theme");
    if (s.density && s.density !== "normal") root.setAttribute("data-density", s.density);
    else root.removeAttribute("data-density");
    if (s.perf === "lite") root.setAttribute("data-perf", "lite");
    else root.removeAttribute("data-perf");
    const fxRoot = document.querySelector(".fx-root");
    if (fxRoot) fxRoot.style.display = s.fx ? "" : "none";
    return s;
  }

  function set(patch) {
    const s = Object.assign(load(), patch);
    save(s);
    apply();
    if (window.PIKAnonymity) PIKAnonymity.logActivity("settings", Object.keys(patch).join("+"));
    return s;
  }

  function flashSaved(el) {
    if (!el) return;
    el.classList.add("is-visible");
    setTimeout(() => el.classList.remove("is-visible"), 1200);
  }

  function bindAudioControls(scope) {
    const vol = scope.querySelector("[data-audio-volume]");
    const volOut = scope.querySelector("[data-audio-volume-out]");
    const mute = scope.querySelector("[data-audio-mute]");
    const enable = scope.querySelector("[data-audio-enable]");
    const list = scope.querySelector("[data-audio-tracks]");

    function paint(st) {
      if (vol) { vol.value = Math.round(st.volume * 100); vol.style.setProperty("--range-fill", Math.round(st.volume * 100) + "%"); }
      if (volOut) volOut.textContent = st.muted || !st.enabled ? "Off" : Math.round(st.volume * 100) + "%";
      if (mute) mute.checked = st.muted;
      if (enable) enable.checked = st.enabled;
      if (list) {
        [...list.children].forEach(row => {
          row.classList.toggle("is-playing", st.playing && row.dataset.trackId === st.track.id);
          row.classList.toggle("is-selected", row.dataset.trackId === st.track.id);
        });
      }
    }

    if (vol) {
      vol.addEventListener("input", () => {
        PIKAudio.setVolume(vol.value / 100);
        vol.style.setProperty("--range-fill", vol.value + "%");
      });
    }
    if (mute) mute.addEventListener("change", () => PIKAudio.toggleMute(mute.checked));
    if (enable) enable.addEventListener("change", () => PIKAudio.setEnabled(enable.checked));
    if (list) {
      list.innerHTML = "";
      PIKAudio.TRACKS.forEach((t, i) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "track-row";
        row.dataset.trackId = t.id;
        row.innerHTML =
          '<span class="track-row__index">' + String(i + 1).padStart(2, "0") + "</span>" +
          '<span><span class="track-row__name"></span><span class="track-row__artist"></span></span>' +
          '<span class="chip ' + (t.bpm >= 128 ? "live" : "") + '">' + t.bpm + " BPM</span>";
        row.querySelector(".track-row__name").textContent = t.title;
        row.querySelector(".track-row__artist").textContent = t.artist + " · " + t.mood;
        row.addEventListener("click", () => {
          PIKAudio.selectTrack(t.id);
          PIKAudio.play();
        });
        list.appendChild(row);
      });
    }
    PIKAudio.onChange(paint);
    paint(PIKAudio.getSettings());
  }

  function bindPrivacyZone(scope) {
    const btnClear = scope.querySelector("[data-clear-identity]");
    const btnRotate = scope.querySelector("[data-rotate-route]");
    const aliasEl = scope.querySelector("[data-anon-alias]");
    const hashEl = scope.querySelector("[data-anon-hash]");
    const visitsEl = scope.querySelector("[data-anon-visits]");
    const hopsEl = scope.querySelector("[data-route-hops]");
    const logEl = scope.querySelector("[data-activity-log]");

    function refresh() {
      PIKAnonymity.renderInto({ alias: aliasEl, hash: hashEl, visits: visitsEl, hops: hopsEl, log: logEl });
    }

    if (btnRotate) btnRotate.addEventListener("click", () => {
      PIKAnonymity.rotateRoute();
      PIKAnonymity.logActivity("route", "rotated");
      refresh();
      PIKToasts.show({ type: "info", title: "Route rotated", text: "Your next activity records will trace to a different public relay exit." });
    });

    if (btnClear) btnClear.addEventListener("click", () => {
      PIKAnonymity.clearAll();
      localStorage.removeItem("pik.accounts");
      localStorage.removeItem("pik.session");
      localStorage.removeItem(KEY);
      refresh();
      PIKToasts.show({ type: "success", title: "Local data purged", text: "Identity hashes, activity log and route chain were deleted from this device's storage." });
    });

    document.addEventListener("pik:activity", refresh);
    refresh();
    setInterval(refresh, 4000);
  }

  function bindThemeSwatches(scope) {
    scope.querySelectorAll("[data-theme-set]").forEach(btn => {
      btn.addEventListener("click", () => {
        set({ theme: btn.dataset.themeSet });
        /* let the FX engine re-read accent colors for the new theme */
        document.dispatchEvent(new CustomEvent("pik:themechange"));
        scope.querySelectorAll("[data-theme-set]").forEach(b => b.classList.toggle("is-active", b === btn));
      });
    });
    const density = scope.querySelector("[data-density-select]");
    if (density) {
      density.addEventListener("change", () => set({ density: density.value }));
      density.value = load().density;
    }
    const perf = scope.querySelector("[data-perf-toggle]");
    if (perf) {
      perf.checked = load().perf === "lite" || (window.PIKPerf && PIKPerf.getMode() === "lite");
      perf.addEventListener("change", () => {
        set({ perf: perf.checked ? "lite" : "full" });
        if (window.PIKPerf) PIKPerf.setMode(perf.checked ? "lite" : "full");
        if (perf.checked) PIK3D.stop(); else PIK3D.start();
      });
    }
    const fx = scope.querySelector("[data-fx-toggle]");
    if (fx) {
      fx.checked = load().fx;
      fx.addEventListener("change", () => set({ fx: fx.checked }));
    }
  }

  function initPage() {
    const page = document.querySelector("[data-settings-page]");
    if (!page) return;
    const saved = page.querySelector(".saved-flash");
    const originalSet = set;
    bindThemeSwatches(page);
    bindAudioControls(page);
    bindPrivacyZone(page);
    page.querySelectorAll("[data-setting-input]").forEach(inp => {
      inp.addEventListener("change", () => {
        originalSet({ [inp.dataset.settingInput]: inp.type === "checkbox" ? inp.checked : inp.value });
        flashSaved(saved);
      });
    });
    const s = load();
    page.querySelectorAll("[data-theme-set]").forEach(b => b.classList.toggle("is-active", b.dataset.themeSet === s.theme));
  }

  return { load, save: set, apply, initPage, bindAudioControls };
})();
