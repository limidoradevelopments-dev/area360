import type { CSSProperties } from "react";

import { CAMERA } from "@/components/hero/stage/camera";

import still from "./scene/still.json";

/**
 * ─── LostStill ───
 *
 * The ruin as a picture: the scene's own first frame (scripts/lost/
 * still.mjs, `npm run lost-still`), for where there is no scene — no
 * WebGL2, a lost context, no scripting. Undisplayed until then and lazy
 * (not-found.css), so a visit with a scene never fetches it.
 *
 * One picture for wide screens and one for upright ones, each laid with
 * `cover` about the horizon the hero's camera puts it at (scene/frame.ts
 * frames as the hero does): the wide lens's and the phone crop's, handed
 * to the stylesheet as variables from the camera's own constants.
 *
 * Decorative: the heading carries the page.
 */
const HORIZONS = {
  "--size-lost-still-wide": `${(CAMERA.horizon * 100).toFixed(2)}%`,
  "--size-lost-still-upright": `${(CAMERA.portrait.horizon * 100).toFixed(2)}%`,
} as CSSProperties;

const src = (name: string, width: number) => `/lost/still/${name}-${width}.webp?v=${still.version} ${width}w`;

export default function LostStill() {
  return (
    <picture data-lost-still style={HORIZONS}>
      <source media="(max-aspect-ratio: 4/5)" srcSet={still.upright.map((w) => src("upright", w)).join(", ")} sizes="100vw" />
      <img
        src={`/lost/still/wide-${still.wide[0]}.webp?v=${still.version}`}
        srcSet={still.wide.map((w) => src("wide", w)).join(", ")}
        sizes="100vw"
        alt=""
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
