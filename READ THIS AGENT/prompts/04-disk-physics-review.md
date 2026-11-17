---
to: deepai
model: deepai-chat
system: |
  You are an accretion-physics expert. You cite the paper you are quoting.
  When the closed form you are asked about is an approximation, you say so
  and give the better alternative. You answer in markdown, in at most 900
  words, and you end with the formula you would actually implement.
---

# Review of the accretion-disk model

Read `READ THIS AGENT/BRIEF.md` for the metric and the conventions.

## What is implemented

The disk is geometrically thin, optically thick, zero-torque, in the
equatorial plane of the Kerr hole. The flux profile used is

```
F(r) ∝ (1/r³) · [1 + (1−a)(M/r)^{3/2}] / [1 − 3M/r + 2a(M/r)^{3/2}]
          × (1 − √(r_ph/r))
```

with `M = 1`, `r_ph = 2(1 + cos(⅔ acos(−a)))` the prograde equatorial
photon orbit. The last factor is the photon-capture probability: the
fraction of locally emitted photons that escape the photon well.

The effective temperature is `T ∝ F^{1/4}`, normalised so that the inner
edge (the ISCO) has 12 000 K. The colour comes from the Kim et al. (2002)
Planckian-locus fit, converted to linear sRGB. The observed colour
temperature is `g·T_em` and the bolometric intensity is boosted by `g⁴`,
where `g = 1/[u^t(1 − ΩL/E)]`, `u^t = (1 + a/r^{3/2})/√(1 − 3/r + 2a/r^{3/2})`
and `Ω = 1/(r^{3/2} + a)`.

## The questions

1. **Is the closed form right?** I took the standard quoted effective
   temperature expression (Shapiro–Teukolsky §15) and multiplied in the
   capture factor because the closed form has a pole at the photon orbit,
   which sits just inside the ISCO for a = 0.999 (r_ph ≈ 1.055 M,
   r_isco ≈ 1.237 M) and produced an absurd temperature spike. Was that
   the right fix, or should I be using the actual Page–Thorne flux?

2. **The capture factor.** `1 − √(r_ph/r)` is the Schwarzschild capture
   cone. Is there a Kerr equivalent that is cheap enough for a shader, and
   how wrong is the Schwarzschild one for a = 0.999?

3. **The peak.** The relativistic flux peaks *outside* the ISCO, at a
   radius that moves outward with spin, and its height is far below the
   Newtonian peak. Does my profile have that peak, or does it peak at the
   inner edge by construction?

4. **The inner edge.** The disk's inner edge is the ISCO, which is
   invisible behind the shadow. Should the rendered disk instead be
   truncated at the photon orbit (so the visible inner edge is a real
   edge), and does that change the flux profile enough to matter?

5. **The colour.** Is a blackbody the right spectrum for a
   radiation-pressure-dominated thin disk? If not, what is the cheapest
   change that keeps the "blue-white approaching, deep orange receding"
   reading while being defensible?

6. **The formula you would implement**, in one block, with the constants.
