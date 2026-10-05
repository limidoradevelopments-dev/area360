/**
 * ─── Stage · what the set's programs are fed ───
 *
 * The set is drawn by several programs (shaders/scene.ts, the top): the
 * stone's slots (stone/stone.ts), the photograph in the lake (water/
 * lake.ts) and the composite (engine.ts). Each declares the GLSL chunks it
 * needs, and each chunk's uniforms are named and fed here, once — so every
 * program that declares one is fed it the same way, and the passes cannot
 * drift apart. A program that declares only part of a group is fed the rest
 * harmlessly: an undeclared uniform has no location, and setting it does
 * nothing.
 */

import { AERIAL, EXTINCTION, MIST_SEEN, OVER_PHOTO, SHEETS, SOFT_BLACK } from "../atmosphere/optics";
import { STONE } from "../stone/optics";
import { LAPS, WATER_MOTION, WAVES } from "../water/motion";
import { WATER, WATER_R0, WATER_UNDER } from "../water/optics";
import { CAMERA, type CameraFrame } from "./camera";
import type { StageParams } from "./engine";
import { bindTexture } from "./gl";
import { BACKDROP, DEPTH, SHEET_EDGES } from "./layers";
import type { Plates } from "./plates";

export type Uniforms = Record<string, WebGLUniformLocation | null>;
type Rgb = readonly [number, number, number];

/** Everything the set's programs read this frame. */
export interface SetFrame {
  camera: CameraFrame;
  params: StageParams;
  colors: { readonly lit: Rgb; readonly shade: Rgb; readonly stone: Rgb; readonly water: Rgb };
  /** Seconds of the lake's own time. */
  waterTime: number;
  plates: Plates;
  /** The fog sheets this frame (atmosphere/): density, and light. */
  density: WebGLTexture;
  light: WebGLTexture;
  /** The print curve's inverse (engine.ts unprintTable). */
  unprint: Float32Array;
  /** The scene's target, px. */
  width: number;
  height: number;
}

/**
 * TEXTURE UNITS, one table for every program of the set, so no pass binds
 * over another's. (3 and 7 are free.)
 */
export const UNITS = {
  sheetDensity: 0,
  sheetLight: 1,
  plate: 2,
  depth: 4,
  /** bloom/bloom.ts bindScene: two, from here. (7 is free.) */
  bloom: 5,
  /** stone/stone.ts bindScene: two, from here. */
  stone: 8,
  lake: 10,
} as const;

/* Constant per build: packed once, not per frame. */
const WAVE_DATA = new Float32Array(WAVES.flat());
const LAP_DATA = new Float32Array(LAPS.flat());

/* ── atmosphere/shaders/fog.ts ────────────────────────────────────────── */

export const FOG_UNIFORMS = ["uExtinction", "uFogHeight", "uSheetEdge", "uSheetVeil", "uLit", "uShade"] as const;

export function setFogUniforms(gl: WebGL2RenderingContext, u: Uniforms, f: SetFrame): void {
  const p = f.params;
  gl.uniform4f(u.uExtinction, p.nearExtinction, p.farExtinction, p.bankFrom, p.bankTo);
  gl.uniform3f(u.uFogHeight, p.lift, EXTINCTION.liftFrom, EXTINCTION.liftTo);
  gl.uniform4f(u.uSheetEdge, ...SHEET_EDGES);
  gl.uniform4f(u.uSheetVeil, p.veil, SHEETS[1].veil, SHEETS[2].veil, SHEETS[3].veil);
  gl.uniform3fv(u.uLit, f.colors.lit);
  gl.uniform3fv(u.uShade, f.colors.shade);
}

/* ── stage/shaders/set.ts: the sheets, and the fog over the photograph ── */

export const SHEET_UNIFORMS = [
  "uSheetDensity", "uSheetLight", "uSheetMean", "uSheetLife", "uFogLife", "uFogReach", "uAerial", "uSoftBlack",
  "uMistSeen",
] as const;

export function setSheetUniforms(gl: WebGL2RenderingContext, u: Uniforms, f: SetFrame): void {
  const p = f.params;
  bindTexture(gl, u.uSheetDensity, UNITS.sheetDensity, f.density);
  bindTexture(gl, u.uSheetLight, UNITS.sheetLight, f.light);
  gl.uniform4f(u.uSheetMean, ...OVER_PHOTO.mean);
  gl.uniform4f(u.uSheetLife, ...OVER_PHOTO.life);
  gl.uniform1f(u.uFogLife, p.fogLife);
  gl.uniform1f(u.uFogReach, OVER_PHOTO.reach);
  gl.uniform4f(u.uAerial, p.aerial, AERIAL.pivot, AERIAL.nearer, AERIAL.most);
  gl.uniform3f(u.uSoftBlack, p.softBlack, SOFT_BLACK.from, SOFT_BLACK.to);
  gl.uniform4f(u.uMistSeen, MIST_SEEN.veil, p.mistSeen, ...MIST_SEEN.water);
}

/* ── water/shaders/water.ts ───────────────────────────────────────────── */

export const WATER_UNIFORMS = [
  "uWaterBody", "uWaterR0", "uWaves", "uWaterTime", "uWaterGain", "uCatsPaws", "uWind", "uWaterClarity",
  "uSubjectWaver", "uMinElevation", "uLaps", "uLapFade",
] as const;

