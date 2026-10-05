/**
 * ─── Stone · its passes ───
 *
 * The stone is traced by two small programs of its own (shaders/slots.ts),
 * before the scene pass, which reads what they drew:
 *
 *   SEEN    the stone as the camera sees it: ten slots — the light of the
 *           pixel's centre and its four edge rays, then their normals —
 *           over a rect round where the stone stands above the water
 *   MIRROR  the stone as the lake mirrors it: four slots — the reflection's
 *           cone of rays — over a rect of the near water, round where the
 *           stone's reflection can fall
 *
 * Each rect follows the camera every frame (its lean moves the stone a few
 * pixels); its targets grow when the rect does, and are kept otherwise. A
 * pixel outside its rect is one the stone cannot reach, and the scene reads
 * no hit there — so the rects are drawn generously, never tight.
 */

import { CAMERA_UNIFORMS, CAMERA, setCameraUniforms, type CameraFrame } from "../stage/camera";
import { bindTexture, createProgram, createTarget, deleteTarget, exactTargetFormat, type Program, type Target } from "../stage/gl";
import { DEPTH } from "../stage/layers";
import {
  FOG_UNIFORMS,
  STONE_UNIFORMS,
  UNITS,
  WATER_UNIFORMS,
  setFogUniforms,
  setStoneUniforms,
  setWaterUniforms,
  type SetFrame,
  type Uniforms,
} from "../stage/uniforms";
import { STONE } from "./optics";
import { STONE_MIRROR_FRAG, STONE_VIEW_FRAG } from "./shaders/slots";

/** The uniforms the scene pass declares to read the slots (SLOTS_GLSL). */
export const SLOT_UNIFORMS = [
  "uStoneSeen", "uStoneMirror", "uStoneSeenRect", "uStoneSeenStep", "uStoneMirrorRect", "uStoneMirrorStep",
] as const;

/**
 * HOW FAR ROUND THE STONE ITS RECTS REACH (px of the scene's target).
 *
 * SEEN: the stone's own outline, and the reach of its edge rays — a pixel
 * past the outline at most (shaders/slots.ts: they fall within ±0.375 of a
 * pixel's steps); four, to spare.
 *
 * MIRROR: the stone's reflection is pushed sideways by the water's tilt
 * across, times `WATER.waver`, times the sine of the grazing angle: from
 * the near water, a few tenths of a metre at the stone, about half its
 * width. `mirrorReach` is the share of its reflection's width added either
 * side, PER UNIT OF WAVER — at the designed 4, its whole width either side,
 * twice what the lake reaches — and grows with the waver slider. Up and
 * down it spans all the water nearer than the stone's far corner, down to
 * the frame's foot: there a reflection can be stretched as far as the
 * ripples smear it.
 */
const BOUNDS = {
  seenPx: 4,
  mirrorReach: 0.25,
  mirrorPx: 8,
} as const;

/* The plan's four corners on the water (x, z): a diamond (optics.ts). */
const PLAN_CORNERS = [
  [STONE.center[0] - STONE.plan.across, STONE.center[1]],
  [STONE.center[0] + STONE.plan.across, STONE.center[1]],
  [STONE.center[0], STONE.center[1] - STONE.plan.along],
  [STONE.center[0], STONE.center[1] + STONE.plan.along],
] as const;

/* Water nearer than this (m) can see the stone (shaders/surface.ts
   beforeStone). */
const BEFORE_STONE = Math.max(DEPTH.subject, STONE.center[1] + STONE.plan.along);

type Box = [number, number, number, number];

interface Slots {
  readonly program: Program;
  readonly count: number;
  target: Target | null;
  /** One slot's rect in the scene's target: corner and size (px). */
  readonly rect: [number, number, number, number];
  /** From one slot to the next in the target (px). */
  readonly step: [number, number];
}

export class StonePass {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly seen: Slots;
  private readonly mirror: Slots;
  private readonly box: Box = [0, 0, 0, 0];

