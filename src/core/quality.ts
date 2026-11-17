/**
 * Resolution governor helpers.
 *
 * The rule from docs/architecture.md §5.2: the governor may change the
 * **resolution, the supersample count and the bloom resolution** — and
 * nothing else. It must never change the physics: the number of integration
 * steps, the metric, the disk model and the camera are off limits.
 */

export interface QualityGovernorOptions {
  /** The frame time we aim for, in milliseconds. */
  targetFrameMs?: number;
  /** The frame time above which the resolution is reduced. */
  reduceAboveMs?: number;
  /** The frame time below which the resolution is raised again. */
  raiseBelowMs?: number;
  /** How long to wait between two adjustments, in milliseconds. */
  intervalMs?: number;
  /** The smallest resolution scale. */
  minScale?: number;
  /** The largest resolution scale. */
  maxScale?: number;
  /** The step used when the scale changes. */
  step?: number;
}

export interface QualityDecision {
  /** The new scale, or undefined if nothing changed. */
  scale?: number;
  /** Why the decision was made. */
  reason?: 'too-slow' | 'headroom';
}

/**
 * A hysteretic governor: it reacts to a sustained average frame time, not
 * to a single slow frame, and it waits between adjustments so the
 * resolution does not oscillate.
 */
export class QualityGovernor {
  private readonly options: Required<QualityGovernorOptions>;
  private averageFrameMs: number;
  private lastAdjustment = 0;

  constructor(options: QualityGovernorOptions = {}) {
    this.options = {
      targetFrameMs: options.targetFrameMs ?? 16.7,
      reduceAboveMs: options.reduceAboveMs ?? 34,
      raiseBelowMs: options.raiseBelowMs ?? 19,
      intervalMs: options.intervalMs ?? 1200,
      minScale: options.minScale ?? 0.25,
      maxScale: options.maxScale ?? 1,
      step: options.step ?? 0.15,
    };
    this.averageFrameMs = this.options.targetFrameMs;
  }

  /** The current resolution scale. */
  get scale(): number {
    return this.options.maxScale;
  }

  /** Feed a frame time in; get a decision. */
  update(frameMs: number, now: number, currentScale: number): QualityDecision {
    this.averageFrameMs += (frameMs - this.averageFrameMs) * 0.05;

    if (now - this.lastAdjustment < this.options.intervalMs) return {};

    let next = currentScale;
    let reason: QualityDecision['reason'];

    if (this.averageFrameMs > this.options.reduceAboveMs && currentScale > this.options.minScale) {
      next = Math.max(this.options.minScale, currentScale - this.options.step);
      reason = 'too-slow';
    } else if (
      this.averageFrameMs < this.options.raiseBelowMs &&
      currentScale < this.options.maxScale
    ) {
      next = Math.min(this.options.maxScale, currentScale + this.options.step * 0.66);
      reason = 'headroom';
    }

    if (next === currentScale) return {};

    this.lastAdjustment = now;
    return { scale: next, reason };
  }
}

/** The device pixel ratio to render at, capped so a 3x phone does not melt. */
export function targetPixelRatio(max = 2): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, max);
}
