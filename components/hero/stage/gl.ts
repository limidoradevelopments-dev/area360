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
 * `alive`: false once the caller is gone (disposed, or its context lost) —
 * the wait stops there and resolves with nothing read. WITHOUT IT, a stage
 * torn down while its shaders compiled (React's development double mount
 * does it on every load) kept polling for up to two minutes, its deleted
 * programs never reporting done, holding the whole dead engine — its
 * context, its canvas, its plates — until the give-up.
 */
export async function programsLinked(
  gl: WebGL2RenderingContext,
  alive: () => boolean = () => true,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const list = pending.get(gl) ?? [];
  pending.delete(gl);
  if (gl.getExtension("KHR_parallel_shader_compile")) {
    /* Everything started so far goes to the driver now. */
    gl.flush();
    /* Done, and how many are (a share, for the page's loading count: the
       same status query the wait already makes, nothing more asked). */
    const done = () => {
      if (!alive() || gl.isContextLost()) return true;
      let finished = 0;
      for (const p of list) if (gl.getProgramParameter(p.program.handle, COMPLETION_STATUS_KHR)) finished += 1;
      onProgress?.(list.length ? finished / list.length : 1);
      return finished === list.length;
    };
    const giveUp = performance.now() + LINK_POLL_GIVE_UP_MS;
    while (!done() && performance.now() < giveUp) await new Promise((resolve) => setTimeout(resolve, LINK_POLL_MS));
  }
  onProgress?.(1);
  if (!alive()) return;
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

/* The formats a target has been found complete in, per context. */
const complete = new WeakMap<WebGL2RenderingContext, Set<GLenum>>();

/**
 * ASKED ONCE A FORMAT, NOT ONCE A TARGET. Whether a framebuffer is complete
 * is a question the page must wait on the GPU process for (a flush and a
 * round trip), and it was asked of every one of the ~40 targets: 10–24 ms
 * each, at times, while the GPU was busy — a hitch exactly as the arrival
 * settled, when the stone's and the flowers' targets are made again round
 * the resting scene (2026-10-23). A colour target's completeness depends
 * on its format alone (every size here is at least 1×1), so one answer per
 * format holds for every target of it.
 */
function checkFramebuffer(gl: WebGL2RenderingContext, internalFormat: GLenum): void {
  let formats = complete.get(gl);
  if (!formats) complete.set(gl, (formats = new Set()));
  if (formats.has(internalFormat)) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return;
  }
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
    throw new Error(`stage: framebuffer incomplete (0x${status.toString(16)})`);
  }
  formats.add(internalFormat);
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
  checkFramebuffer(gl, internalFormat);
  return { tex, fbo, width, height };
}

/* Whether this GPU draws in tiles (drawsInTiles), set once by the engine:
   only there does discardBound save anything. */
let tiled = false;

/**
 * Whether the GPU draws in tiles held on the chip: every phone's and
 * tablet's (Mali, Adreno, PowerVR, Apple, Samsung's Xclipse) and an
 * Apple-silicon Mac's. By its name where the browser gives one (Chrome and
 * Safari only through the debug extension: their RENDERER is a mask), and
 * otherwise by a phone's or tablet's user agent.
 */
