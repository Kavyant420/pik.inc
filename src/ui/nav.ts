/**
 * Chapter navigation.
 *
 * A vertical list of chapter names down the right edge of the viewport. The
 * links are plain text with an animated underline; there is no panel, no
 * pill, no border and no fill behind them (docs/architecture.md §6).
 *
 * The active chapter is derived from `PikStore.state.progress` — the nav
 * never keeps its own copy of the scroll position.
 */

import type { PikStore } from '../core/store';
import { formatOrdinal } from './format';

export interface NavChapter {
  /** `id` of the section element in the document. */
  id: string;
  /** Text shown in the nav. */
  label: string;
  /** Scroll progress at which this chapter becomes active (0..1). */
  at: number;
}

export interface NavOptions {
  store: PikStore;
  /** Where to mount the nav. Defaults to `document.body`. */
  root?: HTMLElement;
  /** Chapters in narrative order. */
  chapters: NavChapter[];
  /** Called after a chapter is picked. */
  onSelect?: (chapter: NavChapter) => void;
  /** Document to resolve chapter ids in. Defaults to `document`. */
  doc?: Document;
}

export interface Nav {
  readonly element: HTMLElement;
  /** Re-evaluate the active chapter (normally driven by the frame loop). */
  update(): void;
  dispose(): void;
}

export function createNav(opts: NavOptions): Nav {
  const store = opts.store;
  const root = opts.root ?? document.body;
  const doc = opts.doc ?? document;
  const chapters = opts.chapters.slice().sort((a, b) => a.at - b.at);

  const element = document.createElement('nav');
  element.className = 'pik-nav';
  element.setAttribute('aria-label', 'Chapters');

  const list = document.createElement('ol');
  list.className = 'pik-nav__list';

  // A hairline progress rule next to the labels. One pixel, no fill, no
  // background — it is a graphic, not a box.
  const rule = document.createElement('span');
  rule.className = 'pik-nav__rule';
  rule.setAttribute('aria-hidden', 'true');
  const ruleFill = document.createElement('span');
  ruleFill.className = 'pik-nav__rule-fill';
  rule.append(ruleFill);

  const links: HTMLAnchorElement[] = [];

  chapters.forEach((chapter, i) => {
    const item = document.createElement('li');
    item.className = 'pik-nav__item';
    item.dataset.chapter = chapter.id;

    const link = document.createElement('a');
    link.className = 'pik-nav__link';
    link.href = `#${chapter.id}`;
    link.dataset.chapter = chapter.id;

    const ordinal = document.createElement('span');
    ordinal.className = 'pik-nav__ordinal';
    ordinal.textContent = formatOrdinal(i + 1);

    const label = document.createElement('span');
    label.className = 'pik-nav__label';
    label.textContent = chapter.label;

    link.append(ordinal, label);

    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = doc.getElementById(chapter.id);
      const reduced = store.state.reducedMotion;
      if (target) {
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
      // Keep the address bar in sync without the browser's instant jump.
      if (typeof history !== 'undefined' && history.replaceState) {
        history.replaceState(null, '', `#${chapter.id}`);
      }
      opts.onSelect?.(chapter);
    });

    item.append(link);
    list.append(item);
    links.push(link);
  });

  element.append(rule, list);
  root.append(element);

  let active = -1;
  let raf = 0;
  let disposed = false;

  const update = () => {
    const progress = store.state.progress;

    // The active chapter is the last one whose threshold has been passed.
    let next = 0;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].at <= progress + 1e-6) next = i;
    }
    if (next !== active) {
      if (active >= 0) links[active]?.removeAttribute('data-active');
      links[next]?.setAttribute('data-active', '');
      active = next;
    }

    element.style.setProperty('--pik-progress', progress.toFixed(4));
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
