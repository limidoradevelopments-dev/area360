/**
 * ─── Stage · WebGL2 plumbing ───
 *
 * The least code that runs a stack of fullscreen passes. No three.js: the
 * scene is a handful of 2D passes over textures and a few analytic shapes,
 * and a scene graph would cost ~150KB of script in front of the hero to
 * draw one triangle.
 */

/**
 * One texture behind one framebuffer. ONE: no pass draws into two targets
 * at once. Under Direct3D (every Windows browser) a program is compiled for
 * a single render target; drawn into several, it is compiled again, whole
 * and synchronously, on its first draw, with the GPU process waiting — a
 * first visit lost ~5 s to it (2026-10-04). Several values a pixel are
 * drawn in several draws, or packed (atmosphere/shaders/sheets.ts).
 */
export interface Target {
  readonly tex: WebGLTexture;
  readonly fbo: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

export interface Program {
  readonly handle: WebGLProgram;
  /** Filled once the program has linked (programsLinked). */
  readonly uniforms: Record<string, WebGLUniformLocation | null>;
}

/**
 * Half-float render targets are the whole requirement: the air is advected
 * with bilinear lookups, so its state must be both renderable and
 * FILTERABLE, and RGBA16F is the one float format that is filterable on
 * every WebGL2 device (32F is not, on most phones). Without a colour-buffer
 * extension there is no simulation, and the static paint stays.
 */
export function supportsHalfFloatTargets(gl: WebGL2RenderingContext): boolean {
  return Boolean(
    gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"),
  );
}

/**
 * The format for values one pass hands the next at the same pixel (the
 * stone's slots, the photograph in the lake): 32-bit floats where they can
 * be rendered to (EXT_color_buffer_float, nearly every WebGL2 device), so
 * nothing is rounded on the way and the scene reads exactly what it would
 * have computed. Half floats otherwise: a rounding of 1 in 2000, under a
 * level of the print. Not filterable at 32 bits: read with texelFetch, and
 * made with NEAREST, or the texture is incomplete and reads as black.
 */
export function exactTargetFormat(gl: WebGL2RenderingContext): GLenum {
  return gl.getExtension("EXT_color_buffer_float") ? gl.RGBA32F : gl.RGBA16F;
}

/**
 * The vertex stage for every pass: one oversized triangle from gl_VertexID,
 * no buffers. A quad's diagonal is a seam every pass would shade twice.
 */
export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * COMPILED OFF THE MAIN THREAD. Every program is only started here —
 * compiled and linked with no question asked of it — and finished in one
 * place, programsLinked, once the driver says it is done. Asking a shader
 * or program for its status (or a uniform's location) the moment it is
 * built makes the page wait for the driver: the scene shader alone held
 * the main thread ~1 s on a GTX 1050 Ti (Windows, ANGLE), the set ~1.4 s,
 * with the page frozen and the shore images not yet asked for. With
 * KHR_parallel_shader_compile the browser compiles on its own threads and
 * says when each program is ready; without it, the first question waits,
 * as before. Same source, same shaders: not one pixel changes.
 */
interface Pending {
  readonly program: Program;
  readonly names: readonly string[];
  readonly vs: WebGLShader;
  readonly fs: WebGLShader;
}

const pending = new WeakMap<WebGL2RenderingContext, Pending[]>();

function startShader(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("stage: createShader failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/**
 * Starts a program: a fullscreen pass, unless it brings its own vertex stage
 * (bloom/: the plant is a mesh). Its `uniforms` are empty, and it must not
 * be drawn with, until programsLinked has resolved.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  fragment: string,
  uniformNames: readonly string[],
  vertex: string = FULLSCREEN_VERT,
): Program {
  const handle = gl.createProgram();
  if (!handle) throw new Error("stage: createProgram failed");
  const vs = startShader(gl, gl.VERTEX_SHADER, vertex);
  const fs = startShader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(handle, vs);
  gl.attachShader(handle, fs);
  gl.linkProgram(handle);
  const program: Program = { handle, uniforms: {} };
  const list = pending.get(gl) ?? [];
  list.push({ program, names: uniformNames, vs, fs });
  pending.set(gl, list);
  return program;
}

/** The driver's word that a program is built, without waiting for it. */
const COMPLETION_STATUS_KHR = 0x91b1;
/** How often to ask, ms: about a frame. */
const LINK_POLL_MS = 16;
/**
 * How long to keep asking, ms, before asking the blocking way — only for a
 * driver that never answers. NOT A FEW SECONDS: a first visit on Windows
 * compiles from an empty shader cache, which took the scene 9–31 s
 * (measured 2026-10-04, GTX 1050 Ti; ~1.3 s once cached), and the blocking
 * query freezes the page — scroll, clicks, everything — for whatever is
 * left. With 3 s here the page froze for 8 s on every first visit (27 s
 * before the scene's compile was cut). Asking costs nothing and the still
 * covers the wait.
 */
const LINK_POLL_GIVE_UP_MS = 120_000;

/**
 * Resolves once every program started on `gl` has linked, then checks each
 * and reads its uniforms. Rejects with the driver's log if one failed.
 */
export async function programsLinked(gl: WebGL2RenderingContext): Promise<void> {
  const list = pending.get(gl) ?? [];
  pending.delete(gl);
  if (gl.getExtension("KHR_parallel_shader_compile")) {
    /* Everything started so far goes to the driver now. */
    gl.flush();
    const done = () =>
      gl.isContextLost() || list.every((p) => gl.getProgramParameter(p.program.handle, COMPLETION_STATUS_KHR));
    const giveUp = performance.now() + LINK_POLL_GIVE_UP_MS;
    while (!done() && performance.now() < giveUp) await new Promise((resolve) => setTimeout(resolve, LINK_POLL_MS));
  }
  for (const { program, names, vs, fs } of list) {
    if (!gl.getProgramParameter(program.handle, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(program.handle);
      throw new Error(`stage: shader failed\n${log}`);
    }
    /* Shaders are owned by the program once linked. */
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    for (const name of names) program.uniforms[name] = gl.getUniformLocation(program.handle, name);
  }
}

function allocateTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internalFormat: GLenum,
  filter: GLenum,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("stage: texture allocation failed");
  const { format, type } = describe(gl, internalFormat);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function checkFramebuffer(gl: WebGL2RenderingContext): void {
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
    throw new Error(`stage: framebuffer incomplete (0x${status.toString(16)})`);
  }
}

export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internalFormat: GLenum,
  filter: GLenum,
): Target {
  const tex = allocateTexture(gl, width, height, internalFormat, filter);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("stage: framebuffer allocation failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  checkFramebuffer(gl);
  return { tex, fbo, width, height };
}

/** Zeroes a target. New sim targets must start from rest, not from garbage. */
export function clearTarget(gl: WebGL2RenderingContext, target: Target): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, target.width, target.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function deleteTarget(gl: WebGL2RenderingContext, target: Target | null): void {
  if (!target) return;
  gl.deleteTexture(target.tex);
  gl.deleteFramebuffer(target.fbo);
}

function describe(gl: WebGL2RenderingContext, internalFormat: GLenum) {
  switch (internalFormat) {
    case gl.RGBA32F:
      return { format: gl.RGBA, type: gl.FLOAT };
    case gl.RGBA16F:
      return { format: gl.RGBA, type: gl.HALF_FLOAT };
    case gl.RGBA32UI:
      return { format: gl.RGBA_INTEGER, type: gl.UNSIGNED_INT };
    case gl.R8:
      return { format: gl.RED, type: gl.UNSIGNED_BYTE };
    case gl.RG8:
      return { format: gl.RG, type: gl.UNSIGNED_BYTE };
    default:
      return { format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  }
}

/**
 * The backdrop photograph as one mipmapped R8 texture (it is B&W: red is
 * all of it). Mipmapped because a reflection reads it softened by the
 * ripples.
 *
 * NO FLIP and NO COLOUR CONVERSION: its rows stay top-down, as the shader
 * reads them, and its values reach the GPU as the print stored them — the
 * film undoes the print itself (film.ts undevelop).
 *
 * CLAMPED: the camera never looks past the photograph's sides (camera.ts),
 * and where a frame too wide for it reaches them they fade into the fog
 * (shaders/backdrop.ts). A mirrored copy there read as the same trees
 * twice. Up and down, the top rows are already fog continued smooth.
 *
 * ANISOTROPIC where the GPU offers it: a reflection reads the photograph
 * through a footprint far taller than it is wide (the ripples smear it
 * vertically), and anisotropic filtering takes that footprint along its
 * length instead of blurring it to a circle as wide as it is tall.
 */
export function createBackdrop(gl: WebGL2RenderingContext, image: TexImageSource): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("stage: backdrop allocation failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
  if (aniso) {
    const most = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
    gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, most));
  }
  return tex;
}

/**
 * Two channels of data per texel (the backdrop's inverse depth and land), as
 * RG16F: filterable on every WebGL2 device, which RG32F is not. Uploaded
 * from 32-bit floats; the driver rounds them. Clamped like the photograph,
 * so the two always agree on what lies past its sides.
 */
export function createDataTexture(
  gl: WebGL2RenderingContext,
  data: Float32Array,
  width: number,
  height: number,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("stage: data texture allocation failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, width, height, 0, gl.RG, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Binds a texture to a unit and points a sampler uniform at it. */
export function bindTexture(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation | null,
  unit: number,
  tex: WebGLTexture,
  target: GLenum = gl.TEXTURE_2D,
): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(target, tex);
  gl.uniform1i(location, unit);
}

/**
 * Parses a CSS colour token ("#rgb", "#rrggbb", "rgb(…)") to 0–1 sRGB
 * channels.
 */
export function parseColor(value: string): [number, number, number] {
  const v = value.trim();
  if (v.startsWith("#")) {
    const hex = v.length === 4 ? v.slice(1).replace(/./g, (c) => c + c) : v.slice(1, 7);
    const n = Number.parseInt(hex, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const parts = v.match(/[\d.]+/g);
  if (parts && parts.length >= 3) {
    return [Number(parts[0]) / 255, Number(parts[1]) / 255, Number(parts[2]) / 255];
  }
  return [0.5, 0.5, 0.5];
}

/** sRGB (0–1) → linear light: the optics run in radiance, not in display values. */
export function srgbToLinear([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [f(r), f(g), f(b)];
}