export function setWaterUniforms(gl: WebGL2RenderingContext, u: Uniforms, f: SetFrame): void {
  const p = f.params;
  gl.uniform3fv(u.uWaterBody, f.colors.water);
  gl.uniform1f(u.uWaterR0, WATER_R0);
  gl.uniform4fv(u.uWaves, WAVE_DATA);
  gl.uniform1f(u.uWaterTime, f.waterTime);
  gl.uniform3f(u.uWaterGain, p.swell, p.undulation, p.ripples);
  const paws = WATER_MOTION.catsPaws;
  gl.uniform4f(u.uCatsPaws, paws.scale, paws.drift, p.paws, paws.softness);
  gl.uniform3f(u.uWind, Math.cos(WATER_MOTION.wind), Math.sin(WATER_MOTION.wind), p.glass);
  gl.uniform3f(u.uWaterClarity, WATER.clarity.beam, WATER.clarity.down, WATER_UNDER);
  gl.uniform1f(u.uSubjectWaver, p.waver);
  gl.uniform1f(u.uMinElevation, WATER.minElevation);
  gl.uniform3fv(u.uLaps, LAP_DATA);
  gl.uniform2f(u.uLapFade, WATER_MOTION.lapping.reach, p.lapping);
}

/* ── stone/shaders/stone.ts ───────────────────────────────────────────── */

export const STONE_UNIFORMS = [
  "uStonePlan", "uStoneSpan", "uStoneAlbedo", "uStoneLight", "uLightSide", "uStoneFoot", "uStoneSheen",
  "uStoneGrain", "uStoneFine", "uStoneWeather", "uStoneLichen", "uStoneWear", "uStoneWater", "uStoneUnder",
  "uStoneMeniscus", "uSubjectDepth",
] as const;

export function setStoneUniforms(gl: WebGL2RenderingContext, u: Uniforms, f: SetFrame): void {
  const p = f.params;
  const g = STONE.granite;
  gl.uniform4f(u.uStonePlan, STONE.center[0], STONE.center[1], STONE.plan.across, STONE.plan.along);
  gl.uniform2f(u.uStoneSpan, -STONE.depth, STONE.top);
  gl.uniform3fv(u.uStoneAlbedo, f.colors.stone);
  gl.uniform3f(u.uStoneLight, p.stoneTop, p.stoneAway, p.stoneToward);
  gl.uniform2f(u.uLightSide, ...STONE.lightSide);
  gl.uniform3f(u.uStoneFoot, STONE.foot.height, p.footAway, p.footToward);
  gl.uniform4f(u.uStoneSheen, STONE.sheen.headOn, STONE.sheen.grazing, p.sheenTop, p.sheenFace);
  gl.uniform4f(u.uStoneGrain, g.cloud, g.cloudAmount, g.fleck, g.fleckAmount);
  gl.uniform2f(u.uStoneFine, g.fine, g.fineAmount);
  gl.uniform4f(u.uStoneWeather, STONE.edge, STONE.runs, STONE.lichen.size, STONE.lichen.cover);
  gl.uniform2f(u.uStoneLichen, STONE.lichen.pale, STONE.lichen.dark);
  gl.uniform4f(u.uStoneWater, STONE.stain.height, STONE.stain.darkening, STONE.wet.height, STONE.wet.darkening);
  gl.uniform4f(u.uStoneWear, STONE.wear.polish, STONE.wear.chip, STONE.wear.chipTone, STONE.wear.pits);
  gl.uniform1f(u.uStoneUnder, STONE.under);
  gl.uniform2f(u.uStoneMeniscus, STONE.meniscus.height, STONE.meniscus.sky);
  gl.uniform1f(u.uSubjectDepth, DEPTH.subject);
}

/* ── stage/shaders/backdrop.ts ────────────────────────────────────────── */

export const PLATE_UNIFORMS = ["uPlate", "uBackdropDepth", "uPlateGeo", "uPlateAxis", "uBackdropNearest"] as const;

/** The photograph and its depth, and their place in the camera. */
export function setPlateUniforms(gl: WebGL2RenderingContext, u: Uniforms, camera: CameraFrame, plates: Plates): void {
  bindTexture(gl, u.uPlate, UNITS.plate, plates.backdrop);
  bindTexture(gl, u.uBackdropDepth, UNITS.depth, plates.depth);
  const [plateW, plateH] = BACKDROP.plate;
  gl.uniform4f(
    u.uPlateGeo,
    BACKDROP.texelsPerTan / plateW,
    BACKDROP.texelsPerTan / plateH,
    BACKDROP.horizonRow / plateH,
    BACKDROP.depthNear,
  );
  /* A frame too wide for the lens to close in on (camera.ts maxCloseIn)
     reaches past the photograph's sides: there its edges fade into the
     fog over a width that grows with how far past them it looks, so the
     forest recedes into the fog instead of stopping at a line. */
  const past = (0.5 * camera.view[0]) / camera.focal + CAMERA.edge.lean - BACKDROP.reach;
  const fade = Math.min(CAMERA.edge.widest, CAMERA.edge.fade + CAMERA.edge.grow * Math.max(0, past));
  gl.uniform2f(u.uPlateAxis, BACKDROP.centerColumn / plateW, (fade * BACKDROP.texelsPerTan) / plateW);
  gl.uniform1f(u.uBackdropNearest, BACKDROP.nearest);
}

/* ── stage/shaders/film.ts: the film backwards, for the photograph ────── */

export const DEVELOP_UNIFORMS = ["uExposure", "uUnprint"] as const;

export function setDevelopUniforms(gl: WebGL2RenderingContext, u: Uniforms, f: SetFrame): void {
  gl.uniform1f(u.uExposure, f.params.exposure);
  gl.uniform1fv(u.uUnprint, f.unprint);
}
