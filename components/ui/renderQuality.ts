import { useSyncExternalStore } from "react";

/**
 * ─── renderQuality ───
 *
 * How much the page's live scene may draw: the visitor's choice, and what
 * the scene settled on. A module store, as loadProgress is, so the scene's
 * engine (outside React) and the settings control (inside it) share one
 * value without a provider between them.
 *
 *   choice   the visitor's: "auto" (the device is measured and the scene
 *            picks: the default) or a level held whatever the frame rate
 *            does. Kept on this device (localStorage), so a visitor who
 *            asked for Low on an old phone is not measured onto High next
 *            time.
 *   level    what the scene is drawing at now — under "auto", what it
 *            measured; null while there is no live scene (still loading, no
 *            WebGL2, a lost context), when there is nothing to set.
 *
 * Knows nothing of tiers or shaders: the scene maps a level to its own
 * (components/hero/stage/StageCanvas.tsx).
 */

export type QualityLevel = "high" | "medium" | "low";
export type QualityChoice = "auto" | QualityLevel;

export interface RenderQuality {
  readonly choice: QualityChoice;
  readonly level: QualityLevel | null;
}

const KEY = "kavi:quality";
const CHOICES: readonly QualityChoice[] = ["auto", "high", "medium", "low"];

/* The server's snapshot, and the client's until it has read the stored
   choice: the same on both sides of hydration. */
const INITIAL: RenderQuality = { choice: "auto", level: null };

/* STORAGE CAN THROW (a private window, blocked site data) and can be empty:
   either way the choice is Auto, and the page works without it. */
function readChoice(): QualityChoice {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = window.localStorage.getItem(KEY) as QualityChoice | null;
    return stored && CHOICES.includes(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

/* Whether the choice is now what this device will read on its next visit. */
function writeChoice(choice: QualityChoice): boolean {
  try {
    if (choice === "auto") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
    return readChoice() === choice;
  } catch {
    /* Not kept: it holds for this visit. */
    return false;
  }
}

/* One object per state, replaced on every change: useSyncExternalStore
   compares snapshots by identity. */
let snapshot: RenderQuality = { choice: readChoice(), level: null };
const listeners = new Set<() => void>();

function set(next: Partial<RenderQuality>): void {
  const merged = { ...snapshot, ...next };
  if (merged.choice === snapshot.choice && merged.level === snapshot.level) return;
  snapshot = merged;
  for (const listener of listeners) listener();
}

export const renderQuality = {
  get current(): RenderQuality {
    return snapshot;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** The visitor chose; remembered on this device ("auto" forgets).
   *  Whether it was kept there — false where storage is refused (a
   *  private window): then it holds for this visit only, and a reload
   *  would lose it. */
  choose(choice: QualityChoice): boolean {
    const kept = writeChoice(choice);
    set({ choice });
    return kept;
  },

  /** The scene is drawing at `level`, or there is no live scene (null). */
  settle(level: QualityLevel | null): void {
    set({ level });
  },
};

/** The store, for a component: re-renders on a choice or a settle. */
export function useRenderQuality(): RenderQuality {
  return useSyncExternalStore(renderQuality.subscribe, () => snapshot, () => INITIAL);
}
