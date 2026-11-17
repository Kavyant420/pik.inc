/**
 * Bloom: the three-mip bright-pass chain.
 *
 * The chain is the usual one (see docs/architecture.md §4):
 *
 *   scene (RGBA16F) → prefilter → mip0 → down → mip1 → down → mip2
 *                    ↑                                            │
 *                    └──────────── up (tent) ←───────────────────┘
 *
 * The prefilter uses a soft knee so that the bloom fades in smoothly instead
 * of switching on at a hard threshold — the difference is very visible on
 * the thin photon ring, which is only a few pixels wide.
 */

/** Bright-pass prefilter, rendered into the first bloom mip. */
export const BLOOM_PREFILTER_FRAGMENT = /* glsl */ `
uniform sampler2D uScene;
uniform float uThreshold;
uniform float uKnee;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 c = texture(uScene, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));

  /* Soft knee (Jimenez / "Next Generation Post Processing in Call of
   * Duty: Advanced Warfare"): quadratic ramp between threshold−knee and
   * threshold+knee. */
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contribution = max(soft, br - uThreshold) / max(br, 1e-5);

  fragColor = vec4(c * contribution, 1.0);
}
`;

/** 13-tap downsample (Jimenez). */
export const BLOOM_DOWN_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uTexel;   /* 1 / source resolution */

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 t = uTexel;

  vec3 a = texture(uSource, vUv + vec2(-2.0,  2.0) * t).rgb;
  vec3 b = texture(uSource, vUv + vec2( 0.0,  2.0) * t).rgb;
  vec3 c = texture(uSource, vUv + vec2( 2.0,  2.0) * t).rgb;

  vec3 d = texture(uSource, vUv + vec2(-2.0,  0.0) * t).rgb;
  vec3 e = texture(uSource, vUv).rgb;
  vec3 f = texture(uSource, vUv + vec2( 2.0,  0.0) * t).rgb;

  vec3 g = texture(uSource, vUv + vec2(-2.0, -2.0) * t).rgb;
  vec3 h = texture(uSource, vUv + vec2( 0.0, -2.0) * t).rgb;
  vec3 i = texture(uSource, vUv + vec2( 2.0, -2.0) * t).rgb;

  vec3 j = texture(uSource, vUv + vec2(-1.0,  1.0) * t).rgb;
  vec3 k = texture(uSource, vUv + vec2( 1.0,  1.0) * t).rgb;
  vec3 l = texture(uSource, vUv + vec2(-1.0, -1.0) * t).rgb;
  vec3 m = texture(uSource, vUv + vec2( 1.0, -1.0) * t).rgb;

  vec3 result = e * 0.125;
  result += (a + c + g + i) * 0.03125;
  result += (b + d + f + h) * 0.0625;
  result += (j + k + l + m) * 0.125;

  fragColor = vec4(result, 1.0);
}
`;

/** 3x3 tent upsample, blended additively into the next larger mip.
 *
 * Only the smaller mip is sampled; the larger mip is the current render
 * target and is accumulated into with additive blending (ONE, ONE).
 */
export const BLOOM_UP_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;   /* the smaller mip   */
uniform vec2 uTexel;         /* 1 / source resolution */
uniform float uRadius;       /* tent radius in texels */
uniform float uStrength;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 t = uTexel * uRadius;

  vec3 s = texture(uSource, vUv + vec2(-1.0,  1.0) * t).rgb;
  s += texture(uSource, vUv + vec2( 0.0,  1.0) * t).rgb * 2.0;
  s += texture(uSource, vUv + vec2( 1.0,  1.0) * t).rgb;
  s += texture(uSource, vUv + vec2(-1.0,  0.0) * t).rgb * 2.0;
  s += texture(uSource, vUv).rgb * 4.0;
  s += texture(uSource, vUv + vec2( 1.0,  0.0) * t).rgb * 2.0;
  s += texture(uSource, vUv + vec2(-1.0, -1.0) * t).rgb;
  s += texture(uSource, vUv + vec2( 0.0, -1.0) * t).rgb * 2.0;
  s += texture(uSource, vUv + vec2( 1.0, -1.0) * t).rgb;
  s *= 0.0625;

  fragColor = vec4(s * uStrength, 1.0);
}
`;
