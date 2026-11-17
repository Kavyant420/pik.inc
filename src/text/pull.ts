/**
 * The spaghettification.
 *
 * As the camera falls, the prose is pulled into the shadow: the characters
 * near the black hole are stretched towards it and fade, the way light
 * would be dragged in.
 *
 * The pull is driven entirely by the shared state — the camera radius for
 * the strength, the shadow's projected centre for the direction — so it
 * always agrees with what the renderer drew. Under `prefers-reduced-motion`
 * the pull is switched off completely (docs/architecture.md §6).
 */

import type { PikStore } from '../core/store';
import { fallAmount } from '../ui/audio';
import { pullTargets, splitCharacters, type CharacterSpan } from './split';

export interface TextPullOptions {
  store: PikStore;
  /** Where to look for the elements to pull. */
  root?: ParentNode;
  /** How far the influence of the shadow reaches, in CSS pixels. */
  influenceRadius?: number;
}

export interface TextPull {
  /** Re-evaluate the pull. Called once per frame. */
  update(): void;
  /** The number of characters under the pull. */
  readonly characterCount: number;
  dispose(): void;
}

interface PullGroup {
  element: HTMLElement;
  characters: CharacterSpan[];
}

export function createTextPull(opts: TextPullOptions): TextPull {
  const store = opts.store;
  const root = opts.root ?? document;
  const influenceRadius = opts.influenceRadius ?? 420;

  const groups: PullGroup[] = pullTargets(root).map((element) => ({
    element,
    characters: splitCharacters(element).characters,
  }));

  const characterCount = groups.reduce((sum, group) => sum + group.characters.length, 0);
  let rects = new Map<HTMLElement, DOMRect>();

  const refreshRects = () => {
    rects = new Map();
    for (const group of groups) {
      rects.set(group.element, group.element.getBoundingClientRect());
    }
  };

  const update = () => {
    const state = store.state;

    if (state.reducedMotion) {
      if (groups.length === 0) return;
      for (const group of groups) {
        for (const character of group.characters) {
          character.element.style.transform = '';
          character.element.style.opacity = '';
        }
      }
      return;
    }

    // The camera's radius drives the strength; the shadow's projected
    // centre drives the direction.
    const fall = fallAmount(state.radius);
    const center = state.blackHoleScreenCenter;
    const width = window.innerWidth || 1;

    for (const group of groups) {
      let rect = rects.get(group.element);
      if (!rect) {
        rect = group.element.getBoundingClientRect();
        rects.set(group.element, rect);
      }

      for (const character of group.characters) {
        const x = rect.left + character.offsetX + character.width / 2;
        const y = rect.top + character.offsetY + character.height / 2;
        const dx = center.x - x;
        const dy = center.y - y;
        const distance = Math.hypot(dx, dy);

        // The influence falls off exponentially with the distance to the
        // shadow, so the type dissolves into it rather than being cut off.
        const influence = Math.exp(-distance / (influenceRadius * (0.35 + 0.65 * (width / 1920))));

        if (influence < 0.002) {
          character.element.style.transform = '';
          character.element.style.opacity = '';
          continue;
        }

        const stretch = 1 + fall * 2.8 * influence;
        const squeeze = 1 + fall * 0.55 * influence;
        const move = fall * 0.42 * influence;

        character.element.style.transformOrigin = dx >= 0 ? '0% 50%' : '100% 50%';
        character.element.style.transform =
          `translate3d(${(dx * move).toFixed(2)}px, ${(dy * move).toFixed(2)}px, 0) ` +
          `scale(${stretch.toFixed(4)}, ${squeeze.toFixed(4)})`;
        character.element.style.opacity = String(Math.max(0, 1 - fall * 0.82 * influence));
      }
    }
  };

  const onResize = () => refreshRects();
  window.addEventListener('resize', onResize);

  return {
    characterCount,
    update,
    dispose() {
      window.removeEventListener('resize', onResize);
      for (const group of groups) {
        for (const character of group.characters) {
          character.element.style.transform = '';
          character.element.style.opacity = '';
        }
      }
    },
  };
}
