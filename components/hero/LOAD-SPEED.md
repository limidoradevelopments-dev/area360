# Hero load speed — what changed (2026-10-04)

A change note for the load-speed work, phases 1 and 2. It covers what was slow, what moved where, and what changed in the flower (bloom/) while that is still being built, plus the rules that keep a first visit fast.

The look did not change. Every step was checked frame against frame with the clock frozen: 5 moments, 3 screen sizes, camera leans, 20 s of motion. In the end 0.02% of pixels moved, none by more than 6 levels of 255, all on sharp edges where the compiler orders the same arithmetic slightly differently. Every phase 2 step was bit-for-bit identical to phase 1.

## Why a first visit was slow

On Windows, every browser turns WebGL into Direct3D, and Direct3D's shader compiler (FXC) runs on the visitor's CPU. Two things made a first visit wait:

1. **One huge program.** FXC takes far longer over one big shader than over its parts. The stone's shading cost ~15 s inside the old scene shader, and 0.6 s in a program of its own. The browser also compiles only about two programs at once.
2. **Programs that write two outputs at once.** These are drawn into two render targets at once (MRT, `layout(location = 1) out`). The browser prepares each program for one target. A program drawn into two is compiled again, whole, on its first draw, and the page waits for it: the fog sheets cost 2.4 s, the flower 2.2 s.

Once the browser has cached the shaders, a repeat visit is fast (~1.4 s). Only a visitor's first visit pays.

## Results (GTX 1050 Ti + i7-8750H, production build, empty shader cache)

| | before | after |
|---|---|---|
| first live frame, first visit, CPU cool | ≈ 30 s | **3.1–3.7 s** |
| the same, CPU warm | | 4.1–5.1 s |
| the same, CPU heat-throttled (1.5–2.2 GHz) | | 7–12 s |
| repeat visit | ~1.6 s | ~1.4 s |
| GPU time a frame, 1920×1080 | ~18 ms | ~12 ms |
| still photo on screen | 0.1 s | 0.1 s |

"First live frame" is measured when the GPU has finished drawing it, not when the code asked for it. The old "25.6 s" counted only until the code asked; its GPU had ~5 s more to do (see MRT below).

Compile time is CPU time, so it scales with the visitor's processor and how hot it is. After hours of back-to-back benchmarks, this laptop (an i7-8750H) ran at 70–100% of its 2.2 GHz base clock instead of turbo, and every compile took twice as long. Fresh browser profiles also made Windows Defender scan thousands of new files during the test. The cool-CPU numbers are what a visitor's laptop normally sees.

## What moved where

The scene used to be one program. It is now drawn by several, and each pass reads what the earlier ones drew at the same pixel.

| pass | file | what it draws |
|---|---|---|
| bloom | `bloom/bloom.ts`, `bloom/shaders/bloom.ts` | the plant, its contact shade on the stone, the plant in the lake |
| stone | `stone/stone.ts`, `stone/shaders/slots.ts` | the stone as the camera sees it, and as the lake mirrors it: one ray per pixel into "slots" over a small rect round the stone |
| lake | `water/lake.ts`, `water/shaders/lake.ts` | the photograph of the shores reflected in the lake |
| scene | `stage/shaders/scene.ts` | everything put together: fog, shores, water, reading the three above |

Shared pieces, so the passes can never disagree:

- **`stage/uniforms.ts`** feeds every program its uniforms, one setter per GLSL chunk.
- **`stage/shaders/set.ts`** holds the fog-over-the-photograph helpers, moved out of `scene.ts` unchanged.
- **`water/shaders/surface.ts`** computes the lake under a pixel (the waves, the lapping, the reflected rays) once, for the three programs that need it.
- **`stage/shaders/pixel.ts`** gives a pixel's footprint on the water.

Values pass between programs in 32-bit float textures, read with `texelFetch` at the same pixel, so nothing is rounded on the way. A rect pass draws the scene's own full-frame triangle through a shifted viewport, so its pixels and their 2×2 derivative blocks are the scene's own.

### The fog sheets (`atmosphere/`)

