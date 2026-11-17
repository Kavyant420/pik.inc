/**
 * Independent 64-bit reference integrator for Kerr null geodesics.
 *
 * This module deliberately does **not** use the Carter separation or the
 * Carter-time formulation implemented in `geodesics.ts`. It integrates the
 * geodesic equations of motion directly from the metric:
 *
 *   dx^μ/dλ = g^{μν}(x) p_ν
 *   dp_μ/dλ = −½ ∂_μ ( g^{αβ}(x) p_α p_β )
 *
 * with the metric derivatives obtained by central finite differences. It is
 * slow but it is an independent check of the fast implementation: the two
 * must agree on where every ray goes.
 */

import { metricCov, metricInv, sigma, type Vec3 } from './metric';

export interface RefTraceOptions {
  spin: number;
  radius: number;
  theta: number;
  dir: Vec3;
  /** Maximum affine-parameter span to integrate. */
  lambdaMax?: number;
  /** Base step in λ. */
  step?: number;
  /** Relative tolerance for the adaptive controller. */
  tolerance?: number;
  /** Stop when the ray crosses the equatorial plane; returns that crossing. */
  maxCrossings?: number;
}

export interface RefCrossing {
  r: number;
  phi: number;
  theta: number;
  lambda: number;
}

export interface RefTrace {
  captured: boolean;
  escaped: boolean;
  crossings: RefCrossing[];
  lambda: number;
  x: [number, number, number, number];
  p: [number, number, number, number];
  steps: number;
  /** Conserved-quantity drift measured along the path. */
  drift: number;
}

/** Curvature of the ray in the local orthonormal frame is not needed here. */

/** Compute g^{μν} and its partial derivatives ∂_μ g^{αβ} numerically. */
function metricWithDerivs(
  r: number,
  theta: number,
  a: number,
  t: number,
  phi: number,
  h: number,
): { gi: Float64Array; dgi: Float64Array } {
  const gi = metricInv(r, theta, a);
  const dgi = new Float64Array(3 * 16); // ∂_r, ∂_θ, ∂_φ
  const coords: [number, number, number] = [r, theta, phi];
  for (let axis = 0; axis < 3; axis++) {
    const x0 = coords[axis];
    const hh = axis === 0 ? h * Math.max(1, x0) : h;
    const plus = coords.slice() as [number, number, number];
    const minus = coords.slice() as [number, number, number];
    plus[axis] = x0 + hh;
    minus[axis] = x0 - hh;
    const gp = metricInv(plus[0], plus[1], a);
    const gm = metricInv(minus[0], minus[1], a);
    for (let i = 0; i < 16; i++) dgi[axis * 16 + i] = (gp[i] - gm[i]) / (2 * hh);
  }
  void t;
  return { gi, dgi };
}

const IDX = (mu: number, nu: number) => mu * 4 + nu;

/**
 * Integrate one null geodesic with RK4 (fixed step) in the affine parameter.
 */
