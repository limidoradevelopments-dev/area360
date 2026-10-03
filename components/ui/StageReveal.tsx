"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * ─── StageReveal ───
 *
 * One boolean: has the stage been handed over to the page yet.
 *
 * Use it when a preloader (or any curtain) sits in front of above-the-fold
 * entrances. Entrances start on THIS, not on mount — otherwise they play
 * behind the curtain and the visitor is shown a page that already finished
 * arriving.
 *
 * Gate the ANIMATION, never the MOUNT: the markup stays correct in the server
 * render for search engines and no-script visitors.
 *
 * The default outside a provider is `true` — "no curtain is in front of me" —
 * so every consumer still works on its own.
 */

export interface StageRevealValue {
  readonly revealed: boolean;
  /** Called by the curtain as it BEGINS to leave. Idempotent. */
  readonly reveal: () => void;
}

const FALLBACK: StageRevealValue = { revealed: true, reveal: () => {} };

const StageRevealContext = createContext<StageRevealValue>(FALLBACK);

export default function StageRevealProvider({ children }: { children: ReactNode }) {
  /* False on the first render on both sides; the server cannot know whether
     a curtain will run, and seeding otherwise would mismatch hydration. */
  const [revealed, setRevealed] = useState(false);
  const reveal = useCallback(() => setRevealed(true), []);
  const value = useMemo(() => ({ revealed, reveal }), [revealed, reveal]);

  return <StageRevealContext.Provider value={value}>{children}</StageRevealContext.Provider>;
}

export function useStageReveal(): StageRevealValue {
  return useContext(StageRevealContext);
}