- **One output.** The density and the light of the four sheets (8 values) used to be written to two targets at once. They are now packed as half floats, two to a 32-bit channel, into one unsigned target (`outPacked`). A tiny pass (`SHEETS_UNPACK_FRAG`) lays them back out into the same two half-float textures as before, so the values are identical, bit for bit.
- **One copy of the noise per sheet.** `billows()` (4 simplex noises) is called once per sheet, in a loop that runs to a uniform's count (`uCarriedSets`). It used to be called twice for a near sheet and once for a far one, and the compiler pasted the noise six times over. This cut the pass's compile from 1.7 s to 0.7 s. The same calls and the same sums in the same order: bit-for-bit identical.

## What changed in the flower (bloom/) in phase 2 — since rebuilt, see below

The plant's shape, light and look are untouched. `BLOOM_GLSL`, the tepals, stems, tube, heart, `bloomTrace` and `bloomContact` are all as they were. Only how the pass hands out its pictures changed.

**`bloom/shaders/bloom.ts`, `BLOOM_FRAG`**
- **Before:** two outputs, `outPlant` (location 0) and `outContact` (location 1), written by every draw.
- **Now:** one output, `outColor`, chosen by a new uniform `uBloomOutput`:
  - `0`: the plant (light premultiplied, cover). Same as `outPlant` was.
  - `1`: the stone's contact shade under the plant. Same as `outContact` was. This draw traces only the stone and calls `bloomContact`; it skips `bloomTrace`.
- `uBloomMirror` is unchanged and still picks the mirrored view.

**`bloom/bloom.ts`, `BloomPass`**
- **Before:** two 2-target framebuffers (near and mirror), two draws.
- **Now:** three single targets and three draws per frame:
  1. `near`: the plant, camera view (`uBloomOutput = 0`)
  2. `contact`: the contact shade under it, camera view (`uBloomOutput = 1`)
  3. `mirror`: the plant as the lake mirrors it (`uBloomOutput = 0`, mirrored)
- The mirror's contact output was never read, so it is no longer drawn.
- `bindScene` hands the scene `near.tex`, `contact.tex` and `mirror.tex` at the same units as before. The scene reads them exactly as before.

**When you add the next steps (the opening, the air, pollen, the seed per visit):**
- **Keep one output per draw.** If the flower needs another picture, add a value of `uBloomOutput` (or a draw) and a target. Never a second `out` in the same draw: under Direct3D it costs a whole second compile on the first frame.
- **Keep loops running to uniform counts** (`uBloomLoops`). Direct3D's compiler pastes a constant-count loop's body once per turn.
- **Use `textureLod` / `texelFetch`, never `texture()`,** if the flower ever reads a texture.
- **Watch its cold compile.** The flower is one of the two longest compiles now (~1.5 s), and the first frame waits for the last program to finish. More shape code makes a first visit wait longer, so measure each step cold, as below.

## The flower rebuilt (2026-10-05)

The traced flower (flat pieces hinged together, found by rays in `BLOOM_FRAG`) was replaced by a modelled one: the user saw its stems and tepals as cardboard cutouts. Everything below about `BLOOM_FRAG` and `uBloomOutput` is history.

**Now (`bloom/`):**
- `shape.ts` models the plant as surfaces swept along curves ("spines"). A fixed mesh is laid over them, and the CPU poses the spines each frame into a small RGBA32F texture: about 600 samples, ~25 KB, ~0.3 ms of the main thread, no allocations.
- `shaders/bloom.ts` has two programs:
  - `PLANT_VERT` + `PLANT_FRAG` draw the mesh into a supersampled target (3–4 samples a pixel each way, with a depth test).
  - `RESOLVE_FRAG` averages it down to the scene's pixels and works out the stone's contact shade in the same draw. The near picture's alpha is what the plant leaves of what lies behind it, the contact shade folded in.
- One output a draw, as before: four draws a frame, all into single targets (near, resolved; mirror, resolved).
- The scene reads the near picture with `texelFetch` at its own pixel (its rect's corner sits on the scene's pixel grid) and the mirror bilinear, as before.
- `atmosphere/sampler.ts` reads the simulated air round the plant back to the CPU: a pixel-pack buffer and a fence, collected on a later frame. It costs ~0.05 ms and never stalls.

**Measured (GTX 1050 Ti + i7-8750H):**

