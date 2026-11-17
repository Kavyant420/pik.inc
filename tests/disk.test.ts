import { describe, expect, it } from 'vitest';
import {
  beamingFactor,
  blackbodyChroma,
  blackbodyRgb,
  createDiskModel,
  diskEffectiveTemperature,
  diskEmission,
  diskInnerRadius,
  diskOuterRadius,
  diskOmega,
  ntFluxShape,
  redshiftFactor,
} from '../src/physics/diskModel';
import { iscoRadius, photonOrbitRadius } from '../src/physics/kerr/orbital';

/**
 * The disk model has to agree with the shader that draws it, so the checks
 * here are about *properties* that both implementations must have:
 *
 *  - the flux is positive outside the ISCO and falls off like r⁻³;
 *  - the flux has the Novikov–Thorne pole at the ISCO;
 *  - the temperature falls off like r⁻³/⁴;
 *  - the blackbody colour runs from red through white to blue;
 *  - the redshift factor reduces to the static lapse far from the hole.
 */

describe('Novikov–Thorne flux', () => {
  it('is positive everywhere outside the ISCO', () => {
    for (const spin of [0, 0.5, 0.999]) {
      const inner = Math.max(iscoRadius(spin), photonOrbitRadius(spin) * 0.999);
      for (let r = inner; r < 40; r += 0.25) {
        expect(ntFluxShape(r, spin)).toBeGreaterThan(0);
      }
    }
  });

  it('falls off like 1/r³ far from the hole', () => {
    const spin = 0.999;
    const r = 400;
    const scaled = ntFluxShape(r, spin) * r ** 3;
    expect(scaled).toBeCloseTo(1, 1);
  });

  it('closes the capture cone at the photon orbit', () => {
    // The photon orbit lies inside the ISCO for every spin, so the disk
    // never reaches it, but the capture factor must close there: no light
    // emitted from inside the photon well escapes.
    const spin = 0;
    const photon = photonOrbitRadius(spin);
    expect(photon).toBeLessThan(iscoRadius(spin));
    expect(ntFluxShape(photon, spin)).toBeCloseTo(0, 6);
    expect(ntFluxShape(photon * 1.5, spin)).toBeGreaterThan(0);
  });

  it('is monotonically decreasing over the whole disk', () => {
    for (const spin of [0, 0.5, 0.999]) {
      const inner = Math.max(iscoRadius(spin), photonOrbitRadius(spin) * 0.999);
      let previous = ntFluxShape(inner, spin);
      for (let r = inner + 0.25; r < 40; r += 0.25) {
        const current = ntFluxShape(r, spin);
        expect(current).toBeLessThan(previous);
        previous = current;
      }
    }
  });
});

describe('disk geometry', () => {
  it('puts the inner edge at the ISCO for a non-rotating hole', () => {
    expect(diskInnerRadius(0)).toBeCloseTo(6, 6);
  });

  it('never puts the inner edge inside the photon orbit', () => {
    for (const spin of [0, 0.3, 0.9, 0.999]) {
      expect(diskInnerRadius(spin)).toBeGreaterThanOrEqual(photonOrbitRadius(spin) * 0.999);
    }
  });

  it('keeps the outer edge outside the inner edge', () => {
    for (const spin of [0, 0.999]) {
      expect(diskOuterRadius(spin)).toBeGreaterThan(diskInnerRadius(spin));
    }
  });

  it('uses a Kerr-corrected Keplerian rate', () => {
    // Omega = 1/(r^{3/2} + a): the frame dragging makes the coordinate
    // angular velocity of the prograde flow *smaller* than the Keplerian
    // one, while the hole itself is dragged faster.
    expect(diskOmega(10, 0)).toBeCloseTo(1 / Math.pow(10, 1.5), 12);
    expect(diskOmega(10, 0.999)).toBeLessThan(diskOmega(10, 0));
  });
});

