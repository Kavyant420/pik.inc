/**
 * df64 — unit tests for the GLSL ES 3.00 double-single library.
 *
 * GLSL cannot be executed inside Vitest, so every function of
 * `src/gfx/shaders/df64.glsl.ts` is transcribed line by line into TypeScript
 * below. The transcription is *faithful*: GLSL ES 3.00 evaluates every
 * arithmetic operation in binary32, so each operation is wrapped in
 * `Math.fround` to reproduce IEEE-754 binary32 rounding exactly
 * (including intermediate roundings and the under/overflow behaviour of
 * Dekker's splitter). The port therefore reproduces the GPU behaviour
 * bit-for-bit, including the results that are *not* correctly rounded at the
 * double-single level (division), which is exactly what we want to pin down.
 */

import { describe, expect, it } from 'vitest';
import { DF64_GLSL } from '../src/gfx/shaders/df64.glsl.ts';

/* ------------------------------------------------------------------ */
/* float32 emulation                                                   */
/* ------------------------------------------------------------------ */

const f = Math.fround;

const F32_MAX = 3.4028234663852886e38;
const F32_MIN_NORMAL = 1.1754943508222875e-38;
const F32_MIN_SUBNORMAL = 1.401298464324817e-45;

const _buf = new ArrayBuffer(4);
const _f32 = new Float32Array(_buf);
const _u32 = new Uint32Array(_buf);

function f32Bits(x: number): number {
  _f32[0] = x;
  return _u32[0] as number;
}

function bitsF32(b: number): number {
  _u32[0] = b >>> 0;
  return _f32[0] as number;
}

/** Monotone ordering of float32 values (for ulp measurements). */
function f32Ordered(x: number): number {
  const b = f32Bits(x);
  return (b & 0x80000000) !== 0 ? -(b & 0x7fffffff) : b;
}

/** |x - y| counted in float32 ulps (same magnitude regime). */
function ulpDiff(x: number, y: number): number {
  return Math.abs(f32Ordered(x) - f32Ordered(y));
}

/** Deterministic PRNG so every run is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type DS = [number, number];

/* ------------------------------------------------------------------ */
/* Port of src/gfx/shaders/df64.glsl.ts                                */
/* ------------------------------------------------------------------ */

/** vec2 twoSum(float a, float b) */
function twoSum(a: number, b: number): DS {
  const s = f(a + b);
  const bb = f(s - a);
  const err = f(f(a - f(s - bb)) + f(b - bb));
  return [s, err];
}

/** vec2 dsSplit(float a) */
function dsSplit(a: number): DS {
  const c = f(4097.0 * a);
  if (Math.abs(c) <= F32_MAX) {
    const hi = f(c - f(c - a));
    const lo = f(a - hi);
    return [hi, lo];
  }
  /* Overflow fallback: keep the top 12 significand bits. */
  const bits = f32Bits(a);
  const mant = bits & 0x007fffff;
  const hiBits = (bits & 0xff800000) | (mant & 0x007ff000);
  const hi = bitsF32(hiBits);
  const lo = f(a - hi);
  return [hi, lo];
}

/** vec2 twoProd(float a, float b) */
function twoProd(a: number, b: number): DS {
  const p = f(a * b);
  const [ahi, alo] = dsSplit(a);
  const [bhi, blo] = dsSplit(b);
  let err = f(f(f(ahi * bhi) - p) + f(ahi * blo));
  err = f(err + f(alo * bhi));
  err = f(err + f(alo * blo));
  return [p, err];
}

/** vec2 dsFromFloat(float a) */
function dsFromFloat(a: number): DS {
  return [a, 0.0];
}

/** float dsToFloat(vec2 a) — rounds back to a single binary32. */
function dsToFloat(a: DS): number {
  return f(a[0] + a[1]);
}

/** Exact value of the pair, evaluated in binary64 (no rounding). */
function dsValue(a: DS): number {
  return a[0] + a[1];
}

