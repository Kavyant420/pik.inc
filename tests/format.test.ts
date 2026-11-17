import { describe, expect, it } from 'vitest';
import {
  clamp01,
  formatClock,
  formatFixed,
  formatInclination,
  formatLengthMetres,
  formatOrdinal,
  formatPercent,
  formatRadiusM,
  formatRadiusRs,
  formatSigned,
  formatSpin,
  formatTimeDilation,
} from '../src/ui/format';
import { fallAmount } from '../src/ui/audio';

/**
 * The formatters are the only part of the UI that can be tested without a
 * DOM, and they are the part that a reader actually looks at: the HUD
 * numbers have to stay legible while the camera falls.
 */

describe('formatFixed', () => {
  it('trims trailing zeros', () => {
    expect(formatFixed(12.4, 2)).toBe('12.4');
    expect(formatFixed(12.0, 2)).toBe('12');
    expect(formatFixed(12.345, 2)).toBe('12.35');
  });

  it('never renders a negative zero', () => {
    expect(formatFixed(-0.001, 2)).toBe('0');
    expect(formatFixed(-0.0001, 2)).toBe('0');
    expect(formatFixed(-0, 2)).toBe('0');
  });

  it('degrades to a dash on non-finite input', () => {
    expect(formatFixed(Number.NaN, 2)).toBe('--');
    expect(formatFixed(Number.POSITIVE_INFINITY, 2)).toBe('--');
  });

  it('clamps the number of digits', () => {
    expect(formatFixed(1.23456789, 2)).toBe('1.23');
    expect(formatFixed(1.23456789, 99)).toBe('1.23456789');
  });
});

describe('telemetry formatters', () => {
  it('quotes the radius in M and in Schwarzschild radii', () => {
    expect(formatRadiusM(12.345)).toBe('12.35');
    expect(formatRadiusRs(12.345)).toBe('6.17');
  });

  it('keeps four digits on the time dilation', () => {
    expect(formatTimeDilation(0.938273)).toBe('0.9383');
  });

  it('quotes the inclination and the spin', () => {
    expect(formatInclination(4.874)).toBe('4.87');
    expect(formatSpin(0.999)).toBe('0.999');
  });

  it('formats signed values with an explicit sign', () => {
    expect(formatSigned(1.5)).toBe('+1.5');
    expect(formatSigned(-1.5)).toBe('-1.5');
    expect(formatSigned(0)).toBe('+0');
  });
});

describe('progress and time', () => {
  it('clamps the percentage', () => {
    expect(formatPercent(0)).toBe('0');
    expect(formatPercent(0.5)).toBe('50');
    expect(formatPercent(1)).toBe('100');
    expect(formatPercent(2)).toBe('100');
    expect(formatPercent(-1)).toBe('0');
  });

  it('formats a clock', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(9)).toBe('00:09');
    expect(formatClock(75)).toBe('01:15');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-1)).toBe('--:--');
  });

  it('pads ordinals to two digits', () => {
    expect(formatOrdinal(1)).toBe('01');
    expect(formatOrdinal(12)).toBe('12');
  });
});

describe('lengths', () => {
  it('switches units at the right thresholds', () => {
    expect(formatLengthMetres(999)).toBe('999 m');
    expect(formatLengthMetres(1500)).toBe('1.5 km');
    expect(formatLengthMetres(2e6)).toBe('2 Mm');
    expect(formatLengthMetres(1.495978707e11 * 2)).toBe('2 AU');
  });
});

describe('clamp01', () => {
  it('clamps to the unit interval', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(1.5)).toBe(1);
  });
});

describe('fallAmount', () => {
  it('is zero far away and one at the closest approach', () => {
    expect(fallAmount(400)).toBe(0);
    expect(fallAmount(3.2)).toBe(1);
    expect(fallAmount(1000)).toBe(0);
    expect(fallAmount(1)).toBe(1);
  });

  it('increases monotonically as the camera falls', () => {
    let previous = -1;
    for (let r = 400; r >= 3.2; r -= 10) {
      const amount = fallAmount(r);
      expect(amount).toBeGreaterThanOrEqual(previous);
      previous = amount;
    }
  });
});
