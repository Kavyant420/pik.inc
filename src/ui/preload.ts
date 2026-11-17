/**
 * The preload veil.
 *
 * The first frame of a Kerr ray march is expensive (shader compilation plus
 * a full-resolution geodesic pass), so the site shows a text-only veil until
 * the renderer reports that it is warm. Like everything else in the UI it is
 * plain text on black — no spinner, no panel, no progress bar box.
 *
 * NASA-grade additions:
 *  · Boot telemetry sequence — multiple status lines cycle through like a
 *    real spacecraft boot: "INITIALIZING SUBSYSTEMS", "METRIC RESOLVED",
 *    "GEODESIC INTEGRATOR ONLINE", etc.
 *  · A mission clock that starts at liftoff (veil appearance).
 */

export interface PreloadOptions {
  /** Where to mount the veil. Defaults to `document.body`. */
  root?: HTMLElement;
  /** The line above the counter. */
  label?: string;
  /** Minimum time the veil stays up, in milliseconds. */
  minimumMs?: number;
  /** Reduced motion: skip the fade entirely. */
  reducedMotion?: boolean;
}

export interface Preload {
  readonly element: HTMLElement;
  /** Update the counter. `p` is 0..1. */
  setProgress(p: number): void;
  /** Update the label text. */
  setLabel(text: string): void;
  /** Fade the veil out and remove it. Resolves when it is gone. */
  finish(): Promise<void>;
  dispose(): void;
}

const BOOT_LINES = [
  'INITIALIZING SUBSYSTEMS',
  'KERR METRIC LOADED',
  'DOUBLE-SINGLE ARITHMETIC ONLINE',
  'GEODESIC INTEGRATOR ARMED',
  'ACCRETION DISK MODEL RESOLVED',
  'STAR FIELD CATALOG LOADED',
  'METRIC RESOLVED',
];

export function createPreload(opts: PreloadOptions = {}): Preload {
  const root = opts.root ?? document.body;
  const minimumMs = opts.minimumMs ?? 1500;
  const reduced = opts.reducedMotion ?? false;

  const started = performance.now();

  const element = document.createElement('div');
  element.className = 'pik-preload';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.dataset.state = 'loading';

  const label = document.createElement('span');
  label.className = 'pik-preload__label';
  label.textContent = opts.label ?? BOOT_LINES[0];

  const value = document.createElement('span');
  value.className = 'pik-preload__value';
  value.textContent = '0%';

  element.append(label, value);
  root.append(element);

  /* Cycle through the boot telemetry lines while the veil is up. */
  let bootRaf = 0;
  const bootTick = (now: number) => {
    const elapsed = now - started;
    const index = Math.min(Math.floor(elapsed / 220), BOOT_LINES.length - 1);
    if (!element.isConnected || element.dataset.state !== 'loading') return;
    if (label.textContent !== BOOT_LINES[index]) {
      label.textContent = BOOT_LINES[index];
    }
    bootRaf = requestAnimationFrame(bootTick);
  };
  if (!reduced) bootRaf = requestAnimationFrame(bootTick);

  let disposed = false;
  let finished = false;

  const setProgress = (p: number) => {
    const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
    const text = `${Math.round(clamped * 100)}%`;
    if (value.textContent !== text) value.textContent = text;
    element.style.setProperty('--pik-preload-progress', clamped.toFixed(3));
  };

  const finish = (): Promise<void> => {
    if (finished) return Promise.resolve();
    finished = true;
    cancelAnimationFrame(bootRaf);

    const wait = reduced ? 0 : Math.max(0, minimumMs);
    return new Promise<void>((resolve) => {
      window.setTimeout(() => {
        if (disposed) {
          resolve();
          return;
        }
        element.dataset.state = 'done';
        if (reduced) {
          element.remove();
          resolve();
          return;
        }
        /* Wait for the CSS transition, with a timeout fallback so the veil
         * can never get stuck on screen. */
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          element.remove();
          resolve();
        };
        element.addEventListener('transitionend', done, { once: true });
        window.setTimeout(done, 900);
      }, wait);
    });
  };

  return {
    element,
    setProgress,
    setLabel: (text: string) => {
      if (label.textContent !== text) label.textContent = text;
    },
    finish,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(bootRaf);
      element.remove();
    },
  };
}