export function drawsInTiles(gl: WebGL2RenderingContext): boolean {
  let renderer = String(gl.getParameter(gl.RENDERER));
  if (/^WebKit/.test(renderer)) {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  }
  if (/Mali|Adreno|PowerVR|Apple|Xclipse|Immortalis|Maleoon/i.test(renderer)) return true;
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

/** Sets whether discardBound tells the GPU anything (drawsInTiles). */
export function setTiledGpu(value: boolean): void {
  tiled = value;
}

/**
 * THE BOUND TARGET'S OLD CONTENTS ARE NOT NEEDED: the pass about to draw
 * into it covers every pixel anything will read from it. Call with the
 * scissor off, before drawing.
 *
 * A phone's GPU (Mali, Adreno, PowerVR, Apple) draws in small tiles held
 * on the chip; told nothing, it first copies the target's old contents in
 * from memory, tile by tile, in case the pass leaves some of them — across
 * the ~40 passes of a frame (the air alone is ~30 a step), memory traffic a
 * phone pays in time and heat for nothing. ONLY THERE: a desktop GPU
 * behind Direct3D took the hint as work, ~0.4 ms a frame (GTX 1050 Ti,
 * 2026-10-21), so it is told nothing (drawsInTiles). `integer`: an integer
 * target (RGBA32UI).
 *
 * In development, `window.__kaviDiscardProbe` fills the target with junk
 * instead — what a phone may leave there — so a frame that still reads old
 * contents shows it on any GPU.
 */
export function discardBound(gl: WebGL2RenderingContext, integer = false): void {
  if (process.env.NODE_ENV !== "production" && (globalThis as { __kaviDiscardProbe?: boolean }).__kaviDiscardProbe) {
    if (integer) gl.clearBufferuiv(gl.COLOR, 0, [0xdeadbeef, 0x7f7f7f7f, 0x12345678, 0xffffffff]);
    else gl.clearBufferfv(gl.COLOR, 0, [7, -3, 5, 0.37]);
    return;
  }
  if (tiled) gl.invalidateFramebuffer(gl.FRAMEBUFFER, DISCARD_COLOR);
}

/* COLOR_ATTACHMENT0, as its number: this module is also evaluated where
   there is no WebGL (the server's render). */
const DISCARD_COLOR = [0x8ce0];

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
    case gl.R16F:
      return { format: gl.RED, type: gl.HALF_FLOAT };
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
 *
 * ONE CHANNEL STRAIGHT FROM THE IMAGE. Uploaded as RGBA and copied down to
 * one channel on the GPU instead, the upload moved four times the bytes and
 * took longer on the main thread (21 ms against 12 on a quiet machine,
 * measured 2026-10-23): tried, and not kept.
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

type Call = (...args: never[]) => unknown;

/* Contexts already given the cache below: given once each, however many
   engines start on one canvas (React's development double mount). */
const cached = new WeakSet<WebGL2RenderingContext>();

/* "Not known yet": the first call of each kind always goes through. */
const UNKNOWN = Symbol("unknown");

/**
 * EACH CALL MADE ONLY WHEN IT CHANGES SOMETHING (2026-10-23). The passes set
 * everything they draw with, every frame — ~680 uniform calls a frame, and
 * the program, the vertex array, the viewport, every texture and target
 * bound again — and most of it is what the GPU already holds: the optics,
 * the tokens, the texture units, the one vertex array. Each call is a trip
 * through the browser's validation into the GPU process's command stream;
 * on a phone-class CPU (4× slower than the laptop it was measured on) the
 * frame's script took ~12.7 ms of a 16.7 ms frame. On this context a call
 * that would leave the state as it is now does nothing; every other call
 * goes through as before, and the state it leaves is the same.
 *
 * Kept true to the GPU: a uniform is keyed by its location object, which
 * each program asks for once (programsLinked) — never set one uniform
 * through two locations; deleting a bound texture, target or vertex array
 * unbinds it, as the GPU does. Every call of these kinds on this context
 * must go through it (they do: every pass draws on this one object).
 */
export function sendChangedStateOnly(gl: WebGL2RenderingContext): void {
  if (cached.has(gl)) return;
  cached.add(gl);
  const methods = gl as unknown as Record<string, Call>;
  const plain = (name: string) => methods[name].bind(gl) as (...args: unknown[]) => unknown;

  /* ── uniforms: what each location was last sent ── */
  const held = new Map<WebGLUniformLocation, number[]>();
  /* Whether `values` is what `location` holds; if not, it holds them now.
     No arrays made but a location's first. */
  const same = (location: WebGLUniformLocation, values: ArrayLike<number>, n: number): boolean => {
    let last = held.get(location);
    if (!last || last.length !== n) held.set(location, (last = new Array<number>(n).fill(Number.NaN)));
    let i = 0;
    while (i < n && last[i] === values[i]) i += 1;
    if (i === n) return true;
    for (; i < n; i += 1) last[i] = values[i];
    return false;
  };
  const scalars = [0, 0, 0, 0];
  for (const [name, n] of [["uniform1f", 1], ["uniform2f", 2], ["uniform3f", 3], ["uniform4f", 4], ["uniform1i", 1], ["uniform2i", 2]] as const) {
    const send = plain(name);
    methods[name] = ((location: WebGLUniformLocation | null, a: number, b: number, c: number, d: number) => {
      scalars[0] = a;
      scalars[1] = b;
      scalars[2] = c;
      scalars[3] = d;
      /* No location: a uniform the program does not use. */
      if (location && same(location, scalars, n)) return;
      send(location, a, b, c, d);
    }) as Call;
  }
  for (const name of ["uniform1fv", "uniform2fv", "uniform3fv", "uniform4fv"]) {
    const send = plain(name);
    methods[name] = ((location: WebGLUniformLocation | null, values: ArrayLike<number>, offset?: number, length?: number) => {
      /* The WebGL 2 forms with a source offset and length: as they were. */
      if (offset !== undefined) return void send(location, values, offset, length);
      if (location && same(location, values, values.length)) return;
      send(location, values);
    }) as Call;
  }
  {
    const send = plain("uniformMatrix3fv");
    methods.uniformMatrix3fv = ((location: WebGLUniformLocation | null, transpose: boolean, values: ArrayLike<number>, offset?: number, length?: number) => {
      if (offset !== undefined || transpose) return void send(location, transpose, values, offset, length);
      if (location && same(location, values, values.length)) return;
      send(location, transpose, values);
    }) as Call;
  }

  /* ── the program and the vertex array (a deleted program in use stays in
     use until another is, so deleting one changes nothing here) ── */
  let program: unknown = UNKNOWN;
  const useProgram = plain("useProgram");
  methods.useProgram = ((p: WebGLProgram | null) => {
    if (p === program) return;
    program = p;
    useProgram(p);
  }) as Call;
  let vao: unknown = UNKNOWN;
  const bindVertexArray = plain("bindVertexArray");
  methods.bindVertexArray = ((v: WebGLVertexArrayObject | null) => {
    if (v === vao) return;
    vao = v;
    bindVertexArray(v);
  }) as Call;
  const deleteVertexArray = plain("deleteVertexArray");
  methods.deleteVertexArray = ((v: WebGLVertexArrayObject | null) => {
    if (v && v === vao) vao = null;
    deleteVertexArray(v);
  }) as Call;

  /* ── the viewport ── */
  const view = [Number.NaN, Number.NaN, Number.NaN, Number.NaN];
  const viewport = plain("viewport");
  methods.viewport = ((x: number, y: number, w: number, h: number) => {
    if (x === view[0] && y === view[1] && w === view[2] && h === view[3]) return;
    view[0] = x;
    view[1] = y;
    view[2] = w;
    view[3] = h;
    viewport(x, y, w, h);
  }) as Call;

  /* ── textures: the active unit, and what each unit holds per target ── */
  let unit: unknown = UNKNOWN;
  const bound = new Map<number, WebGLTexture | null>();
  const activeTexture = plain("activeTexture");
  methods.activeTexture = ((u: GLenum) => {
    if (u === unit) return;
    unit = u;
    activeTexture(u);
  }) as Call;
  const bindTex = plain("bindTexture");
  methods.bindTexture = ((target: GLenum, tex: WebGLTexture | null) => {
    /* Until the first activeTexture, the unit is not known: no skipping. */
    if (unit === UNKNOWN) return void bindTex(target, tex);
    const key = (unit as number) * 65536 + target;
    if (bound.has(key) && bound.get(key) === tex) return;
    bound.set(key, tex);
    bindTex(target, tex);
  }) as Call;
  const deleteTexture = plain("deleteTexture");
  methods.deleteTexture = ((tex: WebGLTexture | null) => {
    if (tex) for (const [key, held] of bound) if (held === tex) bound.set(key, null);
    deleteTexture(tex);
  }) as Call;

  /* ── targets: what is bound to draw into, and to read from ── */
  let draw: unknown = UNKNOWN;
  let read: unknown = UNKNOWN;
  const bindFramebuffer = plain("bindFramebuffer");
  methods.bindFramebuffer = ((target: GLenum, fbo: WebGLFramebuffer | null) => {
    if (target === gl.FRAMEBUFFER) {
      if (draw === fbo && read === fbo) return;
      draw = read = fbo;
    } else if (target === gl.DRAW_FRAMEBUFFER) {
      if (draw === fbo) return;
      draw = fbo;
    } else if (target === gl.READ_FRAMEBUFFER) {
      if (read === fbo) return;
      read = fbo;
    }
    bindFramebuffer(target, fbo);
  }) as Call;
  const deleteFramebuffer = plain("deleteFramebuffer");
  methods.deleteFramebuffer = ((fbo: WebGLFramebuffer | null) => {
    if (fbo && draw === fbo) draw = null;
    if (fbo && read === fbo) read = null;
    deleteFramebuffer(fbo);
  }) as Call;
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
