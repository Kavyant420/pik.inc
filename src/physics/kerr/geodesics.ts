/**
 * Kerr null geodesics: conserved quantities, radial/polar potentials and the
 * Carter-time integrator used by both the CPU reference and the GLSL shader.
 *
 * Separator conventions (see docs/architecture.md §1 and docs/physics.md):
 *
 *   E = -p_t,  L = p_φ
 *   Q = p_θ² + L²cot²θ − a²E²cos²θ                        (Carter constant)
 *   R(r) = [E(r²+a²) − aL]² − Δ[(L − aE)² + Q]              (radial potential)
 *   W(u) = (1−u²)(Q + a²E²u²) − L²u²   with u = cosθ         (polar potential)
 *
 * In Carter time σ (dσ = dλ/Σ) the radial and polar motions decouple:
 *
 *   d²r/dσ² = ½ R'(r)        d²u/dσ² = ½ W'(u)
 *   dφ/dσ  = 2arE/Δ + L(Δ − a²sin²θ)/(Δ sin²θ)
 *   dt/dσ  = (E·A − 2arL)/Δ
 *
 * The second-order form is used because it is smooth through the radial and
 * polar turning points (the first-order form ±√R is not Lipschitz there).
 */

import {
  delta,
  horizonRadius,
  metricA,
  photonMomentum,
  sigma,
  staticTetrad,
  zamoTetrad,
  type Vec3,
} from './metric';

export interface Conserved {
  /** Energy at infinity, E = −p_t. */
  E: number;
  /** Azimuthal angular momentum, L = p_φ. */
  L: number;
  /** Carter constant in our convention. */
  Q: number;
}

export interface EquatorialCrossing {
  /** Boyer–Lindquist radius of the crossing. */
  r: number;
  /** Azimuth of the crossing. */
  phi: number;
  /** Carter time of the crossing. */
  sigma: number;
}

export interface TraceResult {
  /** True if the ray fell through the event horizon. */
  captured: boolean;
  /** True if the ray escaped to r → ∞. */
  escaped: boolean;
  /** Equatorial-plane crossings, in order along the ray. */
  crossings: EquatorialCrossing[];
  /** Final state. */
  r: number;
  u: number;
  phi: number;
  /** Coordinate time at the end of the trace. */
  t: number;
  /** Number of accepted integration steps. */
  steps: number;
  /** Number of function evaluations. */
  evals: number;
  /** Invariant drift measured along the path (should stay at round-off). */
  drift: { radial: number; polar: number; carter: number };
  /** Conserved quantities of the traced ray. */
  conserved: Conserved;
  /** Sparse samples of the trajectory, useful for diagnostics and tests. */
  samples?: { r: number; u: number; phi: number; sigma: number; vr: number }[];
}

/** Conserved quantities from a covariant photon momentum. */
export function conservedFromMomentum(
  p: [number, number, number, number],
  _r: number,
  theta: number,
  a: number,
): Conserved {
  const E = -p[0];
  const L = p[3];
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const pTheta = p[2];
  const cot = ct / st;
  const Q = pTheta * pTheta + L * L * cot * cot - a * a * E * E * ct * ct;
  return { E, L, Q };
}

/** Conserved quantities for a local ray direction at the camera. */
export function conservedFromDirection(
  r: number,
  theta: number,
  phi: number,
  a: number,
  dir: Vec3,
  useZamo = false,
): Conserved {
  const tetrad = useZamo ? zamoTetrad(r, theta, a) : staticTetrad(r, theta, a);
  const p = photonMomentum(tetrad, r, theta, a, dir, 1);
  return conservedFromMomentum(p, r, theta, a);
}

/** Expand R(r) = E²r⁴ + βr² + 2Cr − a²Q. */
export interface RadialPolynomial {
  E2: number;
  beta: number;
  C: number;
  a2Q: number;
}

export function radialPolynomial(c: Conserved, a: number): RadialPolynomial {
  const C = (c.L - c.E * a) * (c.L - c.E * a) + c.Q;
  const beta = 2 * a * a * c.E * c.E - 2 * a * c.E * c.L - C;
  return { E2: c.E * c.E, beta, C, a2Q: a * a * c.Q };
}