export function traceRayReference(opts: RefTraceOptions): RefTrace {
  const a = opts.spin;
  const h = opts.step ?? 1e-2;
  const lambdaMax = opts.lambdaMax ?? 4000;
  const maxCrossings = opts.maxCrossings ?? 4;

  const r0 = opts.radius;
  const th0 = opts.theta;
  const phi0 = 0;

  // Build the initial covariant momentum from the camera's static tetrad.
  const S = sigma(r0, th0, a);
  const gtt = -(1 - (2 * r0) / S);
  const gtp = (-2 * a * r0 * Math.sin(th0) ** 2) / S;
  const gpp = Math.sin(th0) ** 2 * (r0 * r0 + a * a + (2 * a * a * r0 * Math.sin(th0) ** 2) / S);
  const ut = 1 / Math.sqrt(-gtt);
  const c = -gtp / (gtt * ut);
  const norm = Math.sqrt(gpp - (gtp * gtp) / gtt);
  const dirRaw = opts.dir;
  const dlen = Math.hypot(dirRaw.x, dirRaw.y, dirRaw.z) || 1;
  const dir = { x: dirRaw.x / dlen, y: dirRaw.y / dlen, z: dirRaw.z / dlen };
  // p^μ = u^μ + n·e^μ
  const pu: [number, number, number, number] = [
    ut + dir.z * (c * ut * (1 / norm)),
    Math.sqrt(deltaSafe(r0, a) / S) * dir.x,
    (1 / Math.sqrt(S)) * dir.y,
    dir.z * (1 / norm),
  ];

  const g = metricCov(r0, th0, a);
  const p: [number, number, number, number] = [
    g[0] * pu[0] + g[3] * pu[3],
    g[5] * pu[1],
    g[10] * pu[2],
    g[12] * pu[0] + g[15] * pu[3],
  ];

  const x: [number, number, number, number] = [0, r0, th0, phi0];

  const deriv = (xx: number[] | Float64Array, pp: number[] | Float64Array, out: number[] | Float64Array) => {
    const o = out as number[];
    const { gi, dgi } = metricWithDerivs(xx[1], xx[2], a, xx[0], xx[3], 1e-6);
    for (let mu = 0; mu < 4; mu++) {
      let s = 0;
      for (let nu = 0; nu < 4; nu++) s += gi[IDX(mu, nu)] * pp[nu];
      o[mu] = s;
    }
    // dp_μ/dλ = −½ ∂_μ(g^{αβ} p_α p_β)
    //
    // The derivative array is laid out per coordinate axis (r, θ, φ); the
    // metric is stationary, so the t-derivative vanishes. Coordinate order is
    // (t, r, θ, φ).
    const axisOf = [0, 0, 1, 2];
    for (let mu = 0; mu < 4; mu++) {
      if (mu === 0) {
        o[4] = 0;
        continue;
      }
      let s = 0;
      for (let alpha = 0; alpha < 4; alpha++) {
        for (let beta = 0; beta < 4; beta++) {
          const q = pp[alpha] * pp[beta];
          const d = dgi[axisOf[mu] * 16 + IDX(alpha, beta)];
          s += d * q;
        }
      }
      o[4 + mu] = -0.5 * s;
    }
  };

  const k1 = new Float64Array(8);
  const k2 = new Float64Array(8);
  const k3 = new Float64Array(8);
  const k4 = new Float64Array(8);
  const y = new Float64Array([x[0], x[1], x[2], x[3], p[0], p[1], p[2], p[3]]);
  const ytmp = new Float64Array(8);

  const crossings: RefCrossing[] = [];
  let lambda = 0;
  let steps = 0;
  let captured = false;
  let escaped = false;
  let drift = 0;

  const E0 = -p[0];
  const L0 = p[3];

  const rH = 1 + Math.sqrt(Math.max(0, 1 - a * a));

  while (lambda < lambdaMax && steps < 200000) {
    const y0 = Float64Array.from(y);
    deriv([y[0], y[1], y[2], y[3]], [y[4], y[5], y[6], y[7]], k1);
    for (let i = 0; i < 8; i++) ytmp[i] = y0[i] + (h / 2) * k1[i];
    deriv([ytmp[0], ytmp[1], ytmp[2], ytmp[3]], [ytmp[4], ytmp[5], ytmp[6], ytmp[7]], k2);
    for (let i = 0; i < 8; i++) ytmp[i] = y0[i] + (h / 2) * k2[i];
    deriv([ytmp[0], ytmp[1], ytmp[2], ytmp[3]], [ytmp[4], ytmp[5], ytmp[6], ytmp[7]], k3);
    for (let i = 0; i < 8; i++) ytmp[i] = y0[i] + h * k3[i];
    deriv([ytmp[0], ytmp[1], ytmp[2], ytmp[3]], [ytmp[4], ytmp[5], ytmp[6], ytmp[7]], k4);
    for (let i = 0; i < 8; i++) {
      y[i] =
        y0[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    lambda += h;
    steps++;

    // Conserved quantities (the metric has no explicit t or φ dependence).
    const E = -y[4];
    const L = y[7];
    drift = Math.max(drift, Math.abs(E - E0), Math.abs(L - L0));

    // Equatorial crossing?
    const thPrev = y0[2];
    const thNow = y[2];
    if (thPrev !== 0 && Math.sign(Math.cos(thPrev)) !== Math.sign(Math.cos(thNow))) {
      const f = Math.cos(thPrev) / (Math.cos(thPrev) - Math.cos(thNow));
      crossings.push({
        r: y0[1] + f * (y[1] - y0[1]),
        phi: y0[3] + f * (y[3] - y0[3]),
        theta: Math.PI / 2,
        lambda: lambda - h + f * h,
      });
      if (crossings.length >= maxCrossings) break;
    }

    if (y[1] <= rH * (1 + 1e-6)) {
      captured = true;
      break;
    }
    if (y[1] > 400 && y[5] > 0) {
      escaped = true;
      break;
    }
    if (!Number.isFinite(y[1]) || !Number.isFinite(y[2])) break;
  }

  return {
    captured,
    escaped,
    crossings,
    lambda,
    x: [y[0], y[1], y[2], y[3]],
    p: [y[4], y[5], y[6], y[7]],
    steps,
    drift,
  };
}

function deltaSafe(r: number, a: number): number {
  return r * r - 2 * r + a * a;
}
