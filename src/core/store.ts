/**
 * The single shared state contract for pik.
 * See docs/architecture.md §3. Nothing else stores scroll progress.
 */

export interface BlackHoleState {
  /** Camera Boyer–Lindquist radius r, in units of M. Never below 3.2. */
  radius: number;
  /** Camera polar angle θ in radians (disk plane is θ = π/2). */
  inclination: number;
  /** Camera roll about the line of sight, in radians (frame-dragging precession). */
  roll: number;
  /** Dimensionless spin a/M. */
  spin: number;
  /** Seconds since renderer start (drives disk turbulence / drift). */
  time: number;
}

export interface HudReadout {
  /** r in M. */
  radiusM: number;
  /** r in Schwarzschild radii (r_s = 2M). */
  radiusSchwarzschild: number;
  /** dτ_static/dt for a static observer at the camera radius. */
  timeDilation: number;
  /** Camera inclination above the disk plane, in degrees. */
  inclinationDeg: number;
  /** Current spin a/M. */
  spin: number;
}

export interface PikState {
  /** Scroll progress, 0..1. The only source of truth for the narrative. */
  progress: number;
  radius: number;
  inclination: number;
  roll: number;
  spin: number;
  time: number;
  reducedMotion: boolean;
  /** Resolution multiplier, 0.25..1. */
  qualityScale: number;
  /** Projected shadow centre, CSS pixels, viewport coordinates. */
  blackHoleScreenCenter: { x: number; y: number };
  /** Viewport aspect ratio (w/h). */
  aspect: number;
  hud: HudReadout;
  /** Monotonic frame counter. */
  frames: number;
}

export type StoreListener = (s: PikState) => void;

const MIN_RADIUS = 3.2;
const MAX_RADIUS = 400;

export class PikStore {
  readonly state: PikState;

  private listeners = new Set<StoreListener>();
  private dirty = false;

  constructor(initial: Partial<PikState> = {}) {
    this.state = {
      progress: 0,
      radius: 50,
      inclination: Math.PI / 2 - 0.085,
      roll: 0,
      spin: 0.999,
      time: 0,
      reducedMotion: false,
      qualityScale: 1,
      blackHoleScreenCenter: { x: 0, y: 0 },
      aspect: 1,
      hud: {
        radiusM: 50,
        radiusSchwarzschild: 25,
        timeDilation: 1,
        inclinationDeg: 4.87,
        spin: 0.999,
      },
      frames: 0,
      ...initial,
    };
  }

  subscribe(fn: StoreListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setProgress(p: number): void {
    const v = clamp(p, 0, 1);
    if (v === this.state.progress) return;
    this.state.progress = v;
    this.markDirty();
  }

  setCamera(radius: number, inclination: number): void {
    this.state.radius = clamp(radius, MIN_RADIUS, MAX_RADIUS);
    this.state.inclination = inclination;
    this.state.hud.radiusM = this.state.radius;
    this.state.hud.radiusSchwarzschild = this.state.radius / 2;
    this.state.hud.inclinationDeg = (Math.PI / 2 - inclination) * (180 / Math.PI);
    this.markDirty();
  }

  setRoll(roll: number): void {
    this.state.roll = roll;
    this.markDirty();
  }

  setSpin(a: number): void {
    this.state.spin = clamp(a, -0.9999, 0.9999);
    this.state.hud.spin = this.state.spin;
    this.markDirty();
  }

  setTime(t: number): void {
    this.state.time = t;
  }

  setReducedMotion(v: boolean): void {
    this.state.reducedMotion = v;
    this.markDirty();
  }

  setQualityScale(s: number): void {
    this.state.qualityScale = clamp(s, 0.25, 1);
    this.markDirty();
  }

  setScreenCenter(x: number, y: number): void {
    this.state.blackHoleScreenCenter.x = x;
    this.state.blackHoleScreenCenter.y = y;
  }

  setAspect(a: number): void {
    this.state.aspect = a;
  }

  bumpFrame(): void {
    this.state.frames++;
  }

  private markDirty(): void {
    this.dirty = true;
  }

  /** Flush pending changes to listeners. Called once per frame by the loop. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    for (const fn of this.listeners) fn(this.state);
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