/** R(r) */
export function radialPotential(r: number, p: RadialPolynomial): number {
  return p.E2 * r * r * r * r + p.beta * r * r + 2 * p.C * r - p.a2Q;
}

/** R'(r) */
export function radialPotentialDerivative(r: number, p: RadialPolynomial): number {
  return 4 * p.E2 * r * r * r + 2 * p.beta * r + 2 * p.C;
}

/**
 * Full polar potential.
 *   W(u) = (1−u²)(Q + a²E²u²) − L²u² = −a²E²u⁴ + (a²E² − Q − L²)u² + Q
 */
export function polarPotential(u: number, c: Conserved, a: number): number {
  const u2 = u * u;
  const a2E2 = a * a * c.E * c.E;
  return -a2E2 * u2 * u2 + (a2E2 - c.Q - c.L * c.L) * u2 + c.Q;
}

/** W'(u) */
export function polarPotentialDerivative(u: number, c: Conserved, a: number): number {
  const a2E2 = a * a * c.E * c.E;
  return -4 * a2E2 * u * u * u + 2 * (a2E2 - c.Q - c.L * c.L) * u;
}

/**
 * Locate the radial turning point R(r) = 0 inside the bracket [rA, rB].
 *
 * R is smooth and has a simple root at a turning point, so bisection
 * converges to machine precision. The bracket must contain a sign change.
 * The returned root is approached from the *allowed* side (R >= 0), so that
 * the caller can restart the integration just outside the forbidden region.
 */
export function rootOfRadial(rA: number, rB: number, p: RadialPolynomial): number {
  let x1 = rA;
  let f1 = radialPotential(rA, p);
  let x2 = rB;
  let f2 = radialPotential(rB, p);
  if (f1 === 0) return rA;
  if (f2 === 0) return rB;
  if ((f1 < 0) === (f2 < 0)) {
    // No sign change inside the bracket (the ray is already sitting on the
    // turning point): return the endpoint closest to the root.
    return Math.abs(f1) <= Math.abs(f2) ? rA : rB;
  }
  if (f1 < 0) {
    const tx = x1;
    x1 = x2;
    x2 = tx;
    const tf = f1;
    f1 = f2;
    f2 = tf;
  }
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (x1 + x2);
    if (radialPotential(mid, p) >= 0) x1 = mid;
    else x2 = mid;
  }
  return x1;
}

/**
 * Locate the polar turning point W(u) = 0 inside the bracket [uA, uB].
 * As for the radial root, the result is approached from the allowed side
 * (W >= 0).
 */
export function rootOfPolar(uA: number, uB: number, c: Conserved, a: number): number {
  let x1 = uA;
  let f1 = polarPotential(uA, c, a);
  let x2 = uB;
  let f2 = polarPotential(uB, c, a);
  if (f1 === 0) return uA;
  if (f2 === 0) return uB;
  if ((f1 < 0) === (f2 < 0)) {
    return Math.abs(f1) <= Math.abs(f2) ? uA : uB;
  }
  if (f1 < 0) {
    const tx = x1;
    x1 = x2;
    x2 = tx;
    const tf = f1;
    f1 = f2;
    f2 = tf;
  }
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (x1 + x2);
    if (polarPotential(mid, c, a) >= 0) x1 = mid;
    else x2 = mid;
  }
  return x1;
}

/** Largest |u| reachable by the ray (polar turning point). */
export function polarTurningPoint(c: Conserved, a: number): number {
  const a2E2 = a * a * c.E * c.E;
  // Solve for v = u²:  -a²E² v² + (a²E² − Q − L²) v + Q = 0
  const B = a2E2 - c.Q - c.L * c.L;
  let vMax = 1;
  if (a2E2 > 1e-300) {
    const disc = B * B + 4 * a2E2 * c.Q;
    if (disc < 0) return 1;
    const v = (B + Math.sqrt(disc)) / (2 * a2E2);
    if (v > 0) vMax = v;
  } else {
    // a = 0: W(u) = (Q − L²)u² + Q  →  v = Q/(L² − Q) when L² > Q
    const denom = c.L * c.L - c.Q;
    vMax = denom > 0 ? c.Q / denom : 1;
  }
  return Math.min(1, Math.sqrt(Math.max(0, vMax)));
}