  constructor(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject) {
    this.gl = gl;
    this.vao = vao;
    const names = [...CAMERA_UNIFORMS, ...FOG_UNIFORMS, ...STONE_UNIFORMS, ...WATER_UNIFORMS, "uSlot"];
    const slots = (fragment: string, count: number): Slots => ({
      program: createProgram(gl, fragment, names),
      count,
      target: null,
      rect: [0, 0, 0, 0],
      step: [0, 0],
    });
    /* SEEN: five rays' light, then the same five rays' normals. */
    this.seen = slots(STONE_VIEW_FRAG, 10);
    this.mirror = slots(STONE_MIRROR_FRAG, 4);
  }

  /** The scene's target was rebuilt: the slots are placed afresh. */
  resize(): void {
    for (const slots of [this.seen, this.mirror]) {
      deleteTarget(this.gl, slots.target);
      slots.target = null;
    }
  }

  /** Places both rects for this frame's camera and draws their slots. */
  render(f: SetFrame): void {
    this.place(this.seen, seenBounds(this.box, f), f);
    this.draw(this.seen, f);
    this.place(this.mirror, mirrorBounds(this.box, f), f);
    this.draw(this.mirror, f);
  }

  /** Hands the scene pass the slots (texture units from UNITS.stone). */
  bindScene(u: Uniforms): void {
    const gl = this.gl;
    const { seen, mirror } = this;
    if (seen.target) bindTexture(gl, u.uStoneSeen, UNITS.stone, seen.target.tex);
    if (mirror.target) bindTexture(gl, u.uStoneMirror, UNITS.stone + 1, mirror.target.tex);
    gl.uniform4f(u.uStoneSeenRect, ...seen.rect);
    gl.uniform2f(u.uStoneSeenStep, ...seen.step);
    gl.uniform4f(u.uStoneMirrorRect, ...mirror.rect);
    gl.uniform2f(u.uStoneMirrorStep, ...mirror.step);
  }

  dispose(): void {
    this.resize();
    this.gl.deleteProgram(this.seen.program.handle);
    this.gl.deleteProgram(this.mirror.program.handle);
  }

  /**
   * Fits the slots' rect round `box` (px of the scene's target, clipped to
   * it). The corner snaps to even pixels, so the slots' 2×2 quads are the
   * scene's (stage/shaders/pixel.ts). The targets grow with headroom when
   * the rect outgrows them, and are kept otherwise; the rect is then the
   * targets' size, reaching a little further up and right than it must.
   */
  private place(slots: Slots, box: Box, f: SetFrame): void {
    const even = (v: number) => 2 * Math.floor(v / 2);
    const x0 = even(Math.max(0, box[0]));
    const y0 = even(Math.max(0, box[1]));
    const w = Math.max(0, even(Math.min(f.width, box[2]) - x0 + 1.999));
    const h = Math.max(0, even(Math.min(f.height, box[3]) - y0 + 1.999));
    const rect = slots.rect;
    /* Off the frame (or not a number): nothing to draw, nothing to read. */
    if (!(w > 0 && h > 0)) {
      rect.fill(0);
      return;
    }
    let size = this.slotSize(slots);
    if (w > size[0] || h > size[1]) {
      size = [even(w * 1.15 + 1.999), even(h * 1.15 + 1.999)];
      if (!this.allocate(slots, size[0], size[1])) {
        rect.fill(0);
        return;
      }
    }
    rect[0] = x0;
    rect[1] = y0;
    rect[2] = size[0];
    rect[3] = size[1];
  }

  /** One slot's size in the current targets (0 × 0 if none). */
  private slotSize(slots: Slots): [number, number] {
    const t = slots.target;
    if (!t) return [0, 0];
    return slots.step[0] > 0 ? [slots.step[0], t.height] : [t.width, slots.step[1]];
  }

  /**
   * The slots stacked along whichever axis makes the shorter stack: a wide
   * rect one above another, a tall one (a phone's near water) side by side —
   * so neither side outgrows the GPU's largest texture.
   */
  private allocate(slots: Slots, w: number, h: number): boolean {
    const gl = this.gl;
    deleteTarget(gl, slots.target);
    slots.target = null;
    const across = h > w;
    const width = across ? w * slots.count : w;
    const height = across ? h : h * slots.count;
    if (Math.max(width, height) > (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)) return false;
    slots.target = createTarget(gl, width, height, exactTargetFormat(gl), gl.NEAREST);
    slots.step[0] = across ? w : 0;
    slots.step[1] = across ? 0 : h;
    return true;
  }