| | traced (phase 2) | modelled |
|---|---|---|
| cold compile, alone | 1.8 s, one program | 0.46 s + 0.51 s, two programs, side by side |
| first live frame, cold, production | 3.1–3.7 s | 3.4–3.5 s (CPU warm) |
| GPU, the plant's pass, 1080p | ~0.23 ms | ~0.21 ms |
| GPU, the plant's pass, 1440p | | ~0.3 ms |
| main thread a frame | ~0 | ~0.3 ms pose + ~0.15 ms draw calls |

**When you add to the flower:**
- More shape is more CPU posing or more vertices, not more shader. Keep the vertex stage's branches by kind, and keep the posing allocation-free (`Pose`: write floats, make no arrays per sample).
- Anything finer than a sample (filaments, anthers, pollen) is drawn a sample wide at least and as faint as it is narrow, blended after the solid parts. At its true width it would flicker as it moves.
- The rules below still hold: one output a draw, loops to uniform counts, levels named.

## Tried in phase 2 and not kept

Each was measured and turned down.

- **Starting the longest compiles first, or last.** Chrome on Windows does not compile in the order programs are created, and neither order was reliably faster. The original order is kept.
- **Splitting the scene into a land pass and a water pass.** The water is almost all of the scene's compile, so the split saved nothing in total.
- **Running the lake's 26 waves in a loop to a uniform's count.** It saved under 0.1 s per program.

## Rules for any shader in the hero

1. **Split heavy subjects into their own small programs.** The compiler's time grows much faster than the program's size, and smaller programs also run faster (the scene frame got ~40% cheaper).
2. **One output per program draw.** No MRT.
3. **Make loops around heavy calls run to a uniform's count, and call each heavy function once per path.**
4. **Name every texture read's level** (`textureLod` / `textureGrad` / `texelFetch`).
5. **Measure both ways, cold compile and frame cost.** A first visit waits once, every frame pays: one change that compiled faster but ran 45% slower was refused.

## How it was measured

- **Browser:** headless Edge, a brand-new profile each time (an empty shader cache), driven over the DevTools protocol.
- **First live frame:** a one-pixel `readPixels` right after the first draw onto the canvas, which returns only once the GPU has finished.
- **Compile per program:** sources captured from the page and compiled cold, alone and together.
- **Pictures:** `requestAnimationFrame` frozen, the stage stepped with `__kaviStage.advance()` in development, and PNGs compared pixel by pixel.
- **GPU cost:** `__kaviStage.gpuTimings()`.

Delete old test profiles. Dozens of them (several GB) left in a temp folder kept Windows Explorer and Defender busy and doubled every timing.

## Appendix: the exact change to the flower

`bloom/` is not in git yet, so `git diff` does not show it. This is everything that changed there in phase 2. Before is the flower as it was on 2026-10-04, after its first build step.

