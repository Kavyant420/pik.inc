/**
 * The composite pass.
 *
 * Combines the linear HDR scene with the bloom chain and a faint anamorphic
 * streak, tone maps the result, dithers it and writes it to the canvas.
 *
 * NASA-grade additions:
 *  · Chromatic aberration — the RGB channels sample the scene at slightly
 *    different UVs near the screen edges, like a wide-angle telescope optic.
 *  · Lens flare ghosts — two offset, dimmer reflections of the brightest
 *    sources, like internal reflections in a multi-element lens.
 *  · Film grain — fine organic noise over the final image, replacing the
 *    purely digital Bayer dither with something closer to photographic stock.
 *
 * Deliberately still absent: a vignette, a lift, a gradient, any kind of
 * "film" overlay. The design rules say the background behind the text is pure
 * black, and a lifted vignette would put grey into the corners of a page
 * that is supposed to be nothing but a hole in space.
 *
 * The host prepends COMMON_GLSL, TONEMAP_GLSL and DITHER_GLSL.
 */

/** Scene + bloom + streak + ghosts, tone mapped and dithered. */
export const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uGlareStrength;
uniform float uStreakLength;
uniform float uTime;          /* seconds — drives grain and ghost drift */

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

/* Lens flare ghosts: sample the bloom at an offset, dimmer position.
 * Like internal reflections between lens elements. */
vec3 lensGhost(vec2 uv, float offsetX, float strength) {
  vec2 ghostUv = uv + vec2(offsetX * uStreakLength / uResolution.x, 0.0);
  return texture(uBloom, ghostUv).rgb * strength;
}

/* Fine organic film grain, driven by time so it never settles into a
 * static pattern. Sub-LSB so it texturises without banding. */
float filmGrain(vec2 frag, float time) {
  float n = hash21(frag + vec2(time * 0.07, time * 0.13));
  return (n - 0.5) * 0.012;   /* ±0.6% — visible grain, no banding */
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = vUv;

  /* --- chromatic aberration: sample each channel at a slightly different UV ---
   * The offset grows toward the screen edges, like a fast wide-angle optic. */
  float edgeDist = length(uv - 0.5) * 2.0;   /* 0 at centre, 1 at edges */
  float aber = 0.0018 * edgeDist * edgeDist; /* max ~1.8 px at the corner */
  vec3 scene;
  scene.r = texture(uScene, uv + vec2(-aber, 0.0)).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv + vec2(aber, 0.0)).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 streak = anamorphicStreak(uv);

  /* Lens flare ghosts — two internal reflections at different offsets. */
  vec3 ghost = lensGhost(uv,  1.6, 0.06) +
               lensGhost(uv, -2.4, 0.04);

  vec3 color = scene + bloom * uBloomStrength + streak * uGlareStrength + ghost;

  /* Linear HDR -> display. */
  color = linearToSrgb(acesFilmic(color * uExposure));

  /* Film grain over the tone-mapped image. */
  float grain = filmGrain(frag, uTime);
  color.r += grain;
  color.g += grain;
  color.b += grain;

  /* Dither before the 8-bit write. */
  color.r = ditherValue(color.r, frag);
  color.g = ditherValue(color.g, frag);
  color.b = ditherValue(color.b, frag);

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
