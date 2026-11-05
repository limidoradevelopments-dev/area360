"use client";

import { lazy, Suspense } from "react";

/**
 * ─── LostShell ───
 *
 * The 404's only client code on every page (NotFoundSection says why):
 * this, a few hundred bytes. It asks for the live part — the scene and the
 * entrance (LostLive) — when it is drawn, which is only on the 404; the
 * live part's own first act is to ask for the scene's engine.
 */
const LostLive = lazy(() => import("./LostLive"));

export default function LostShell({ respectReducedMotion }: { respectReducedMotion: boolean }) {
  return (
    <Suspense fallback={null}>
      <LostLive respectReducedMotion={respectReducedMotion} />
    </Suspense>
  );
}
