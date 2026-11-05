/**
 * ─── 404 · the flowers' programs: the hero's own ───
 *
 * The hero's two chamomiles and their cloth are drawn by THE HERO'S OWN
 * PROGRAMS (hero/bloom/shaders/bloom.ts): its vertex program builds every
 * ray, disc, stem and band from the pose (flowers.ts, the hero's pose with
 * their death written in), its fragment program lights them — the rays'
 * teeth, veins and satin, the discs' florets, the stems' wax, the cloth's
 * weave and fray. Only two things are its own here:
 *
 *   ITS LIGHT INTO THIS PRINT: the hero's fragment program's main is kept
 *   whole and called; what it wrote is carried into this print by the curve
 *   the stone's light is (common.ts heroToPrint), so the flowers and the
 *   stone print as one
 *   ITS STONE: the hero's program hides a flower behind the hero's whole
 *   stone; this one is broken, and the stone's own picture's depth hides
 *   them instead (scene/engine.ts gives it no stone to hide them behind)
 */

import { PLANT_FRAG, PLANT_VERT } from "@/components/hero/bloom/shaders/bloom";

import { HERO_PRINT_GLSL, PRINT_GLSL } from "./common";

export { PLANT_VERT as FLOWER_VERT };

export const FLOWER_UNIFORMS = [
  "uView", "uFocal", "uCenter", "uCamPos", "uCamRot",
  "uPose", "uRayRuffle", "uRidges", "uClothPleat", "uTargetRect", "uMirror", "uPoints", "uMote",
  "uLit", "uBloomDome", "uLightSide", "uPetal", "uDisc", "uStem", "uCloth", "uPollen",
  "uBloomLight", "uBloomMore", "uRayLook", "uPlantMore", "uNoise",
  "uStonePlan", "uStoneSpan", "uStoneWeather", "uPrint",
] as const;

/* The hero's main, renamed and called. */
const HERO_MAIN = "void main() {";
if (!PLANT_FRAG.includes(HERO_MAIN)) throw new Error("not-found: the hero's flower program has changed shape");

export const FLOWER_FRAG = `${PLANT_FRAG.replace(HERO_MAIN, "void heroFlower() {")}
${PRINT_GLSL}
${HERO_PRINT_GLSL}
void main() {
  heroFlower();
  outColor = vec4(toPrint(heroToPrint(outColor.rgb)), outColor.a);
}
`;
