/**
 * Kerr metric, observer tetrad, and the invariants the renderer needs.
 *
 * Units: G = c = 1, M = 1.
 * Coordinates: Boyer–Lindquist (t, r, θ, φ) with the **spin axis along z**
 * and the accretion disk in the equatorial plane θ = π/2.
 *
 * Covariant metric (equatorial-disk convention):
 *   g_tt = -(1 - 2r/Σ)              g_tφ = -2ar sin²θ/Σ
 *   g_rr = Σ/Δ                      g_θθ = Σ
 *   g_φφ = sin²θ (r² + a² + 2a²r sin²θ/Σ)
 *
 * The closed-form inverse below is verified against a numerical inversion of
 * the covariant metric in tests/kerr.test.ts.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Σ = r² + a²cos²θ */
export function sigma(r: number, theta: number, a: number): number {
  return r * r + a * a * Math.cos(theta) * Math.cos(theta);
}

/** Δ = r² - 2r + a² */
export function delta(r: number, a: number): number {
  return r * r - 2 * r + a * a;
}

/** A = (r²+a²)² - a²Δ sin²θ */
export function metricA(r: number, theta: number, a: number): number {
  const s = r * r + a * a;
  return s * s - a * a * delta(r, a) * Math.sin(theta) * Math.sin(theta);
}

/** Outer event horizon r₊ = 1 + √(1-a²) */
export function horizonRadius(a: number): number {
  return 1 + Math.sqrt(Math.max(0, 1 - a * a));
}

/** Inner (Cauchy) horizon r₋ = 1 - √(1-a²) */
export function innerHorizonRadius(a: number): number {
  return 1 - Math.sqrt(Math.max(0, 1 - a * a));
}

/**
 * Covariant metric components, indexed [μ][ν] as g[4*mu + nu].
 * Order: t, r, θ, φ.
 */
export function metricCov(r: number, theta: number, a: number): Float64Array {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const g = new Float64Array(16);
  g[0] = -(1 - (2 * r) / S);
  g[1] = 0;
  g[2] = 0;
  g[3] = (-2 * a * r * st * st) / S;
  g[4] = 0;
  g[5] = S / D;
  g[6] = 0;
  g[7] = 0;
  g[8] = 0;
  g[9] = 0;
  g[10] = S;
  g[11] = 0;
  g[12] = g[3];
  g[13] = 0;
  g[14] = 0;
  g[15] = st * st * (r * r + a * a + (2 * a * a * r * st * st) / S);
  // ct is used above only through cos²θ inside Σ; keep the reference explicit.
  void ct;
  return g;
}

/**
 * Inverse metric components, indexed [μ][ν] as gi[4*mu + nu].
 * g^tt = -A/(ΣΔ), g^tφ = -2ar/(ΣΔ), g^rr = Δ/Σ, g^θθ = 1/Σ,
 * g^φφ = (Δ - a²sin²θ)/(ΣΔ sin²θ)
 */
export function metricInv(r: number, theta: number, a: number): Float64Array {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const st = Math.sin(theta);
  const A = metricA(r, theta, a);
  const gi = new Float64Array(16);
  gi[0] = -A / (S * D);
  gi[1] = 0;
  gi[2] = 0;
  gi[3] = (-2 * a * r) / (S * D);
  gi[4] = 0;
  gi[5] = D / S;
  gi[6] = 0;
  gi[7] = 0;
  gi[8] = 0;
  gi[9] = 0;
  gi[10] = 1 / S;
  gi[11] = 0;
  gi[12] = gi[3];
  gi[13] = 0;
  gi[14] = 0;
  gi[15] = (D - a * a * st * st) / (S * D * st * st);
  return gi;
}

/** Lower a covector: p_μ = g_μν p^ν */
export function lowerIndex(g: Float64Array, pUp: ArrayLike<number>): [number, number, number, number] {
  return [
    g[0] * pUp[0] + g[1] * pUp[1] + g[2] * pUp[2] + g[3] * pUp[3],
    g[4] * pUp[0] + g[5] * pUp[1] + g[6] * pUp[2] + g[7] * pUp[3],
    g[8] * pUp[0] + g[9] * pUp[1] + g[10] * pUp[2] + g[11] * pUp[3],
    g[12] * pUp[0] + g[13] * pUp[1] + g[14] * pUp[2] + g[15] * pUp[3],
  ];
}

/** Raise an index: p^μ = g^μν p_ν */
export function raiseIndex(gi: Float64Array, pDown: number[]): [number, number, number, number] {
  return [
    gi[0] * pDown[0] + gi[1] * pDown[1] + gi[2] * pDown[2] + gi[3] * pDown[3],
    gi[4] * pDown[0] + gi[5] * pDown[1] + gi[6] * pDown[2] + gi[7] * pDown[3],
    gi[8] * pDown[0] + gi[9] * pDown[1] + gi[10] * pDown[2] + gi[11] * pDown[3],
    gi[12] * pDown[0] + gi[13] * pDown[1] + gi[14] * pDown[2] + gi[15] * pDown[3],
  ];
}

