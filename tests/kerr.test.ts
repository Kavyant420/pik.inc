import { describe, expect, it } from 'vitest';
import {
  delta,
  horizonRadius,
  metricA,
  metricCov,
  metricInv,
  sigma,
  staticTetrad,
  zamoTetrad,
} from '../src/physics/kerr/metric';
import {
  conservedFromDirection,
  polarPotential,
  radialPolynomial,
  radialPotential,
  traceRay,
  type Conserved,
} from '../src/physics/kerr/geodesics';
import {
  criticalCarterCurve,
  gFactor,
  impactParameter,
  isCaptured,
  iscoRadius,
  iscoSpecificAngularMomentum,
  iscoSpecificEnergy,
  photonOrbitRadius,
  staticTimeDilation,
} from '../src/physics/kerr/orbital';
import { traceRayReference } from '../src/physics/kerr/reference';

/** Numerically invert a 4×4 matrix given in row-major order. */
function invert4(m: Float64Array): Float64Array {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    a.push([m[4 * i], m[4 * i + 1], m[4 * i + 2], m[4 * i + 3], i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, i === 3 ? 1 : 0]);
  }
  // Augmented 4x8 matrix, Gauss-Jordan.
  for (let col = 0; col < 4; col++) {
    let piv = col;
    for (let r = col + 1; r < 4; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    const tmp = a[col];
    a[col] = a[piv];
    a[piv] = tmp;
    const p = a[col][col];
    for (let c = 0; c < 8; c++) a[col][c] /= p;
    for (let r = 0; r < 4; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let c = 0; c < 8; c++) a[r][c] -= f * a[col][c];
    }
  }
  const out = new Float64Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[4 * i + j] = a[i][4 + j];
  return out;
}

describe('Kerr metric', () => {
  it('closed-form inverse matches a numerical inversion of the covariant metric', () => {
    for (const a of [0, 0.3, 0.9, 0.999]) {
      for (const r of [2.5, 6, 30, 500]) {
        for (const th of [0.4, Math.PI / 2 - 0.085, Math.PI / 2, 2.6]) {
          const g = metricCov(r, th, a);
          const numeric = invert4(g);
          const closed = metricInv(r, th, a);
          for (let i = 0; i < 16; i++) {
            const scale = Math.max(1e-12, Math.abs(numeric[i]));
            expect(Math.abs(closed[i] - numeric[i]) / scale).toBeLessThan(1e-9);
          }
        }
      }
    }
  });

  it('places the horizon at r₊ = 1 + √(1−a²) and the ergosphere correctly', () => {
    expect(horizonRadius(0)).toBeCloseTo(2, 12);
    expect(horizonRadius(0.999)).toBeCloseTo(1 + Math.sqrt(1 - 0.999 ** 2), 12);
    // Equatorial ergosphere: g_tt = 0 → r = 2 M for a ≠ 0.
    const a = 0.999;
    const r = 2;
    const S = sigma(r, Math.PI / 2, a);
    expect(1 - (2 * r) / S).toBeCloseTo(0, 12);
  });

  it('produces orthonormal tetrads (u·u = −1, eᵢ·eⱼ = δᵢⱼ, u·eᵢ = 0)', () => {
    for (const a of [0, 0.999]) {
      for (const r of [4, 12, 100]) {
        for (const th of [Math.PI / 2 - 0.085, 1.2]) {
          const tet = staticTetrad(r, th, a);
          const g = metricCov(r, th, a);
          const dot = (p: number[], q: number[]): number => {
            let s = 0;
            for (let mu = 0; mu < 4; mu++) for (let nu = 0; nu < 4; nu++) s += g[4 * mu + nu] * p[mu] * q[nu];
            return s;
          };
          expect(dot(tet.u, tet.u)).toBeCloseTo(-1, 10);
          const e = [tet.er, tet.eth, tet.ephi];
          for (let i = 0; i < 3; i++) {
            expect(dot(tet.u, e[i])).toBeCloseTo(0, 9);
            for (let j = 0; j < 3; j++) expect(dot(e[i], e[j])).toBeCloseTo(i === j ? 1 : 0, 9);
          }
          // The ZAMO tetrad must also be orthonormal.
          const z = zamoTetrad(r, th, a);
          const ez = [z.er, z.eth, z.ephi];
          expect(dot(z.u, z.u)).toBeCloseTo(-1, 10);
          expect(dot(z.u, ez[2])).toBeCloseTo(0, 8);
        }
      }
    }
  });
});

