/**
 * The accretion disk's emission model.
 *
 * PHYSICS
 * -------
 * The disk is a geometrically thin, optically thick, zero-torque
 * (Novikov–Thorne) relativistic accretion flow around a Kerr hole. Three
 * pieces are needed to turn a crossing of the equatorial plane into light:
 *
 * 1. **The flux profile.** The Novikov–Thorne energy flux is
 *
 *      F(r) = (3 Ṁ)/(8π r³) · [ 1 + (1−a)(M/r)^{3/2} ] / [ 1 − 3M/r + 2a(M/r)^{3/2} ]
 *
 *    with M = 1. The denominator vanishes at the equatorial photon orbit,
 *    which is inside the ISCO for every spin, so the disk never reaches
 *    it; the shader floors it anyway so the inner edge stays finite. The
 *    escaping flux is then multiplied by the photon-capture factor
 *    1 − √(r_ph/r), which closes the capture cone at the photon orbit.
 *
 * 2. **The temperature and its colour.** The effective temperature scales
 *    like F^{1/4}; the colour follows the Planckian locus (Kim et al. 2002
 *    cubic fit), converted to linear sRGB. The *observed* temperature is
 *    g·T_em, because the photon arrives blueshifted (or redshifted) by the
 *    combined gravitational and Doppler factor g.
 *
 * 3. **The beaming.** Liouville's theorem for an isotropic source gives
 *    I_ν/ν³ invariant, hence a bolometric intensity boost of g⁴. That factor
 *    is what makes the approaching side of the disk blaze and the receding
 *    side almost vanish.
 *
 * The same code exists on the CPU side in src/physics/diskModel.ts; the two
 * are kept in step by tests/disk.test.ts.
 */

/** The Novikov–Thorne flux shape and the disk's emission helpers. */
export const DISK_GLSL = /* glsl */ `
uniform float uDiskInner;    /* inner edge of the disk, in M      */
uniform float uDiskOuter;    /* outer edge of the disk, in M      */
uniform float uDiskPeakK;    /* effective temperature at the inner edge, K */
uniform float uDiskScale;    /* overall brightness of the disk    */

/* The Novikov–Thorne flux shape F(r) up to an overall constant.
 *
 * Returns a value >= 0. The denominator vanishes at the equatorial photon
 * orbit, which lies inside the ISCO for every spin, so the disk (truncated
 * at the ISCO) never reaches it; the floor is only a safety net.
 *
 * The escaping flux carries the photon-capture factor: the fraction of the
 * locally emitted photons that escape the hole's photon well. The capture
 * cone closes at the photon orbit, which removes the unphysical pole of the
 * closed form.
 */
float ntFluxShape(float r, float a) {
  float ri = max(r, 1.0);
  float s  = sqrt(ri);
  float w  = 1.0 - 3.0 / ri + 2.0 * a / (ri * s);
  w = max(w, 2.0e-3);
  float num = 1.0 + (1.0 - a) / (ri * s);
  float shape = num / (ri * ri * ri * w);

  /* r_ph = 2(1 + cos((2/3) acos(-a))) — the prograde equatorial photon orbit. */
  float rPh = 2.0 * (1.0 + cos((2.0 / 3.0) * acos(clamp(-a, -1.0, 1.0))));
  float escape = max(1.0 - sqrt(rPh / ri), 0.0);

  return shape * escape;
}

/* The Planckian locus (Kim et al. 2002) — chromaticity in xy for a
 * blackbody of temperature T, then converted to linear sRGB.
 */
vec3 blackbodyChroma(float T) {
  T = clamp(T, 1200.0, 40000.0);
  float t2 = T * T;
  float t3 = t2 * T;

  float x;
  if (T < 4000.0) {
    x = -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / T + 0.179910;
  } else {
    x = -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / T + 0.240390;
  }

  float x2 = x * x;
  float x3 = x2 * x;
  float y;
  if (T < 2222.0) {
    y = -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683;
  } else if (T < 4000.0) {
    y = -0.9549476 * x3 - 1.37418593 * x2 + 2.62591848 * x - 0.62408774;
  } else {
    y = 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  }
  return vec3(x, y, 1.0 - x - y);
}

/* Linear sRGB of a blackbody, normalised so the brightest channel is 1.
 * The intensity comes from the flux, not from the colour. */
vec3 blackbodyRgb(float T) {
  vec3 xy = blackbodyChroma(T);
  vec3 XYZ = vec3(xy.x, xy.y, xy.z) / max(xy.y, 1e-4);
  mat3 toRgb = mat3(
     3.2404542, -0.9692660,  0.0556434,
    -1.5371385,  1.8760108, -0.2040259,
    -0.4985314,  0.0415560,  1.0572252);
  vec3 rgb = max(toRgb * XYZ, vec3(0.0));
  float m = max(rgb.r, max(rgb.g, rgb.b));
  return m > 1e-6 ? rgb / m : vec3(1.0);
}

/* The Keplerian angular velocity of the disk material (M = 1). */
float diskOmega(float r, float a) {
  return 1.0 / (pow(max(r, 1.0), 1.5) + a);
}

/* The redshift/blueshift factor g for a photon emitted by the disk at
 * radius r and received by a distant observer:
 *
 *     g = 1 / [ u^t (1 - Omega L / E) ]
 *
 * 'L' is the angular momentum of the *forward* photon (the tracer works
 * with the backward ray, whose L has the opposite sign).
 */
float diskRedshift(float r, float a, float E, float L) {
  float ri = max(r, 1.0);
  float s  = sqrt(ri);
  float w  = 1.0 - 3.0 / ri + 2.0 * a / (ri * s);
  w = max(w, 1.0e-4);
  float ut = (1.0 + a / (ri * s)) / sqrt(w);
  float om = diskOmega(r, a);
  float denom = ut * (1.0 - om * L / max(E, 1e-9));
  return 1.0 / denom;
}

/* The emitted light of the disk at one point of the equatorial plane.
 *
 *   r      radius of the crossing, in M
 *   phi    azimuth of the crossing, in radians
 *   g      redshift factor (>= 1 blueshifted)
 *   a      spin
 *   time   seconds, used to shear the turbulence
 */
vec3 diskEmission(float r, float phi, float g, float a, float time) {
  float shape = ntFluxShape(r, a);

  /* The emitted effective temperature, normalised to the inner edge. */
  float shapeIn = ntFluxShape(uDiskInner, a);
  float T = uDiskPeakK * pow(max(shape / max(shapeIn, 1e-12), 1e-9), 0.25);

  /* The observer sees the temperature shifted by the redshift factor. */
  T *= g;
  vec3 tint = blackbodyRgb(T);

  /* Turbulence. The texture is sheared by the local Keplerian rate, so the
   * inner rings really do run ahead of the outer ones. */
  float om = diskOmega(r, a);
  float shear = phi - om * time;
  float turb = fbm3(vec3(r * 0.30, shear * 0.85, time * 0.04), 4);
  float fil  = ridged3(vec3(r * 0.75, shear * 1.70, time * 0.07), 3);
  float profile = 0.45 + 1.15 * turb * (0.55 + 0.85 * fil);

  /* Bolometric beaming: I_obs = g^4 I_em. */
  float g2 = g * g;
  float intensity = shape * g2 * g2 * profile * uDiskScale;

  return tint * intensity;
}
`;
