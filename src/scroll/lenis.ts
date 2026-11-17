/**
 * The smooth scroll.
 *
 * Lenis drives the scroll position; everything else in the page reads the
 * *progress* it publishes (0..1) and never the raw scroll offset. That is
 * the rule from docs/architecture.md §3: `progress` is written only by the
 * scroll system, and it is the only truth about where the reader is.
 */

import Lenis from 'lenis';

export interface SmoothScrollOptions {
  /** Seconds per scroll gesture. */
  duration?: number;
  /** The easing function name Lenis ships with. */
  easing?: (t: number) => number;
  /** Disable the smooth scroll (used under prefers-reduced-motion). */
  instant?: boolean;
  /** Called on every frame with the progress (0..1). */
  onProgress?: (progress: number) => void;
}

export interface SmoothScroll {
  /** The current progress, 0..1. */
  progress(): number;
  /** Scroll to a fraction of the document. */
  scrollTo(progress: number, options?: { instant?: boolean }): void;
  /** The Lenis instance, for the render loop. */
  readonly lenis: Lenis;
  destroy(): void;
}

export function createSmoothScroll(options: SmoothScrollOptions = {}): SmoothScroll {
  const instant = options.instant ?? false;

  const lenis = new Lenis({
    duration: options.duration ?? 1.1,
    easing: options.easing ?? ((t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t))),
    smoothWheel: !instant,
    syncTouch: false,
    touchMultiplier: 1.4,
    wheelMultiplier: 1,
    autoRaf: false,
  });

  let progress = 0;

  lenis.on('scroll', (event: { progress: number }) => {
    progress = event.progress;
    options.onProgress?.(progress);
  });

  return {
    lenis,
    progress: () => progress,
    scrollTo(target: number, scrollOptions = {}) {
      lenis.scrollTo(Math.max(0, Math.min(1, target)), {
        immediate: scrollOptions.instant ?? instant,
        duration: instant ? 0 : undefined,
      });
    },
    destroy() {
      lenis.destroy();
    },
  };
}