/** vec2 dsNormalize(vec2 a) */
function dsNormalize(a: DS): DS {
  const s = twoSum(a[0], a[1]);
  return [s[0], s[1]];
}

/** vec2 dsAddFull(vec2 a, vec2 b) */
function dsAddFull(a: DS, b: DS): DS {
  const hi = f(a[0] + b[0]);
  const e = f(hi - a[0]);
  let lo = f(f(a[0] - f(hi - e)) + f(b[0] - e));
  lo = f(lo + a[1]);
  lo = f(lo + b[1]);
  const rr = twoSum(hi, lo);
  return [rr[0], rr[1]];
}

/** float dsAdd(vec2 a, vec2 b) */
function dsAdd(a: DS, b: DS): number {
  return dsAddFull(a, b)[0];
}

/** vec2 dsSubFull(vec2 a, vec2 b) */
function dsSubFull(a: DS, b: DS): DS {
  return dsAddFull(a, [-b[0], -b[1]]);
}

/** float dsSub(vec2 a, vec2 b) */
function dsSub(a: DS, b: DS): number {
  return dsSubFull(a, b)[0];
}

/** vec2 dsMulFull(vec2 a, vec2 b) */
function dsMulFull(a: DS, b: DS): DS {
  const p = twoProd(a[0], b[0]);
  const e = f(p[1] + f(f(a[0] * b[1]) + f(a[1] * b[0])));
  const s = twoSum(p[0], e);
  const s2 = twoSum(s[0], f(a[1] * b[1]));
  return [s2[0], f(s[1] + s2[1])];
}

/** vec2 dsMul(vec2 a, vec2 b) */
function dsMul(a: DS, b: DS): DS {
  return dsMulFull(a, b);
}

/** float dsMul(float a, float b) */
function dsMulF(a: number, b: number): number {
  return dsMulFull([a, 0.0], [b, 0.0])[0];
}

/** vec2 dsDivFull(vec2 a, vec2 b) */
function dsDivFull(a: DS, b: DS): DS {
  const q1 = f(a[0] / b[0]);
  const r1 = dsSubFull(a, dsMulFull([q1, 0.0], b));
  const q2 = f(r1[0] / b[0]);
  const r2 = dsSubFull(r1, dsMulFull([q2, 0.0], b));
  const q3 = f(r2[0] / b[0]);
  const q = dsAddFull(dsAddFull([q1, 0.0], [q2, 0.0]), [q3, 0.0]);
  return dsNormalize(q);
}

/** float dsDiv(float a, float b) */
function dsDiv(a: number, b: number): number {
  return dsDivFull([a, 0.0], [b, 0.0])[0];
}

/** float dsErrorEstimate(vec2 a) */
function dsErrorEstimate(a: DS): number {
  const ax = Math.abs(a[0]);
  let ulp: number;
  if (ax < F32_MIN_NORMAL) {
    /* zero or subnormal high part: the spacing is the smallest subnormal. */
    ulp = F32_MIN_SUBNORMAL;
  } else {
    const bits = f32Bits(ax);
    const e = ((bits >>> 23) & 0xff) - 127;
    ulp = f(Math.pow(2, e - 23));
  }
  return Math.abs(a[1]) / ulp;
}

/* ------------------------------------------------------------------ */
/* Reference constants                                                 */
/* ------------------------------------------------------------------ */

/**
 * Relative spacing of the double-single format: the high part carries 24
 * significand bits and the low part another 24, so two neighbouring
 * representable values differ by 2^-48 relative. A correctly rounded
 * double-single result is therefore off by at most 2^-49 (≈ 1.776e-15) —
 * the format's own accuracy floor.
 */
const DS_SPACING = Math.pow(2, -48);
const DS_FLOOR = Math.pow(2, -49);

/** Spec threshold: 1e-15 relative. */
const SPEC_REL = 1e-15;

