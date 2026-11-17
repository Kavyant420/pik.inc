/**
 * The spaghettification.
 *
 * As the camera falls, the prose is pulled into the shadow: the characters
 * near the black hole are stretched towards it and fade, the way light
 * would be dragged in.
 *
 * NASA-grade additions:
 *  · Rotational spaghettification — characters rotate toward the shadow,
 *    the frame-dragging twist of the ergosphere made visible in the type.
 *  · Chromatic redshift drift — as words approach the hole they shift from
 *    warm white toward deep red, the gravitational redshift of light
 *    climbing out of the potential well.
 *  · Time-dilation freeze — near the horizon the pull slows and the type
 *    appears to almost stop, the dτ/dt → 0 effect made visible.
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
          character.element.style.color = '';
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
          character.element.style.color = '';
          continue;
        }

        const stretch = 1 + fall * 2.8 * influence;
        const squeeze = 1 + fall * 0.55 * influence;
        const move = fall * 0.42 * influence;

        /* Rotational spaghettification: rotate each character toward the
         * shadow. The angle is the direction from the character to the
         * hole's centre, scaled by fall and influence. */
        const angle = Math.atan2(dy, dx) * fall * 0.5 * influence;

        /* Chromatic redshift drift: shift color from warm white to deep red
         * as the character nears the hole — gravitational redshift made
         * visible in the type. */
        const redShift = fall * 0.55 * influence;
        const r = 245;
        const g = Math.round(237 * (1 - redShift * 0.7));
        const b = Math.round(228 * (1 - redShift * 0.85));
        const color = `rgb(${r},${g},${b})`;

        /* Time-dilation freeze: near the horizon the pull damps out so the
         * type appears to almost stop moving (dτ/dt → 0). */
        const dilation = 1.0 / Math.sqrt(1.0 - 2.0 / Math.max(state.radius, 2.01));
        const freeze = Math.min(1.0, (dilation - 1.0) / 3.0);
        const effectiveStretch = 1 + (stretch - 1) * (1 - freeze * 0.7);
        const effectiveMove = move * (1 - freeze * 0.6);

        character.element.style.transformOrigin = '50% 50%';
        character.element.style.transform =
          `translate3d(${(dx * effectiveMove).toFixed(2)}px, ${(dy * effectiveMove).toFixed(2)}px, 0) ` +
          `rotate(${angle.toFixed(3)}rad) ` +
          `scale(${effectiveStretch.toFixed(4)}, ${squeeze.toFixed(4)})`;
        character.element.style.opacity = String(Math.max(0, 1 - fall * 0.82 * influence));
        character.element.style.color = color;
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
          character.element.style.color = '';
        }
      }
    },
  };
}
