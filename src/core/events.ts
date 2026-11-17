/**
 * A tiny typed event emitter.
 *
 * The store is the only shared state; this is for the things that are
 * genuinely events rather than state: the scroll moving, the renderer
 * becoming warm, a quality change, a chapter being picked.
 */

export type Listener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

export class Emitter<T> {
  private readonly listeners = new Set<Listener<T>>();

  /** Subscribe. Returns the unsubscribe function. */
  on(listener: Listener<T>): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Subscribe for exactly one emission. */
  once(listener: Listener<T>): Unsubscribe {
    const wrapper: Listener<T> = (payload) => {
      this.off(wrapper);
      listener(payload);
    };
    return this.on(wrapper);
  }

  off(listener: Listener<T>): void {
    this.listeners.delete(listener);
  }

  emit(payload: T): void {
    for (const listener of [...this.listeners]) listener(payload);
  }

  get size(): number {
    return this.listeners.size;
  }

  clear(): void {
    this.listeners.clear();
  }
}
