# Brief — the standing context pack

> Reference this from every request (`"See BRIEF.md"`). Do not paste the
> whole thing unless the request genuinely needs it.

## What pik is

A single-page, fully static website whose entire background is a real-time,
physically exact Kerr black hole (a = 0.999 by default) rendered in WebGL2
with per-pixel null-geodesic integration. The visitor scrolls; the camera
falls toward the black hole; the HTML text is pulled into the shadow.

No backend. No API keys at runtime. No runtime CDN. No fonts from a CDN.
No images shipped from third parties. Everything is authored in this repo.

## The physics (do not get this wrong)

Geometric units `G = c = 1`, `M = 1`. Boyer–Lindquist coordinates
`(t, r, θ, φ)` with **the spin axis along `z`** and the accretion disk in
the equatorial plane `θ = π/2`.

```
Σ(r,θ) = r² + a²cos²θ          Δ(r) = r² − 2r + a²
A(r,θ) = (r²+a²)² − a²Δ sin²θ

g_tt = −(1 − 2r/Σ)             g_tφ = −2ar sin²θ/Σ
g_rr = Σ/Δ                      g_θθ = Σ
g_φφ = sin²θ (r² + a² + 2a²r sin²θ/Σ)

g^tt = −A/(ΣΔ)                 g^tφ = −2ar/(ΣΔ)
g^rr = Δ/Σ                      g^θθ = 1/Σ
g^φφ = (Δ − a²sin²θ)/(ΣΔ sin²θ)
```

Conserved quantities of a null geodesic:

```
E = −p_t            L = p_φ
Q = p_θ² + L²cot²θ − a²E²cos²θ
R(r) = [E(r²+a²) − aL]² − Δ[(L − aE)² + Q]
W(u) = (1−u²)(Q + a²E²u²) − L²u²      (u = cosθ)
```

Radial and polar motion decouple in **Carter time** `σ` (`dσ = dλ/Σ`):

```
d²r/dσ² = ½ R'(r)        d²u/dσ² = ½ W'(u)
dφ/dσ  = 2arE/Δ + L(Δ − a²sin²θ)/(Δ sin²θ)
dt/dσ  = (E·A − 2arL)/Δ
```

## The hard rules (design)

* Sans-serif only: `"Segoe UI Variable Display", "Segoe UI", Selawik,
  system-ui, -apple-system, Helvetica, Arial, sans-serif`. Selawik is
  self-hosted.
* **No boxes.** No cards, panels, borders, outlines, pills, glass or fills
  behind or around any text — including nav, buttons, HUD and tooltips.
  Links and buttons are plain text with an animated underline or glow. A
  soft `text-shadow` glow is allowed.
* Background is pure `#000000`. No gradient, no lifted vignette, no nebula.
* Warm white text `#F5EDE4`, WCAG AA contrast on black.
* Typography: light weights, fluid `clamp()` sizes, tight tracking on
  display type, generous whitespace.
* Reduced motion (`prefers-reduced-motion`): simplified fades, stepped
  camera movement, no spaghettification.

## The invariants (code)

1. Full Kerr geodesics, always. The disk emission carries the Doppler and
   gravitational redshift (`g`) and the beaming (`g⁴`). Never a fake "lens"
   approximation.
2. The quality governor may change **resolution, supersample count and
   bloom resolution only**. It may never change the physics.
3. If the device cannot keep up, the site falls back to a pre-rendered
   sequence produced by the same Kerr renderer.
4. `npm test` (Vitest) must pass. `npm run shots` must produce screenshots
   at scroll 0/25/50/75/100 %.

## The questions we actually want answered

* Does the rendering match the physics, or does it merely look plausible?
* Does the *interface* respect the rules above, and does it read on a
  phone in daylight?
* Is the narrative legible — does the reader understand that the text is
  being pulled into the shadow, rather than fighting the background?
* What is the weakest part of the picture, and what would a physicist notice
  first?

## The files that matter

```
src/physics/kerr/       the metric, the geodesics, the orbits (exact)
src/physics/diskModel.ts the Novikov–Thorne disk model
src/gfx/shaders/        the GLSL: df64, the ray marcher, the disk, the post chain
src/gfx/renderer.ts      the renderer contract implementation
src/ui/                 the HUD, the nav, the veil, the colophon, the audio
src/styles/             the CSS
docs/architecture.md     the contract — read it before answering
```
