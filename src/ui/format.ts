/**
 * Pure number formatting for the HUD, the nav and the overlays.
 *
 * Deliberately free of DOM access so that the formatting rules can be
 * unit-tested (tests/format.test.ts) and reused by the offline renderer
 * (tools/render-offline.mjs).
 *
 * The HUD is read by humans while the camera is falling; a value that reads
 * "NaN" or "Infinity" for a single frame is worse than an honest dash, so
 * every formatter degrades to "--" on non-finite input.
 */

/** Clamp to the unit interval. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Fixed-point number with trailing zeros trimmed.
 *
 *   12.40  -> "12.4"
 *   12.00  -> "12"
 *   -0.001 -> "0"
 *   NaN    -> "--"
 */
export function formatFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '--';
  const d = Math.max(0, Math.min(12, Math.trunc(digits)));
  let s = value.toFixed(d);
  if (s.indexOf('.') >= 0) {
    s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return s === '-0' ? '0' : s;
}

/** Camera radius in units of M. */
export function formatRadiusM(r: number): string {
  return formatFixed(r, 2);
}

/** Camera radius in Schwarzschild radii (r_s = 2M). */
export function formatRadiusRs(r: number): string {
  return formatFixed(r / 2, 2);
}

/**
 * Static-observer time dilation dτ/dt. Four digits: the value falls off a
 * cliff below r = 4 M and three digits is not enough to see it happen.
 */
export function formatTimeDilation(d: number): string {
  return formatFixed(d, 4);
}

/** Inclination above the equatorial plane, in degrees. */
export function formatInclination(deg: number): string {
  return formatFixed(deg, 2);
}

/** Dimensionless spin a/M. */
export function formatSpin(a: number): string {
  return formatFixed(a, 3);
}

/** Scroll progress as a percentage. */
export function formatPercent(p: number): string {
  return formatFixed(clamp01(p) * 100, 1);
}

/** Signed value with an explicit sign, for angular velocities. */
export function formatSigned(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '--';
  const body = formatFixed(Math.abs(v), digits);
  return (v < 0 ? '-' : '+') + body;
}

/**
 * Seconds as m:ss (or h:mm:ss past an hour). Used by the preload readout and
 * by the colophon for the session timer.
 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Two-digit ordinal, for chapter numbers: 1 -> "01". */
export function formatOrdinal(n: number): string {
  if (!Number.isFinite(n)) return '--';
  return String(Math.max(0, Math.trunc(n))).padStart(2, '0');
}

/**
 * Format a physical radius in the unit a reader expects at that scale:
 * metres below 1000 km, kilometres below 1000 Mm, astronomical units beyond.
 * The camera radius is quoted in M, but the colophon shows the same fall in
 * SI so the numbers mean something outside the simulation.
 */
export function formatLengthMetres(metres: number): string {
  if (!Number.isFinite(metres)) return '--';
  const abs = Math.abs(metres);
  if (abs < 1000) return `${formatFixed(metres, 0)} m`;
  if (abs < 1e6) return `${formatFixed(metres / 1000, 2)} km`;
  if (abs < 1e9) return `${formatFixed(metres / 1e6, 2)} Mm`;
  const au = metres / 1.495978707e11;
  if (au < 1000) return `${formatFixed(au, 2)} AU`;
  return `${formatFixed(metres / 9.4607304725808e15, 3)} ly`;
}

/** Gravitational radius M expressed in SI (G = c = 1 -> M = 1 metre). */
export function metresPerGeometricUnit(kg: number): number {
  const G = 6.6743e-11;
  const c = 299792458;
  return (G * kg) / (c * c);
}