/**
 * Local observer tetrad.
 *
 * Two observers are provided:
 *  - `static`  : the zero-angular-momentum *static* observer (u^φ = 0). This is
 *                 the camera frame (see the HUD's "static observer time
 *                 dilation"), and it is well defined for r outside the
 *                 ergosphere — the camera never goes below 3.2 M, and the
 *                 equatorial ergosphere ends at r = 2 M for a = 0.999.
 *  - `zamo`    : the zero-angular-momentum *observer* in the usual sense
 *                 (locally non-rotating), which is regular down to the horizon
 *                 and is used by the HUD and by the physics reference code.
 *
 * The returned basis vectors are contravariant (upper index) so that
 * p^μ = E_obs (u^μ + n_r e_r̂^μ + n_θ e_θ̂^μ + n_φ e_φ̂^μ).
 */
export interface Tetrad {
  /** 4-velocity u^μ (upper index). */
  u: [number, number, number, number];
  /** Orthonormal spatial triad, upper index. */
  er: [number, number, number, number];
  eth: [number, number, number, number];
  ephi: [number, number, number, number];
  /** Lapse α of the static observer (α = 1/√(-g_tt)). */
  alpha: number;
  /** Frame-dragging angular velocity ω of the ZAMO (0 for the static frame). */
  omega: number;
}

export function staticTetrad(r: number, theta: number, a: number): Tetrad {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const st = Math.sin(theta);
  const gtt = -(1 - (2 * r) / S);
  const gtp = (-2 * a * r * st * st) / S;
  const gpp = st * st * (r * r + a * a + (2 * a * a * r * st * st) / S);

  const alpha = 1 / Math.sqrt(-gtt);
  const ut = alpha;

  // ê_r̂ is normalised because g_rr = Σ/Δ.
  const er: [number, number, number, number] = [0, Math.sqrt(D / S), 0, 0];
  const eth: [number, number, number, number] = [0, 0, 1 / Math.sqrt(S), 0];

  // φ̂ orthogonal to u: e_φ = (∂_φ + c·u)/norm. With u = u^t∂_t,
  // orthogonality requires  g_φt·u^t + c·g_tt·(u^t)² = 0.
  const c = -gtp / (gtt * ut);
  const norm2 = gpp - (gtp * gtp) / gtt;
  const invNorm = 1 / Math.sqrt(Math.max(norm2, 1e-300));
  const ephi: [number, number, number, number] = [c * ut * invNorm, 0, 0, invNorm];

  return { u: [ut, 0, 0, 0], er, eth, ephi, alpha, omega: 0 };
}

export function zamoTetrad(r: number, theta: number, a: number): Tetrad {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const st = Math.sin(theta);
  const A = metricA(r, theta, a);

  const alpha = Math.sqrt((S * D) / A);
  const omega = (2 * a * r) / A;

  // u = (1/α)(∂_t + ω ∂_φ)
  const ut = 1 / alpha;
  const uphi = omega / alpha;

  const er: [number, number, number, number] = [0, Math.sqrt(D / S), 0, 0];
  const eth: [number, number, number, number] = [0, 0, 1 / Math.sqrt(S), 0];

  // The ZAMO's spatial triad: ê_φ is orthogonal to u and has unit norm.
  // g(∂_φ + k u, ∂_φ + k u) with k solved from orthogonality.
  const gtt = -(1 - (2 * r) / S);
  const gtp = (-2 * a * r * st * st) / S;
  const gpp = st * st * (r * r + a * a + (2 * a * a * r * st * st) / S);
  const k = -(gtp * ut + gpp * uphi) / (gtt * ut * ut + 2 * gtp * ut * uphi + gpp * uphi * uphi);
  const gk2 =
    gpp + 2 * k * (gtp * ut + gpp * uphi) + k * k * (gtt * ut * ut + 2 * gtp * ut * uphi + gpp * uphi * uphi);
  const invNorm = 1 / Math.sqrt(Math.max(gk2, 1e-300));
  const ephi: [number, number, number, number] = [
    k * ut * invNorm,
    0,
    0,
    (1 + k * uphi) * invNorm,
  ];

  return { u: [ut, 0, 0, uphi], er, eth, ephi, alpha, omega };
}

/**
 * Build a photon's covariant momentum p_μ from a local ray direction.
 *
 * The direction is normalised internally: a photon built from a non-unit
 * direction would not be null and the conserved quantities would be
 * inconsistent.
 *
 * @param dir  direction in the camera's orthonormal triad (e_r̂, e_θ̂, e_φ̂)
 * @param energy  photon energy in the observer's frame (arbitrary scale)
 */
export function photonMomentum(
  tetrad: Tetrad,
  r: number,
  theta: number,
  a: number,
  dirIn: Vec3,
  energy = 1,
): [number, number, number, number] {
  const len = Math.hypot(dirIn.x, dirIn.y, dirIn.z) || 1;
  const dir: Vec3 = { x: dirIn.x / len, y: dirIn.y / len, z: dirIn.z / len };
  const g = metricCov(r, theta, a);
  const pu: [number, number, number, number] = [
    energy * (tetrad.u[0] + dir.x * tetrad.er[0] + dir.y * tetrad.eth[0] + dir.z * tetrad.ephi[0]),
    energy * (tetrad.u[1] + dir.x * tetrad.er[1] + dir.y * tetrad.eth[1] + dir.z * tetrad.ephi[1]),
    energy * (tetrad.u[2] + dir.x * tetrad.er[2] + dir.y * tetrad.eth[2] + dir.z * tetrad.ephi[2]),
    energy * (tetrad.u[3] + dir.x * tetrad.er[3] + dir.y * tetrad.eth[3] + dir.z * tetrad.ephi[3]),
  ];
  return lowerIndex(g, pu);
}
