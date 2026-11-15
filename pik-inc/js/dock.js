const PIKDock = (() => {
  let dock, playBtn, volBtn, titleEl, barsWrap, volSlider, volOut, pop;
  let animRaf = null;
  let isAnimating = false;
  const data = new Uint8Array(32);

  function resolveRoot() {
    const raw = (document.body && document.body.getAttribute("data-root")) || "./";
    return raw.endsWith("/") ? raw : raw + "/";
  }

  const DOCK_ITEMS = [
    {
      href: "index.html",
      label: "Home",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/></svg>'
    },
    {
      href: "pikx.html",
      label: "PIKX",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/><circle cx="12" cy="12" r="9" stroke-opacity="0.45"/></svg>'
    },
    {
      href: "blackhole.html",
      label: "Singularity",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-18 12 12)"/></svg>'
    },
    {
      href: "products.html",
      label: "Products",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>'
    },
    {
      href: "security.html",
      label: "Security",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>'
    },
    {
      href: "account.html",
      label: "Account",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>'
    },
    {
      href: "settings.html",
      label: "Settings",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>'
    }
  ];

  function mount() {
    if (document.querySelector(".audio-dock")) return;
    const root = resolveRoot();
    dock = document.createElement("aside");
    dock.className = "audio-dock is-idle";
    dock.setAttribute("aria-label", "Liquid Glass Dock & Ambient Synth");

    const navHtml = DOCK_ITEMS.map(
      item =>
        '<a class="dock-link" href="' +
        root +
        item.href +
        '" aria-label="' +
        item.label +
        '" title="' +
        item.label +
        '">' +
        item.icon +
        '<span class="dock-link__text">' +
        item.label +
        "</span></a>"
    ).join("");

    dock.innerHTML =
      '<nav class="dock-nav" aria-label="Quick launcher">' +
      navHtml +
      "</nav>" +
      '<span class="dock-sep" aria-hidden="true"></span>' +
      '<div class="dock-audio">' +
      '<span class="visualizer" aria-hidden="true">' +
      '<i class="visualizer__bar"></i>'.repeat(7) +
      "</span>" +
      '<span class="audio-dock__label"><span class="audio-dock__title">Synth · NCS</span>' +
      '<span class="audio-dock__track"></span></span>' +
      '<button class="eq-toggle" type="button" data-dock-play aria-label="Play or pause ambient synth"></button>' +
      '<button class="eq-toggle" type="button" data-dock-vol aria-expanded="false" aria-label="Volume and audio settings">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>' +
      "</button>" +
      '<div class="volume-pop" role="region" aria-label="Volume control">' +
      '<div class="row row--between"><span class="u-mono u-small">Volume</span><span class="value-readout" data-dock-volout>35%</span></div>' +
      '<input class="range" type="range" min="0" max="100" value="35" data-dock-volume aria-label="Music volume">' +
      '<a class="btn btn--ghost btn--sm btn--block" href="' +
      root +
      'settings.html#audio">Audio deck &amp; tracks →</a>' +
      "</div>" +
      "</div>";

    document.body.appendChild(dock);

    playBtn = dock.querySelector("[data-dock-play]");
    volBtn = dock.querySelector("[data-dock-vol]");
    titleEl = dock.querySelector(".audio-dock__track");
    barsWrap = dock.querySelectorAll(".visualizer__bar");
    volSlider = dock.querySelector("[data-dock-volume]");
    volOut = dock.querySelector("[data-dock-volout]");
    pop = dock.querySelector(".volume-pop");

    playBtn.innerHTML = iconPlay();

    playBtn.addEventListener("click", () => {
      const st = PIKAudio.getSettings();
      if (st.playing) PIKAudio.pause();
      else PIKAudio.play();
    });

    function closePop(restoreFocus) {
      if (!pop.classList.contains("is-open")) return;
      pop.classList.remove("is-open");
      volBtn.setAttribute("aria-expanded", "false");
      if (restoreFocus) volBtn.focus();
    }

    volBtn.addEventListener("click", ev => {
      ev.stopPropagation();
      const open = pop.classList.toggle("is-open");
      volBtn.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", ev => {
      if (!pop.classList.contains("is-open")) return;
      if (!pop.contains(ev.target) && !volBtn.contains(ev.target)) {
        closePop(false);
      }
    });

    document.addEventListener("keydown", ev => {
      if (ev.key === "Escape" && pop.classList.contains("is-open")) {
        closePop(true);
      }
    });

    volSlider.addEventListener("input", () => {
      PIKAudio.setVolume(Number(volSlider.value) / 100);
      volSlider.style.setProperty("--range-fill", volSlider.value + "%");
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopBars(false);
      else if (PIKAudio.getSettings().playing) startBars();
    });

    PIKAudio.onChange(paint);
    paint(PIKAudio.getSettings());
  }

  function iconPlay() {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l11 7-11 7z"/></svg>';
  }

  function iconPause() {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  }

  function paint(st) {
    if (!dock) return;
    dock.classList.toggle("is-idle", !st.playing);
    playBtn.innerHTML = st.playing ? iconPause() : iconPlay();
    playBtn.setAttribute("aria-pressed", String(!!st.playing));
    titleEl.textContent = st.track.title + " · " + st.track.mood;
    const pct = Math.round(st.volume * 100);
    volSlider.value = pct;
    volSlider.style.setProperty("--range-fill", pct + "%");
    volOut.textContent = st.muted || !st.enabled ? "Muted" : pct + "%";

    if (st.playing && !document.hidden) startBars();
    else stopBars(true);
  }

  function startBars() {
    if (isAnimating) return;
    isAnimating = true;
    function loop() {
      if (!isAnimating) return;
      const got = PIKAudio.getSpectrum(data);
      barsWrap.forEach((bar, i) => {
        let v = 0.14;
        if (got) {
          const idx = 2 + i * 3;
          v = Math.max(0.14, data[idx] / 255);
        }
        bar.style.transform = "scaleY(" + (0.16 + v * 0.84).toFixed(3) + ")";
      });
      animRaf = requestAnimationFrame(loop);
    }
    animRaf = requestAnimationFrame(loop);
  }

  function stopBars(resetScale) {
    isAnimating = false;
    if (animRaf) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
    if (resetScale && barsWrap) {
      barsWrap.forEach(bar => {
        bar.style.transform = "scaleY(0.22)";
      });
    }
  }

  return { mount, resolveRoot };
})();

if (typeof window !== "undefined") {
  window.PIKDock = PIKDock;
}
