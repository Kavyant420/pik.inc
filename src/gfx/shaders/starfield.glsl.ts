/**
 * The procedural star field.
 *
 * Stars only: the background behind the hole is pure black, exactly as the
 * design rules demand ("Background is pure #000000. No gradient, no lifted
 * vignette, no nebula."). There is no milky band, no gas, no dust — just
 * points of light at infinity.
 *
 * The stars are placed on a cube-face grid so that the density is uniform
 * over the sphere (a plain latitude/longitude grid would bunch them at the
 * poles). Each layer is a different magnitude class; the bright layer is
 * sparse and coloured, the faint layer is dense and nearly white.
 *
 * The chunk exposes `starfield(dir, brightness)`, which returns linear RGB.
 */

/** Star field sampling, called from the geodesic pass. */
export const STARFIELD_GLSL = /* glsl */ `
/* One magnitude layer of stars.
 *
 * 'density'  cells per cube face
 * 'sharp'    inverse of the point-spread width in cell units
 * 'seed'     decorrelates the layers
 */
vec3 starLayer(vec3 dir, float density, float sharp, float seed) {
  vec3 a = abs(dir);
  vec2 uv;
  float face;

  if (a.x >= a.y && a.x >= a.z) {
    uv = dir.zy / max(a.x, 1e-6);
    face = dir.x > 0.0 ? 0.0 : 1.0;
  } else if (a.y >= a.z) {
    uv = dir.xz / max(a.y, 1e-6);
    face = dir.y > 0.0 ? 2.0 : 3.0;
  } else {
    uv = dir.xy / max(a.z, 1e-6);
    face = dir.z > 0.0 ? 4.0 : 5.0;
  }

  vec3 p = vec3(uv * density, face * 37.0 + seed);
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;

  vec3 h = hash33(id + seed);
  /* Stars sit away from the cell borders so the faces do not show seams. */
  vec2 offset = (h.xy - 0.5) * 0.72;
  float d = length(f.xy - offset);

  /* A steep magnitude distribution: a few bright stars, many faint ones. */
  float mag = pow(hash13(id + 19.7 + seed), 9.0);
  float s = mag * exp(-d * d * sharp);

  /* Stellar colour: mostly white, some warm, some blue. */
  float t = hash13(id + 41.3 + seed);
  vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.86, 1.0), smoothstep(0.35, 1.0, t));
  tint = mix(vec3(1.0), tint, 0.75);

  return tint * s;
}

/* The full sky: three magnitude classes, no diffuse background. */
vec3 starfield(vec3 dir, float brightness) {
  vec3 c = vec3(0.0);
  c += starLayer(dir,  22.0, 240.0,  0.0)  * 1.60;  /* bright, sparse  */
  c += starLayer(dir,  58.0, 900.0, 11.0)  * 0.55;  /* mid             */
  c += starLayer(dir, 150.0, 2600.0, 23.0) * 0.16;  /* faint, dense    */
  return c * brightness;
}
`;
