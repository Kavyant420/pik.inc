# pik — Architecture

> Contract for parallel work. **Every agent reads this file first.**
> Shared files are owned by the lead (`src/core/**`, `src/physics/kerr/**`,
> `src/renderer/BlackHoleRenderer.ts`, `src/main.ts`, `index.html`,
> `vite.config.ts`). Do not edit files you do not own — request a change in your
> final report instead.

## 0. What we are building

`pik` is a single-page, fully static website whose entire background is a
real-time, physically exact Kerr black hole (a = 0.999 by default) rendered in
WebGL2 with per-pixel null-geodesic integration. The visitor scrolls; the
camera falls toward the black hole; HTML text is pulled into the shadow.

No backend, no API keys, no runtime CDN, no fonts from a CDN, no images
shipped from third parties. Everything is authored in this repo.

## 1. Numerics / units

Geometric units `G = c = 1`, `M = 1`. The black hole is a Kerr hole with spin
`a = a*` (dimensionless, `a* = a/M`). Boyer–Lindquist coordinates `(t, r, θ, φ)`
with **the spin axis along `z` and the accretion disk in the equatorial plane
`θ = π/2`**.

Conventions (derived and validated in `src/physics/kerr/metric.ts`):

```
Σ(r,θ) = r² + a²cos²θ          Δ(r) = r² − 2r + a²
A(r,θ) = (r²+a²)² − a²Δ sin²θ
```

Covariant metric (equatorial-disk convention, `z` = spin axis):

```
g_tt = −(1 − 2r/Σ)        g_tφ = −2ar sin²θ/Σ
g_rr = Σ/Δ                g_θθ = Σ
g_φφ = sin²θ (r² + a² + 2a²r sin²θ/Σ)
```

Inverse metric:

```
g^tt = −A/(ΣΔ)            g^tφ = −2ar/(ΣΔ)
g^rr = Δ/Σ                g^θθ = 1/Σ
g^φφ = (Δ − a²sin²θ)/(ΣΔ sin²θ)
```

Null-geodesic conserved quantities (Carter separation):

```
E  = −p_t                 L = p_φ
R(r) = [E(r²+a²) − aL]² − Δ[(L − aE)² + Q]
Θ(θ) = Q − L²cot²θ + a²E²cos²θ          ( = p_θ² )
Q  = p_θ² + L²cot²θ − a²E²cos²θ
```

Radial / polar motion decouple in **Carter time** `σ` (`dσ = dλ/Σ`):

```
dr/dσ = ±√R(r)               dθ/dσ = ±√Θ(θ)
dφ/dσ = Σ·φ̇                  dt/dσ = Σ·ṫ
```

## 2. Runtime shape

```
src/
  main.ts                 ← lead: bootstraps everything
  core/
    store.ts              ← lead: THE SHARED STATE CONTRACT (read below)
    events.ts             ← lead: tiny typed emitter
    quality.ts            ← lead: resolution governor helpers
  physics/
    kerr/
      metric.ts           ← lead: metric, tetrad, invariants
      conserved.ts        ← lead: E, L, Q from a local ray
      geodesics.ts        ← lead: Carter-time integrator, quartic solvers
      orbital.ts          ← lead: ISCO, photon orbits, circular-orbit data
      constants.ts        ← lead
    diskModel.ts          ← agent 2 (Novikov–Thorne, blackbody, beaming)
  renderer/
    BlackHoleRenderer.ts  ← lead: implements the renderer contract
    pipeline.ts           ← lead: HDR targets + pass orchestration
    gl/
      context.ts          ← lead: WebGL2 context, caps, float render targets
      program.ts          ← lead: shader compile/link helpers
    shaders/
      df64.glsl.ts             ← agent 1: double-single arithmetic
      kerrRay.glsl.ts          ← agent 1: Kerr ray marcher
      disk.glsl.ts             ← agent 2: emission model
      starfield.glsl.ts        ← agent 3
      composite.glsl.ts        ← agent 3
      bloom.glsl.ts            ← agent 3
      tonemap.glsl.ts          ← agent 3
      dither.glsl.ts           ← agent 3
      common.glsl.ts           ← lead: shared uniforms + helpers
  scroll/
    lenis.ts              ← agent 4
    camera.ts             ← agent 4: radius/inclination choreography
    timeline.ts           ← agent 4: GSAP ScrollTrigger beats
  text/
    split.ts              ← agent 4: glyph splitting
    pull.ts               ← agent 4: spaghettification into the shadow
  ui/
    hud.ts                ← agent 5
    nav.ts                ← agent 5
    preload.ts            ← agent 5
    audio.ts              ← agent 5 (WebAudio, off by default)
  styles/
    *.css                 ← agent 5
docs/                     ← lead + agents (see ownership table)
prototypes/               ← lead + agent 6
tests/                    ← agent 1 (unit) + agent 6 (e2e)
tools/                    ← agent 6
```

