/**
 * ─── Atmosphere · the air, read back ───
 *
 * The simulated air lives on the GPU. What stands in it and answers it —
 * the plant on the stone (bloom/), swaying and shedding pollen — is posed
 * on the CPU, so a small patch of the air round it is read back each frame:
 * its velocity (cells/s) and churn, cell by cell.
 *
 * NEVER WAITING FOR IT. A plain readPixels makes the page wait for the GPU
 * to finish everything queued before it. Here the read goes into a buffer on
 * the GPU (a pixel-pack buffer) with a fence after it, and is collected on a
 * later frame, once the fence says the GPU is past it — a frame or two late,
 * which nothing that sways can show. Until a first patch arrives, the air
 * reads as still.
 */

import type { Target } from "../stage/gl";

export class AirSampler {
  private readonly gl: WebGL2RenderingContext;
  private readonly buffer: WebGLBuffer;
  private bytes = 0;
  private sync: WebGLSync | null = null;
  private asked: [number, number, number, number] = [0, 0, 0, 0];
  /* The last patch that arrived: its rect in cells, and rgba a cell. */
  private rect: [number, number, number, number] = [0, 0, 0, 0];
  private data = new Float32Array(0);
  private staging = new Float32Array(0);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("stage: no pixel buffer");
    this.buffer = buffer;
  }

  /** A patch has arrived: `at` has something to say. */
  get ready(): boolean {
    return this.data.length > 0;
  }

  /**
   * Collects the patch asked for earlier if the GPU is done with it, then
   * asks for the cells `x, y` (lower-left) to `x + w, y + h` of `field` — if
   * nothing is still on its way.
   */
  update(field: Target, x: number, y: number, w: number, h: number): void {
    this.collect();
    if (this.sync) return;
    const gl = this.gl;
    const x0 = Math.max(0, Math.min(field.width - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(field.height - 1, Math.floor(y)));
    const pw = Math.max(1, Math.min(field.width - x0, Math.ceil(w)));
    const ph = Math.max(1, Math.min(field.height - y0, Math.ceil(h)));
    const bytes = pw * ph * 16;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffer);
    if (bytes !== this.bytes) {
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
      this.bytes = bytes;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, field.fbo);
    gl.readPixels(x0, y0, pw, ph, gl.RGBA, gl.FLOAT, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.asked = [x0, y0, pw, ph];
  }

  private collect(): void {
    const gl = this.gl;
    const sync = this.sync;
    if (!sync) return;
    const status = gl.clientWaitSync(sync, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED || status === gl.WAIT_FAILED) return;
    const count = this.asked[2] * this.asked[3] * 4;
    if (this.staging.length !== count) this.staging = new Float32Array(count);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.staging);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteSync(sync);
    this.sync = null;
    /* Swapped, not copied: the old patch's array becomes the next staging. */
    const read = this.staging;
    this.staging = this.data.length === count ? this.data : new Float32Array(count);
    this.data = read;
    this.rect = [...this.asked];
  }

  /**
   * The air at a cell position (texel centres at +0.5), bilinear: velocity
   * x and y (cells/s, y up) and churn (the field's fourth channel). Clamped
   * to the patch's edge; still air before any patch.
   */
  at(cx: number, cy: number, out: [number, number, number]): [number, number, number] {
    const [x0, y0, w, h] = this.rect;
    const d = this.data;
    if (d.length === 0) {
      out[0] = out[1] = out[2] = 0;
      return out;
    }
    const fx = Math.min(Math.max(cx - 0.5 - x0, 0), w - 1);
    const fy = Math.min(Math.max(cy - 0.5 - y0, 0), h - 1);
    const ix = Math.min(Math.floor(fx), w - 2 < 0 ? 0 : w - 2);
    const iy = Math.min(Math.floor(fy), h - 2 < 0 ? 0 : h - 2);
    const tx = w > 1 ? fx - ix : 0;
    const ty = h > 1 ? fy - iy : 0;
    const i00 = (iy * w + ix) * 4;
    const i10 = i00 + (w > 1 ? 4 : 0);
    const i01 = i00 + (h > 1 ? w * 4 : 0);
    const i11 = i01 + (w > 1 ? 4 : 0);
    for (const [k, c] of [[0, 0], [1, 1], [2, 3]] as const) {
      const a = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * tx;
      const b = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * tx;
      out[k] = a + (b - a) * ty;
    }
    return out;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.sync) gl.deleteSync(this.sync);
    gl.deleteBuffer(this.buffer);
    this.sync = null;
  }
}
