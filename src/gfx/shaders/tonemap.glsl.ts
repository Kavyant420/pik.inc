/**
 * Tone mapping and transfer functions.
 *
 * The geodesic pass writes unbounded HDR (the disk's approaching side is
 * orders of magnitude brighter than the receding side, and the photon ring
 * is brighter still), so the image has to be compressed before it reaches
 * the 8-bit canvas.
 *
 * ACES (Narkowicz's fit of the RRT+ODT approximation) is used because it
 * keeps the highlights from going magenta the way a naive Reinhard does on
 * very saturated, very bright pixels — which is exactly the case of the
 * blueshifted, beamed edge of the disk.
 *
 * The canvas is sRGB, so the linear result is encoded with the exact sRGB
 * OETF rather than the cheap 2.2 power curve.
 */

/** ACES filmic tone map, plus the sRGB transfer function. */
export const TONEMAP_GLSL = /* glsl */ `
/* Narkowicz's fit of the ACES RRT+ODT. */
vec3 acesFilmic(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

/* The exact sRGB opto-electronic transfer function. */
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92,
             1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
             step(vec3(0.0031308), c));
}

/* sRGB -> linear (for textures that arrive already encoded). */
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92,
             pow((c + 0.055) / 1.055, vec3(2.4)),
             step(vec3(0.04045), c));
}
`;

/** The composite pass applies the tone map and the transfer function. */
export const TONEMAP_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform float uExposure;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 hdr = texture(uSource, vUv).rgb * uExposure;
  fragColor = vec4(linearToSrgb(acesFilmic(hdr)), 1.0);
}
`;
