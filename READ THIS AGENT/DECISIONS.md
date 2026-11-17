# Decisions

> `D-<nn> — one line, then the reasoning.` A decision is only a decision once
> it is written down here; otherwise it is a rumour.

## D-01 — The interface is text on black, and nothing else

*2026-11-16 · session: UI/UX + 3D graphics*

No panel, no card, no pill, no glass, no `background` behind any text — not
in the HUD, not in the nav, not in the preload veil, not in the colophon.
The only ornaments allowed are an animated underline and a soft
`text-shadow` glow.

**Why.** The background is a photograph of a black hole. Any surface behind
the type is a surface floating in front of the hole, and the eye reads that
as a mistake. The rules are in `docs/architecture.md` §6 and they are not
negotiable.

**Consequence.** Focus states are drawn with the underline and the glow
rather than an outline. The nav's progress indicator is a one-pixel rule,
not a bar in a container.

## D-02 — The star field is stars, and nothing else

*2026-11-16 · session: UI/UX + 3D graphics*

No nebula, no galactic band, no diffuse background, no colour gradient. The
sky is black with points of light on it.

**Why.** Same reason as D-01, plus physics: there is no interstellar dust
in this scene, and a Milky Way band would be a lie drawn in front of the
one thing on the page that is exact.

## D-03 — The disk flux uses the S&T closed form times the photon-capture factor

*2026-11-16 · session: UI/UX + 3D graphics*

```
F(r) ∝ (1/r³)·[1 + (1−a)r^(−3/2)] / [1 − 3/r + 2a r^(−3/2)] · (1 − √(r_ph/r))
```

**Why.** The first factor is the standard quoted Novikov–Thorne effective
temperature. The second is the fraction of locally emitted photons that
escape the photon well; the capture cone closes at the photon orbit. The
second factor is not optional: without it the closed form has a pole at the
photon orbit, which sits just inside the ISCO and produces an absurd
temperature spike and an almost black outer disk.

**Known approximation.** The full Page–Thorne transport solution differs
from this by an order-unity factor near the inner edge (the relativistic
peak of the flux is ~10–16 % of the Newtonian peak, Thorne 1974). The
difference is absorbed by the exposure; it is a modelling choice, not a
numerical error.

**Consequence.** `src/physics/diskModel.ts` and `src/gfx/shaders/disk.glsl.ts`
must stay in step. `tests/disk.test.ts` guards the properties both must have.

## D-04 — The radial potential is evaluated in double-single; the polar potential is not

*2026-11-16 · session: UI/UX + 3D graphics*

`R(r)` is computed with the `df64` chunk (~48 significand bits); `W(u)` stays
in float32.

**Why.** `R(r) → 0` exactly at the turning points and along the shadow's
critical curve, and in float32 the residual is swamped by rounding long
before the ray reaches the critical impact parameters — the photon ring
breaks into a staircase. `W(u)` has no such cancellation and the extra cost
would buy nothing.

**Consequence.** The shader is ~10× the ALU cost of a float32 evaluation of
`R`. That is the reason the step controller is `h ≈ k/r` (≈ 80 steps from
r = 400 M to the photon sphere) and the reason the quality governor may
lower the resolution but never the physics.

## D-05 — The sky is sampled with the ray's direction where it leaves the well

*2026-11-16 · session: UI/UX + 3D graphics*

The tracer walks the geodesic *backwards* from the camera. The far end of
the path is therefore the source, and the local direction of the ray at the
escape radius, expressed in the camera's tetrad, is the direction of that
source on the celestial sphere.

**Why.** It is exact by construction, it needs no impact-parameter
inversion, and it produces the Einstein-ring structure for free: rays that
wind around the hole exit pointing in a very different direction, and the
sky smears into the ring on its own.

**Consequence.** The escape radius has to be far enough that the local tetrad
and the asymptotic frame agree (frame dragging tilts them by ~10⁻⁸ rad at
r = 300 M). 400 M is used.

## D-06 — The composite pass does no vignetting and no lifting

*2026-11-16 · session: UI/UX + 3D graphics*

The final pass is: scene + bloom + streak → ACES → sRGB → dither → canvas.

**Why.** A lifted vignette would put grey into the corners of a page that is
supposed to be nothing but a hole in space, and the design rules say so
explicitly. The dither is there because an 8-bit canvas cannot hold the
gradient without banding, and the gradient here spans several orders of
magnitude.
