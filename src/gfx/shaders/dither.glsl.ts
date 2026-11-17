/**
 * Dithering.
 *
 * The scene is a continuous gradient over an enormous dynamic range, and the
 * canvas is 8 bits. Without dithering the deep shadows band visibly, and
 * the faint stars of the outer sky turn into a handful of flat grey steps.
 *
 * An 8x8 Bayer matrix with a triangular-PDF dither of ±0.5 LSB is used:
 * the ordered part breaks up the banding, the triangular part removes the
 * regular structure of the pattern (at the cost of a little noise, which
 * is invisible on a star field).
 */

/** Ordered + triangular dither, applied to an sRGB-encoded image. */
export const DITHER_GLSL = /* glsl */ `
/* 8x8 Bayer matrix, values in [0, 1).
 *
 * The matrix is defined bit-wise: for each bit position i of the cell
 * coordinates, the two bits of the index are (x_i XOR y_i) and y_i, with
 * the pairs interleaved from the least significant end.
 */
float bayer8(vec2 p) {
  int x = int(mod(p.x, 8.0));
  int y = int(mod(p.y, 8.0));
  int v = 0;
  for (int i = 0; i < 3; i++) {
    int bx = (x >> i) & 1;
    int by = (y >> i) & 1;
    v |= (((bx ^ by) << 1) | by) << (2 * i);
  }
  return float(v) / 64.0;
}

/* Triangular PDF noise: the difference of two uniforms. */
float triangularNoise(vec2 p) {
  return (hash21(p) - hash21(p + 17.13)) ;
}

/* Apply ±0.5 LSB of dither to a value in [0, 1]. */
float ditherValue(float v, vec2 fragCoord) {
  float b = bayer8(fragCoord) - 0.5;
  float t = triangularNoise(fragCoord) - 0.5;
  return v + (b * 0.5 + t * 0.5) / 255.0;
}
`;

/** The composite pass applies the dither just before the 8-bit write. */
export const DITHER_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uResolution;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 c = texture(uSource, vUv).rgb;
  vec2 frag = gl_FragCoord.xy;
  c.r = ditherValue(c.r, frag);
  c.g = ditherValue(c.g, frag);
  c.b = ditherValue(c.b, frag);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
