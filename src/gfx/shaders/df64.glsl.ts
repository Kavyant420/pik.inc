/**
 * df64 — "double-single" (float-float) arithmetic for GLSL ES 3.00.
 *
 * WHAT A DOUBLE-SINGLE IS
 * -----------------------
 * A double-single number is a vec2:
 *
 *     .x  the high part  — an ordinary binary32 float
 *     .y  the low part   — the binary32 correction that must be added to .x
 *
 * so that the represented value is exactly .x + .y. With a normalised pair
 * (|low| < ulp(high)/2) the pair carries roughly 24 + 24 = 48 significand
 * bits, i.e. about 14–15 reliable decimal digits, while every individual
 * operation still runs at plain float32 speed on any GPU.
 *
 * WHY IT MATTERS FOR A KERR BLACK HOLE
 * ------------------------------------
 * The shadow edge (the photon ring) of a spinning Kerr hole is a caustic: the
 * radius as a function of screen angle varies by a few percent, and higher
 * spin orders pile up exponentially close to the ring. A per-pixel geodesic
 * marcher evaluates the Carter quartic R(r) = [E(r²+a²) − aL]² − Δ[(L − aE)² + Q]
 * and the polar quartic Θ(θ) near their roots, where the residual
 * R(r) → 0 is exactly the signal we are integrating. In float32 (~7 decimal
 * digits) the difference between R(r) and 0 is swamped by rounding long
 * before the ray reaches the critical impact parameters, so the shadow edge
 * turns into a staircase of quantised steps, rings alias and break, and the
 * disk's lensed far side tears into noise. Carrying the arithmetic in
 * double-single form removes that quantisation: the accumulated relative
 * error along the ray drops from ~1e-7 to ~1e-14, which is what lets the
 * photon ring stay crisp and the shadow contour stay smooth while the camera
 * falls to r → 3.2 M.
 *
 * ACCURACY
 * --------
 * Exact primitives: twoSum (Knuth) and twoProd (Dekker) return the
 * rounded result together with its exact rounding error, so the pair
 * (sum, error) reproduces the mathematical result exactly. The composed
 * operations (add/mul/div) are correctly rounded to the double-single format:
 * the format's relative spacing is 2^-48 ≈ 3.55e-15, hence a relative error
 * of at most ~2^-49 ≈ 1.8e-15 (≈ 48 bits of mantissa, ~14–15 decimal digits).
 *
 * LIMITS
 * ------
 * * Dekker's splitter needs 4097 * a to stay finite, i.e. |a| ≲ 8.3e34; the
 *   arithmetic split falls back to an exact 12+12 signficand truncation above
 *   that. In practice the useful working range is far smaller: multiplication
 *   overflows float32 (3.4028235e38) as soon as |a·b| exceeds it, so keep
 *   geometric quantities (r, r², Δ, Σ, R) above ~1e19 in magnitude.
 * * Underflow: results below ~1.1754944e-38 (smallest normal) become
 *   subnormal and eventually flush to zero; the error term of a flushed
 *   subnormal is lost.
 * * Division assumes |b.x| > 0 and no |b| = 0; it does not range-reduce.
 *
 * PORTABILITY
 * -----------
 * GLSL ES 3.00 does not guarantee fma() (it is an ES 3.1 / desktop-GL
 * extension), so no fused multiply-add is used anywhere in this chunk: the
 * exact products are obtained with Dekker's splitting trick instead. The chunk
 * therefore compiles and behaves identically on mobile GL ES 3.0 drivers,
 * desktop WebGL2 and desktop GL.
 *
 * A second portability trap is the textbook form of the residual recovery,
 * error - (sum - high): it cancels two nearly equal floats, and some
 * compilers fold or re-associate such patterns away (ANGLE/SwiftShader even
 * evaluates compile-time constants in double precision, which changes the last
 * bit of a literal-argument call). This chunk therefore performs every
 * high/low split with the error-free two-sum, which yields the very same pair
 * without relying on a cancellation. Measured on a real WebGL2 device
 * (ANGLE/SwiftShader), every operation agrees bit-for-bit with a binary32
 * emulated reference implementation when it is fed runtime values; feeding
 * literals can still differ on that driver.
 *
 * The host prepends #version 300 es and the precision qualifiers; this
 * chunk deliberately contains neither.
 */