  private draw(slots: Slots, f: SetFrame): void {
    const target = slots.target;
    const rect = slots.rect;
    if (!target || rect[2] === 0) return;
    const gl = this.gl;
    const u = slots.program.uniforms;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.useProgram(slots.program.handle);
    setCameraUniforms(gl, u, f.camera);
    setFogUniforms(gl, u, f);
    setStoneUniforms(gl, u, f);
    setWaterUniforms(gl, u, f);
    /* Each slot through the scene's own viewport, shifted so the rect lands
       on the slot, and scissored to it: the scene's own pixels, its own vUv
       and its own 2×2 quads (the shift is even: place). */
    gl.enable(gl.SCISSOR_TEST);
    for (let k = 0; k < slots.count; k += 1) {
      const ox = k * slots.step[0];
      const oy = k * slots.step[1];
      gl.viewport(ox - rect[0], oy - rect[1], f.width, f.height);
      gl.scissor(ox, oy, rect[2], rect[3]);
      gl.uniform1f(u.uSlot, k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
  }
}

/* ── Where the stone can show ─────────────────────────────────────────── */

/** A world point → the scene's target (px, y up), through this frame's
 *  camera (shaders/camera.ts projectUv); false if behind it. */
function project(out: [number, number], camera: CameraFrame, x: number, y: number, z: number, f: SetFrame): boolean {
  const r = camera.rotation;
  const p = camera.position;
  const vx = x - p[0];
  const vy = y - p[1];
  const vz = z - p[2];
  /* Camera space: the rotation's columns are its right, up and forward. */
  const cx = vx * r[0] + vy * r[1] + vz * r[2];
  const cy = vx * r[3] + vy * r[4] + vz * r[5];
  const cz = vx * r[6] + vy * r[7] + vz * r[8];
  if (cz <= 1e-3) return false;
  out[0] = ((cx / cz) * (camera.focal / camera.view[0]) + 0.5) * f.width;
  out[1] = ((cy / cz) * (camera.focal / camera.view[1]) + 1 - CAMERA.horizon) * f.height;
  return true;
}

const at: [number, number] = [0, 0];

/** The block's corners at heights `y0`, `y1` → their bounding box (px). */
function cornersBox(box: Box, f: SetFrame, y0: number, y1: number): Box {
  box[0] = Infinity;
  box[1] = Infinity;
  box[2] = -Infinity;
  box[3] = -Infinity;
  for (const [x, z] of PLAN_CORNERS) {
    for (const y of [y0, y1]) {
      if (!project(at, f.camera, x, y, z, f)) continue;
      box[0] = Math.min(box[0], at[0]);
      box[1] = Math.min(box[1], at[1]);
      box[2] = Math.max(box[2], at[0]);
      box[3] = Math.max(box[3], at[1]);
    }
  }
  return box;
}

/** SEEN: the block above the water, and a few pixels round it. */
function seenBounds(box: Box, f: SetFrame): Box {
  cornersBox(box, f, 0, STONE.top);
  const pad = BOUNDS.seenPx;
  box[0] -= pad;
  box[1] -= pad;
  box[2] += pad;
  box[3] += pad;
  return box;
}

/** MIRROR: the block mirrored under the water, widened by how far the
 *  lake can push its reflection sideways; from the frame's foot up to the
 *  water level with the stone's far corner. */
function mirrorBounds(box: Box, f: SetFrame): Box {
  cornersBox(box, f, 0, -STONE.top);
  const widen = (box[2] - box[0]) * BOUNDS.mirrorReach * Math.max(1, f.params.waver) + BOUNDS.mirrorPx;
  box[0] -= widen;
  box[2] += widen;
  /* The far corner's waterline, across all the frame's width: the camera
     only leans, so it is all but level. */
  let top = -Infinity;
  const half = (0.5 * f.camera.view[0] * BEFORE_STONE) / f.camera.focal;
  for (let i = 0; i <= 8; i += 1) {
    if (project(at, f.camera, STONE.center[0] + half * (i / 4 - 1) * 1.2, 0, BEFORE_STONE, f)) top = Math.max(top, at[1]);
  }
  box[1] = 0;
  box[3] = top + BOUNDS.mirrorPx;
  return box;
}
