/**
 * The telemetry HUD.
 *
 * Design contract (docs/architecture.md §6):
 *  - **no boxes** — no cards, panels, borders, outlines, pills, glass or
 *    fills behind or around any text. The HUD is *only* text on black;
 *  - sans-serif only, warm white #F5EDE4, light weights, fluid clamp() sizes;
 *  - a soft text-shadow glow is allowed and is the only ornament.
 *
 * NASA-grade additions:
 *  · Mission Elapsed Time (MET) — seconds since the fall began, ticking in
 *    the corner like a flight clock.
 *  · Horizon proximity warning — as the camera approaches r = 2 M the
 *    dilation readout pulses amber, then red inside the photon sphere.
 *  · Camera roll — frame-dragging precession shown as degrees of roll.
 *
 * State: the HUD owns nothing. It reads `PikStore.state` every frame and
 * renders smoothed numbers. It never writes to the store.
 */

import type { PikState, PikStore } from '../core/store';
import {
  formatClock,
  formatFixed,
  formatInclination,
  formatRadiusM,
  formatRadiusRs,
  formatSpin,
  formatTimeDilation,
} from './format';

export interface HudRowSpec {
  /** Stable identifier; also becomes a CSS class suffix. */
  key: string;
  /** Human label rendered to the left of the value. */
  label: string;
  /** Unit rendered to the right of the value (may be empty). */
  unit?: string;
  /** Reads the raw value out of the shared state. */
  read: (s: PikState) => number;
  /** Formats the value. Defaults to two decimals, trailing zeros trimmed. */
  format?: (v: number) => string;
  /** When true the row is styled as a warning (pulses near the horizon). */
  warning?: boolean;
}

export interface HudOptions {
  /** The shared store. Required. */
  store: PikStore;
  /** Where to mount the HUD. Defaults to `document.body`. */
  root?: HTMLElement;
  /** Rows to show. Defaults to the standard telemetry set. */
  rows?: HudRowSpec[];
  /** Exponential smoothing rate (1/s). 0 disables smoothing. */
  smoothing?: number;
}

export interface Hud {
  readonly element: HTMLElement;
  /** Force an immediate re-render (used by tests and by the offline renderer). */
  update(): void;
  dispose(): void;
}

/** The standard telemetry rows, in reading order. */
export function defaultHudRows(): HudRowSpec[] {
  return [
    { key: 'met', label: 'MET', unit: '', read: (s) => s.time, format: formatClock },
    { key: 'radius', label: 'r', unit: 'M', read: (s) => s.hud.radiusM, format: formatRadiusM },
    {
      key: 'schwarzschild',
      label: 'r',
      unit: 'rₛ',
      read: (s) => s.hud.radiusSchwarzschild,
      format: formatRadiusRs,
    },
    {
      key: 'dilation',
      label: 'dτ/dt',
      unit: 'static',
      read: (s) => s.hud.timeDilation,
      format: formatTimeDilation,
      warning: true,
    },
    { key: 'roll', label: 'roll', unit: '°', read: (s) => s.hud.inclinationDeg * 0 + s.roll * (180 / Math.PI), format: formatInclination },
    { key: 'inclination', label: 'θ', unit: '°', read: (s) => s.hud.inclinationDeg, format: formatInclination },
    { key: 'spin', label: 'a*', unit: '', read: (s) => s.hud.spin, format: formatSpin },
  ];
}

interface RowView {
  spec: HudRowSpec;
  valueEl: HTMLElement;
  current: number;
  target: number;
  lastText: string;
  warningLevel: number;
}

export function createHud(opts: HudOptions): Hud {
  const store = opts.store;
  const root = opts.root ?? document.body;
  const rows = opts.rows ?? defaultHudRows();
  const smoothing = opts.smoothing ?? 6;

  const element = document.createElement('div');
  element.className = 'pik-hud';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Telemetry');
  element.dataset.state = 'visible';

  const views: RowView[] = rows.map((spec) => {
    const row = document.createElement('div');
    row.className = `pik-hud__row pik-hud__row--${spec.key}`;

    const label = document.createElement('span');
    label.className = 'pik-hud__label';
    label.textContent = spec.label;

    const value = document.createElement('span');
    value.className = 'pik-hud__value';
    value.textContent = '--';

    const unit = document.createElement('span');
    unit.className = 'pik-hud__unit';
    unit.textContent = spec.unit ?? '';

    row.append(label, value, unit);
    element.append(row);

    const target = spec.read(store.state);
    return { spec, valueEl: value, current: target, target, lastText: '', warningLevel: 0 };
  });

  root.append(element);

  let raf = 0;
  let lastTime = 0;
  let disposed = false;

  /* Horizon proximity: how close the camera is to r = 2 M, 0..1. */
  const horizonProximity = (radius: number): number => {
    const near = 2.0;   /* Schwarzschild radius */
    const far = 12.0;   /* start warning at 12 M */
    if (radius <= near) return 1.0;
    if (radius >= far) return 0.0;
    return 1.0 - (radius - near) / (far - near);
  };

  const render = (dt: number) => {
    const s = store.state;
    const reduced = s.reducedMotion;
    const proximity = horizonProximity(s.radius);
    const warning = proximity > 0.15;

    for (const view of views) {
      const target = view.spec.read(s);
      view.target = target;

      if (reduced || smoothing <= 0) {
        view.current = target;
      } else {
        const k = 1 - Math.exp(-smoothing * Math.min(dt, 0.1));
        view.current += (target - view.current) * k;
        if (Math.abs(target - view.current) < 1e-9) view.current = target;
      }

      const text = (view.spec.format ?? ((v: number) => formatFixed(v, 2)))(view.current);
      if (text !== view.lastText) {
        view.valueEl.textContent = text;
        view.lastText = text;
      }

      /* Warning pulse: amber → red as the camera approaches the horizon. */
      if (view.spec.warning) {
        const pulse = 0.6 + 0.4 * Math.sin(s.time * 6.0);
        const level = warning ? proximity * pulse : 0;
        view.warningLevel = level;
        if (level > 0.02) {
          view.valueEl.style.color = `rgb(255, ${Math.round(180 - 130 * level)}, ${Math.round(60 - 60 * level)})`;
          view.valueEl.style.textShadow = `0 0 ${Math.round(10 + 14 * level)}px rgba(255, 80, 40, ${Math.min(1, level * 1.2)})`;
        } else {
          view.valueEl.style.color = '';
          view.valueEl.style.textShadow = '';
        }
      } else if (view.warningLevel > 0) {
        view.warningLevel = 0;
        view.valueEl.style.color = '';
        view.valueEl.style.textShadow = '';
      }
    }
  };

  const tick = (now: number) => {
    if (disposed) return;
    const dt = lastTime === 0 ? 1 / 60 : (now - lastTime) / 1000;
    lastTime = now;
    render(dt);
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return {
    element,
    update: () => render(0),
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      element.remove();
    },
  };
}
