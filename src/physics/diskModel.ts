/**
 * The accretion disk model (CPU side).
 *
 * This is the twin of src/gfx/shaders/disk.glsl.ts: the shader needs the
 * same numbers per pixel, so the two are kept in step by tests/disk.test.ts.
 *
 * PHYSICS
 * -------
 * A geometrically thin, optically thick, zero-torque (Novikov–Thorne)
 * relativistic accretion flow. The pieces:
 *
 * 1. **The flux profile.** The Novikov–Thorne energy flux in geometric
 *    units (M = 1) is taken in its usual closed form,
 *
 *      F(r) ∝ (1/r³) · [ 1 + (1−a)(M/r)^{3/2} ] / [ 1 − 3M/r + 2a(M/r)^{3/2} ]
 *
 *    which is the standard quoted effective-temperature expression
 *    (Shapiro–Teukolsky §15). Three properties matter here:
 *
 *      · it falls off like r⁻³ far from the hole, i.e. it reduces to the
 *        Newtonian thin-disk flux;
 *      · the denominator vanishes at the equatorial *photon orbit*, which
 *        lies inside the ISCO for every spin, so the disk — truncated at
 *        the ISCO — never sees the pole;
 *      · the shader floors the denominator, so the inner edge stays finite.
 *
 *    On top of that the *escaping* flux is multiplied by the photon
 *    capture factor 1 − √(r_ph/r): the fraction of the locally emitted
 *    photons that make it out of the hole's photon well. The capture cone
 *    closes at the photon orbit, which removes the unphysical pole of the
 *    closed form and reproduces the fact that the relativistic peak of the
 *    flux is far below the Newtonian one (Thorne 1974).
 *
 *    The full Page–Thorne transport solution differs from this closed form
 *    by an order-unity factor near the inner edge; that difference is a
 *    modelling choice absorbed by the exposure, not a numerical error.
 *
 * 2. **The temperature and its colour.** T_eff ∝ F^{1/4}; the colour comes
 *    from the Planckian locus (Kim et al. 2002), converted to linear sRGB.
 *
 * 3. **The beaming.** Liouville's theorem gives I_ν/ν³ invariant, hence a
 *    bolometric boost of g⁴, where
 *
 *      g = 1 / [ u^t (1 − Ω L/E) ]
 *
 *    is the combined gravitational and Doppler factor. The approaching side
 *    of the disk has g > 1 and blazes; the receding side has g < 1 and
 *    almost disappears. The observed colour temperature is g·T_em.
 */

import { iscoRadius, photonOrbitRadius } from './kerr/orbital';

/** The inner edge of the disk, in M. */
export function diskInnerRadius(spin: number): number {
  // The material's inner edge is the ISCO, but nothing inside the photon
  // orbit can be seen anyway: it is hidden behind the shadow.
  const isco = iscoRadius(spin);
  const photon = photonOrbitRadius(spin);
  return Math.max(isco, photon * 0.999);
}

/** The outer edge of the disk, in M. */
export function diskOuterRadius(spin: number): number {
  void spin;
  return 22;
}

/**
 * The Novikov–Thorne flux shape F(r), up to an overall constant.
 *
 * The same clamp as the shader: the denominator is floored so the pole at
 * the photon orbit cannot produce an infinite emission, and the escaping
 * flux carries the photon-capture factor.
 */
export function ntFluxShape(r: number, spin: number): number {
  const ri = Math.max(r, 1);
  const s = Math.sqrt(ri);
  const w = Math.max(1 - 3 / ri + (2 * spin) / (ri * s), 2e-3);
  const num = 1 + (1 - spin) / (ri * s);
  const shape = num / (ri * ri * ri * w);

  // Photon capture: the capture cone closes at the photon orbit.
  const rPhoton = photonOrbitRadius(spin);
  const escape = Math.max(1 - Math.sqrt(rPhoton / ri), 0);

  return shape * escape;
}

/**
 * The effective temperature of the disk at radius r, in kelvin.
 *
 * @param peakK the effective temperature at the inner edge
 * @param inner the inner edge of the disk
 */
export function diskEffectiveTemperature(
  r: number,
  spin: number,
  peakK: number,
  inner: number,
): number {
  const shape = ntFluxShape(r, spin);
  const shapeIn = ntFluxShape(inner, spin);
  return peakK * Math.pow(Math.max(shape / Math.max(shapeIn, 1e-12), 1e-9), 0.25);
}

