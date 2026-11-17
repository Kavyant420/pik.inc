/**
 * Kerr orbital quantities: ISCO, circular photon orbits, circular-orbit
 * kinematics and the shadow's critical curve (Bardeen's construction).
 *
 * All formulas are for geometric units G = c = M = 1.
 */

import { delta, horizonRadius, metricA, sigma } from './metric';
import { radialPolynomial, radialPotential, type Conserved } from './geodesics';

/** Prograde/retrograde ISCO radius (Bardeen–Press–Teukolsky 1972). */
export function iscoRadius(a: number, retrograde = false): number {
  const s = Math.cbrt(1 - a * a);
  const Z1 = 1 + s * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
  const root = Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
  return 3 + Z2 + (retrograde ? root : -root);
}

/** Specific energy of the ISCO circular orbit. */
export function iscoSpecificEnergy(a: number, retrograde = false): number {
  const r = iscoRadius(a, retrograde);
  const s = Math.sqrt(r * Math.sqrt(r) - 3 * Math.sqrt(r) + 2 * a);
  return (r * Math.sqrt(r) - 2 * Math.sqrt(r) + a) / (r ** 0.75 * s);
}

/** Specific angular momentum of the ISCO circular orbit. */
export function iscoSpecificAngularMomentum(a: number, retrograde = false): number {
  const r = iscoRadius(a, retrograde);
  const s = Math.sqrt(r * Math.sqrt(r) - 3 * Math.sqrt(r) + 2 * a);
  return (r * r - 2 * a * Math.sqrt(r) + a * a) / (r ** 0.75 * s);
}

/** Equatorial circular photon orbit radius (prograde for a > 0). */
export function photonOrbitRadius(a: number, retrograde = false): number {
  const x = retrograde ? a : -a; // cos⁻¹(∓a)
  return 2 * (1 + Math.cos((2 / 3) * Math.acos(Math.max(-1, Math.min(1, x)))));
}

/** Kerr-corrected Keplerian angular velocity of the disk material. */
export function keplerianOmega(r: number, a: number): number {
  return 1 / (Math.pow(r, 1.5) + a);
}

/** Time component of the fluid's 4-velocity for a circular equatorial orbit. */
export function circularOrbitTimeComponent(r: number, a: number): number {
  const num = 1 + a / Math.pow(r, 1.5);
  const den = Math.sqrt(1 - 3 / r + (2 * a) / Math.pow(r, 1.5));
  return num / den;
}

/**
 * Redshift/beaming factor for a photon crossing the equatorial plane at
 * radius r with conserved E and L:
 *   g = 1 / [ u^t (1 − Ω L/E) ]
 */
export function gFactor(r: number, a: number, E: number, L: number): number {
  const ut = circularOrbitTimeComponent(r, a);
  const omega = keplerianOmega(r, a);
  const lambda = E !== 0 ? L / E : 0;
  return 1 / (ut * (1 - omega * lambda));
}

/** dτ/dt for a *static* observer at (r, θ) — the factor quoted by the HUD. */
export function staticTimeDilation(r: number, theta: number, a: number): number {
  const S = sigma(r, theta, a);
  return Math.sqrt(Math.max(0, 1 - (2 * r) / S));
}

/** dτ/dt for the zero-angular-momentum observer (ZAMO). */
export function zamoTimeDilation(r: number, theta: number, a: number): number {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const A = metricA(r, theta, a);
  return Math.sqrt((S * D) / A);
}

/**
 * Radial turning points of a ray (roots of R(r) above the horizon).
 */
export function radialTurningPointsOf(c: Conserved, a: number): { rIn: number; rOut: number } {
  const poly = radialPolynomial(c, a);
  return turningPoints(poly, horizonRadius(a));
}

