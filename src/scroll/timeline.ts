/**
 * The narrative timeline.
 *
 * The beats are scrubbed by the scroll progress rather than by
 * ScrollTrigger, because the scroll is driven by Lenis: a scrubbed GSAP
 * timeline reads the same number the renderer does, so the type and the
 * black hole can never disagree about where the reader is.
 *
 * Each beat is a chapter of the page: it fades its text in, holds it, and
 * fades it out again as the camera falls past it.
 */

import { gsap } from 'gsap';
import type { CameraBeat } from './camera';

export interface TimelineChapter {
  /** The `id` of the section element. */
  id: string;
  /** The scroll progress at which the chapter is centred. */
  at: number;
  /** How wide the chapter's window is, in progress units. */
  width?: number;
}

export interface TimelineOptions {
  /** The scroll progress, 0..1. */
  progress: () => number;
  /** The chapters. */
  chapters: TimelineChapter[];
  /** The camera beats, for the HUD flashes. */
  beats?: CameraBeat[];
  /** Called when a chapter becomes active. */
  onChapter?: (chapter: TimelineChapter, index: number) => void;
}

export interface Timeline {
  /** The active chapter index. */
  readonly active: number;
  /** Re-evaluate the chapters. Called every frame. */
  update(): void;
  destroy(): void;
}

export function createTimeline(options: TimelineOptions): Timeline {
  const chapters = options.chapters.slice().sort((a, b) => a.at - b.at);
  const tweens = new Map<string, gsap.core.Tween>();
  let active = -1;

  const build = () => {
    for (const chapter of chapters) {
      const element = document.getElementById(chapter.id);
      if (!element) continue;
      const width = chapter.width ?? 0.16;

      gsap.set(element, { autoAlpha: 0, y: 26 });
      const tween = gsap
        .timeline({ paused: true })
        .fromTo(
          element,
          { autoAlpha: 0, y: 26 },
          { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out' },
        )
        .to(element, { autoAlpha: 1, duration: 0.36 })
        .to(element, { autoAlpha: 0, y: -22, duration: 0.32, ease: 'power2.in' });

      tweens.set(chapter.id, tween as unknown as gsap.core.Tween);
      void width;
    }
  };

  build();

  const update = () => {
    const p = options.progress();

    for (const chapter of chapters) {
      const tween = tweens.get(chapter.id);
      if (!tween) continue;
      const width = chapter.width ?? 0.16;
      // The chapter is fully visible from `at - width` to `at + width`.
      const start = chapter.at - width;
      const end = chapter.at + width;
      const local = (p - start) / Math.max(end - start, 1e-6);
      tween.progress(Math.max(0, Math.min(1, local)));
    }

    let next = 0;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].at <= p + 1e-6) next = i;
    }
    if (next !== active) {
      active = next;
      options.onChapter?.(chapters[active], active);
    }
  };

  return {
    get active() {
      return active;
    },
    update,
    destroy() {
      for (const tween of tweens.values()) tween.kill();
      tweens.clear();
    },
  };
}
