---
to: deepai
model: deepai-chat
system: |
  You are a relativist who reviews ray-tracing code for physical
  correctness. You are terse. When you are unsure, you say so and name the
  reference you would check. You answer in markdown, in at most 900 words,
  and you end with a numbered list of the errors you found, most severe
  first, each with the formula that is wrong.
---

# Review of the Kerr ray marcher

Read `READ THIS AGENT/BRIEF.md` first — it has the metric and the
conserved-quantity conventions. The conventions matter: the spin axis is
`z`, the disk is `θ = π/2`, and `E = −p_t`, `L = p_φ`.

## What the shader does

Per pixel, in GLSL ES 3.00:

1. A ray direction is built in the **static observer's tetrad** at the
   camera: `forward = −e_r̂`, `up = −e_θ̂`, `right = +e_φ̂`, with a pinhole
   projection at `uFov`.
2. The direction is converted to `(E, L, Q)` with the tetrad above.
3. The geodesic is integrated in **Carter time** `σ`, with the second-order
   system

   ```
   d²r/dσ² = ½ R'(r)      d²u/dσ² = ½ W'(u)
   dφ/dσ  = 2arE/Δ + L(Δ − a²sin²θ)/(Δ sin²θ)
   ```

   using symplectic (semi-implicit) Euler with `h ≈ k/r`, `k ≈ 0.055`.
   `R(r)` is evaluated in double-single (~48-bit) arithmetic; `W(u)` in
   float32.
4. The ray either crosses the horizon (shadow), crosses the equatorial
   plane inside the disk (emission), or escapes (star field).

## The questions

1. **The conserved quantities.** The shader computes `Q` as
   `p_θ² + L²cot²θ − a²E²cos²θ` from the tetrad at the camera. Is the
   sign of the `a²E²cos²θ` term right for this convention? Does the
   `cot²θ` need a `sin²θ` somewhere that I have dropped?

2. **The step controller.** `h ≈ k/r` keeps the *relative* radial step
   constant. But the photon orbit at a = 0.999 sits at r ≈ 1.055 M and the
   radial motion there is slow while the azimuthal motion is fast — is the
   Carter-time step size still the right control variable, or should it be
   tied to the azimuthal frequency `dφ/dσ` near the critical curve?

3. **The symmetry.** In the flat far zone, `Q = b² − L²` and
   `b² = Q/E² + (L/E)²`, so `cos²θ_s = (L/E)/b`. I use the ray's *local
   direction at the escape radius* instead, on the argument that the ray is
   traced backwards so its far end is the source. Is that argument sound
   for the polar angle, and where does the difference between the local
   tetrad and the asymptotic frame actually become visible?

4. **The disk's redshift.** `g = 1/[u^t(1 − ΩL/E)]` with `u^t` the fluid's
   time component and `Ω = 1/(r^{3/2}+a)`. The tracer works with the
   *backwards* ray, so the shader passes `−L` to this function. Is that
   sign flip correct, and is the beaming then `g⁴` (bolometric) or `g³`
   (specific) for what we want?

5. **What am I most likely to have wrong** that would still produce a
   picture that looks right? Name the effect and the number it would
   change.