describe('temperature', () => {
  it('is the peak at the inner edge and falls outwards', () => {
    const spin = 0.999;
    const inner = diskInnerRadius(spin);
    const peak = 8000;
    expect(diskEffectiveTemperature(inner, spin, peak, inner)).toBeCloseTo(peak, 4);
    expect(diskEffectiveTemperature(inner * 2, spin, peak, inner)).toBeLessThan(peak);
  });

  it('falls off like r^(-3/4) in the far field', () => {
    const spin = 0.999;
    const inner = diskInnerRadius(spin);
    const peak = 8000;
    const t1 = diskEffectiveTemperature(100, spin, peak, inner);
    const t2 = diskEffectiveTemperature(200, spin, peak, inner);
    // The relativistic factor 1/(1 - 3/r + 2a/r^{3/2}) contributes a small
    // correction, so the pure r^(-3/4) law is only approached.
    expect(t1 / t2).toBeCloseTo(Math.pow(2, 0.75), 1);
  });
});

describe('blackbody colour', () => {
  it('sits on the Planckian locus near D65 at 6500 K', () => {
    // The Planckian locus at 6500 K is (0.3135, 0.3238); D65 itself is
    // (0.3127, 0.3290) — a daylight spectrum is slightly above the locus.
    const { x, y } = blackbodyChroma(6500);
    expect(x).toBeCloseTo(0.3135, 3);
    expect(y).toBeCloseTo(0.3238, 3);
    expect(Math.abs(x - 0.3127)).toBeLessThan(0.005);
    expect(Math.abs(y - 0.329)).toBeLessThan(0.01);
  });

  it('is red-dominant when cold and blue-dominant when hot', () => {
    const cold = blackbodyRgb(2000);
    const hot = blackbodyRgb(20000);
    expect(cold[0]).toBeGreaterThan(cold[1]);
    expect(cold[1]).toBeGreaterThan(cold[2]);
    expect(hot[2]).toBeGreaterThan(hot[0]);
  });

  it('normalises the brightest channel to one', () => {
    for (const t of [1500, 3000, 6500, 12000, 30000]) {
      const rgb = blackbodyRgb(t);
      expect(Math.max(rgb[0], rgb[1], rgb[2])).toBeCloseTo(1, 5);
    }
  });
});

describe('redshift and beaming', () => {
  it('reduces to the static lapse far away', () => {
    // At r = 1000 M the gravitational redshift is 1.5e-3.
    expect(redshiftFactor(1000, 0, 1, 0)).toBeCloseTo(1, 2);
    expect(redshiftFactor(1000, 0, 1, 0)).toBeLessThan(1);
  });

  it('is blueshifted for a photon strongly co-rotating with the disk', () => {
    // L > 0 means the photon is dragged forward with the flow. The
    // gravitational redshift dominates at large radii, so the Doppler
    // factor has to be strong enough to overcome it.
    const g = redshiftFactor(6, 0.999, 1, 5);
    expect(g).toBeGreaterThan(1);
  });

  it('is redshifted for a counter-rotating photon', () => {
    const g = redshiftFactor(6, 0.999, 1, -2);
    expect(g).toBeLessThan(1);
  });

  it('is larger for a co-rotating than for a counter-rotating photon', () => {
    const pro = redshiftFactor(6, 0.999, 1, 2);
    const retro = redshiftFactor(6, 0.999, 1, -2);
    expect(pro).toBeGreaterThan(retro);
  });

  it('beams by g^4', () => {
    expect(beamingFactor(2)).toBeCloseTo(16, 10);
    expect(beamingFactor(0.5)).toBeCloseTo(0.0625, 10);
  });
});

describe('emission', () => {
  it('is brighter at the inner edge than in the outer disk', () => {
    const spin = 0.999;
    const model = createDiskModel(spin);
    const inner = diskEmission(model.innerRadius, 1, spin, model.peakTemperatureK, model.innerRadius);
    const outer = diskEmission(12, 1, spin, model.peakTemperatureK, model.innerRadius);
    const lum = (c: [number, number, number]) => c[0] + c[1] + c[2];
    expect(lum(inner)).toBeGreaterThan(lum(outer));
  });

  it('blue-shifts the colour of the approaching side', () => {
    const spin = 0.999;
    const model = createDiskModel(spin);
    const cold = diskEmission(8, 0.6, spin, model.peakTemperatureK, model.innerRadius);
    const hot = diskEmission(8, 1.8, spin, model.peakTemperatureK, model.innerRadius);
    expect(hot[2] / hot[0]).toBeGreaterThan(cold[2] / cold[0]);
  });
});
