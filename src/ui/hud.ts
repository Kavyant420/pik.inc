/**
 * The telemetry HUD.
 *
 * Design contract (docs/architecture.md §6):
 *  - **no boxes** — no cards, panels, borders, outlines, pills, glass or
 *    fills behind or around any text. The HUD is *only* text on black;
 *  - sans-serif only, warm white #F5EDE4, light weights, fluid clamp() sizes;
 *  - a soft text-shadow glow is allowed and is the only ornament.
 *
 * State: the HUD owns nothing. It reads `PikStore.state` every frame and
 * renders smoothed numbers. It never writes to the store.
 */

import type { PikState, PikStore } from '../core/store';
import {
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
    },
    {
      key: 'inclination',
      label: 'θ',
      unit: '°',
      read: (s) => s.hud.inclinationDeg,
      format: formatInclination,
    },
    { key: 'spin', label: 'a*', unit: '', read: (s) => s.hud.spin, format: formatSpin },
  ];
}

interface RowView {
  spec: HudRowSpec;
  valueEl: HTMLElement;
  current: number;
  target: number;
  lastText: string;
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
    return { spec, valueEl: value, current: target, target, lastText: '' };
  });

  root.append(element);

  let raf = 0;
  let lastTime = 0;
  let disposed = false;

  const render = (dt: number) => {
    const s = store.state;
    const reduced = s.reducedMotion;

    for (const view of views) {
      const target = view.spec.read(s);
      view.target = target;

      if (reduced || smoothing <= 0) {
        view.current = target;
      } else {
        // Frame-rate independent exponential smoothing: the same visual
        // result at 30 fps and at 144 fps.
        const k = 1 - Math.exp(-smoothing * Math.min(dt, 0.1));
        view.current += (target - view.current) * k;
        if (Math.abs(target - view.current) < 1e-9) view.current = target;
      }

      const text = (view.spec.format ?? ((v: number) => formatFixed(v, 2)))(view.current);
      if (text !== view.lastText) {
        view.valueEl.textContent = text;
        view.lastText = text;
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
