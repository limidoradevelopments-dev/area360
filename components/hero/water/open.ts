/**
 * ─── Water · the open water, its pass ───
 *
 * Draws the water's light as the camera sees it (shaders/open.ts) into a
 * target the size of the scene's, after the stone, the plant and the
 * photograph in the lake (it reads all three) and before the scene pass,
 * which reads it back at its own pixel and burns it in. Scissored to the
 * rows under the horizon, as the photograph's pass is (lake.ts).
 */

import { CAMERA_UNIFORMS, setCameraUniforms } from "../stage/camera";
import { bindTexture, createProgram, createTarget, deleteTarget, discardBound, exactTargetFormat, type Program, type Target } from "../stage/gl";
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
import type { BloomPass } from "../bloom/bloom";
import { SLOT_UNIFORMS, type StonePass } from "../stone/stone";
import { HORIZON_PAD, belowHorizon, type LakePass } from "./lake";
import { OPEN_WATER_FRAG } from "./shaders/open";

export class OpenWaterPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly program: Program;
  private target: Target | null = null;

  constructor(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject) {
    this.gl = gl;
    this.vao = vao;
    this.program = createProgram(gl, OPEN_WATER_FRAG, [
      ...CAMERA_UNIFORMS, ...FOG_UNIFORMS, ...SHEET_UNIFORMS, ...WATER_UNIFORMS,
      ...STONE_UNIFORMS, ...PLATE_UNIFORMS, ...DEVELOP_UNIFORMS, ...SLOT_UNIFORMS,
      "uLakeBurn", "uLakePhoto", "uBloomMirror", "uBloomMirrorRect", "uBloomMirrorFill", "uBloomPlane",
    ]);
  }

  /** The scene's target, px: this one matches it pixel for pixel. */
  resize(width: number, height: number): void {
    const t = this.target;
    if (t && t.width === width && t.height === height) return;
    deleteTarget(this.gl, t);
    this.target = createTarget(this.gl, width, height, exactTargetFormat(this.gl), this.gl.NEAREST);
  }

  /** `lakeBurn`: the lake's burn and harder paper (the scene's uLakeBurn);
   *  what the water mirrors, drawn just before: the plant, the stone, the
   *  shores. */
  render(f: SetFrame, lakeBurn: readonly [number, number, number, number], plant: BloomPass, stone: StonePass, shores: LakePass): void {
    const target = this.target;
    if (!target) return;
    const rows = Math.min(target.height, Math.ceil(belowHorizon(f)) + HORIZON_PAD);
    if (rows <= 0) return;
    const gl = this.gl;
    const u = this.program.uniforms;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    /* Read only on the water, below the rows drawn. */
    discardBound(gl);
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
    gl.uniform4f(u.uLakeBurn, ...lakeBurn);
    plant.bindScene(u, UNITS.bloom);
    stone.bindScene(u);
    shores.bindScene(u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  /** Hands the scene pass the open water (UNITS.water). */
  bindScene(u: Uniforms): void {
    if (this.target) bindTexture(this.gl, u.uWaterOpen, UNITS.water, this.target.tex);
  }

  dispose(): void {
    deleteTarget(this.gl, this.target);
    this.target = null;
    this.gl.deleteProgram(this.program.handle);
  }
}