```diff
--- bloom/bloom.ts (before)
+++ bloom/bloom.ts (now)
@@ -2,22 +2,20 @@
  * ─── Bloom · its pass ───
  *
  * The plant is drawn by its own small program (shaders/bloom.ts BLOOM_FRAG)
- * into two pictures the scene pass reads: the plant as the camera sees it,
- * with the stone's contact shade under it, over a rect round the plant; and
+ * into the pictures the scene pass reads: the plant as the camera sees it,
+ * and the stone's contact shade under it, over a rect round the plant; and
  * the plant as the still lake mirrors it, over the rect where that falls,
  * at half the resolution (the lake blurs it anyway). Each rect follows the
  * camera's lean every frame; its size is fixed by the frame's.
+ *
+ * ONE PICTURE A DRAW: three draws into three targets, never one draw into
+ * two (shaders/bloom.ts BLOOM_FRAG: a program drawn into two targets at once
+ * is compiled again on its first draw under Direct3D). The contact's draw
+ * traces only the stone.
  */
 
 import { CAMERA, CAMERA_UNIFORMS, focalPx, setCameraUniforms, type CameraFrame } from "../stage/camera";
-import {
-  bindTexture,
-  createMultiTarget,
-  createProgram,
-  deleteTarget,
-  type MultiTarget,
-  type Program,
-} from "../stage/gl";
+import { bindTexture, createProgram, createTarget, deleteTarget, type Program, type Target } from "../stage/gl";
 import { STONE } from "../stone/optics";
 import { BLOOM, bloomBound } from "./optics";
 import { BLOOM_FRAG } from "./shaders/bloom";
@@ -73,8 +71,9 @@
   private readonly gl: WebGL2RenderingContext;
   private readonly vao: WebGLVertexArrayObject;
   private readonly program: Program;
-  private near: MultiTarget | null = null;
-  private mirror: MultiTarget | null = null;
+  private near: Target | null = null;
+  private contact: Target | null = null;
+  private mirror: Target | null = null;
   /* Half the rect's side, CSS px. */
   private half = 1;
   private readonly nearRect: [number, number, number, number] = [0, 0, 1, 1];
@@ -89,7 +88,7 @@
       "uTube", "uTubeRadius", "uStem", "uStemWidth", "uStemFace",
       "uPetal", "uSepal", "uLeaf", "uTubeTone", "uAnther", "uBloomLight", "uBloomBound", "uBloomContact",
       "uBloomLoops", "uLit", "uStonePlan", "uStoneSpan", "uStoneWeather", "uStoneLight", "uLightSide",
-      "uBloomRect", "uBloomMirror",
+      "uBloomRect", "uBloomMirror", "uBloomOutput",
     ]);
   }
 
@@ -103,19 +102,22 @@
     const gl = this.gl;
     if (this.near?.width !== side) {
       deleteTarget(gl, this.near);
-      this.near = createMultiTarget(gl, side, side, gl.RGBA16F, gl.LINEAR, 2);
+      deleteTarget(gl, this.contact);
+      this.near = createTarget(gl, side, side, gl.RGBA16F, gl.LINEAR);
+      this.contact = createTarget(gl, side, side, gl.RGBA16F, gl.LINEAR);
     }
     if (this.mirror?.width !== mirrorSide) {
       deleteTarget(gl, this.mirror);
-      this.mirror = createMultiTarget(gl, mirrorSide, mirrorSide, gl.RGBA16F, gl.LINEAR, 2);
+      this.mirror = createTarget(gl, mirrorSide, mirrorSide, gl.RGBA16F, gl.LINEAR);
     }
   }
 
-  /** Draws both pictures for this frame's camera. */
+  /** Draws the three pictures for this frame's camera. */
   render(camera: CameraFrame, colors: BloomColors, state: BloomState): void {
     const near = this.near;
+    const contact = this.contact;
     const mirror = this.mirror;
-    if (!near || !mirror) return;
+    if (!near || !contact || !mirror) return;
     const gl = this.gl;
     const u = this.program.uniforms;
     gl.bindVertexArray(this.vao);
@@ -125,9 +127,12 @@
 
     rectOf(this.nearRect, camera, [BOUND[0], BOUND[1], BOUND[2]], this.half);
     rectOf(this.mirrorRect, camera, [BOUND[0], -BOUND[1], BOUND[2]], this.half);
-    for (const [target, rect, on] of [
-      [near, this.nearRect, 0],
-      [mirror, this.mirrorRect, 1],
+    /* [target, rect, mirrored, output]: the plant, the stone's contact
+       under it, the plant in the lake. */
+    for (const [target, rect, on, output] of [
+      [near, this.nearRect, 0, 0],
+      [contact, this.nearRect, 0, 1],
+      [mirror, this.mirrorRect, 1, 0],
     ] as const) {
       gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
       gl.viewport(0, 0, target.width, target.height);
@@ -135,17 +140,18 @@
       /* The mirror's blur: the lake's unseen ripples, as an angle — about
          what the stone's reflection is blurred by under the plant. */
       gl.uniform2f(u.uBloomMirror, on, on ? BLOOM.mirrorBlur : 0);
+      gl.uniform1f(u.uBloomOutput, output);
       gl.drawArrays(gl.TRIANGLES, 0, 3);
     }
   }
 
-  /** Hands the scene pass the two pictures (texture units from `unit`). */
+  /** Hands the scene pass the three pictures (texture units from `unit`). */
   bindScene(u: Record<string, WebGLUniformLocation | null>, unit: number): void {
     const gl = this.gl;
-    if (!this.near || !this.mirror) return;
-    bindTexture(gl, u.uBloomNear, unit, this.near.texs[0]);
-    bindTexture(gl, u.uBloomContact, unit + 1, this.near.texs[1]);
-    bindTexture(gl, u.uBloomMirror, unit + 2, this.mirror.texs[0]);
+    if (!this.near || !this.contact || !this.mirror) return;
+    bindTexture(gl, u.uBloomNear, unit, this.near.tex);
+    bindTexture(gl, u.uBloomContact, unit + 1, this.contact.tex);
+    bindTexture(gl, u.uBloomMirror, unit + 2, this.mirror.tex);
     gl.uniform4f(u.uBloomRect, ...this.nearRect);
     gl.uniform4f(u.uBloomMirrorRect, ...this.mirrorRect);
     gl.uniform1f(u.uBloomPlane, BOUND[2]);
@@ -155,8 +161,10 @@
     const gl = this.gl;
     gl.deleteProgram(this.program.handle);
     deleteTarget(gl, this.near);
+    deleteTarget(gl, this.contact);
     deleteTarget(gl, this.mirror);
     this.near = null;
+    this.contact = null;
     this.mirror = null;
   }
 
--- bloom/shaders/bloom.ts (before)
+++ bloom/shaders/bloom.ts (now)
@@ -19,8 +19,9 @@
  * shader Direct3D (every Windows browser) already takes long to compile:
  * cold, it doubled from ~40 s to ~80 s and the GPU's watchdog killed it.
  * Here it is a small program of its own, drawn over a small rect round the
- * plant — once as the camera sees it, once as the still lake mirrors it —
- * and the scene only reads the two pictures (stage/shaders/scene.ts).
+ * plant — as the camera sees it (and the stone's contact shade under it),
+ * and as the still lake mirrors it — and the scene only reads the pictures
+ * (stage/shaders/scene.ts).
  * Every loop runs to a uniform's count, never a constant: Direct3D's
  * compiler unrolls a constant loop into copies of its body.
  *
@@ -412,18 +413,25 @@
 
 /**
  * The plant's pass, over its rect of the frame (stage/engine.ts runs it
- * before the scene): its light, premultiplied, and its cover; and, on the
- * stone under it, the share of the sky the stone keeps (1 elsewhere).
+ * before the scene). One output a draw, chosen by `uBloomOutput`:
+ *   0  the plant: its light, premultiplied, and its cover
+ *   1  on the stone under it, the share of the sky the stone keeps (1
+ *      elsewhere) — a draw of its own, which traces only the stone
  * `uBloomMirror.x` set: the plant as the still lake mirrors it — the same
  * rays from the camera's image under the water — its outline softened by
  * `uBloomMirror.y` (radians), the blur the lake's unseen ripples give.
+ *
+ * NEVER TWO OUTPUTS AT ONCE. Under Direct3D the browser compiles a program
+ * for one render target; drawn into two (`layout(location = 1) out`), it is
+ * compiled again, whole, on its first draw, on the GPU process's main
+ * thread — 2.2 s of a first visit for this one, everything waiting
+ * (stage/shaders/scene.ts, the top).
  */
 export const BLOOM_FRAG = /* glsl */ `#version 300 es
 precision highp float;
 
 in vec2 vUv;
