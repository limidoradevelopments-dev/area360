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

import { MIST_MOTION } from "../atmosphere/motion";
import { AERIAL, EXTINCTION, MIST, MIST_SEEN, OVER_PHOTO, SHEETS, SOFT_BLACK } from "../atmosphere/optics";
import { STONE } from "../stone/optics";
import { GRAVITY, LAPS, TENSION, WATER_MOTION, WAVES } from "../water/motion";
import { WATER, WATER_R0, WATER_UNDER } from "../water/optics";
import { CAMERA, treesShown, type CameraFrame } from "./camera";
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
  /** Seconds of the low mist's drift (slowed under reduced motion, as the
   *  air's is). */
  mistTime: number;
  /** The steam's patches (atmosphere/wisps.ts); none while the low mist is
   *  off (MIST.on). */
  wisps: WebGLTexture | null;
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
 * over another's. (7 is free.)
 */
export const UNITS = {
  sheetDensity: 0,
  sheetLight: 1,
  plate: 2,
  depth: 4,
  /** bloom/bloom.ts bindScene: two, from here; bindFilm: three (5–7). */
  bloom: 5,
  /** stone/stone.ts bindScene: two, from here. */
  stone: 8,
  lake: 10,
  /** The low mist's veil (atmosphere/shaders/mist.ts). */
  mist: 11,
  /** The wisps drifting through it (atmosphere/wisps.ts). */
  wisps: 3,
} as const;

/* The waves and the lapping, packed once; only their phases change. */
const WAVE_DATA = new Float32Array(WAVES.flat());
const LAP_DATA = new Float32Array(LAPS.flat());

/* Each wave's angular speed (rad/s), by the dispersion relation of real
   water (water/motion.ts), ω² = g·k + (σ/ρ)·k³: once, here. Every pass that
   draws the lake worked it out at every pixel of every frame. */
const TAU = 2 * Math.PI;
const dispersion = (k: number) => Math.sqrt(GRAVITY * k + TENSION * k * k * k);
const WAVE_OMEGA = WAVES.map(([kx, kz]) => dispersion(Math.hypot(kx, kz)));
const LAP_OMEGA = LAPS.map(([k]) => dispersion(k));
let phasesAt = Number.NaN;

/**
 * The waves' and the lapping's phases at the lake's time `time` (s), into
 * their packed data — once a frame, however many passes ask. Taken round
 * the circle in double precision, so a long visit keeps them exact (the
 * GPU's single precision lost ~0.002 rad of a ripple's phase per ten
 * minutes).
 */
function phasesNow(time: number): void {
  if (time === phasesAt) return;
  phasesAt = time;
  for (let i = 0; i < WAVES.length; i += 1) WAVE_DATA[i * 4 + 3] = (WAVES[i][3] - WAVE_OMEGA[i] * time) % TAU;
  for (let i = 0; i < LAPS.length; i += 1) LAP_DATA[i * 3 + 2] = (LAPS[i][2] - LAP_OMEGA[i] * time) % TAU;
}

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
  gl.uniform4f(u.uSoftBlack, p.softBlack, SOFT_BLACK.from, SOFT_BLACK.to, p.clarity);
  gl.uniform4f(u.uMistSeen, MIST_SEEN.veil, p.mistSeen, ...MIST_SEEN.water);
}

/* ── atmosphere/shaders/mist.ts: the low mist ───────────────────────────── */

export const MIST_UNIFORMS = [
  "uMistVeil", "uMistRect", "uMistLook", "uMistMotion", "uMistWisps", "uMistDrift", "uMistWisp", "uMistStone",
  "uMistVolume",
] as const;

/* The veil's texels per tan across: its detail, against the screen's. */
const MIST_TEXELS_PER_TAN = MIST.size[0] / (MIST.tan[2] - MIST.tan[0]);

