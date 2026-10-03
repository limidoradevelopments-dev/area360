/**
 * ─── Stage · WebGL2 plumbing ───
 *
 * The least code that runs a stack of fullscreen passes. No three.js: the
 * scene is a handful of 2D passes over textures and a few analytic shapes,
 * and a scene graph would cost ~150KB of script in front of the hero to
 * draw one triangle.
 */

export interface Target {
  readonly tex: WebGLTexture;
  readonly fbo: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

/** One framebuffer writing several textures at once (a shader's `out`s). */
export interface MultiTarget {
  readonly texs: readonly WebGLTexture[];
  readonly fbo: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

export interface Program {
  readonly handle: WebGLProgram;
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

function compile(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("stage: createShader failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`stage: shader compile failed\n${log}`);
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  fragment: string,
  uniformNames: readonly string[],
): Program {
  const handle = gl.createProgram();
  if (!handle) throw new Error("stage: createProgram failed");
  const vs = compile(gl, gl.VERTEX_SHADER, FULLSCREEN_VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(handle, vs);
  gl.attachShader(handle, fs);
  gl.linkProgram(handle);
  /* Shaders are owned by the program once linked. */
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`stage: link failed\n${gl.getProgramInfoLog(handle)}`);
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(handle, name);
  return { handle, uniforms };
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

/**
 * `count` textures behind one framebuffer, attachment i ↔ `layout(location
 * = i) out`. WebGL2 guarantees four draw buffers, so one pass can write four
 * RGBA values per pixel without running twice.
 */
export function createMultiTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internalFormat: GLenum,
  filter: GLenum,
  count: number,
): MultiTarget {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("stage: framebuffer allocation failed");
  const texs: WebGLTexture[] = [];
  const buffers: GLenum[] = [];
  for (let i = 0; i < count; i += 1) texs.push(allocateTexture(gl, width, height, internalFormat, filter));
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  texs.forEach((tex, i) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
    buffers.push(gl.COLOR_ATTACHMENT0 + i);
  });
  gl.drawBuffers(buffers);
  checkFramebuffer(gl);
  return { texs, fbo, width, height };
}

/** Zeroes a target. New sim targets must start from rest, not from garbage. */
export function clearTarget(gl: WebGL2RenderingContext, target: Target): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, target.width, target.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function deleteTarget(gl: WebGL2RenderingContext, target: Target | MultiTarget | null): void {
  if (!target) return;
  if ("texs" in target) target.texs.forEach((tex) => gl.deleteTexture(tex));
  else gl.deleteTexture(target.tex);
  gl.deleteFramebuffer(target.fbo);
}

function describe(gl: WebGL2RenderingContext, internalFormat: GLenum) {
  switch (internalFormat) {
    case gl.RGBA32F:
      return { format: gl.RGBA, type: gl.FLOAT };
    case gl.RGBA16F:
      return { format: gl.RGBA, type: gl.HALF_FLOAT };
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
