const PIKDock = (() => {
  let dock, playBtn, titleEl, barsWrap, volSlider, volOut, pop;

  function mount() {
    if (document.querySelector(".audio-dock")) return;
    dock = document.createElement("div");
    dock.className = "audio-dock glass glass--deep is-idle";
    dock.setAttribute("aria-label", "Ambient music player");
    dock.innerHTML =
      '<span class="visualizer" aria-hidden="true">' + '<i class="visualizer__bar"></i>'.repeat(9) + "</span>" +
      '<span class="audio-dock__label"><span class="audio-dock__title">Now playing · NCS mix</span>' +
      '<span class="audio-dock__track"></span></span>' +
      '<button class="eq-toggle" type="button" aria-label="Play or pause music"></button>' +
      '<button class="eq-toggle" type="button" data-dock-panel aria-label="Open track list">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button>' +
      '<div class="volume-pop glass glass--solid"><span class="u-mono u-small">Volume</span>' +
      '<input class="range" type="range" min="0" max="100" value="35" data-dock-volume aria-label="Music volume">' +
      '<span class="value-readout" data-dock-volout>35%</span></div>';
    document.body.appendChild(dock);

    playBtn = dock.querySelector(".eq-toggle");
    playBtn.innerHTML = iconPlay();
    titleEl = dock.querySelector(".audio-dock__track");
    barsWrap = dock.querySelectorAll(".visualizer__bar");
    volSlider = dock.querySelector("[data-dock-volume]");
    volOut = dock.querySelector("[data-dock-volout]");
    pop = dock.querySelector(".volume-pop");

    playBtn.addEventListener("click", () => {
      const st = PIKAudio.getSettings();
      if (st.playing) PIKAudio.pause(); else PIKAudio.play();
    });

    dock.querySelector("[data-dock-panel]").addEventListener("click", () => {
      const root = document.body.getAttribute("data-root") || "./";
      location.href = root + "settings.html#audio";
    });

    volSlider.addEventListener("input", () => {
      PIKAudio.setVolume(volSlider.value / 100);
      volSlider.style.setProperty("--range-fill", volSlider.value + "%");
    });

    PIKAudio.onChange(paint);
    paint(PIKAudio.getSettings());
    animateBars();
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
    titleEl.textContent = st.track.title + " — " + st.track.mood;
    volSlider.value = Math.round(st.volume * 100);
    volSlider.style.setProperty("--range-fill", Math.round(st.volume * 100) + "%");
    volOut.textContent = st.muted || !st.enabled ? "Muted" : Math.round(st.volume * 100) + "%";
  }

  const data = new Uint8Array(32);

  function animateBars() {
    function loop() {
      const got = PIKAudio.getSpectrum(data);
      barsWrap.forEach((bar, i) => {
        let v = 0.12;
        if (got) {
          const idx = 2 + i * 3;
          v = Math.max(0.12, (data[idx] / 255));
        }
        bar.style.transform = "scaleY(" + (0.15 + v * 0.85).toFixed(3) + ")";
      });
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  return { mount };
})();