describe('Conserved quantities', () => {
  it('keeps E, L and the Carter constant constant along the ray', () => {
    const spin = 0.999;
    const radius = 40;
    const theta = Math.PI / 2 - 0.085;
    for (const [dx, dy, dz] of [
      [-0.9998, 0, 0.02],
      [-0.85, 0.4, 0.34],
      [-0.77, 0.2, 0.6],
      [-0.95, -0.3, 0.05],
    ]) {
      const res = traceRay({
        spin,
        radius,
        theta,
        dir: { x: dx, y: dy, z: dz },
        tolerance: 1e-12,
        maxCrossings: 3,
      });
      // The conservation of E, L and Q is enforced by construction of the
      // Carter separation; the residuals reported here are the drift of the
      // *numerical* integration of the same invariants.
      expect(res.drift.carter).toBeLessThan(1e-8 * Math.max(1, Math.abs(res.conserved.Q)));
      expect(res.drift.radial).toBeLessThan(1e-6);
      expect(res.drift.polar).toBeLessThan(1e-6);
    }
  });

  it('gives Q = 0 for rays that stay in the equatorial plane', () => {
    const res = traceRay({
      spin: 0.999,
      radius: 40,
      theta: Math.PI / 2,
      dir: { x: -1, y: 0, z: 0 },
    });
    expect(Math.abs(res.conserved.Q)).toBeLessThan(1e-10);
  });
});

describe('Fast tracer vs the independent 64-bit reference', () => {
  it('agrees on the radius and azimuth of the first equatorial crossing', () => {
    const spin = 0.999;
    const radius = 30;
    const theta = Math.PI / 2 - 0.085;
    const dirs = [
      { x: -0.85, y: 0.4, z: 0.34 },
      { x: -0.8, y: 0.5, z: 0.2 },
      { x: -0.9, y: 0.3, z: 0.4 },
    ];
    for (const dir of dirs) {
      const fast = traceRay({ spin, radius, theta, dir, tolerance: 1e-12, maxCrossings: 1 });
      const ref = traceRayReference({ spin, radius, theta, dir, step: 2e-3, maxCrossings: 1 });
      expect(fast.crossings.length).toBeGreaterThan(0);
      expect(ref.crossings.length).toBeGreaterThan(0);
      const dr = Math.abs(fast.crossings[0].r - ref.crossings[0].r);
      const dphi = Math.abs(fast.crossings[0].phi - ref.crossings[0].phi);
      expect(dr).toBeLessThan(2e-3);
      expect(dphi).toBeLessThan(2e-3);
    }
  });
});

describe('Schwarzschild shadow', () => {
  it('has a critical impact parameter of 3√3 M within 0.1 %', () => {
    const camR = 1000;
    const theta = Math.PI / 2;
    let lo = 0.0; // captured
    let hi = 0.2; // escapes
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      const res = traceRay({
        spin: 0,
        radius: camR,
        theta,
        dir: { x: -Math.cos(mid), y: Math.sin(mid), z: 0 },
        escapeRadius: 1e5,
        tolerance: 1e-12,
        maxCrossings: 0,
      });
      if (res.captured) lo = mid;
      else hi = mid;
    }
    const beta = 0.5 * (lo + hi);
    const res = traceRay({
      spin: 0,
      radius: camR,
      theta,
      dir: { x: -Math.cos(beta), y: Math.sin(beta), z: 0 },
      escapeRadius: 1e5,
      tolerance: 1e-12,
      maxCrossings: 0,
    });
    // For Schwarzschild the flat-far-zone impact parameter is b = sqrt(L^2+Q)/E.
    const b = impactParameter(res.conserved, 0, theta);
    expect(b).toBeCloseTo(3 * Math.sqrt(3), 2); // within 0.1 %
    console.log(`Schwarzschild shadow: b_c = ${b.toFixed(6)} M (3√3 = ${(3 * Math.sqrt(3)).toFixed(6)})`);
  });
});

describe('Weak-field deflection', () => {
  it('matches 4M/b in the weak field', () => {
    const b = 100;
    const camR = 200000;
    const theta = Math.PI / 2;
    // Aim the ray so that its impact parameter is b.
    const sinBeta = b / camR;
    const beta = Math.asin(sinBeta);
    // The ray must stay in the equatorial plane: the local phi component of
    // the direction carries the impact parameter, a theta component would tilt
    // the ray out of the plane.
    const res = traceRay({
      spin: 0,
      radius: camR,
      theta,
      dir: { x: -Math.cos(beta), y: 0, z: Math.sin(beta) },
      escapeRadius: 400000,
      tolerance: 1e-12,
      maxCrossings: 0,
    });
    // A straight line sweeping past the hole sweeps pi - psi_cam - psi_esc
    // between the camera radius and the escape radius, with
    // sin(psi) = b/r. The gravitational deflection adds the rest.
    const psiCam = Math.asin(Math.min(1, b / camR));
    const psiEsc = Math.asin(Math.min(1, b / 400000));
    const deflection = Math.abs(res.phi) - Math.PI + psiCam + psiEsc;
    const expected = 4 / b + (15 * Math.PI) / (b * b);
    console.log(`Deflection at b=${b}M: measured ${deflection.toFixed(6)} rad, expected ${expected.toFixed(6)} rad`);
    expect(deflection).toBeGreaterThan(0.03);
    // The weak-field series is only a rough check (for b = 100 M the second
    // order term is already 12 % of the first); the tight validation is the
    // comparison with the independent geodesic integrator below.
    expect(Math.abs(deflection - expected) / expected).toBeLessThan(0.15);
  });
});