-layout(location = 0) out vec4 outPlant;
-layout(location = 1) out vec4 outContact;
+out vec4 outColor;
 
 ${CAMERA_GLSL}
 /* the full sky light */
@@ -437,6 +445,8 @@
 uniform vec4 uBloomRect;
 /* the mirror: on (1) or off, and its blur */
 uniform vec2 uBloomMirror;
+/* which output this draw writes: 0 the plant, 1 the stone's contact */
+uniform float uBloomOutput;
 
 void main() {
   vec2 uv = uBloomRect.xy + vUv * uBloomRect.zw;
@@ -461,13 +471,16 @@
   vec3 onStone = from + ray * t;
   bool stone = t > 0.0 && onStone.y >= 0.0;
 
+  if (uBloomOutput > 0.5) {
+    outColor = vec4(stone && !mirror ? bloomContact(onStone) : 1.0, 0.0, 0.0, 1.0);
+    return;
+  }
   vec3 color;
   float alpha;
   float depth;
-  outPlant = vec4(0.0);
+  outColor = vec4(0.0);
   if (bloomTrace(origin, ray, spread, color, alpha, depth) && !(stone && onStone.z < depth)) {
-    outPlant = vec4(color, alpha);
+    outColor = vec4(color, alpha);
   }
-  outContact = vec4(stone && !mirror ? bloomContact(onStone) : 1.0, 0.0, 0.0, 1.0);
 }
 `;
```
