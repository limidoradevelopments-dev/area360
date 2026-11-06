/**
 * ─── Water · the hand's ripples, their pass ───
 *
 * Draws the hand's touches on the water (water/touch.ts, shaders/
 * ripples.ts) as their slope at each of the scene's pixels under the
 * horizon, into a two-channel target the size of the scene's, before the
 * lake's programs, which read it back at their own pixel (shaders/
 * surface.ts lakeSurface).
 *
 * ONLY WHILE A RING LIVES, ONLY WHERE. With none, nothing is drawn and the
 * lake's programs read nothing; with some, only the rect their box on the
 * water covers is drawn, and the lake reads only inside it (`area`:
 * outside it the target holds an older frame's). The target is made the
 * first time a touch falls — a visit that never moves a mouse over the
 * water never holds it — and kept, at the scene's size, for the visit.
 */

import { CAMERA_UNIFORMS, setCameraUniforms } from "../stage/camera";
import { createProgram, createTarget, deleteTarget, type Program, type Target } from "../stage/gl";
import type { SetFrame } from "../stage/uniforms";
import { STONE } from "../stone/optics";
import { belowHorizon, HORIZON_PAD } from "./lake";
import { HAND_RIPPLES } from "./motion";
import { RIPPLES_FRAG } from "./shaders/ripples";
import { HAND_LOOK } from "./touch";

const LOOK = new Float32Array(HAND_LOOK);

export class RipplePass {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly program: Program;
  private target: Target | null = null;
  private width = 0;
  private height = 0;
  /** Where this frame's rings were drawn (uv: x0, y0, x1, y1). */
  readonly area = new Float32Array(4);

  constructor(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject) {
    this.gl = gl;
    this.vao = vao;
    this.program = createProgram(gl, RIPPLES_FRAG, [
      ...CAMERA_UNIFORMS, "uStonePlan", "uStoneSpan", "uHandWaves", "uHandCount", "uHandBox", "uHandLook", "uHand",
    ]);
  }

  /** The scene's target, px: this one matches it pixel for pixel (made
   *  when it is first drawn). */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    deleteTarget(this.gl, this.target);
    this.target = null;
  }

  /** Draws the live rings, and returns their picture — or null when none
   *  lives, and the lake reads nothing. */
  render(f: SetFrame): WebGLTexture | null {
    const hand = f.ripples;
    if (!hand || hand.count === 0 || this.width === 0) return null;
    const gl = this.gl;
    this.target ??= createTarget(gl, this.width, this.height, gl.RG16F, gl.NEAREST);
    const target = this.target;
    /* Only where the rings can show: their box on the water, as the
       camera sees it, under the horizon. */
    const rect = this.onScreen(f, hand.box, target);
    if (!rect) return null;
    const u = this.program.uniforms;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.width, target.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rect[0], rect[1], rect[2], rect[3]);
    const area = this.area;
    area[0] = rect[0] / target.width;
    area[1] = rect[1] / target.height;
    area[2] = (rect[0] + rect[2]) / target.width;
    area[3] = (rect[1] + rect[3]) / target.height;
    gl.useProgram(this.program.handle);
    setCameraUniforms(gl, u, f.camera);
    gl.uniform4f(u.uStonePlan, STONE.center[0], STONE.center[1], STONE.plan.across, STONE.plan.along);
    gl.uniform2f(u.uStoneSpan, -STONE.depth, STONE.top);
    gl.uniform1i(u.uHandCount, hand.count);
    gl.uniform4fv(u.uHandWaves, hand.waves, 0, hand.count * 4);
    gl.uniform4fv(u.uHandBox, hand.box);
    gl.uniform4fv(u.uHandLook, LOOK);
    gl.uniform2f(u.uHand, HAND_RIPPLES.soft, f.params.touch);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    return target.tex;
  }

  /* The rect (px: x, y from the bottom, width, height) of the target the
     box on the water (x, z least, most) covers, as the camera sees it and
     under the horizon; null if none of it shows. */
  private readonly rect: [number, number, number, number] = [0, 0, 0, 0];

  private onScreen(f: SetFrame, box: Float32Array, target: Target): [number, number, number, number] | null {
    const { rotation: r, view, focal, center, position: p } = f.camera;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < 4; i += 1) {
      const wx = (i & 1 ? box[2] : box[0]) - p[0];
      const wy = -p[1];
      /* Never behind the lens: the box's near edge is held in front of it. */
      const wz = Math.max(i & 2 ? box[3] : box[1], p[2] + 0.5) - p[2];
      /* Camera space: the rotation's transpose (column-major). */
      const cx = r[0] * wx + r[1] * wy + r[2] * wz;
      const cy = r[3] * wx + r[4] * wy + r[5] * wz;
      const cz = r[6] * wx + r[7] * wy + r[8] * wz;
      const u = ((cx / cz) * focal) / view[0] + center[0];
      const v = ((cy / cz) * focal) / view[1] + center[1];
      x0 = Math.min(x0, u);
      x1 = Math.max(x1, u);
      y0 = Math.min(y0, v);
      y1 = Math.max(y1, v);
    }
    /* A pixel's margin: the edge rows' footprints read their neighbours. */
    const left = Math.max(0, Math.floor(x0 * target.width) - 2);
    const right = Math.min(target.width, Math.ceil(x1 * target.width) + 2);
    const bottom = Math.max(0, Math.floor(y0 * target.height) - 2);
    const top = Math.min(target.height, Math.ceil(y1 * target.height) + 2, Math.ceil(belowHorizon(f)) + HORIZON_PAD);
    if (right <= left || top <= bottom) return null;
    const rect = this.rect;
    rect[0] = left;
    rect[1] = bottom;
    rect[2] = right - left;
    rect[3] = top - bottom;
    return rect;
  }

  dispose(): void {
    deleteTarget(this.gl, this.target);
    this.target = null;
    this.gl.deleteProgram(this.program.handle);
  }
}