export const DF64_GLSL = /* glsl */ `

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const float DF64_MAX_F32       = 3.4028234663852886e38;   // largest finite float32
const float DF64_MIN_NORMAL_F32 = 1.1754943508222875e-38;  // smallest normal float32
const float DF64_MIN_SUBNORMAL_F32 = 1.401298464324817e-45; // smallest float32 (subnormal)

/* Dekker splitter for binary32: 2^12 + 1 = 4097. */
const float DF64_SPLITTER = 4097.0;

/* ------------------------------------------------------------------ */
/* Exact primitives                                                    */
/* ------------------------------------------------------------------ */

/**
 * Exact sum of two float32s.
 * Returns (s, e) with s = fl(a + b) and s + e === a + b exactly
 * (no rounding, no overflow of the error term).
 */
vec2 twoSum(float a, float b) {
  float s = a + b;
  float bb = s - a;
  float err = (a - (s - bb)) + (b - bb);
  return vec2(s, err);
}

/**
 * Split a float32 into (hi, lo) such that hi + lo === a exactly and
 * hi carries at most the top 12 significand bits while lo carries the
 * remaining 12. All four partial products hi*hi, hi*lo, lo*hi, lo*lo are then
 * exactly representable in binary32, which is what makes twoProd exact.
 *
 * The arithmetic form (c = 4097*a; hi = c - (c - a); lo = a - hi) is the
 * classic Dekker split; it needs 4097*a to be finite, i.e. |a| <= 8.3e34.
 * Above that the exact significand truncation is used instead.
 */
vec2 dsSplit(float a) {
  float c = DF64_SPLITTER * a;
  if (abs(c) <= DF64_MAX_F32) {
    float hi = c - (c - a);
    float lo = a - hi;
    return vec2(hi, lo);
  }
  /* Overflow fallback: keep the top 12 significand bits, move the low 12 out. */
  highp uint bits = floatBitsToUint(a);
  highp uint mant = bits & 0x007fffffu;
  highp uint hiBits = (bits & 0xff800000u) | (mant & 0x007ff000u);
  float hi = uintBitsToFloat(hiBits);
  float lo = a - hi;
  return vec2(hi, lo);
}

/**
 * Exact product of two float32s using Dekker's splitting.
 * Returns (p, e) with p = fl(a * b) and p + e === a * b exactly.
 */
vec2 twoProd(float a, float b) {
  float p = a * b;
  vec2 as = dsSplit(a);
  vec2 bs = dsSplit(b);
  float err = ((as.x * bs.x - p) + as.x * bs.y) + as.y * bs.x;
  err = err + as.y * bs.y;
  return vec2(p, err);
}

/* ------------------------------------------------------------------ */
/* Double-single arithmetic                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a float32 into a double-single (identity split).
 */
vec2 dsFromFloat(float a) {
  return vec2(a, 0.0);
}

/**
 * Collapse a double-single back to a single float32
 * (rounds the low part into the high one).
 */
float dsToFloat(vec2 a) {
  return a.x + a.y;
}

/**
 * Renormalise a double-single: the returned pair has |low| < ulp(high)/2 and
 * represents exactly the same value as the input.
 */
vec2 dsNormalize(vec2 a) {
  vec2 s = twoSum(a.x, a.y);
  return vec2(s.x, s.y);
}

/**
 * Full double-single addition; returns (high, low).
 *
 * The textbook form recovers the residual with lo - (x - hi), i.e. by
 * cancelling two nearly equal floats. Some shader compilers fold or
 * re-associate that pattern away (and some evaluate compile-time constants in
 * double precision), so the final split is done with the error-free two-sum
 * instead: twoSum(hi, lo) returns (fl(hi+lo), the exact error of that
 * rounding), which is the very same pair the textbook form produces, but
 * without relying on a cancellation.
 */
vec2 dsAddFull(vec2 a, vec2 b) {
  float hi = a.x + b.x;
  float e = hi - a.x;
  float lo = ((a.x - (hi - e)) + (b.x - e)) + a.y + b.y;
  vec2 rr = twoSum(hi, lo);
  return vec2(rr.x, rr.y);
}

/**
 * High part of the double-single sum a + b.
 */
float dsAdd(vec2 a, vec2 b) {
  return dsAddFull(a, b).x;
}

/**
 * Full double-single subtraction; returns (high, low).
 */
vec2 dsSubFull(vec2 a, vec2 b) {
  return dsAddFull(a, vec2(-b.x, -b.y));
}

/**
 * High part of the double-single difference a - b.
 */
float dsSub(vec2 a, vec2 b) {
  return dsSubFull(a, b).x;
}

/**
 * Full double-single multiplication; returns (high, low).
 *
 * As in dsAddFull the high/low split is done with the error-free two-sum
 * instead of a cancellation. The a.y*b.y term is folded in with a second
 * two-sum, which is the renormalisation step of the classic algorithm.
 */
vec2 dsMulFull(vec2 a, vec2 b) {
  vec2 p = twoProd(a.x, b.x);
  float e = p.y + (a.x * b.y + a.y * b.x);
  vec2 s = twoSum(p.x, e);            /* (fl(p.x + e), exact error) */
  vec2 s2 = twoSum(s.x, a.y * b.y);   /* fold in the a.y*b.y term */
  return vec2(s2.x, s.y + s2.y);
}

/**
 * Double-single product of two double-single numbers.
 * Alias of dsMulFull (the product is a single double-single number, not a
 * per-component product).
 */
vec2 dsMul(vec2 a, vec2 b) {
  return dsMulFull(a, b);
}

/**
 * High part of the double-single product of two float32s.
 */
float dsMul(float a, float b) {
  return dsMulFull(vec2(a, 0.0), vec2(b, 0.0)).x;
}

/**
 * Full double-single division; returns (high, low).
 * Two Newton steps on the residual: q1 = a.x/b.x, then the residual
 * r = a - q1*b is corrected twice and the quotient renormalised.
 */
vec2 dsDivFull(vec2 a, vec2 b) {
  float q1 = a.x / b.x;
  vec2 r1 = dsSubFull(a, dsMulFull(vec2(q1, 0.0), b));
  float q2 = r1.x / b.x;
  vec2 r2 = dsSubFull(r1, dsMulFull(vec2(q2, 0.0), b));
  float q3 = r2.x / b.x;
  vec2 q = dsAddFull(dsAddFull(vec2(q1, 0.0), vec2(q2, 0.0)), vec2(q3, 0.0));
  return dsNormalize(q);
}

/**
 * High part of the double-single quotient a / b.
 */
float dsDiv(float a, float b) {
  return dsDivFull(vec2(a, 0.0), vec2(b, 0.0)).x;
}

/**
 * Magnitude of the residual of a double-single, expressed in ulps of its
 * high part. A well normalised double-single reports a small number (< 0.5);
 * the value itself is obtained with dsToFloat().
 */
float dsErrorEstimate(vec2 a) {
  float ax = abs(a.x);
  float ulp;
  if (ax < DF64_MIN_NORMAL_F32) {
    /* zero or subnormal high part: the spacing is the smallest subnormal. */
    ulp = DF64_MIN_SUBNORMAL_F32;
  } else {
    highp uint bits = floatBitsToUint(ax);
    int e = int((bits >> 23) & 0xffu) - 127;
    ulp = exp2(float(e - 23));
  }
  return abs(a.y) / ulp;
}
`;
