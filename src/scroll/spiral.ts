/**
 * The text pull.
 *
 * The narrative is HTML type laid over the render. As the visitor falls,
 * the type is pulled into the shadow: every word is dragged towards the
 * centre of the hole, twisted along the spiral it is falling down, and
 * tinted from warm white to the dim red of the inner disk.
 *
 * The pull is a pure function of three numbers — the distance of the word
 * from the shadow's centre, the scroll progress and the reduced-motion
 * flag — so the same expression can be unit-tested and reused by the
 * offline renderer.
 *
 * Nothing here creates a box: the words are transformed, not framed.
 */

import { clamp01 } from './camera';

/** The colour the type is dragged towards: the deep red of the inner disk. */
export const PULLED_COLOUR = '#8a2a17';
/** The colour the type starts from. */
export const TYPE_COLOUR = [245, 237, 228];

/** How a word is distorted by the pull. */
export interface PullState {
  /** 0 = untouched, 1 = fully in the shadow. */
  pull: number;
  /** The drag in x, in pixels. */
  dx: number;
  /** The drag in y, in pixels. */
  dy: number;
  /** The twist, in radians. */
  angle: number;
  /** The scale factor. */
  scale: number;
  /** The opacity. */
  opacity: number;
}

export interface PullOptions {
  /** The pull's strength multiplier (narrative: later = stronger). */
  strength?: number;
  /** The radius of the pull, in pixels. */
  radius?: number;
  /** How far the drag takes the word, as a fraction of the distance. */
  drag?: number;
}

/**
 * Compute the pull for a word.
 *
 * @param dx the word's offset from the shadow's centre, in pixels
 * @param dy the word's offset from the shadow's centre, in pixels
 * @param progress the scroll progress, 0..1
 */
export function pullState(
  dx: number,
  dy: number,
  progress: number,
  opts: PullOptions = {},
): PullState {
  const radius = opts.radius ?? 520;
  const drag = opts.drag ?? 0.42;
  const strength = opts.strength ?? (0.3 + 0.7 * clamp01(progress));

  const distance = Math.hypot(dx, dy);
  const q = clamp01(1 - distance / radius);
  // The pull is gentle at the edge of the field and savage near the hole.
  const pull = Math.pow(q, 1.6) * strength;
  if (pull <= 0) {
    return { pull: 0, dx: 0, dy: 0, angle: 0, scale: 1, opacity: 1 };
  }

  const angle = Math.atan2(dy, dx);
  const move = drag * pull;
  return {
    pull,
    dx: -dx * move,
    dy: -dy * move,
    // The twist is the angle the word subtends at the hole: the line of
    // type curls around the shadow as it falls in.
    angle: angle * pull * 1.25,
    scale: 1 - 0.45 * pull,
    opacity: clamp01(1 - Math.pow(pull, 1.4) * 1.35),
  };
}

/** Mix the type colour towards the pulled colour. */
export function pullColour(pull: number): string {
  const t = clamp01(pull);
  const r = Math.round(TYPE_COLOUR[0] + (138 - TYPE_COLOUR[0]) * t);
  const g = Math.round(TYPE_COLOUR[1] + (42 - TYPE_COLOUR[1]) * t);
  const b = Math.round(TYPE_COLOUR[2] + (23 - TYPE_COLOUR[2]) * t);
  return `rgb(${r} ${g} ${b})`;
}

/** A word of the narrative type, split out of its paragraph. */
export interface PullWord {
  /** The element that carries the word. */
  element: HTMLElement;
  /** The line it belongs to. */
  line: HTMLElement;
}

/**
 * Split the text inside an element into per-word elements.
 *
 * The inline markup (strong, em, …) is preserved and the text content of
 * the element is unchanged, so the accessible name of the paragraph stays
 * exactly what it was.
 */
export function splitWords(element: HTMLElement): PullWord[] {
  const words: PullWord[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    textNodes.push(node as Text);
  }

  for (const text of textNodes) {
    const parent = text.parentElement;
    if (!parent) continue;
    const parts = text.data.split(/(\s+)/);
    if (parts.length <= 1) continue;
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        fragment.append(document.createTextNode(' '));
        continue;
      }
      const span = document.createElement('span');
      span.className = 'pik-pull';
      span.textContent = part;
      fragment.append(span);
      words.push({ element: span, line: parent });
    }
    parent.replaceChild(fragment, text);
  }

  return words;
}

/**
 * Drives the pull for a set of words.
 *
 * The update is throttled to the frames on which the scroll actually
 * moved: the transform of every word is written at most once per frame and
 * only when the pull has changed enough to see.
 */
export class TextPull {
  private words: PullWord[] = [];
  private lastPull = new Map<HTMLElement, number>();
  private disposed = false;

  constructor(
    private readonly store: {
      readonly state: {
        progress: number;
        reducedMotion: boolean;
        blackHoleScreenCenter: { x: number; y: number };
      };
    },
    private readonly root: HTMLElement = document.body,
  ) {}

  /** Split every narrative text block under the root into words. */
  attach(selector = '.pik-chapter__title, .pik-chapter__lede, .pik-chapter__body, .pik-chapter__eyebrow'): PullWord[] {
    const blocks = Array.from(this.root.querySelectorAll<HTMLElement>(selector));
    const words: PullWord[] = [];
    for (const block of blocks) words.push(...splitWords(block));
    this.words = words;
    return words;
  }

  /** Recompute every word's transform. */
  update(): void {
    if (this.disposed) return;
    const state = this.store.state;
    const centre = state.blackHoleScreenCenter;
    const radius = Math.max(240, Math.min(window.innerWidth, window.innerHeight) * 0.72);

    // One layout read for all of the words: the rects are read before any
    // style is written, so the browser lays the document out once.
    const rects = this.words.map((w) => w.element.getBoundingClientRect());

    for (let i = 0; i < this.words.length; i++) {
      const word = this.words[i];
      const rect = rects[i];
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) {
        // Off screen: hidden anyway, and nothing to pull.
        if (word.element.style.opacity !== '0') word.element.style.opacity = '0';
        continue;
      }
      const dx = rect.left + rect.width / 2 - centre.x;
      const dy = rect.top + rect.height / 2 - centre.y;
      const pull = pullState(dx, dy, state.progress, { radius });

      if (state.reducedMotion) {
        word.element.style.transform = '';
        word.element.style.opacity = '';
        word.element.style.color = '';
        this.lastPull.set(word.element, 0);
        continue;
      }

      const previous = this.lastPull.get(word.element) ?? -1;
      if (Math.abs(previous - pull.pull) < 0.004 && previous >= 0) continue;
      this.lastPull.set(word.element, pull.pull);

      word.element.style.transform =
        `translate3d(${pull.dx.toFixed(2)}px, ${pull.dy.toFixed(2)}px, 0) ` +
        `rotate(${pull.angle.toFixed(4)}rad) scale(${pull.scale.toFixed(4)})`;
      word.element.style.opacity = pull.opacity.toFixed(3);
      word.element.style.color = pullColour(pull.pull);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.words = [];
    this.lastPull.clear();
  }
}
