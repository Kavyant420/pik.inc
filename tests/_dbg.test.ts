import { it } from 'vitest';
import { traceRay } from '../src/physics/kerr/geodesics';

interface Opts {
  stepScale: number;
  maxSteps: number;
  mode: 'leapfrog' | 'energy';
}

function shaderTrace(
  spin: number,
  radius: number,
  theta: number,
  d: { x: number; y: number; z: number },
  opts: Opts,
) {
  const ct = Math.cos(theta);
  const st2 = 1 - ct * ct;
  const S = radius * radius + spin * spin * ct * ct;
  const D = radius * radius - 2 * radius + spin * spin;
  const gtt = -(1 - (2 * radius) / S);
  const gtp = (-2 * spin * radius * st2) / S;
  const gpp = st2 * (radius * radius + spin * spin + (2 * spin * spin * radius * st2) / S);
  const alpha = 1 / Math.sqrt(-gtt);
  const ut = alpha;
  const c = -gtp / (gtt * ut);
  const invNorm = 1 / Math.sqrt(gpp - (gtp * gtp) / gtt);

  const pt = ut * (1 + d.z * c);
  const pr = d.x * Math.sqrt(D / S);
  const pth = d.y / Math.sqrt(S);
  const pph = d.z * invNorm;

  const E = -(gtt * pt + gtp * pph);
  const L = gtp * pt + gpp * pph;
  const pTheta = S * pth;
  const Q = pTheta * pTheta + L * L * (ct * ct / st2) - spin * spin * E * E * ct * ct;

  const C = (L - spin * E) * (L - spin * E) + Q;
  const beta = 2 * spin * spin * E * E - 2 * spin * E * L - C;
  const R = (rr: number) => E * E * rr ** 4 + beta * rr * rr + 2 * C * rr - spin * spin * Q;
  const dR = (rr: number) => 4 * E * E * rr ** 3 + 2 * beta * rr + 2 * C;
  const a2E2 = spin * spin * E * E;
  const W = (uu: number) => -a2E2 * uu ** 4 + (a2E2 - Q - L * L) * uu * uu + Q;
  const dW = (uu: number) => -4 * a2E2 * uu ** 3 + 2 * (a2E2 - Q - L * L) * uu;
  const phiDot = (rr: number, uu: number) => {
    const Dd = rr * rr - 2 * rr + spin * spin;
    const s2 = Math.max(1 - uu * uu, 1e-6);
    return (2 * spin * rr * E) / Dd + (L * (Dd - spin * spin * s2)) / (Dd * s2);
  };

  let r = radius;
  let u = ct;
  let phi = 0;
  let vr = (d.x >= 0 ? 1 : -1) * Math.sqrt(Math.max(R(r), 0));
  let vu = -(d.y >= 0 ? 1 : -1) * Math.sqrt(Math.max(W(u), 0));

  let uPrev = u;
  let rPrev = r;
  let phiPrev = phi;

  for (let i = 0; i < opts.maxSteps; i++) {
    const h = Math.min(0.25, Math.max(2e-5, opts.stepScale / Math.max(r, 1)));

    if (opts.mode === 'leapfrog') {
      // kick - drift - kick
      vr += 0.5 * dR(r) * h;
      vu += 0.5 * dW(u) * h;
      r += vr * h;
      u += vu * h;
      vr += 0.5 * dR(r) * h;
      vu += 0.5 * dW(u) * h;
    } else {
      // energy form with a turning-point snap
      const rNext = r + vr * h;
      const Rnext = R(rNext);
      if (Rnext < 0) {
        let lo = Math.min(r, rNext);
        let hi = Math.max(r, rNext);
        for (let k = 0; k < 6; k++) {
          const mid = 0.5 * (lo + hi);
          if (R(mid) < 0) lo = mid;
          else hi = mid;
        }
        r = hi;
        // Restart with the Taylor step so the ray leaves the turning point.
        const a = 0.5 * dR(r);
        r = r + Math.sign(a) * 0.5 * Math.abs(a) * h * h;
        vr = Math.sign(a) * Math.sqrt(Math.max(R(r), 0));
      } else {
        r = rNext;
        vr = (d.x >= 0 ? 1 : -1) * Math.sqrt(Math.max(R(r), 0));
        if (R(r) < 0) vr = 0;
      }

      const uNext = u + vu * h;
      const Wnext = W(uNext);
      if (Wnext < 0) {
        let lo = Math.min(u, uNext);
        let hi = Math.max(u, uNext);
        for (let k = 0; k < 6; k++) {
          const mid = 0.5 * (lo + hi);
          if (W(mid) < 0) lo = mid;
          else hi = mid;
        }
        u = hi;
        const a = 0.5 * dW(u);
        u = u + Math.sign(a) * 0.5 * Math.abs(a) * h * h;
        vu = Math.sign(a) * Math.sqrt(Math.max(W(u), 0));
      } else {
        u = uNext;
        vu = -(d.y >= 0 ? 1 : -1) * Math.sqrt(Math.max(W(u), 0));
        if (W(u) < 0) vu = 0;
      }
    }

    phi += phiDot(r, u) * h;

    if (uPrev !== 0 && Math.sign(uPrev) !== Math.sign(u)) {
      const f = uPrev / (uPrev - u);
      const rc = rPrev + f * (r - rPrev);
      return { crossing: rc, steps: i + 1, u, r };
    }

    uPrev = u;
    rPrev = r;
    phiPrev = phi;

    const rH = 1 + Math.sqrt(Math.max(0, 1 - spin * spin));
    if (r <= rH * (1 + 1e-7)) return { crossing: null, captured: true, steps: i + 1, r, u };
    if (r > 400) return { crossing: null, escaped: true, steps: i + 1, r, u };
  }
  return { crossing: null, budget: true, steps: opts.maxSteps, r, u };
}

it('dbg', () => {
  const spin = 0.999;
  const radius = 40;
  const theta = Math.PI / 2 - 0.085;
  for (const mode of ['leapfrog', 'energy'] as const) {
    for (const k of [0.05, 0.02, 0.008]) {
      const line: string[] = [];
      let maxErr = 0;
      let maxSteps = 0;
      for (const ang of [0, 2, 5, 8, 12, 20, 45]) {
        const a = (ang * Math.PI) / 180;
        const dir = { x: -Math.cos(a), y: Math.sin(a), z: 0 };
        const cpu = traceRay({ spin, radius, theta, dir, maxCrossings: 3, tolerance: 1e-11 });
        const gpu = shaderTrace(spin, radius, theta, dir, { stepScale: k, maxSteps: 2000, mode });
        maxSteps = Math.max(maxSteps, gpu.steps);
        let text: string;
        if (gpu.crossing !== null && cpu.crossings.length) {
          const err = ((gpu.crossing - cpu.crossings[0].r) / cpu.crossings[0].r) * 100;
          maxErr = Math.max(maxErr, Math.abs(err));
          text = `${gpu.crossing.toFixed(2)}(${err.toFixed(1)}%)`;
        } else {
          text = gpu.crossing !== null ? gpu.crossing.toFixed(2) : gpu.captured ? 'capt' : gpu.escaped ? 'esc' : 'bud';
        }
        line.push(`${ang}:${text}`);
      }
      console.log(`${mode} k=${k}: ${line.join(' ')}  maxErr=${maxErr.toFixed(2)}% maxSteps=${maxSteps}`);
    }
  }
});