function turningPoints(poly: ReturnType<typeof radialPolynomial>, rH: number) {
  const f = (r: number) => poly.E2 * r ** 4 + poly.beta * r * r + 2 * poly.C * r - poly.a2Q;
  const roots: number[] = [];
  let prevR = rH * (1 + 1e-9);
  let prevF = f(prevR);
  for (let i = 1; i <= 8000; i++) {
    const r = rH * (1 + 1e-9) * Math.pow(1e4, i / 8000);
    const fv = f(r);
    if (prevF * fv < 0) {
      let lo = prevR;
      let hi = r;
      let flo = prevF;
      for (let k = 0; k < 200; k++) {
        const mid = Math.sqrt(lo * hi);
        const fm = f(mid);
        if (fm * flo < 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      roots.push(Math.sqrt(lo * hi));
    }
    prevR = r;
    prevF = fv;
  }
  roots.sort((x, y) => x - y);
  return { rIn: roots.length ? roots[0] : rH, rOut: roots.length ? roots[roots.length - 1] : Infinity };
}

/**
 * Impact parameter (flat-far-zone convention) of a ray with the given
 * conserved quantities and the observer's polar angle θ (M = 1).
 *
 * In the far zone, the transverse ("polar") part of the photon's angular
 * momentum obeys  Q0 ≡ p_θ² + L²cot²θ → E²b²cos²θ∞, and the Kerr Carter
 * constant is Q = Q0 − a²E²cos²θ, hence
 *     E²b²cos²θ∞ = Q + a²E²cos²θ∞ .
 * Replacing θ∞ by the observer's θ is accurate to O(a²/r_obs²) (< 10⁻⁴ for
 * our camera radii); docs/physics.md quantifies it.
 */
export function impactParameter(c: Conserved, a: number, thetaObs: number): number {
  const E = c.E;
  const L = c.L;
  const ct = Math.cos(thetaObs);
  const Q0 = c.Q + a * a * E * E * ct * ct;
  return Math.sqrt(Math.max(0, (L * L + Q0) / (E * E)));
}

/**
 * Critical curve of the shadow in Bardeen's (1973) construction, expressed in
 * the impact-parameter plane (ξ, Q) where
 *
 *   ξ ≡ L/E    (azimuthal impact parameter of the ray)
 *   Q ≡ p_θ² + L²cot²θ − a²E²cos²θ   (our Carter constant)
 *
 * A ray is captured exactly when its radial potential
 *
 *   R(r) = [E(r²+a²) − aL]² − Δ[(L − aE)² + Q]
 *
 * becomes negative somewhere between the horizon and infinity, i.e. when the
 * radial motion is forbidden. The boundary of the capture region — the
 * critical curve — is the locus where R(r) has a *double* root, i.e. where
 * the ray asymptotes to an unstable photon orbit.
 *
 * For each ξ we find the critical Carter constant Q_c(ξ) by bisecting on the
 * condition min_r R(r; ξ, Q) = 0.
 *
 * In the Schwarzschild limit this reduces to ξ² + Q = 27 M², i.e. the circle
 * of critical impact parameter b_c = 3√3 M, which the validation suite checks
 * explicitly.
 */
export function criticalCarterCurve(a: number, xiList: number[]): { xi: number; Q: number }[] {
  const out: { xi: number; Q: number }[] = [];
  const rH = horizonRadius(a);
  for (const xi of xiList) {
    const minR = (Q: number): number => {
      const C = (xi - a) * (xi - a) + Q;
      const beta = 2 * a * a - 2 * a * xi - C;
      const R = (r: number) => r ** 4 + beta * r * r + 2 * C * r - a * a * Q;
      const lo = rH * (1 + 1e-9);
      const hi = 600;
      const n = 3000;
      let best = lo;
      let bestV = Infinity;
      for (let i = 0; i <= n; i++) {
        const r = lo * Math.pow(hi / lo, i / n);
        const v = R(r);
        if (v < bestV) {
          bestV = v;
          best = r;
        }
      }
      let a0 = best / 1.000001;
      let b0 = best * 1.000001;
      const gr = (Math.sqrt(5) - 1) / 2;
      let c0 = b0 - gr * (b0 - a0);
      let d0 = a0 + gr * (b0 - a0);
      for (let i = 0; i < 160; i++) {
        if (R(c0) < R(d0)) b0 = d0;
        else a0 = c0;
        c0 = b0 - gr * (b0 - a0);
        d0 = a0 + gr * (b0 - a0);
      }
      return R(0.5 * (a0 + b0));
    };

    let lo = 0;
    let hi = 6000;
    if (!(minR(hi) < 0)) continue; // this ξ never captures
    for (let i = 0; i < 100; i++) {
      const mid = 0.5 * (lo + hi);
      if (minR(mid) < 0) hi = mid;
      else lo = mid;
    }
    out.push({ xi, Q: 0.5 * (lo + hi) });
  }
  return out;
}

/**
 * True when a ray with the given conserved quantities, arriving from radius
 * `rCam`, plunges through the horizon.
 *
 * The ray is captured exactly when its radial motion is allowed all the way
 * down to the horizon, i.e. when R(r) >= 0 for every r in (r₊, rCam). A root
 * of R inside that interval is a turning point: the ray turns around and
 * escapes. (Regions with R < 0 *outside* the camera radius are irrelevant.)
 */
export function isCaptured(c: Conserved, a: number, rCam = 1e4): boolean {
  const poly = radialPolynomial(c, a);
  const rH = horizonRadius(a);
  const lo = rH * (1 + 1e-9);
  const hi = Math.max(rCam, lo * 2);
  const n = 20000;
  for (let i = 0; i <= n; i++) {
    const r = lo * Math.pow(hi / lo, i / n);
    if (radialPotential(r, poly) < 0) return false;
  }
  return true;
}
