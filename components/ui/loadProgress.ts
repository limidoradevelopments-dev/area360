/**
 * ─── loadProgress ───
 *
 * How far the page has got toward being ready, for a curtain to count.
 *
 * A feature that loads something heavy (the hero's scene: its shores, its
 * shaders, the device measured in the dark) registers under a name, reports
 * a fraction as it goes, and finishes. The curtain reads `value` and
 * `settled` from its own frame loop: they change every frame, so they are a
 * plain module store, never React state.
 *
 * Client only. Nothing writes to it on the server (every call is from an
 * effect or an engine callback), so the module's state is never shared
 * between requests.
 */

interface Entry {
  fraction: number;
  done: boolean;
}

const entries = new Map<string, Entry>();

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export const loadProgress = {
  /** `name` is loading. Idempotent: a remount does not reset what it reached. */
  begin(name: string): void {
    if (!entries.has(name)) entries.set(name, { fraction: 0, done: false });
  },

  /** `name` is `fraction` of the way. Never goes back. */
  report(name: string, fraction: number): void {
    const entry = entries.get(name);
    if (!entry || entry.done) return;
    entry.fraction = Math.max(entry.fraction, clamp01(fraction));
  },

  /** `name` is ready, or has given up (a fallback stands in): either way,
   *  nothing more is coming from it. */
  finish(name: string): void {
    const entry = entries.get(name) ?? { fraction: 0, done: false };
    entry.fraction = 1;
    entry.done = true;
    entries.set(name, entry);
  },

  /** The mean of everything registered, 0–1 (0 while nothing is). */
  get value(): number {
    if (entries.size === 0) return 0;
    let sum = 0;
    for (const entry of entries.values()) sum += entry.fraction;
    return sum / entries.size;
  },

  /** How many have registered. */
  get count(): number {
    return entries.size;
  },

  /** Something registered, and all of it has finished. */
  get settled(): boolean {
    if (entries.size === 0) return false;
    for (const entry of entries.values()) if (!entry.done) return false;
    return true;
  },
};
