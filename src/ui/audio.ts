/**
 * Ambient audio.
 *
 * Off by default, started only from an explicit user gesture (the browser
 * requires it), and driven by the camera: as the hole pulls the camera in,
 * the drone detunes downward and the noise bed closes up. No sample files,
 * no external assets — everything is synthesised in the WebAudio graph.
 */

import type { PikStore } from '../core/store';

export interface AudioOptions {
  /** The shared store; the camera radius drives the synthesis. */
  store: PikStore;
  /** Master gain, 0..1. */
  volume?: number;
}

export interface AmbientAudio {
  /** True when the audio graph is running. */
  isEnabled(): boolean;
  /** Start or stop the graph. Resolves once the transition is scheduled. */
  setEnabled(enabled: boolean): Promise<void>;
  /** Flip the state and report the new one. */
  toggle(): Promise<boolean>;
  dispose(): void;
}

/** Map the camera radius (M) onto a 0..1 "fall" amount. */
export function fallAmount(radius: number): number {
  const far = 400;
  const near = 3.2;
  const t = (far - radius) / (far - near);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function createAmbientAudio(opts: AudioOptions): AmbientAudio {
  const store = opts.store;
  const volume = opts.volume ?? 0.5;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let droneFilter: BiquadFilterNode | null = null;
  let droneGain: GainNode | null = null;
  let noiseGain: GainNode | null = null;
  let noiseFilter: BiquadFilterNode | null = null;
  let enabled = false;
  let raf = 0;
  let disposed = false;

  const supported =
    typeof window !== 'undefined' &&
    (typeof AudioContext !== 'undefined' || typeof (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !== 'undefined');

  const build = () => {
    if (ctx) return;
    const Ctor =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    ctx = new Ctor();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Two detuned low oscillators: the beating between them gives the drone
    // its slow shimmer without any LFO.
    droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    droneFilter.Q.value = 6;

    droneGain = ctx.createGain();
    droneGain.gain.value = 0.09;

    droneGain.connect(droneFilter);
    droneFilter.connect(master);

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 48;
    oscA.connect(droneGain);

    const oscB = ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 72.3;
    const oscBGain = ctx.createGain();
    oscBGain.gain.value = 0.6;
    oscB.connect(oscBGain);
    oscBGain.connect(droneGain);

    // A short noise buffer, looped: the "roar" of the accretion flow.
    const seconds = 2;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      // One-pole low pass -> a cheap pink-ish spectrum.
      last = 0.98 * last + 0.02 * white;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 420;
    noiseFilter.Q.value = 0.8;

    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.02;

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);

    oscA.start();
    oscB.start();
    noise.start();
  };

  const applyCamera = () => {
    if (!ctx || !droneFilter || !noiseFilter || !droneGain || !noiseGain) return;
    const fall = fallAmount(store.state.radius);
    const now = ctx.currentTime;
    // The cutoff falls from 220 Hz to 45 Hz as the camera dives in.
    droneFilter.frequency.setTargetAtTime(220 - 175 * fall, now, 0.35);
    noiseFilter.frequency.setTargetAtTime(420 - 300 * fall, now, 0.35);
    noiseGain.gain.setTargetAtTime(0.02 + 0.05 * fall, now, 0.5);
    droneGain.gain.setTargetAtTime(0.09 + 0.05 * fall, now, 0.5);
  };

  const tick = () => {
    if (disposed) return;
    if (enabled) applyCamera();
    raf = requestAnimationFrame(tick);
  };

  const setEnabled = async (next: boolean): Promise<void> => {
    if (disposed) return;
    if (!supported) return;
    if (next === enabled) return;

    if (next) {
      build();
      if (!ctx || !master) return;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          // A blocked resume just means the gesture was not accepted; the
          // UI stays silent rather than throwing.
        }
      }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.4);
      enabled = true;
      applyCamera();
      if (!raf) raf = requestAnimationFrame(tick);
    } else {
      if (!ctx || !master) return;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      enabled = false;
    }
  };

  return {
    isEnabled: () => enabled,
    setEnabled,
    toggle: async () => {
      await setEnabled(!enabled);
      return enabled;
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      if (ctx) {
        void ctx.close().catch(() => undefined);
        ctx = null;
      }
      master = null;
      droneFilter = null;
      droneGain = null;
      noiseGain = null;
      noiseFilter = null;
      enabled = false;
    },
  };
}
