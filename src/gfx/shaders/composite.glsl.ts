/**
 * The composite pass.
 *
 * Combines the linear HDR scene with the bloom chain and a faint anamorphic
 * streak, tone maps the result, dithers it and writes it to the canvas.
 *
 * Deliberately absent: a vignette, a lift, a gradient, any kind of "film"
 * overlay. The design rules say the background behind the text is pure
 * black, and a lifted vignette would put grey into the corners of a page
 * that is supposed to be nothing but a hole in space.
 *
 * The host prepends COMMON_GLSL, TONEMAP_GLSL and DITHER_GLSL.
 */

/** Scene + bloom + streak, tone mapped and dithered. */
export const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uGlareStrength;
uniform float uStreakLength;

in vec2 vUv;
out vec4 fragColor;

/* A cheap horizontal streak: nine taps of the smallest bloom mip, spaced
 * along x. It is the "lens flare" of a real optic, and it is what makes
 * the photon ring feel like a light source rather than a line. */
vec3 anamorphicStreak(vec2 uv) {
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    float fi = float(i);
    float w = exp(-fi * fi * 0.22);
    sum += texture(uBloom, uv + vec2(fi * uStreakLength / uResolution.x, 0.0)).rgb * w;
    wsum += w;
  }
  return sum / max(wsum, 1e-5);
}

void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 streak = anamorphicStreak(vUv);

  vec3 color = scene + bloom * uBloomStrength + streak * uGlareStrength;

  /* Linear HDR -> display. */
  color = linearToSrgb(acesFilmic(color * uExposure));

  /* Dither before the 8-bit write. */
  vec2 frag = gl_FragCoord.xy;
  color.r = ditherValue(color.r, frag);
  color.g = ditherValue(color.g, frag);
  color.b = ditherValue(color.b, frag);

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
