/**
 * The colophon.
 *
 * Credits and references at the end of the fall. Plain text rows, no panel,
 * no border; the links are plain text with an animated underline.
 *
 * It fades in once the reader reaches the bottom of the scroll and fades out
 * again if they scroll back up.
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
    { label: 'Metric', value: 'Kerr (Boyer–Lindquist), a/M = 0.999' },
    { label: 'Integration', value: 'null geodesics in Carter time, per pixel' },
    { label: 'Arithmetic', value: 'double-single (≈48-bit) in GLSL ES 3.00' },
    { label: 'Disk', value: 'Novikov–Thorne flux, relativistic blackbody' },
    { label: 'Type', value: 'Segoe UI Variable Display / Selawik' },
    { label: 'Assets', value: 'none — no images, no fonts, no CDN' },
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
  heading.textContent = 'COLOPHON';
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