export function setMistUniforms(gl: WebGL2RenderingContext, u: Uniforms, f: SetFrame): void {
  /* Off, the scene compiled without it (atmosphere/shaders/mist.ts). */
  if (!MIST.on) return;
  const p = f.params;
  const veil = f.plates.mist;
  const [left, top, right, bottom] = MIST.tan;
  gl.uniform4f(u.uMistRect, left, top, 1 / (right - left), 1 / (top - bottom));
  gl.uniform4f(u.uMistLook, veil ? MIST.amount * p.mistAmount : 0, MIST.tauMax, MIST.edge, p.mistLight);
  /* Read at the level whose texels are this target's pixels: on a small
     screen the veil's finer wisps would shimmer, read finer. */
  const pixelsPerTan = f.camera.focal * (f.width / f.camera.view[0]);
  const level = Math.max(0, Math.log2(MIST_TEXELS_PER_TAN / pixelsPerTan));
  gl.uniform3f(u.uMistMotion, MIST_MOTION.breathe * p.mistMotion, MIST_MOTION.near, level);
  if (veil) bindTexture(gl, u.uMistVeil, UNITS.mist, veil);
  /* Each layer's drift, in tiles, kept within one (they repeat): along the
     shore and up, the same wind at both depths — the near layer, read at
     its nearer distance, crosses the screen the faster. */
  const w = MIST_MOTION.wisps;
  const far = f.mistTime / w.tile;
  const near = f.mistTime / w.near.tile;
  gl.uniform4f(u.uMistDrift, (w.drift * far) % 1, (-w.rise * far) % 1, (w.drift * near) % 1, (-w.rise * near) % 1);
  gl.uniform3f(u.uMistWisp, w.amount * p.mistMotion, 1 / w.tile, w.near.distance / w.near.tile);
  /* The patches' light moves with them: none when they are held still. */
  const v = MIST.volume;
  const patches = p.mistVolume * Math.min(p.mistMotion, 1);
  gl.uniform4f(u.uMistVolume, v.facing * patches, v.core * patches, v.side * p.mistVolume, v.up * p.mistVolume);
  gl.uniform3f(u.uMistStone, MIST.stone.foot * p.mistStone, MIST.stone.height, MIST.stone.up * p.mistStone);
  if (f.wisps) bindTexture(gl, u.uMistWisps, UNITS.wisps, f.wisps, gl.TEXTURE_2D_ARRAY);
}

/* ── water/shaders/water.ts ───────────────────────────────────────────── */

export const WATER_UNIFORMS = [
  "uWaterBody", "uWaterR0", "uWaves", "uWaterTime", "uWaterGain", "uCatsPaws", "uWind", "uWaterClarity",
  "uSubjectWaver", "uMinElevation", "uLaps", "uLapFade", "uWaterSmear",
] as const;

export function setWaterUniforms(gl: WebGL2RenderingContext, u: Uniforms, f: SetFrame): void {
  const p = f.params;
  gl.uniform3fv(u.uWaterBody, f.colors.water);
  gl.uniform1f(u.uWaterR0, WATER_R0);
  phasesNow(f.waterTime);
  gl.uniform4fv(u.uWaves, WAVE_DATA);
  gl.uniform1f(u.uWaterTime, f.waterTime);
  /* The long exposure: what it averages is not drawn, but kept as the
     spread of every reflection — each band's slope variance, half on each
     axis (water/motion.ts exposure). */
  const held = 1 - p.longExposure;
  gl.uniform3f(u.uWaterGain, p.swell, p.undulation * held, p.ripples * held);
  const smear = (band: number, gain: number) => 0.5 * (p.longExposure * p.smear * gain * band) ** 2;
  gl.uniform2f(u.uWaterSmear, smear(WATER_MOTION.undulation.slope, p.undulation), smear(WATER_MOTION.ripples.slope, p.ripples));
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

export const PLATE_UNIFORMS = ["uPlate", "uBackdropDepth", "uPlateGeo", "uPlateAxis", "uBackdropNearest", "uPlateTrees"] as const;

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
  /* The frame's farther side from the lens's axis (a phone's crop shifts it). */
  const past = (Math.max(camera.center[0], 1 - camera.center[0]) * camera.view[0]) / camera.focal + CAMERA.edge.lean - BACKDROP.reach;
  const fade = Math.min(CAMERA.edge.widest, CAMERA.edge.fade + CAMERA.edge.grow * Math.max(0, past));
  gl.uniform2f(u.uPlateAxis, BACKDROP.centerColumn / plateW, (fade * BACKDROP.texelsPerTan) / plateW);
  gl.uniform1f(u.uBackdropNearest, BACKDROP.nearest);
  /* On a phone, no trees: the photograph's own sky and fog, read in the
     open channel on the lens's axis (shaders/backdrop.ts plateLight). */
  gl.uniform2f(u.uPlateTrees, treesShown(camera.view[0], camera.view[1]) ? 1 : 0, BACKDROP.centerColumn / plateW);
}

/* ── stage/shaders/film.ts: the film backwards, for the photograph ────── */

export const DEVELOP_UNIFORMS = ["uExposure", "uUnprint"] as const;

export function setDevelopUniforms(gl: WebGL2RenderingContext, u: Uniforms, f: SetFrame): void {
  gl.uniform1f(u.uExposure, f.params.exposure);
  gl.uniform1fv(u.uUnprint, f.unprint);
}
