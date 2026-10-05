/**
 * ─── Water · the photograph in the lake, its pass ───
 *
 * Draws the shores as the lake reflects them (shaders/lake.ts) into a
 * target the size of the scene's, before the scene pass, which reads it
 * back at its own pixel. Scissored to the rows under the horizon: above it
 * there is no water to reflect anything.
 */

import { CAMERA, CAMERA_UNIFORMS, setCameraUniforms } from "../stage/camera";
import { bindTexture, createProgram, createTarget, deleteTarget, exactTargetFormat, type Program, type Target } from "../stage/gl";
import {
  DEVELOP_UNIFORMS,
  FOG_UNIFORMS,
  PLATE_UNIFORMS,
  SHEET_UNIFORMS,
  STONE_UNIFORMS,
  UNITS,
  WATER_UNIFORMS,
  setDevelopUniforms,
  setFogUniforms,
  setPlateUniforms,
  setSheetUniforms,
  setStoneUniforms,
  setWaterUniforms,
  type SetFrame,
  type Uniforms,
} from "../stage/uniforms";
import { LAKE_FRAG } from "./shaders/lake";

/* Rows past the horizon's, px: the scene's own test of which pixels show
   water must never reach a row this pass left undrawn. */
const HORIZON_PAD = 2;

export class LakePass {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly program: Program;
  private target: Target | null = null;

  constructor(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject) {
    this.gl = gl;
    this.vao = vao;
    this.program = createProgram(gl, LAKE_FRAG, [
      ...CAMERA_UNIFORMS, ...FOG_UNIFORMS, ...SHEET_UNIFORMS, ...WATER_UNIFORMS,
      ...STONE_UNIFORMS, ...PLATE_UNIFORMS, ...DEVELOP_UNIFORMS,
    ]);
  }

  /** The scene's target, px: this one matches it pixel for pixel. */
  resize(width: number, height: number): void {
    const t = this.target;
    if (t && t.width === width && t.height === height) return;
    deleteTarget(this.gl, t);
    this.target = createTarget(this.gl, width, height, exactTargetFormat(this.gl), this.gl.NEAREST);
  }

  render(f: SetFrame): void {
    const target = this.target;
    if (!target) return;
    const rows = Math.min(target.height, Math.ceil(belowHorizon(f)) + HORIZON_PAD);
    if (rows <= 0) return;
    const gl = this.gl;
    const u = this.program.uniforms;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.width, target.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, target.width, rows);
    gl.useProgram(this.program.handle);
    setCameraUniforms(gl, u, f.camera);
    setFogUniforms(gl, u, f);
    setSheetUniforms(gl, u, f);
    setWaterUniforms(gl, u, f);
    setStoneUniforms(gl, u, f);
    setPlateUniforms(gl, u, f.camera, f.plates);
    setDevelopUniforms(gl, u, f);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  /** Hands the scene pass the photograph in the lake (UNITS.lake). */
  bindScene(u: Uniforms): void {
    if (this.target) bindTexture(this.gl, u.uLakePhoto, UNITS.lake, this.target.tex);
  }

  dispose(): void {
    deleteTarget(this.gl, this.target);
    this.target = null;
    this.gl.deleteProgram(this.program.handle);
  }
}

/**
 * The highest row (px of the scene's target, from the bottom) at which a
 * camera ray still points down: where its world y is 0, at the frame's
 * left and right edges (the camera only leans, so the horizon is a line).
 */
function belowHorizon(f: SetFrame): number {
  const { rotation: r, view, focal } = f.camera;
  let row = 0;
  for (const x of [-0.5 * view[0], 0.5 * view[0]]) {
    /* World y of the camera-space ray (x, y, focal): r[1]·x + r[4]·y +
       r[7]·focal (shaders/camera.ts cameraRay; the matrix is column-major). */
    const y = -(r[1] * x + r[7] * focal) / r[4];
    row = Math.max(row, (y / view[1] + 1 - CAMERA.horizon) * f.height);
  }
  return row;
}
