/**
 * ─── Weather · the rain, its pass ───
 *
 * Draws the rain (shaders/rain.ts) over the finished print, after the film
 * pass: each drop's light added to the print value under it, as the
 * reference shows its specks (weather/optics.ts RAIN). Over the grain, which
 * a speck two pixels wide does not miss.
 *
 * Each layer is one instanced draw of the slots that can show: the columns
 * across the frame, the rows from as high as its drops reach (five of its
 * rises over the horizon) to the foot, in the lattice as it stands at this
 * moment of its fall.
 */

import { CAMERA, type CameraFrame } from "../stage/camera";
import { createProgram, type Program } from "../stage/gl";
import { RAIN_MOTION } from "./motion";
import { RAIN } from "./optics";
import { RAIN_FRAG, RAIN_VERT } from "./shaders/rain";

export class RainPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly program: Program;

  constructor(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject) {
    this.gl = gl;
    this.vao = vao;
    this.program = createProgram(gl, RAIN_FRAG, ["uRainFall", "uRainLook", "uRainSeed", "uRain", "uRainGrid", "uRainLife", "uRainHorizon"], RAIN_VERT);
  }

  /**
   * Onto whatever framebuffer is bound (the canvas, after the film):
   * `amount` of the designed rain, at `time` seconds of its clock, through
   * `camera`, over a target `heightPx` device pixels tall. `arrived`: the
   * rain comes in over the visit's first half-minute (RAIN_MOTION.onset);
   * false holds it fully there (reduced motion: a print of rain, still).
   */
  draw(camera: CameraFrame, amount: number, time: number, heightPx: number, arrived = false): void {
    const { delay, over } = RAIN_MOTION.onset;
    const t = arrived ? 1 : Math.min(Math.max((time - delay) / over, 0), 1);
    amount *= t * t * (3 - 2 * t);
    if (amount <= 0) return;
    const gl = this.gl;
    const u = this.program.uniforms;
    const aspect = camera.view[0] / camera.view[1];
    /* The lens, in frame heights per unit of tangent. */
    const focal = camera.focal / camera.view[1];
    /* The horizon in the frame: the lens's axis tilted by the camera (a
       level direction's height in the camera's view). */
    const r = camera.rotation;
    const horizon = CAMERA.horizon - (r[5] / Math.max(r[8], 1e-3)) * focal;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.program.handle);
    gl.uniform4f(u.uRain, amount, time, RAIN_MOTION.slant, 1 / heightPx);
    gl.uniform2f(u.uRainLife, RAIN_MOTION.life[0], RAIN_MOTION.life[1]);
    gl.uniform1f(u.uRainHorizon, horizon);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    RAIN.layers.forEach((layer, i) => {
      const fall = (RAIN_MOTION.fall / layer.distance) * focal;
      const cell = layer.cell;
      /* Where the lattice stands now: carried down by the fall, and across
         by the lean. */
      const down = fall * time;
      const sideways = RAIN_MOTION.slant * down;
      const top = Math.max(horizon - 5 * layer.rise, 0);
      const firstColumn = Math.floor(-sideways / cell) - 1;
      const columns = Math.ceil(aspect / cell) + 3;
      const firstRow = Math.floor((top - down) / cell) - 1;
      const rows = Math.ceil((1 - top) / cell) + 3;
      gl.uniform4f(u.uRainFall, cell, fall, fall * RAIN_MOTION.shutter, layer.width);
      gl.uniform4f(u.uRainLook, layer.cover, layer.lift, layer.rise, layer.under);
      gl.uniform1f(u.uRainSeed, i * 17.31);
      gl.uniform4f(u.uRainGrid, aspect, firstColumn, firstRow, columns);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, columns * rows);
    });
    gl.disable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program.handle);
  }
}
