---
to: deepai
model: deepai-chat
system: |
  You are a graphics engineer who has shipped real-time renderers. You
  think in milliseconds and in megapixels per second, you are specific
  about what a GPU actually costs, and you never suggest changing the
  physics to hit a frame budget. You answer in markdown, in at most 800
  words, with numbers.
---

# Performance budget and the fallback path

Read `READ THIS AGENT/BRIEF.md` for the invariants — in particular rule 2:
the quality governor may change resolution, supersample count and bloom
resolution, and **nothing else**.

## What the renderer does

Per frame, one full-screen pass per pixel of the drawing buffer:

* The **geodesic pass** integrates a null geodesic per pixel in Carter
  time, with `h ≈ 0.055/r`, so ≈ 80 steps from r = 400 M to the photon
  sphere and up to ~230 steps per winding near the critical curve. The
  radial potential is evaluated in double-single arithmetic (~10× the ALU
  cost of float32); the polar potential is float32. Budget: 512 steps.
* **Bloom**: a soft-knee bright pass at half resolution, two 13-tap
  downsamples, two 3×3 tent upsamples.
* **Composite**: scene + bloom + a 9-tap anamorphic streak, ACES, sRGB,
  dither.

The drawing buffer is `cssSize × devicePixelRatio (≤ 2) × qualityScale`,
with `qualityScale ∈ [0.25, 1]`.

## The questions

1. **Where is the time going?** Give me an order-of-magnitude estimate of
   the geodesic pass on a 2019 laptop iGPU at 1600×900 and on an M-series
   GPU, and tell me which part of the shader is worth optimising if I am
   over budget. The candidates are: the double-single radial potential
   (≈ 8 double-single ops per step), the `1/r³`-style division in the step
   controller, and the `acos`/`cos` in the star field.

2. **A cheaper integrator.** The second-order Carter-time form is used
   because the first-order `±√R` form is not Lipschitz at the turning
   points. Is there a formulation that keeps the smoothness but halves the
   per-step cost — for instance, evaluating `R` in float32 and only
   switching to double-single when `|R|` is small? What is the numerical
   consequence for the shadow edge?

3. **The step controller.** `h ≈ k/r` keeps the relative radial step
   constant. What is the smallest `k` that keeps the photon ring crisp,
   and how does the step count scale as the camera approaches the critical
   curve? Is there a controller that spends steps where the image needs
   them instead of uniformly?

4. **The fallback.** If a device cannot run the real thing, the plan is a
   pre-rendered sequence produced by the *same* Kerr renderer, at 0/25/50/
   75/100 % scroll. What resolution and frame rate, what container, and
   how does the pre-rendered path avoid looking like a video file playing
   in the background?

5. **The governor.** It drops the resolution scale in 0.15 steps when the
   average frame time exceeds 34 ms and recovers when it drops below
   19 ms, with a 1.2 s hysteresis. Is that the right shape? Should it also
   drop the supersample count (currently always 1) or the bloom mip count
   (currently 3)?

6. **What I would measure first** on a device I do not have, to find out
   whether the problem is the shader or the fill rate.
