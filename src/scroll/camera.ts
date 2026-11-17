/**
 * The camera choreography.
 *
 * The scroll is the only input. The camera's radius and inclination are a
 * pure function of the scroll progress (docs/architecture.md §3: `radius`
 * and `inclination` are written only by the camera choreography).
 *
 * The fall is logarithmic — that is what a free fall *looks* like from the
 * inside: the closing rate of the hole is roughly constant in log r, not in
 * r — and it is broken into beats so the reader gets a moment of stillness
 * at each threshold.
 */

export interface CameraBeat {
  /** The scroll progress at which the beat starts. */
  at: number;
  /** The radius at the start of the beat, in M. */
  radius: number;
  /** The inclination at the start of the beat, in radians. */
  inclination: number;
}

export interface CameraChoreographyOptions {
  /** The beats, in order. */
  beats?: CameraBeat[];
}

export interface CameraSample {
  radius: number;
  inclination: number;
}

export interface CameraChoreography {
  /** Sample the camera at a scroll progress. */
  sample(progress: number): CameraSample;
  /** The beats, for the timeline to synchronise with. */
  readonly beats: CameraBeat[];
}

/** The default beats: the fall from 140 M down to the horizon. */
export function defaultBeats(): CameraBeat[] {
  const above = Math.PI / 2 - 0.085; // 4.87° above the equatorial plane
  const level = Math.PI / 2;
  const below = Math.PI / 2 + 0.03; // 1.7° below it: the last shot

  return [
    { at: 0.0, radius: 140, inclination: above },
    { at: 0.16, radius: 62, inclination: above },
    { at: 0.38, radius: 26, inclination: above - 0.01 },
    { at: 0.6, radius: 11, inclination: level - 0.012 },
    { at: 0.8, radius: 5.4, inclination: level + 0.004 },
    { at: 1.0, radius: 3.2, inclination: below },
  ];
}

/** Smoothstep, the standard ease between two beats. */
function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** Clamp to the unit interval. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function createCameraChoreography(
  options: CameraChoreographyOptions = {},
): CameraChoreography {
  const beats = (options.beats ?? defaultBeats()).slice().sort((a, b) => a.at - b.at);

  const sample = (progress: number): CameraSample => {
    const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;

    let index = 0;
    for (let i = 0; i < beats.length; i++) {
      if (beats[i].at <= p) index = i;
    }
    const from = beats[index];
    const to = beats[Math.min(index + 1, beats.length - 1)];

    const span = to.at - from.at;
    const t = span > 1e-9 ? smoothstep((p - from.at) / span) : 0;

    // The radius falls logarithmically: the closing speed of the hole is
    // roughly constant in log r, and a linear fall would spend 90 % of the
    // scroll in the last ten per cent.
    const logRadius = Math.log(from.radius) + (Math.log(to.radius) - Math.log(from.radius)) * t;

    return {
      radius: Math.exp(logRadius),
      inclination: from.inclination + (to.inclination - from.inclination) * t,
    };
  };

  return { sample, beats };
}
