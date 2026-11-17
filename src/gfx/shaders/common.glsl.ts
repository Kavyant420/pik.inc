/**
 * Shared GLSL chunks: constants, hashes, noise and the small helpers every
 * pass needs.
 *
 * The host prepends `#version 300 es` and the precision qualifiers, so this
 * chunk deliberately contains neither — see df64.glsl.ts for the same rule.
 */

/** Math constants and the small helpers every pass needs.
 *
 * No uniforms are declared here: each pass declares its own, so the same
 * chunk can be reused by programs that need different sets.
 */
export const COMMON_GLSL = /* glsl */ `
#define PI  3.141592653589793
#define TAU 6.283185307179586

/* ------------------------------------------------------------------ */
/* Hashing                                                             */
/* ------------------------------------------------------------------ */

/* Dave Hoskins' hash functions: no trig, stable across drivers. */
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash23(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

/* ------------------------------------------------------------------ */
/* Value noise                                                         */
/* ------------------------------------------------------------------ */

/* Trilinear value noise with a smoothstep interpolation. */
float vnoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n = i.x + i.y * 157.0 + i.z * 113.0;

  float a = hash11(n);
  float b = hash11(n + 1.0);
  float c = hash11(n + 157.0);
  float d = hash11(n + 158.0);
  float e = hash11(n + 113.0);
  float g = hash11(n + 114.0);
  float h = hash11(n + 270.0);
  float k = hash11(n + 271.0);

  return mix(
    mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
    mix(mix(e, g, f.x), mix(h, k, f.x), f.y),
    f.z);
}

/* Fractional Brownian motion. 'octaves' is a compile-time-ish small int. */
float fbm3(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise3(p);
    norm += amp;
    amp *= 0.5;
    p *= 2.02;
  }
  return norm > 0.0 ? sum / norm : 0.0;
}

/* Ridged variant — used for the filamentary structure of the disk. */
float ridged3(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(vnoise3(p) * 2.0 - 1.0);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    p *= 2.07;
  }
  return norm > 0.0 ? sum / norm : 0.0;
}

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

/* Rec.709 luminance weights, used by the bloom and the composite pass. */
float luma709(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`;