## 3. The shared store (single source of truth)

`src/core/store.ts`. Nothing else keeps scroll progress.

```ts
export interface BlackHoleState {
  radius: number;       // camera Boyer–Lindquist radius r, in M  (never < 3.2)
  inclination: number;  // camera polar angle θ in radians (≈1.50 = slightly above the disk plane)
  spin: number;         // a/M (0.999 default)
  time: number;         // seconds, for disk turbulence / drift
}

export interface HudReadout {
  radiusM: number;         // r in M
  radiusSchwarzschild: number; // r in Schwarzschild radii (r_s = 2M)
  timeDilation: number;    // dτ_static/dt at the camera radius
  inclinationDeg: number;
  spin: number;
}

export interface PikState {
  progress: number;                 // 0..1 scroll progress (the only truth)
  radius: number;
  inclination: number;
  spin: number;
  time: number;
  reducedMotion: boolean;
  qualityScale: number;             // 0.25 .. 1.0, resolution multiplier
  blackHoleScreenCenter: { x: number; y: number };  // CSS px, viewport coords
  aspect: number;
  hud: HudReadout;
  frames: number;
}

export type StoreListener = (s: PikState) => void;

export class PikStore {
  readonly state: PikState;
  setProgress(p: number): void;         // clamped 0..1
  setCamera(radius: number, inclination: number): void;
  setSpin(a: number): void;
  setTime(t: number): void;
  setReducedMotion(v: boolean): void;
  setQualityScale(s: number): void;
  setScreenCenter(x: number, y: number): void;
  subscribe(fn: StoreListener): () => void;
}
```

Rules:

* `progress` is written **only** by the scroll system (agent 4).
* `radius`, `inclination` are written **only** by the camera choreography (agent 4).
* `time` is written **only** by the render loop.
* `blackHoleScreenCenter` is written **only** by the renderer, every frame.
* Consumers must never cache; they must read `store.state` in their frame loop
  or in the subscribe callback.

## 4. Renderer contract

`src/renderer/BlackHoleRenderer.ts` exports:

```ts
export interface BlackHoleRenderer {
  init(canvas: HTMLCanvasElement): Promise<void>;
  setState(s: BlackHoleState): void;
  render(dt: number): void;
  getScreenCenter(): { x: number; y: number };
  dispose(): void;
}
export function createRenderer(opts: RendererOptions): BlackHoleRenderer;
```

* `init` creates the WebGL2 context (must be `WebGL2RenderingContext`),
  detects float-render-target support, compiles the shader chain and returns a
  promise that resolves once the first frame is warm.
* `setState` is called every frame with the current camera/scan state.
* `render(dt)` draws one frame. `dt` is in seconds.
* `getScreenCenter()` returns the projected centre of the shadow in **CSS
  pixels relative to the viewport** (not canvas pixels) — the text-pull system
  needs that to aim the spiral.
* `dispose()` frees GL resources, cancels the RAF loop, removes listeners.

The renderer owns the whole pipeline:

```
[geodesic pass: RGBA16F] → [bloom: 3 mips] → [composite + glare + dither]
                                                            → canvas (sRGB)
```

## 5. Physics invariants (must hold on every device, at every quality level)

1. Full Kerr geodesics. Scanning disk emission with Doppler + gravitational
   redshift (`g`) and beaming (`g⁴`). Never a fake "lens" approximation.
2. The quality governor may change **resolution, supersample count and bloom
   resolution only**. It may never change the physics.
3. If the device cannot keep up, the site falls back to a **pre-rendered
   sequence** produced by the same Kerr renderer (agent 6, `tools/`).

## 6. Hard design rules

* Sans-serif only:
  `"Segoe UI Variable Display", "Segoe UI", Selawik, system-ui, -apple-system, Helvetica, Arial, sans-serif`
  Selawik (SIL OFL 1.1) is self-hosted from `public/fonts/`.
* **No boxes.** No cards, panels, borders, outlines, pills, glass, or fills
  behind or around any text — including nav, buttons, HUD and tooltips. Links
  and buttons are plain text with an animated underline or glow.
  A soft `text-shadow` glow is allowed.
* Background is pure `#000000`. No gradient, no lifted vignette, no nebula.
* Warm white text `#F5EDE4`, WCAG AA contrast on black.
* Typography: light weights, fluid `clamp()` sizes, tight tracking on display
  type, generous whitespace.
* Reduced motion: `prefers-reduced-motion` → simplified fades, stepped camera
  movement, no spaghettification.

## 7. Validation gates

`npm test` (Vitest) must pass. The suite includes the physics validation
suite (agent 1) and the shader-vs-CPU comparison harness. `npm run shots`
(agent 6) must produce screenshots at scroll 0/25/50/75/100 %.