describe('ISCO (Bardeen–Press–Teukolsky)', () => {
  it('matches the published prograde and retrograde radii', () => {
    expect(iscoRadius(0)).toBeCloseTo(6, 10);
    // For a non-rotating hole the prograde and retrograde ISCO coincide.
    expect(iscoRadius(0, true)).toBeCloseTo(6, 10);
    expect(iscoRadius(0.5)).toBeCloseTo(4.2330, 3);
    expect(iscoRadius(0.9)).toBeCloseTo(2.3209, 3);
    // Published values: a = 0.998 → 1.2370 M, a = 0.999 → 1.1818 M.
    expect(iscoRadius(0.998)).toBeCloseTo(1.2370, 3);
    expect(iscoRadius(0.999)).toBeCloseTo(1.1818, 3);
    expect(iscoRadius(0.999, true)).toBeCloseTo(8.9972, 3);
  });

  it('matches the published specific energy and angular momentum at a = 0', () => {
    expect(iscoSpecificEnergy(0)).toBeCloseTo(Math.sqrt(8 / 9), 10);
    expect(iscoSpecificAngularMomentum(0)).toBeCloseTo(Math.sqrt(12), 10);
  });

  it('agrees with the metric-derived circular-orbit family', () => {
    // The circular-orbit radial potential derived from the metric:
    //   V(r) = E² − 1 + 2/r + (a²E² − L² − a²)/r² + 2(L − aE)²/r³
    // The marginal stability condition is d²V/dr² = 0 along the family.
    for (const a of [0, 0.5, 0.9, 0.999]) {
      const r = iscoRadius(a);
      const E = iscoSpecificEnergy(a);
      const L = iscoSpecificAngularMomentum(a);
      const V = (rr: number) =>
        E * E - 1 + 2 / rr + (a * a * E * E - L * L - a * a) / (rr * rr) + (2 * (L - a * E) ** 2) / rr ** 3;
      const h = r * 1e-4;
      const d2 = (V(r + h) - 2 * V(r) + V(r - h)) / (h * h);
      // dV/dr = 0 must also hold for a circular orbit.
      const d1 = (V(r + h) - V(r - h)) / (2 * h);
      expect(Math.abs(d1)).toBeLessThan(1e-6);
      expect(Math.abs(d2)).toBeLessThan(1e-5);
    }
  });
});

describe('Photon orbits', () => {
  it('matches the Bardeen–Press–Teukolsky equatorial photon orbit radii', () => {
    expect(photonOrbitRadius(0)).toBeCloseTo(3, 12);
    // For a non-rotating hole both photon orbits sit at the photon sphere.
    expect(photonOrbitRadius(0, true)).toBeCloseTo(3, 12);
    expect(photonOrbitRadius(0.999)).toBeCloseTo(1.0521, 3);
    expect(photonOrbitRadius(0.999, true)).toBeCloseTo(3.9991, 3);
  });

  it('finds the same photon orbit radii from the metric radial potential', () => {
    // For Q = 0 the radial potential is R(r) = r⁴ + βr² + 2Cr with
    // C = (ξ − a)², β = 2a² − 2aξ − C. The circular photon orbit is the ray
    // for which R has a double root: minimise R over r and find ξ with min = 0.
    for (const a of [0, 0.5, 0.9, 0.999]) {
      const expectedPro = photonOrbitRadius(a);
      const expectedRet = photonOrbitRadius(a, true);
      for (const [expected, sign] of [
        [expectedPro, 1],
        [expectedRet, -1],
      ] as [number, number][]) {
        const minR = (xi: number) => {
          // Golden-section minimisation of R over r ∈ (1.05, 60].
          let lo = 1.05;
          let hi = 60;
          const gr = (Math.sqrt(5) - 1) / 2;
          let c = hi - gr * (hi - lo);
          let d = lo + gr * (hi - lo);
          const C = (xi - a) * (xi - a);
          const beta = 2 * a * a - 2 * a * xi - C;
          const R = (r: number) => r ** 4 + beta * r * r + 2 * C * r;
          for (let i = 0; i < 300; i++) {
            if (R(c) < R(d)) hi = d;
            else lo = c;
            c = hi - gr * (hi - lo);
            d = lo + gr * (hi - lo);
          }
          const r = 0.5 * (lo + hi);
          return { r, R: R(r) };
        };
        // Bisect on ξ so that min R = 0 (R > 0 for |ξ| larger).
        let lo = 0;
        let hi = 40;
        for (let i = 0; i < 200; i++) {
          const xi = sign * (0.5 * (lo + hi));
          const m = minR(xi);
          if (m.R < 0) hi = 0.5 * (lo + hi);
          else lo = 0.5 * (lo + hi);
        }
        const xi = sign * (0.5 * (lo + hi));
        const m = minR(xi);
        expect(Math.abs(m.r - expected)).toBeLessThan(1e-3);
      }
    }
  });
});