/**
 * Radial turning points: the two positive roots of R(r) that bound the
 * region R ≥ 0 accessible to the ray.
 */
export function radialTurningPoints(p: RadialPolynomial, rHorizon: number): { rIn: number; rOut: number } {
  const roots = positiveRootsOfQuartic(p, rHorizon);
  const rOut = roots.length ? roots[roots.length - 1] : Infinity;
  const rIn = roots.length ? roots[0] : rHorizon;
  return { rIn, rOut };
}

/**
 * Positive roots of R(r) found by bracketing on the derivative's critical
 * points (robust, no closed-form quartic).
 */
export function positiveRootsOfQuartic(p: RadialPolynomial, rMin: number): number[] {
  // Critical points of R: 4E²r³ + 2βr + 2C = 0 → 2E²r³ + βr + C = 0
  const crit: number[] = [];
  const c0 = p.C / p.E2;
  const c1 = p.beta / p.E2;
  // Depressed cubic r³ + c1 r + c0 = 0
  const disc = (c0 * c0) / 4 + (c1 * c1 * c1) / 27;
  if (disc >= 0) {
    const sq = Math.sqrt(disc);
    const u = Math.cbrt(-c0 / 2 + sq);
    const v = Math.cbrt(-c0 / 2 - sq);
    crit.push(u + v);
  } else {
    const r = 2 * Math.sqrt(-c1 / 3);
    const phi = Math.acos(Math.min(1, Math.max(-1, (3 * c0) / (c1 * r) / r)));
    crit.push(r * Math.cos(phi / 3), r * Math.cos((phi + 2 * Math.PI) / 3), r * Math.cos((phi + 4 * Math.PI) / 3));
  }
  const pts = [rMin, ...crit.filter((x) => x > rMin && x < 1e6).sort((x, y) => x - y), 1e7];
  const roots: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = pts[i];
    const x1 = pts[i + 1];
    const f0 = radialPotential(x0, p);
    const f1 = radialPotential(x1, p);
    if (f0 === 0) roots.push(x0);
    if (f0 * f1 < 0) {
      let lo = x0;
      let hi = x1;
      for (let k = 0; k < 200; k++) {
        const mid = 0.5 * (lo + hi);
        const fm = radialPotential(mid, p);
        if (fm === 0) {
          lo = hi = mid;
          break;
        }
        if (fm * f0 < 0) hi = mid;
        else {
          lo = mid;
        }
      }
      roots.push(0.5 * (lo + hi));
    }
  }
  const filtered = roots.filter((x) => x > rMin && x < 1e7).sort((x, y) => x - y);
  // Remove duplicates
  const out: number[] = [];
  for (const x of filtered) if (!out.length || Math.abs(x - out[out.length - 1]) > 1e-9 * (1 + x)) out.push(x);
  return out;
}

// ---------------------------------------------------------------------------
// Dormand–Prince 5(4) with adaptive step size
// ---------------------------------------------------------------------------

const DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const DP_A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const DP_B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const DP_B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

/** A state or derivative vector (plain array or typed array). */
export type Vec = number[] | Float64Array;

type Deriv = (y: Vec, out: Vec) => void;

/** One Dormand–Prince 5(4) step with FSAL. Returns the 5th-order solution and the error norm. */
function dpStep(f: Deriv, y: Vec, h: number, k: Float64Array, tmp: Float64Array, tmp2: Float64Array): number {
  const n = y.length;
  for (let s = 0; s < 7; s++) {
    if (s === 0) {
      for (let i = 0; i < n; i++) tmp[i] = y[i];
    } else {
      for (let i = 0; i < n; i++) {
        let acc = y[i];
        for (let j = 0; j < s; j++) acc += h * DP_A[s][j] * k[j * n + i];
        tmp[i] = acc;
      }
    }
    f(tmp, tmp2);
    for (let i = 0; i < n; i++) k[s * n + i] = tmp2[i];
  }
  // 5th order solution
  const err = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let y5 = y[i];
    let y4 = y[i];
    for (let j = 0; j < 7; j++) {
      y5 += h * DP_B5[j] * k[j * n + i];
      y4 += h * DP_B4[j] * k[j * n + i];
    }
    err[i] = y5 - y4;
  }
  // Overwrite tmp with the accepted (5th order) solution.
  for (let i = 0; i < n; i++) tmp[i] = y[i];
  for (let i = 0; i < n; i++) {
    let acc = y[i];
    for (let j = 0; j < 7; j++) acc += h * DP_B5[j] * k[j * n + i];
    tmp[i] = acc;
  }
  let norm = 0;
  for (let i = 0; i < n; i++) {
    // Mixed absolute/relative scale: the magnitude of the component plus the
    // amount it is expected to change during the step. Using |y| alone
    // degenerates at turning points, where a velocity component passes
    // through zero and the step size would collapse.
    const scale = Math.max(1e-30, Math.abs(y[i]) + Math.abs(h * k[i]));
    norm += (err[i] / scale) * (err[i] / scale);
  }
  return Math.sqrt(norm / n);
}