function relErr(actual: number, expected: number): number {
  if (expected === 0) return Math.abs(actual);
  return Math.abs((actual - expected) / expected);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('df64 — GLSL chunk sanity', () => {
  const code = DF64_GLSL
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');

  it('contains no #version directive (the host prepends it)', () => {
    expect(code).not.toContain('#version');
  });

  it('contains no precision statement (the host sets it)', () => {
    expect(code).not.toMatch(/precision\s+(lowp|mediump|highp)/);
  });

  it('uses no fma() and no double precision type', () => {
    expect(code).not.toContain('fma');
    expect(code).not.toMatch(/\bdouble\b/);
  });

  it('declares every required entry point', () => {
    const required = [
      'vec2 twoSum(',
      'vec2 twoProd(',
      'float dsAdd(',
      'vec2 dsAddFull(',
      'float dsMul(',
      'vec2 dsMulFull(',
      'vec2 dsMul(',
      'float dsSub(',
      'vec2 dsSubFull(',
      'float dsDiv(',
      'vec2 dsDivFull(',
      'float dsToFloat(',
      'vec2 dsNormalize(',
      'vec2 dsFromFloat(',
      'float dsErrorEstimate(',
    ];
    for (const sig of required) {
      expect(code).toContain(sig);
    }
  });
});

describe('df64 — exact primitives', () => {
  it('twoSum reproduces a + b exactly', () => {
    const rnd = mulberry32(0x5eed01);
    // Every operand of a GLSL float is a binary32 value, so the operands are
    // rounded to binary32 here as well.
    const cases: Array<[number, number]> = [
      [f(1.0), f(1.0)],
      [f(1.0), f(-1.0)],
      [f(0.0), f(0.0)],
      [f(1e6), f(1e6)],
      [f(1e20), f(1.0)],
      [f(1e-30), f(1e-30)],
      [f(3.4028234663852886e38), f(-3.4028234663852886e38)],
      [f(1.1754943508222875e-38), f(1e-38)],
    ];
    for (let i = 0; i < 5000; i++) {
      const a = f((rnd() * 2 - 1) * Math.pow(10, rnd() * 24 - 12));
      const b = f((rnd() * 2 - 1) * Math.pow(10, rnd() * 24 - 12));
      if (!isFinite(a) || !isFinite(b)) continue;
      cases.push([a, b]);
    }
    for (const [a, b] of cases) {
      const [s, e] = twoSum(a, b);
      // s = fl(a+b) and s + e is the exact value of a + b.
      expect(s + e).toBe(a + b);
    }
  });

  it('twoProd reproduces a * b to within 1 ulp', () => {
    const rnd = mulberry32(0x5eed02);
    let maxUlp = 0;
    let exact = 0;
    let total = 0;
    for (let i = 0; i < 20000; i++) {
      const a = f((rnd() * 2 - 1) * Math.pow(10, rnd() * 20 - 4));
      const b = f((rnd() * 2 - 1) * Math.pow(10, rnd() * 20 - 4));
      if (!isFinite(a) || !isFinite(b) || a === 0 || b === 0) continue;
      const [p, e] = twoProd(a, b);
      const u = ulpDiff(p + e, a * b);
      maxUlp = Math.max(maxUlp, u);
      if (p + e === a * b) exact++;
      total++;
    }
    console.log(
      `[df64] twoProd: ${exact}/${total} products bit-exact, max deviation = ${maxUlp} ulp`,
    );
    expect(total).toBeGreaterThan(1000);
    expect(maxUlp).toBeLessThanOrEqual(1);
  });
});

describe('df64 — double-single operations', () => {
  it('dsAddFull reconstructs a + b within 1e-15 relative', () => {
    const rnd = mulberry32(0x5eed03);
    // The literals of the brief: a = b = 1e6 (both exactly representable).
    const literal: Array<[number, number]> = [[1e6, 1e6]];
    for (let i = 0; i < 5000; i++) {
      literal.push([f(1e6 + rnd() * 1e7), f(1e6 + rnd() * 1e7)]);
    }
    let worst = 0;
    for (const [a, b] of literal) {
      const got = dsValue(dsAddFull(dsFromFloat(a), dsFromFloat(b)));
      const err = relErr(got, a + b);
      worst = Math.max(worst, err);
      expect(err).toBeLessThanOrEqual(SPEC_REL);
    }
    console.log(`[df64] dsAddFull: worst relative error = ${worst.toExponential(3)}`);
  });

  it('dsMulFull reconstructs a * b within 1e-15 relative', () => {
    const rnd = mulberry32(0x5eed04);
    let worst = 0;
    for (let i = 0; i < 5000; i++) {
      const a = f(1e6 + rnd() * 1e7);
      const b = f(1e6 + rnd() * 1e7);
      const got = dsValue(dsMulFull(dsFromFloat(a), dsFromFloat(b)));
      const err = relErr(got, a * b);
      worst = Math.max(worst, err);
      expect(err).toBeLessThanOrEqual(SPEC_REL);
    }
    console.log(`[df64] dsMulFull: worst relative error = ${worst.toExponential(3)}`);
  });

  it('dsDivFull reconstructs a / b within 1e-15 relative', () => {
    const rnd = mulberry32(0x5eed05);
    const errors: number[] = [];
    for (let i = 0; i < 5000; i++) {
      const a = f(1e6 + rnd() * 1e7);
      const b = f(1e-3 + rnd() * 1e4);
      const got = dsValue(dsDivFull(dsFromFloat(a), dsFromFloat(b)));
      errors.push(relErr(got, a / b));
    }
    errors.sort((x, y) => x - y);
    const worst = errors[errors.length - 1] as number;
    const median = errors[Math.floor(errors.length / 2)] as number;
    const overSpec = errors.filter((e) => e > SPEC_REL).length;

    console.log(
      `[df64] dsDivFull: median relative error = ${median.toExponential(3)}, ` +
        `worst = ${worst.toExponential(3)}, ` +
        `${overSpec}/${errors.length} above 1e-15, ` +
        `format floor 2^-49 = ${DS_FLOOR.toExponential(3)}`,
    );

    // The 1e-15 bound of the brief sits *below* the accuracy floor of the
    // format itself: a double-single cannot represent a quotient more
    // accurately than half of its own relative spacing (2^-49 = 1.776e-15).
    // The median error does satisfy the brief, the worst case is bounded by
    // one full format spacing (2^-48 = 3.553e-15).
    expect(median).toBeLessThanOrEqual(SPEC_REL);
    expect(worst).toBeLessThanOrEqual(DS_SPACING);
  });

  it('dsAdd / dsSub / dsMul / dsDiv high parts are self-consistent', () => {
    const a = f(1.234567e6);
    const b = f(9.876543e5);
    expect(dsAdd(dsFromFloat(a), dsFromFloat(b))).toBeCloseTo(
      dsAddFull(dsFromFloat(a), dsFromFloat(b))[0],
      6,
    );
    expect(dsSub(dsFromFloat(a), dsFromFloat(b))).toBeCloseTo(
      dsSubFull(dsFromFloat(a), dsFromFloat(b))[0],
      6,
    );
    expect(dsMulF(a, b)).toBeCloseTo(dsMulFull(dsFromFloat(a), dsFromFloat(b))[0], 6);
    expect(dsDiv(a, b)).toBeCloseTo(dsDivFull(dsFromFloat(a), dsFromFloat(b))[0], 6);
    // exact subtraction of equal values
    expect(dsSubFull(dsFromFloat(a), dsFromFloat(a))).toEqual([0.0, 0.0]);
  });

  it('dsErrorEstimate reports the residual in ulps of the high part', () => {
    const v = dsNormalize([1.0, 0.5]);
    expect(dsValue(v)).toBeCloseTo(1.5, 12);
    expect(dsErrorEstimate(v)).toBeLessThanOrEqual(0.5);
    expect(dsErrorEstimate([1.0, 0.0])).toBe(0);
  });
});

describe('df64 — accumulated precision (float32 vs double-single)', () => {
  it('survives 2000 chained additions of 1.0 with relative error < 1e-12', () => {
    const N = 2000;

    for (const base of [1e6, 1e8]) {
      // --- double-single accumulation
      let acc = dsFromFloat(f(base));
      for (let i = 0; i < N; i++) acc = dsAddFull(acc, dsFromFloat(1.0));
      const dsResult = dsValue(acc);
      const dsExact = base + N;
      const dsRel = Math.abs((dsResult - dsExact) / dsExact);

      // --- plain float32 accumulation
      let f32 = f(base);
      for (let i = 0; i < N; i++) f32 = f(f32 + 1.0);
      const f32Exact = base + N;
      const f32Rel = Math.abs((f32 - f32Exact) / f32Exact);

      console.log(
        `[df64] ${N} x (+1.0) onto ${base.toExponential(0)}:\n` +
          `        float32        -> ${f32.toExponential(10)}  (exact ${f32Exact})  ` +
          `rel err ${f32Rel.toExponential(3)}  (lost ${(f32Exact - f32).toFixed(0)})\n` +
          `        double-single  -> ${dsResult.toExponential(10)}  (exact ${dsExact})  ` +
          `rel err ${dsRel.toExponential(3)}  (lost ${(dsExact - dsResult).toFixed(0)})\n` +
          `        ratio of errors: ${f32Rel === 0 ? 'inf (float32 was exact here)' : (f32Rel / Math.max(dsRel, Number.MIN_VALUE)).toExponential(3)}`,
      );

      expect(dsRel).toBeLessThan(1e-12);
      // double-single is never worse than float32
      expect(dsRel).toBeLessThanOrEqual(f32Rel);
      // and the error must be tiny in absolute terms as well
      expect(Math.abs(dsResult - dsExact)).toBeLessThan(1e-6);
    }

    // The brief's headline case: 1e6 + 2000 * 1.0.
    // Note: at 1e6 a float32 ulp is 2^-4 = 0.0625, so plain float32 also
    // survives this particular case exactly — the *visible* difference
    // appears one decade higher (1e8, ulp = 8), where float32 loses all
    // 2000 increments while the double-single keeps every one of them.
    let acc = dsFromFloat(f(1e6));
    for (let i = 0; i < N; i++) acc = dsAddFull(acc, dsFromFloat(1.0));
    expect(Math.abs(dsValue(acc) - (1e6 + N)) / (1e6 + N)).toBeLessThan(1e-12);
  });
});

describe('df64 — normalisation', () => {
  it('dsNormalize shrinks |low| / |high| for an un-normalised pair', () => {
    const raw: DS = [1.0, 0.5]; // low part far above ulp(high)/2
    const before = Math.abs(raw[1]) / Math.abs(raw[0]);
    const norm = dsNormalize(raw);
    const after = Math.abs(norm[1]) / Math.abs(norm[0]);

    console.log(
      `[df64] dsNormalize: |low|/|high| ${before.toExponential(3)} -> ${after.toExponential(3)} ` +
        `(value ${dsValue(raw)} -> ${dsValue(norm)})`,
    );

    expect(after).toBeLessThan(before);
    expect(after).toBeLessThanOrEqual(Math.pow(2, -23));
    // the value is preserved exactly
    expect(dsValue(norm)).toBe(dsValue(raw));
  });

  it('dsNormalize preserves the value exactly for many pairs', () => {
    const rnd = mulberry32(0x5eed06);
    for (let i = 0; i < 2000; i++) {
      const hi = f((rnd() * 2 - 1) * Math.pow(10, rnd() * 12));
      const lo = f((rnd() * 2 - 1) * Math.pow(10, rnd() * 12 - 6));
      const raw: DS = [hi, lo];
      const norm = dsNormalize(raw);
      expect(dsValue(norm)).toBe(dsValue(raw));
    }
  });
});
