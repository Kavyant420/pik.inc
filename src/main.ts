/**
 * pik — the bootstrap.
 *
 * The wiring, in one place:
 *
 *   scroll  →  progress  →  camera  →  store  →  renderer
 *                        ↘  text pull  ↗
 *
 * Everything reads the shared store (docs/architecture.md §3). The scroll
 * writes `progress`, the camera choreography writes `radius` and
 * `inclination`, the render loop writes `time`, and the renderer writes the
 * projected centre of the shadow. Nothing else keeps a copy of any of it.
 */

import './styles/base.css';
import './styles/fonts.css';
import './styles/type.css';
import './styles/hud.css';
import './styles/nav.css';
import './styles/overlays.css';
import './styles/spiral.css';

import { PikStore } from './core/store';
import { createRenderer } from './gfx/renderer';
import { createCameraChoreography } from './scroll/camera';
import { createSmoothScroll } from './scroll/lenis';
import { createTimeline } from './scroll/timeline';
import { createTextPull } from './text/pull';
import { createAmbientAudio } from './ui/audio';
import { createColophon } from './ui/colophon';
import { createHud } from './ui/hud';
import { createNav } from './ui/nav';
import { createPreload } from './ui/preload';

/* ------------------------------------------------------------------ */
/* Reduced motion                                                     */
/* ------------------------------------------------------------------ */

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ------------------------------------------------------------------ */
/* The shared state                                                    */
/* ------------------------------------------------------------------ */

const store = new PikStore();

/* ------------------------------------------------------------------ */
/* The interface                                                       */
/* ------------------------------------------------------------------ */

const preload = createPreload({
  root: document.body,
  label: 'INTEGRATING THE METRIC',
  minimumMs: 700,
  reducedMotion: motionQuery.matches,
});

const hud = createHud({ store, root: document.body });

const chapters = Array.from(
  document.querySelectorAll<HTMLElement>('[data-chapter-label]'),
).map(
  (element, index) => ({
    id: element.id,
    label: element.dataset.chapterLabel ?? `Chapter ${index + 1}`,
    at: Number(element.dataset.chapterAt ?? index / 5),
  }),
);

const nav = createNav({ store, root: document.body, chapters });

const colophon = createColophon({ store, root: document.body });

const audio = createAmbientAudio({ store });

const audioToggle = document.querySelector<HTMLButtonElement>('[data-audio-toggle]');
audioToggle?.addEventListener('click', () => {
  void audio.toggle().then((enabled) => {
    audioToggle.textContent = enabled ? 'SOUND OFF' : 'SOUND ON';
    audioToggle.setAttribute('aria-pressed', String(enabled));
  });
});

/* ------------------------------------------------------------------ */
/* The camera and the scroll                                           */
/* ------------------------------------------------------------------ */

const camera = createCameraChoreography();

const scroll = createSmoothScroll({
  instant: motionQuery.matches,
  onProgress: (progress) => store.setProgress(progress),
});

const timeline = createTimeline({
  progress: () => store.state.progress,
  chapters: chapters.map((chapter) => ({ id: chapter.id, at: chapter.at, width: 0.13 })),
});

const pull = createTextPull({ store, root: document.body });

const scrollCue = document.querySelector<HTMLElement>('[data-scroll-cue]');
if (scrollCue) {
  const unsubscribe = store.subscribe((state) => {
    scrollCue.dataset.hidden = String(state.progress > 0.02);
  });
  window.addEventListener('pagehide', unsubscribe, { once: true });
}

/* ------------------------------------------------------------------ */
/* The renderer                                                        */
/* ------------------------------------------------------------------ */

const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');

/**
 * The resolution scale can be overridden from the query string:
 * `?quality=0.25`. The screenshot tool uses it, because a software
 * rasteriser cannot afford a full-resolution geodesic pass.
 */
const qualityOverride = Number(new URLSearchParams(location.search).get('quality'));

const renderer = createRenderer({
  fov: 0.62,
  qualityScale: Number.isFinite(qualityOverride) && qualityOverride > 0 ? qualityOverride : 1,
  maxSteps: 512,
  stepScale: 0.02,
  escapeRadius: 400,
  onReady: ({ caps }) => {
    preload.setLabel('METRIC RESOLVED');
    preload.setProgress(1);
    void caps;
  },
  onQualityChange: (scale) => store.setQualityScale(scale),
});

if (canvas) {
  renderer
    .init(canvas)
    .then(() => preload.finish())
    .catch((error: unknown) => {
      preload.setLabel('WEBGL2 UNAVAILABLE');
      console.error(error);
      document.body.dataset.renderer = 'unavailable';
    });
} else {
  preload.setLabel('NO CANVAS');
}

/* ------------------------------------------------------------------ */
/* The loop                                                            */
/* ------------------------------------------------------------------ */

let previous = performance.now();

const frame = (now: number) => {
  const dt = Math.min((now - previous) / 1000, 0.1);
  previous = now;

  scroll.lenis.raf(now);

  // The camera choreography owns the radius, inclination and roll.
  const sample = camera.sample(store.state.progress);
  store.setCamera(sample.radius, sample.inclination);
  store.setRoll(sample.roll);
  store.setTime(now / 1000);

  renderer.setState({
    radius: store.state.radius,
    inclination: store.state.inclination,
    roll: store.state.roll,
    spin: store.state.spin,
    time: store.state.time,
  });

  renderer.render(dt);

  const center = renderer.getScreenCenter();
  store.setScreenCenter(center.x, center.y);

  timeline.update();
  pull.update();

  store.bumpFrame();
  store.flush();

  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);

/* ------------------------------------------------------------------ */
/* Reduced motion, live                                                */
/* ------------------------------------------------------------------ */

const onMotionChange = () => {
  store.setReducedMotion(motionQuery.matches);
};
motionQuery.addEventListener('change', onMotionChange);
store.setReducedMotion(motionQuery.matches);

/* ------------------------------------------------------------------ */
/* The automation hook                                                  */
/* ------------------------------------------------------------------ */

/**
 * A small, deliberate surface for the tooling: `tools/shoot.mjs` drives
 * the page through it to take the screenshots at 0/25/50/75/100 %. It is
 * read-only apart from `scrollTo`, and it exposes nothing the reader
 * cannot already do with the scroll wheel.
 */
interface PikHook {
  store: PikStore;
  scrollTo: (progress: number) => void;
  getDiagnostics: () => {
    progress: number;
    radius: number;
    inclination: number;
    qualityScale: number;
    frames: number;
  };
}

const hook: PikHook = {
  store,
  scrollTo: (progress: number) => scroll.scrollTo(progress, { instant: true }),
  getDiagnostics: () => ({
    progress: store.state.progress,
    radius: store.state.radius,
    inclination: store.state.inclination,
    qualityScale: store.state.qualityScale,
    frames: store.state.frames,
  }),
};

(window as unknown as { __pik?: PikHook }).__pik = hook;

/* ------------------------------------------------------------------ */
/* Teardown                                                            */
/* ------------------------------------------------------------------ */

window.addEventListener('pagehide', () => {
  scroll.destroy();
  timeline.destroy();
  pull.dispose();
  hud.dispose();
  nav.dispose();
  colophon.dispose();
  audio.dispose();
  preload.dispose();
  renderer.dispose();
});