// ---------------------------------------------------------------------------
// The ray tracer
// ---------------------------------------------------------------------------

export interface TraceOptions {
  spin: number;
  /** Camera radius (M). */
  radius: number;
  /** Camera polar angle θ (rad). */
  theta: number;
  /** Camera azimuth (rad) — the tracer works in a frame where it is 0. */
  phi?: number;
  /** Local ray direction in the camera's orthonormal triad. */
  dir: Vec3;
  /** Maximum number of equatorial crossings to record. */
  maxCrossings?: number;
  /** Escape radius (M). */
  escapeRadius?: number;
  /** Relative tolerance. */
  tolerance?: number;
  /** Maximum integration steps. */
  maxSteps?: number;
  /** Record the trajectory every N accepted steps (0 = off). */
  sampleEvery?: number;
  /** Use the ZAMO frame instead of the static frame for the camera tetrad. */
  zamo?: boolean;
}

/**
 * Trace a null geodesic backwards from the camera.
 *
 * The state integrated in Carter time σ is (r, ṙ, u, u̇, φ, t) with
 * u = cosθ. Equatorial crossings are detected when u changes sign.
 */
/**
 * Solve R(r; E, L, Q) = v² for the energy E.
 *
 *   R = A E² − 4 a r E L + L²(a² − Δ) − Δ Q,      A = (r²+a²)² − a²Δ
 *
 * The root continuously connected to the current energy is returned, or null
 * if no real solution exists.
 */
export function solveEnergyForR(
  r: number,
  v: number,
  L: number,
  Q: number,
  a: number,
  E0: number,
): number | null {
  const A = metricA(r, Math.PI / 2, a);
  const D = delta(r, a);
  const bq = L * L * (a * a - D) - D * Q - v * v;
  const bb = -4 * a * r * L;
  if (A === 0) return null;
  const disc = bb * bb - 4 * A * bq;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const e1 = (-bb + sq) / (2 * A);
  const e2 = (-bb - sq) / (2 * A);
  return Math.abs(e1 - E0) <= Math.abs(e2 - E0) ? e1 : e2;
}