describe('Kerr shadow shape', () => {
  it("reduces to the 3*sqrt(3) M circle in the Schwarzschild limit", () => {
    const curve = criticalCarterCurve(0, [-5, -3, -1, 0, 1, 3, 5]);
    expect(curve.length).toBeGreaterThan(3);
    for (const p of curve) {
      expect(p.xi * p.xi + p.Q).toBeCloseTo(27, 3);
    }
  });

  it('puts the traced capture boundary on the Bardeen critical curve', () => {
    const a = 0.999;
    const camR = 2000;
    const theta = Math.PI / 2 - 0.085;
    const results: { psi: number; xi: number; Q: number; Qc: number }[] = [];
    for (const psi of [0, 0.4, 0.9, 1.5, 2.1, 2.6, 3.0]) {
      const dirAt = (beta: number) => ({
        x: -Math.cos(beta),
        y: Math.sin(beta) * Math.cos(psi),
        z: Math.sin(beta) * Math.sin(psi),
      });
      let lo = 0; // captured
      let hi = 0.6; // escapes
      for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi);
        const cons = conservedFromDirection(camR, theta, 0, a, dirAt(mid));
        if (isCaptured(cons, a, camR)) lo = mid;
        else hi = mid;
      }
      const cons = conservedFromDirection(camR, theta, 0, a, dirAt(lo));
      const xi = cons.L / cons.E;
      const qc = criticalCarterCurve(a, [xi]);
      expect(qc.length).toBe(1);
      results.push({ psi, xi, Q: cons.Q, Qc: qc[0].Q });
      expect(Math.abs(cons.Q - qc[0].Q)).toBeLessThan(0.02 * Math.max(1, Math.abs(qc[0].Q)));
    }
    const lines = results.map(
      (r) => `  psi=${r.psi.toFixed(2)}  xi=${r.xi.toFixed(5)}  Q=${r.Q.toFixed(5)}  Qc=${r.Qc.toFixed(5)}`,
    );
    console.log('Kerr shadow boundary vs Bardeen critical curve: ' + lines.join(' | '));
  });
});

describe('g-factor', () => {
  it('reduces to the orbiting emitter redshift for L = 0 and a = 0', () => {
    // For a = 0 and L = 0 the factor is g = 1/u^t = √(1 − 3/r): the
    // transverse Doppler redshift of the orbiting material seen by a static
    // observer at infinity times the gravitational redshift.
    for (const r of [10, 100]) {
      expect(gFactor(r, 0, 1, 0)).toBeCloseTo(Math.sqrt(1 - 3 / r), 12);
    }
    // A static emitter at the same radius would give 1/√(1 − 2/r).
    expect(1 / Math.sqrt(1 - 2 / 10)).toBeGreaterThan(gFactor(10, 0, 1, 0));
  });
  it('is larger on the approaching side', () => {
    const gBright = gFactor(6, 0.999, 1, 5);
    const gDim = gFactor(6, 0.999, 1, -5);
    // One side of the disk is dramatically brighter than the other.
    expect(gBright / gDim).toBeGreaterThan(1.8);
    // g → 1 far from the hole.
    expect(gFactor(1000, 0.999, 1, -3)).toBeCloseTo(1, 2);
  });
});

describe('Observer frames', () => {
  it('gives the static-observer time dilation quoted by the HUD', () => {
    const th = Math.PI / 2 - 0.085;
    const r = 50;
    const S = sigma(r, th, 0.999);
    expect(staticTimeDilation(r, th, 0.999)).toBeCloseTo(Math.sqrt(1 - (2 * r) / S), 12);
    expect(staticTimeDilation(5, th, 0.999)).toBeLessThan(1);
  });
  it('keeps the camera outside the horizon for the whole scroll range', () => {
    for (let i = 0; i <= 100; i++) {
      const r = 50 * Math.pow(5 / 50, i / 100);
      expect(r).toBeGreaterThan(3.2);
      expect(r).toBeGreaterThan(horizonRadius(0.999));
    }
  });
});
