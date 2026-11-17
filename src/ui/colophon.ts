/**
 * The colophon.
 *
 * Credits and references at the end of the fall. Plain text rows, no panel,
 * no border; the links are plain text with an animated underline.
 *
 * It fades in once the reader reaches the bottom of the scroll and fades out
 * again if they scroll back up.
 *
 * NASA-grade additions:
 *  · Mission profile — spin, ISCO, photon sphere, horizon, shadow radius.
 *  · Technical stack — every algorithm used, named.
 */

import type { PikStore } from '../core/store';

export interface ColophonLine {
  /** Left-hand label. */
  label: string;
  /** Right-hand value; may contain plain text. */
  value: string;
  /** Optional link target for the value. */
  href?: string;
}

export interface ColophonOptions {
  store: PikStore;
  /** Where to mount the colophon. Defaults to `document.body`. */
  root?: HTMLElement;
  /** Scroll progress at which the colophon appears. */
  revealAt?: number;
  /** Rows to show. */
  lines?: ColophonLine[];
}

export interface Colophon {
  readonly element: HTMLElement;
  update(): void;
  dispose(): void;
}

export function defaultColophonLines(): ColophonLine[] {
  return [
    { label: 'Mission profile', value: 'Kerr black hole, a/M = 0.999 (near-extremal)' },
    { label: 'Event horizon', value: 'r₊ ≈ 1.44 M' },
    { label: 'Photon sphere', value: 'r_ph ≈ 1.18 M (prograde equatorial)' },
    { label: 'ISCO', value: 'r_ISCO ≈ 1.24 M' },
    { label: 'Shadow radius', value: '≈ 5.2 M (Bardeen critical curve)' },
    { label: 'Camera fall', value: '140 M → 3.2 M, logarithmic free fall' },
    { label: 'Metric', value: 'Kerr (Boyer–Lindquist), frame dragging included' },
    { label: 'Integration', value: 'null geodesics in Carter time, per pixel' },
    { label: 'Arithmetic', value: 'double-single (≈48-bit) in GLSL ES 3.00' },
    { label: 'Disk', value: 'Novikov–Thorne flux, relativistic blackbody, g⁴ beaming' },
    { label: 'Tone map', value: 'ACES RRT+ODT, sRGB OETF' },
    { label: 'Post process', value: '5-mip bloom, anamorphic streak, lens ghosts, film grain' },
    { label: 'Relativistic fx', value: 'aberration headlight, gravitational redshift, photon ring' },
    { label: 'Type', value: 'Segoe UI Variable Display / Selawik' },
    { label: 'Assets', value: 'none — no images, no fonts, no CDN, no backend' },
  ];
}

export function createColophon(opts: ColophonOptions): Colophon {
  const store = opts.store;
  const root = opts.root ?? document.body;
  const revealAt = opts.revealAt ?? 0.93;
  const lines = opts.lines ?? defaultColophonLines();

  const element = document.createElement('footer');
  element.className = 'pik-colophon';
  element.dataset.state = 'hidden';

  const heading = document.createElement('p');
  heading.className = 'pik-colophon__heading';
  heading.textContent = 'COLOPHON — MISSION DATA';
  element.append(heading);

  const list = document.createElement('dl');
  list.className = 'pik-colophon__list';

  for (const line of lines) {
    const row = document.createElement('div');
    row.className = 'pik-colophon__row';

    const dt = document.createElement('dt');
    dt.className = 'pik-colophon__label';
    dt.textContent = line.label;

    const dd = document.createElement('dd');
    dd.className = 'pik-colophon__value';

    if (line.href) {
      const link = document.createElement('a');
      link.className = 'pik-colophon__link';
      link.href = line.href;
      link.textContent = line.value;
      dd.append(link);
    } else {
      dd.textContent = line.value;
    }

    row.append(dt, dd);
    list.append(row);
  }

  element.append(list);
  root.append(element);

  let raf = 0;
  let disposed = false;
  let visible = false;

  const update = () => {
    const shouldShow = store.state.progress >= revealAt;
    if (shouldShow !== visible) {
      visible = shouldShow;
      element.dataset.state = visible ? 'visible' : 'hidden';
    }
  };

  const tick = () => {
    if (disposed) return;
    update();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  update();

  return {
    element,
    update,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      element.remove();
    },
  };
}
