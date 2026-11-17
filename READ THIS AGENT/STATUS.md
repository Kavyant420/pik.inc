# Status

> The live board. Updated whenever something ships, breaks or is blocked.
> Times are UTC.

## 2026-11-16 — session: UI/UX + 3D graphics, side by side

### Shipped

**Interface (`src/ui/`, `src/styles/`)** — new files, owned by agent 5.

| File | What it does |
| --- | --- |
| `src/ui/format.ts` | Pure number formatting (HUD, nav, colophon). No DOM, unit-tested. |
| `src/ui/hud.ts` | The telemetry HUD. Text only, no boxes. Frame-rate-independent smoothing; instant under reduced motion. |
| `src/ui/nav.ts` | Chapter navigation: plain-text links with an animated underline, a one-pixel progress rule, keyboard accessible, smooth scrolling that degrades to instant under reduced motion. |
| `src/ui/preload.ts` | The text-only veil over the first (expensive) frame. |
| `src/ui/audio.ts` | Synthesised ambient drone + noise bed. Off by default, gesture-gated, follows the camera radius. No sample files. |
| `src/ui/colophon.ts` | The credits at the bottom of the fall. Fades in with the scroll, fades out again. |
| `src/styles/base.css` | Tokens, reset, typography, focus handling, reduced motion. |
| `src/styles/hud.css`, `nav.css`, `overlays.css`, `type.css` | The per-component styles. |

**Graphics (`src/gfx/`, `src/physics/diskModel.ts`)** — new files.

| File | What it does |
| --- | --- |
| `src/gfx/shaders/common.glsl.ts` | Hashes, value noise, fBm, ridged noise, luma. No uniforms (so the chunk can be reused by every pass). |
| `src/gfx/shaders/starfield.glsl.ts` | Procedural stars on a cube-face grid, three magnitude classes. **No nebula, no diffuse background** — the background stays pure black. |
| `src/gfx/shaders/disk.glsl.ts` | The Novikov–Thorne flux profile, the Planckian-locus blackbody colour, the redshift factor `g` and the `g⁴` beaming. |
| `src/gfx/shaders/kerrRay.glsl.ts` | The geodesic marcher: Carter-time, symplectic, double-single radial potential, equatorial-crossing detection, shadow / disk / sky dispatch. |
| `src/gfx/shaders/bloom.glsl.ts` | Soft-knee bright pass, 13-tap downsample, 3×3 tent upsample. |
| `src/gfx/shaders/tonemap.glsl.ts` | ACES (Narkowicz) + the exact sRGB transfer function. |
| `src/gfx/shaders/dither.glsl.ts` | 8×8 Bayer + triangular PDF dither. |
| `src/gfx/shaders/composite.glsl.ts` | Scene + bloom + anamorphic streak → tone map → dither → canvas. **No vignette, no lift.** |
| `src/gfx/context.ts` | WebGL2 context, capability detection, HDR format choice. |
| `src/gfx/program.ts` | Shader compilation with *readable* errors (numbered source, caret at the offending line). |
| `src/gfx/pipeline.ts` | The render targets and the post-processing chain. |
| `src/gfx/renderer.ts` | The renderer contract from `docs/architecture.md` §4, plus the quality governor (resolution only). |
| `src/physics/diskModel.ts` | The CPU twin of `disk.glsl.ts`: flux, temperature, blackbody colour, redshift, beaming. |

**Tests** — `tests/disk.test.ts` (20) and `tests/format.test.ts` (15).

### Verification

| Gate | Result |
| --- | --- |
| `tsc --noEmit` on the new files | clean |
| `vitest` (new suites) | 35/35 pass |
| `vitest` (whole suite) | 68/69 pass — the one failure is the pre-existing weak-field deflection test in `tests/kerr.test.ts` (lead-owned, in flight) |

### Open / blocked

* **B1 — `npm run typecheck` fails on lead-owned files.** 28 errors, all in
  `src/physics/kerr/{metric,reference,geodesics}.ts` and
  `tests/kerr.test.ts`. Not caused by this session; the files are being
  edited concurrently. Needs the lead.
* **B2 — the renderer is not wired to a page.** `src/main.ts` and
  `index.html` are lead-owned. `src/gfx/renderer.ts` implements the
  documented contract and is ready to be driven, but nothing drives it
  yet.
* **B3 — the shader chain has never been compiled on a GPU.** There is no
  `index.html` and no dev server entry point yet, so the GLSL has only been
  checked by eye. First compile happens the moment the page exists.
* **B4 — `docs/architecture.md` lists `src/renderer/**` and
  `src/physics/diskModel.ts`; this session put the graphics under
  `src/gfx/**` to match the layout that already existed (`src/gfx/shaders/`).
  The lead should reconcile the two maps.

### Next

1. DeepAI review of the four open prompts in `prompts/`.
2. Wire the renderer into `src/main.ts` and get a first frame on screen.
3. `npm run shots` (agent 6) — screenshots at 0/25/50/75/100 %.