export function traceRay(opts: TraceOptions): TraceResult {
  const a = opts.spin;
  const r0 = opts.radius;
  const theta0 = opts.theta;
  let c = conservedFromDirection(r0, theta0, opts.phi ?? 0, a, opts.dir, opts.zamo ?? false);

  let poly = radialPolynomial(c, a);
  const rH = horizonRadius(a);
  const escapeR = opts.escapeRadius ?? 400;
  const maxCrossings = opts.maxCrossings ?? 6;
  const tol = opts.tolerance ?? 1e-11;
  const maxSteps = opts.maxSteps ?? 20000;

  const L = c.L;

  // Signs of the radial and polar motion (they flip at the turning points).
  let sR = opts.dir.x < 0 ? -1 : 1;
  let sU = opts.dir.y < 0 ? 1 : -1;

  // Carter time σ, second-order form. The state is (r, ṙ, u, u̇, φ, t).
  //
  // The first-order form ṙ = ±√R conserves the Carter invariants exactly but
  // cannot turn around at a turning point (the ray would need an infinite
  // Carter time to leave the root). The second-order form
  //     d²r/dσ² = R′(r)/2,   d²u/dσ² = W′(u)/2
  // is smooth through the turning points, so the reversal happens in finite
  // time. Its price is that R(r) = ṙ² is conserved only to the order of the
  // integrator, and the violation is quadratic in the local errors, i.e.
  // invisible to the usual 4th/5th-order error estimate. It is removed by
  // adjusting the energy so that R = ṙ² holds again (see solveEnergyForR).
  const u0 = Math.cos(theta0);
  const R0 = radialPotential(r0, poly);
  const W0 = polarPotential(u0, c, a);
  const y = new Float64Array([
    r0,
    sR * Math.sqrt(Math.max(0, R0)),
    u0,
    sU * Math.sqrt(Math.max(0, W0)),
    0,
    0,
  ]);
  const k = new Float64Array(7 * 6);
  const tmp = new Float64Array(6);
  const tmp2 = new Float64Array(6);

  const deriv: Deriv = (yy, out) => {
    const r = yy[0];
    const u = yy[2];
    const st2 = Math.max(1e-12, 1 - u * u);
    const D = delta(r, a);
    const A = metricA(r, Math.acos(Math.min(1, Math.max(-1, u))), a);
    out[0] = yy[1];
    out[1] = 0.5 * radialPotentialDerivative(r, poly);
    out[2] = yy[3];
    out[3] = 0.5 * polarPotentialDerivative(u, c, a);
    out[4] = (2 * a * r * c.E) / D + (L * (D - a * a * st2)) / (D * st2);
    out[5] = (c.E * A - 2 * a * r * L) / D;
  };

  const crossings: EquatorialCrossing[] = [];
  const samples: { r: number; u: number; phi: number; sigma: number; vr: number }[] = [];
  const sampleEvery = Math.max(0, Math.floor(opts.sampleEvery ?? 0));
  let sigmaT = 0;
  let steps = 0;
  let evals = 7;
  let captured = false;
  let escaped = false;
  let driftR = 0;
  let driftW = 0;
  let driftQ = 0;
  let radialScale = 0;

  // Step policy: dr/dσ ≈ E r², so h = c/(E r) advances the radius by a fixed
  // fraction c of r and the number of steps to cross the dynamic range is
  // logarithmic.
  const stepFrac = 0.05;
  let h = Math.min(0.02, stepFrac / Math.max(1e-3, Math.abs(c.E) * r0));
  const hMin = 1e-16;

  while (steps < maxSteps) {
    const rOld = y[0];
    const uOld = y[2];
    const phiOld = y[4];
    const tOld = y[5];

    if (sampleEvery > 0 && steps % sampleEvery === 0) {
      samples.push({ r: y[0], u: y[2], phi: y[4], sigma: sigmaT, vr: y[1] });
    }

    // Close to a turning point the step has to shrink so that the event
    // localisation below stays accurate: the Carter time left is
    // 2√(d/|R′|) with d the distance to the root.
    const Rnow = radialPotential(y[0], poly);
    if (Rnow > 0) {
      const Rp = radialPotentialDerivative(y[0], poly);
      if (Rp !== 0 && sR * Rp < 0) {
        const d = Rnow / Math.abs(Rp);
        h = Math.min(h, 0.4 * 2 * Math.sqrt(Math.abs(d) / Math.abs(Rp)));
      }
    }
    const Wnow = polarPotential(y[2], c, a);
    if (Wnow > 0) {
      const Wp = polarPotentialDerivative(y[2], c, a);
      if (Wp !== 0 && sU * Wp < 0) {
        const d = Wnow / Math.abs(Wp);
        h = Math.min(h, 0.4 * 2 * Math.sqrt(Math.abs(d) / Math.abs(Wp)));
      }
    }
    if (h < hMin) h = hMin;

    const err = dpStep(deriv, y, h, k, tmp, tmp2);
    evals += 6;

    if (!Number.isFinite(tmp[0]) || !Number.isFinite(tmp[2])) {
      if (h > hMin) {
        h *= 0.25;
        continue;
      }
      captured = true;
      break;
    }
    if ((!Number.isFinite(err) || err > tol) && h > hMin) {
      h *= Number.isFinite(err) ? Math.max(0.2, 0.9 * Math.pow(tol / err, 0.2)) : 0.25;
      continue;
    }

    // Accept.
    y.set(tmp);
    sigmaT += h;
    steps++;

    // Keep the ray inside the allowed region. Near a turning point
    // R ≈ R′(r − r_t), so the Carter time spent beyond the root during the
    // step is 2√(over/|R′|); removing it keeps the azimuth φ = L σ
    // consistent with the position.
    const Racc = radialPotential(y[0], poly);
    if (Racc < 0) {
      const rTurn = rootOfRadial(rOld, y[0], poly);
      const RpT = radialPotentialDerivative(rTurn, poly);
      const over = Math.abs(y[0] - rTurn);
      sigmaT -= 2 * Math.sqrt(over / Math.max(1e-12, Math.abs(RpT)));
      y[0] = rTurn;
      y[1] = 0;
      if (rTurn <= rH * (1 + 1e-9)) {
        captured = true;
        break;
      }
    }

    const Wacc = polarPotential(y[2], c, a);
    if (Wacc < 0) {
      const uTurn = rootOfPolar(uOld, y[2], c, a);
      const WpT = polarPotentialDerivative(uTurn, c, a);
      const over = Math.abs(y[2] - uTurn);
      sigmaT -= 2 * Math.sqrt(over / Math.max(1e-12, Math.abs(WpT)));
      y[2] = uTurn;
      y[3] = 0;
    }

    // Invariant projection on the energy: restore R(r) = ṙ² exactly.
    const Efix = solveEnergyForR(y[0], y[1], c.L, c.Q, a, c.E);
    if (Efix !== null && Number.isFinite(Efix) && Efix > 0) {
      c = { E: Efix, L: c.L, Q: c.Q };
      poly = radialPolynomial(c, a);
    }

    // Drift diagnostics on the raw integrator output.
    radialScale = Math.max(radialScale, Math.abs(Racc));
    driftR = Math.max(driftR, Math.abs(tmp[1] * tmp[1] - Racc) / Math.max(1e-12, radialScale));
    driftW = Math.max(driftW, Math.abs(tmp[3] * tmp[3] - Wacc) / Math.max(1, Math.abs(Wacc)));
    if (Math.abs(y[2]) < 0.98) {
      const st = Math.sqrt(Math.max(1e-12, 1 - y[2] * y[2]));
      const pTheta = -y[3] / st;
      const Qcheck =
        pTheta * pTheta + L * L * ((y[2] * y[2]) / (1 - y[2] * y[2])) - a * a * c.E * c.E * y[2] * y[2];
      driftQ = Math.max(driftQ, Math.abs(Qcheck - c.Q) / Math.max(1, Math.abs(c.Q)));
    }

    // Equatorial crossing?
    if (uOld !== 0 && Math.sign(uOld) !== Math.sign(y[2])) {
      const f = uOld / (uOld - y[2]);
      crossings.push({
        r: rOld + f * (y[0] - rOld),
        phi: phiOld + f * (y[4] - phiOld),
        sigma: sigmaT - h + f * h,
      });
    }

    // Termination conditions.
    if (y[0] <= rH * (1 + 1e-7)) {
      captured = true;
      break;
    }
    if (y[0] >= escapeR && y[1] > 0) {
      escaped = true;
      break;
    }
    if (maxCrossings > 0 && crossings.length >= maxCrossings) {
      break;
    }

    // Step-size control.
    const fac = err > 0 ? Math.max(0.25, Math.min(4, 0.9 * Math.pow(tol / err, 0.2))) : 4;
    h = Math.min(h * fac * (1 + 0.0001), stepFrac / Math.max(1e-3, Math.abs(c.E) * Math.max(1, y[0])));
    if (h < hMin) h = hMin;
  }

  return {
    captured,
    escaped,
    crossings,
    r: y[0],
    u: y[2],
    phi: y[4],
    t: y[5],
    steps,
    evals,
    drift: { radial: driftR, polar: driftW, carter: driftQ },
    conserved: c,
    samples,
  };
}

/** uScale helper kept for symmetry with the shader: dφ/dλ = (dφ/dσ)/Σ. */
export function carterTimeToAffine(r: number, theta: number, a: number): number {
  return 1 / sigma(r, theta, a);
}
