const PIKAudio = (() => {
  const KEY = "pik.audio.settings";
  const TRACKS = [
    { id: "spectrum", title: "Spectrum Drift", artist: "NCS Style · PIK Sessions", bpm: 126, root: 55.0, scale: [0, 3, 5, 7, 10], wave: "sawtooth", mood: "uplifting" },
    { id: "cartoon", title: "Cartoon Energy", artist: "NCS Style · PIK Sessions", bpm: 128, root: 49.0, scale: [0, 2, 3, 5, 7, 9], wave: "square", mood: "playful" },
    { id: "fade", title: "Fade Horizon", artist: "NCS Style · PIK Sessions", bpm: 124, root: 65.4, scale: [0, 2, 4, 7, 9], wave: "triangle", mood: "melodic" },
    { id: "onoff", title: "OnOff Pulse", artist: "NCS Style · PIK Sessions", bpm: 128, root: 58.3, scale: [0, 3, 6, 7, 10], wave: "sawtooth", mood: "electro" },
    { id: "invincible", title: "Invincible Rise", artist: "NCS Style · PIK Sessions", bpm: 132, root: 61.7, scale: [0, 2, 5, 7, 9], wave: "sawtooth", mood: "anthem" },
    { id: "spectre", title: "Spectre Night", artist: "NCS Style · PIK Sessions", bpm: 122, root: 46.2, scale: [0, 3, 5, 8, 10], wave: "triangle", mood: "deep" }
  ];

  let ctx = null;
  let master = null;
  let comp = null;
  let analyser = null;
  let noiseBuf = null;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let state = loadState();
  let listeners = [];

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign({ volume: 0.35, trackId: "spectrum", muted: false, enabled: true }, JSON.parse(raw));
    } catch (e) {}
    return { volume: 0.35, trackId: "spectrum", muted: false, enabled: true };
  }

  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function emit() {
    listeners.forEach(fn => fn(publicView()));
  }

  function publicView() {
    return {
      playing: !!timer && !state.muted && state.enabled,
      volume: state.volume,
      muted: state.muted,
      enabled: state.enabled,
      track: currentTrack(),
      tracks: TRACKS
    };
  }

  function currentTrack() {
    return TRACKS.find(t => t.id === state.trackId) || TRACKS[0];
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    master.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);
    const len = ctx.sampleRate * 1;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function setVolume(v) {
    state.volume = Math.min(1, Math.max(0, v));
    if (state.volume > 0) state.muted = false;
    applyGain();
    saveState();
    emit();
  }

  function toggleMute(force) {
    state.muted = force !== undefined ? force : !state.muted;
    applyGain();
    saveState();
    emit();
  }

  function setEnabled(on) {
    state.enabled = on;
    if (!on) stopClock();
    else if (userWantsPlaying()) startClock();
    applyGain();
    saveState();
    emit();
  }

  function selectTrack(id) {
    if (!TRACKS.some(t => t.id === id)) return;
    state.trackId = id;
    step = 0;
    saveState();
    if (timer) { stopClock(); startClock(); }
    emit();
  }

  function applyGain() {
    if (!ctx || !master) return;
    const target = (state.muted || !state.enabled) ? 0 : state.volume * 0.9;
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
  }

  function userWantsPlaying() {
    return state.enabled && !state.muted;
  }

  function play() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === "suspended") c.resume();
    state.muted = false;
    state.enabled = true;
    saveState();
    startClock();
    applyGain();
    emit();
  }

  function pause() {
    stopClock();
    saveState();
    emit();
  }

  function toggle() {
    if (timer) pause();
    else play();
  }

  function startClock() {
    if (timer) return;
    const c = ensureCtx();
    if (!c) return;
    if (c.state === "suspended") c.resume();
    nextTime = c.currentTime + 0.06;
    timer = setInterval(scheduler, 60);
    applyGain();
  }

  function stopClock() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function scheduler() {
    const c = ctx;
    const track = currentTrack();
    const spb = 60 / track.bpm;
    const stepDur = spb / 4;
    while (nextTime < c.currentTime + 0.22) {
      scheduleStep(track, step, nextTime, stepDur);
      step = (step + 1) % 64;
      nextTime += stepDur;
    }
  }

  function midiToFreq(root, semi) {
    return root * Math.pow(2, semi / 12);
  }

  function scheduleStep(track, s, t, dur) {
    const bar = Math.floor(s / 16);
    const beat = s % 16;
    const chords = [[0, 3, 7], [ -2, 3, 5], [5, 9, 12], [3, 7, 10]];
    const chord = chords[bar % chords.length];

    if (beat % 4 === 0) kick(t);
    if (beat === 4 || beat === 12) snare(t);
    if (beat % 2 === 1) hat(t, beat === 7 ? 0.25 : 0.12);

    if (beat % 2 === 0) {
      const idx = (beat / 2) % chord.length;
      bass(t, midiToFreq(track.root, chord[idx % chord.length]), dur * 1.8, track.wave);
    }

    if ([0, 6, 10, 13].includes(beat)) {
      padChord(t, track, chord, dur);
    }

    if (bar >= 1 && beat % 8 === 0) {
      leadPluck(t, midiToFreq(track.root * 4, chord[(s / 8 | 0) % chord.length] + (beat === 6 ? 12 : 0)));
    }
  }

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.26);
  }

  function snare(t) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.18);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(190, t);
    og.gain.setValueAtTime(0.22, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og); og.connect(master);
    o.start(t); o.stop(t + 0.1);
  }

  function hat(t, level) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 2.4;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.06);
  }

  function bass(t, freq, dur, wave) {
    const o = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = wave === "square" ? "square" : "sawtooth";
    o.frequency.value = freq;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function padChord(t, track, chord, dur) {
    chord.forEach((semi, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      o.type = "triangle";
      o.frequency.value = midiToFreq(track.root * 2, semi);
      o.detune.value = (i - 1) * 5;
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      const len = dur * 6;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(lp); lp.connect(g); g.connect(master);
      o.start(t); o.stop(t + len + 0.1);
    });
  }

  function leadPluck(t, freq) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.5);
  }

  function getSpectrum(arr) {
    if (!analyser) return null;
    analyser.getByteFrequencyData(arr);
    return arr;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  document.addEventListener("click", function armOnce() {
    if (ensureCtx() && ctx.state === "suspended") ctx.resume();
  }, { capture: true });

  return { play, pause, toggle, setVolume, toggleMute, setEnabled, selectTrack, getSpectrum, onChange, getSettings: () => publicView(), TRACKS };
})();