/** The Keplerian angular velocity of the disk material (M = 1). */
export function diskOmega(r: number, spin: number): number {
  return 1 / (Math.pow(Math.max(r, 1), 1.5) + spin);
}

/**
 * The redshift/blueshift factor g for a photon emitted by the disk at
 * radius r and received by a distant observer:
 *
 *     g = 1 / [ u^t (1 − Ω L/E) ]
 *
 * @param L the angular momentum of the *forward* photon
 */
export function redshiftFactor(r: number, spin: number, energy: number, L: number): number {
  const ri = Math.max(r, 1);
  const s = Math.sqrt(ri);
  const w = Math.max(1 - 3 / ri + (2 * spin) / (ri * s), 1e-4);
  const ut = (1 + spin / (ri * s)) / Math.sqrt(w);
  const omega = diskOmega(r, spin);
  const denominator = ut * (1 - (omega * L) / Math.max(energy, 1e-9));
  return 1 / denominator;
}

/** The bolometric beaming factor: I_obs = g⁴ I_em. */
export function beamingFactor(g: number): number {
  const g2 = g * g;
  return g2 * g2;
}

/** The chromaticity (x, y) of a blackbody of the given temperature. */
export function blackbodyChroma(temperatureK: number): { x: number; y: number } {
  const T = Math.min(40000, Math.max(1200, temperatureK));
  const t2 = T * T;
  const t3 = t2 * T;

  let x: number;
  if (T < 4000) {
    x = -0.2661239e9 / t3 - 0.2343589e6 / t2 + (0.8776956e3) / T + 0.17991;
  } else {
    x = -3.0258469e9 / t3 + (2.1070379e6) / t2 + (0.2226347e3) / T + 0.24039;
  }

  const x2 = x * x;
  const x3 = x2 * x;
  let y: number;
  if (T < 2222) {
    y = -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683;
  } else if (T < 4000) {
    y = -0.9549476 * x3 - 1.37418593 * x2 + 2.62591848 * x - 0.62408774;
  } else {
    y = 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483;
  }

  return { x, y };
}

/**
 * The linear sRGB colour of a blackbody, normalised so that the brightest
 * channel is 1 (the intensity comes from the flux, not from the colour).
 */
export function blackbodyRgb(temperatureK: number): [number, number, number] {
  const { x, y } = blackbodyChroma(temperatureK);
  // Chromaticity -> XYZ with unit luminance: Y = 1, X = x/y, Z = (1-x-y)/y.
  const Y = 1;
  const X = x / Math.max(y, 1e-4);
  const Z = (1 - x - y) / Math.max(y, 1e-4);

  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;

  const rgb: [number, number, number] = [Math.max(r, 0), Math.max(g, 0), Math.max(b, 0)];
  const m = Math.max(rgb[0], rgb[1], rgb[2]);
  return m > 1e-6 ? [rgb[0] / m, rgb[1] / m, rgb[2] / m] : [1, 1, 1];
}

/**
 * The observed emission of the disk at one point of the equatorial plane,
 * as linear RGB.
 *
 * @param r the radius of the crossing, in M
 * @param g the redshift factor
 * @param spin a/M
 * @param peakK the effective temperature at the inner edge
 * @param inner the inner edge of the disk
 */
export function diskEmission(
  r: number,
  g: number,
  spin: number,
  peakK: number,
  inner: number,
): [number, number, number] {
  const shape = ntFluxShape(r, spin);
  const temperature = diskEffectiveTemperature(r, spin, peakK, inner) * g;
  const tint = blackbodyRgb(temperature);
  const intensity = shape * beamingFactor(g);
  return [tint[0] * intensity, tint[1] * intensity, tint[2] * intensity];
}

/** The default model parameters. */
export interface DiskModel {
  spin: number;
  innerRadius: number;
  outerRadius: number;
  peakTemperatureK: number;
}

export function createDiskModel(spin: number, peakTemperatureK = 12000): DiskModel {
  return {
    spin,
    innerRadius: diskInnerRadius(spin),
    outerRadius: diskOuterRadius(spin),
    peakTemperatureK,
  };
}
