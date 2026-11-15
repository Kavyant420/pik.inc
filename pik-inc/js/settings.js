const PIKSettings = (() => {
  const KEY = "pik.ui.settings";
  const DEFAULTS = { theme: "midnight", density: "normal", perf: null, fx: true };
  let flashTimer = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {});
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function apply() {
    const s = load();
    const root = document.documentElement;
    if (s.theme && s.theme !== "midnight") root.setAttribute("data-theme", s.theme);
    else root.removeAttribute("data-theme");

    if (s.density && s.density !== "normal") root.setAttribute("data-density", s.density);
    else root.removeAttribute("data-density");

    if (s.perf === "lite") root.setAttribute("data-perf", "lite");
    else if (s.perf === "full") root.removeAttribute("data-perf");

    if (s.fx === false) root.setAttribute("data-fx", "off");
    else root.removeAttribute("data-fx");

    const fxRoot = document.querySelector(".fx-root");
    if (fxRoot) fxRoot.style.display = s.fx === false ? "none" : "";
    if (window.PIK3D) {
      if (s.fx === false || root.getAttribute("data-perf") === "lite") PIK3D.stop(true);
      else PIK3D.start();
    }
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
    el.classList.add("is-visible", "is-on");
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      el.classList.remove("is-visible", "is-on");
    }, 1300);
  }

  function syncSwitchAria(inputEl) {
    if (!inputEl) return;
    const label = inputEl.closest(".switch");
    if (label) label.setAttribute("aria-checked", String(!!inputEl.checked));
  }

  function bindAudioControls(scope, onSaved) {
    const vol = scope.querySelector("[data-audio-volume]");
    const volOut = scope.querySelector("[data-audio-volume-out]");
    const mute = scope.querySelector('[data-audio-mute], [data-setting-input="audioMute"]');
    const enable = scope.querySelector('[data-audio-enable], [data-setting-input="audioEnabled"]');
    const list = scope.querySelector("[data-audio-tracks]");

    function paint(st) {
      const pct = Math.round(st.volume * 100);
      if (vol) {
        vol.value = pct;
        vol.style.setProperty("--range-fill", pct + "%");
      }
      if (volOut) volOut.textContent = st.muted || !st.enabled ? "Off" : pct + "%";
      if (mute) {
        mute.checked = !!st.muted;
        syncSwitchAria(mute);
      }
      if (enable) {
        enable.checked = !!st.enabled;
        syncSwitchAria(enable);
      }
      if (list) {
        [...list.children].forEach(row => {
          row.classList.toggle("is-playing", st.playing && row.dataset.trackId === st.track.id);
          row.classList.toggle("is-selected", row.dataset.trackId === st.track.id);
        });
      }
    }

    if (vol) {
      vol.addEventListener("input", () => {
        PIKAudio.setVolume(Number(vol.value) / 100);
        vol.style.setProperty("--range-fill", vol.value + "%");
      });
      vol.addEventListener("change", () => {
        if (onSaved) onSaved();
      });
    }
    if (mute) {
      mute.dataset.boundCustom = "1";
      mute.addEventListener("change", () => {
        syncSwitchAria(mute);
        PIKAudio.toggleMute(mute.checked);
        if (onSaved) onSaved();
      });
    }
    if (enable) {
      enable.dataset.boundCustom = "1";
      enable.addEventListener("change", () => {
        syncSwitchAria(enable);
        PIKAudio.setEnabled(enable.checked);
        if (onSaved) onSaved();
      });
    }
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
          '<span class="chip ' + (t.bpm >= 128 ? "chip--live" : "") + '">' + t.bpm + " BPM</span>";
        row.querySelector(".track-row__name").textContent = t.title;
        row.querySelector(".track-row__artist").textContent = t.artist + " · " + t.mood;
        row.addEventListener("click", () => {
          PIKAudio.selectTrack(t.id);
          PIKAudio.play();
          if (onSaved) onSaved();
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
      if (!window.PIKAnonymity) return;
      PIKAnonymity.renderInto({
        alias: aliasEl,
        hash: hashEl,
        visits: visitsEl,
        hops: hopsEl,
        log: logEl
      });
    }

    if (btnRotate) {
      btnRotate.addEventListener("click", () => {
        PIKAnonymity.rotateRoute();
        PIKAnonymity.logActivity("route", "rotated");
        refresh();
        if (window.PIKToasts) {
          PIKToasts.show({
            type: "info",
            title: "Route rotated",
            text: "Subsequent activity hashes will trace to a new public relay exit."
          });
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", () => {
        PIKAnonymity.clearAll();
        try {
          localStorage.removeItem("pik.accounts");
          localStorage.removeItem("pik.session");
          localStorage.removeItem("pik.waitlist");
          localStorage.removeItem(KEY);
        } catch (e) {}
        apply();
        document.dispatchEvent(new CustomEvent("pik:authchange", { detail: { session: null } }));
        refresh();
        if (window.PIKToasts) {
          PIKToasts.show({
            type: "success",
            title: "Local data purged",
            text: "Identity hashes, local accounts, activity log, and route chain were wiped from this browser."
          });
        }
      });
    }

    document.addEventListener("pik:activity", refresh);
    refresh();
  }

  function syncSwatches(scope, activeTheme) {
    const cur = activeTheme || "midnight";
    scope.querySelectorAll("[data-theme-set]").forEach(b => {
      const on = b.dataset.themeSet === cur;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  function bindThemeSwatches(scope, onSaved) {
    scope.querySelectorAll("[data-theme-set]").forEach(btn => {
      btn.addEventListener("click", () => {
        const nextTheme = btn.dataset.themeSet || "midnight";
        set({ theme: nextTheme });
        document.dispatchEvent(new CustomEvent("pik:themechange", { detail: { theme: nextTheme } }));
        syncSwatches(scope, nextTheme);
        if (onSaved) onSaved();
      });
    });

    const density = scope.querySelector("[data-density-select]");
    if (density) {
      density.value = load().density || "normal";
      density.addEventListener("change", () => {
        set({ density: density.value });
        if (onSaved) onSaved();
      });
    }

    const perf = scope.querySelector('[data-perf-toggle], [data-setting-input="perf-lite"]');
    if (perf) {
      perf.dataset.boundCustom = "1";
      const s = load();
      perf.checked = s.perf === "lite" || (window.PIKPerf && PIKPerf.getMode() === "lite");
      syncSwitchAria(perf);
      perf.addEventListener("change", () => {
        const mode = perf.checked ? "lite" : "full";
        syncSwitchAria(perf);
        set({ perf: mode });
        if (window.PIKPerf) PIKPerf.setMode(mode);
        if (window.PIK3D) {
          if (perf.checked) PIK3D.stop(true);
          else PIK3D.start();
        }
        if (onSaved) onSaved();
      });
    }

    const fx = scope.querySelector('[data-fx-toggle], [data-setting-input="fx"]');
    if (fx) {
      fx.dataset.boundCustom = "1";
      fx.checked = load().fx !== false;
      syncSwitchAria(fx);
      fx.addEventListener("change", () => {
        syncSwitchAria(fx);
        set({ fx: fx.checked });
        if (onSaved) onSaved();
      });
    }
  }

  function bindSidebarNav(scope) {
    const navItems = [...scope.querySelectorAll('.settings-nav__item[href^="#"]')];
    if (!navItems.length) return;
    navItems.forEach(item => {
      item.addEventListener("click", () => {
        navItems.forEach(n => n.classList.toggle("is-active", n === item));
      });
    });
    const sections = navItems
      .map(n => document.getElementById((n.getAttribute("href") || "").slice(1)))
      .filter(Boolean);
    if (sections.length && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        entries => {
          entries.forEach(e => {
            if (e.isIntersecting) {
              navItems.forEach(n => n.classList.toggle("is-active", n.getAttribute("href") === "#" + e.target.id));
            }
          });
        },
        { rootMargin: "-20% 0px -65% 0px" }
      );
      sections.forEach(sec => io.observe(sec));
    }
  }

  function initPage() {
    const page = document.querySelector("[data-settings-page]");
    if (!page) return;
    const saved = page.querySelector(".saved-flash") || document.querySelector(".saved-flash");
    const notifySaved = () => flashSaved(saved);

    bindThemeSwatches(page, notifySaved);
    bindAudioControls(page, notifySaved);
    bindPrivacyZone(page);
    bindSidebarNav(page);

    page.querySelectorAll("[data-setting-input]").forEach(inp => {
      if (inp.dataset.boundCustom === "1") return;
      syncSwitchAria(inp);
      inp.addEventListener("change", () => {
        syncSwitchAria(inp);
        set({ [inp.dataset.settingInput]: inp.type === "checkbox" ? inp.checked : inp.value });
        notifySaved();
      });
    });

    syncSwatches(page, load().theme);
  }

  return { load, save: set, apply, initPage, bindAudioControls };
})();

if (typeof window !== "undefined") {
  window.PIKSettings = PIKSettings;
}
