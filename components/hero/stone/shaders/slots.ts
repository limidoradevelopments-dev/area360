/**
 * ─── Stone · its slots, in GLSL ───
 *
 * The stone is traced by its own two small programs, not inside the scene
 * pass (stage/shaders/scene.ts, the top: a first visit on Windows waited
 * ~25 s for the scene's compile, most of it the stone). Each draws ONE ray
 * per pixel, in straight-line code, into SLOTS: copies of a rect round
 * where the stone can show, stacked side by side, a slot per ray of the
 * pixel. The scene then reads the slots back at its own pixel and
 * resolves them exactly as it once traced them — the same rays, the same
 * sums in the same order.
 *
 *   STONE_VIEW_FRAG    the stone as the camera sees it: slot 0 the pixel's
 *                      centre, slots 1–4 its four edge rays — each, the light
 *                      (zero on a miss) and whether it hit; then slots 5–9
 *                      the same five rays' normals, which tell an edge from a
 *                      face.
 *   STONE_MIRROR_FRAG  the stone as the lake mirrors it: slots 0–3 the
 *                      reflection's cone of four rays (slot 0 alone, the
 *                      reflected ray itself, where the water is mirror-
 *                      still). Each: the light and whether it hit.
 *   SLOTS_GLSL         the scene's side: the slots read back and resolved.
 *
 * WHY ONE RAY A PROGRAM. Direct3D's compiler (every Windows browser) takes
 * far longer over a big program than over its parts: the stone's shading
 * inside the scene's loops cost ~15 s of its compile, the same shading in a
 * program of its own, one ray straight through, 0.6 s (measured 2026-10-04,
 * GTX 1050 Ti, an empty shader cache).
 *
 * ONE OUTPUT A PROGRAM, NEVER TWO. Under Direct3D the browser compiles a
 * program for one render target; drawn into two at once (`layout(location
 * = 1) out`), it is compiled AGAIN, whole, on its first draw — on the GPU
 * process's main thread, which waits for it. The normals are slots of their
 * own instead, from the same program.
 *
 * EXACT, BUT FOR THE COMPILER. The rays are the scene's own, drawn through
 * its own viewport (stage/shaders/pixel.ts), and the slots are 32-bit
 * floats where the GPU can render them (stone/stone.ts), so what the scene
 * reads back is what it computed before — but for the compiler, which
 * orders the same arithmetic a little differently in a smaller program: at
 * 1440×810, 0.02% of the frame's pixels moved, none by more than 6 levels
 * of 255, all on sharp features (2026-10-04, against the single program).
 */

import { CAMERA_GLSL } from "../../stage/shaders/camera";
import { PIXEL_GLSL } from "../../stage/shaders/pixel";
import { SURFACE_GLSL } from "../../water/shaders/surface";
import { WATER_GLSL } from "../../water/shaders/water";
import { STONE_GLSL } from "./stone";

/* A slot is drawn as the scene's own pixels: through the scene's own
   full-frame triangle and viewport, shifted onto the slot and scissored to
   it (stone/stone.ts), so `vUv` — and every ray from it — is the scene's. */
const SLOT_GLSL = /* glsl */ `
in vec2 vUv;
/* which slot this draw fills */
uniform float uSlot;
`;

export const STONE_VIEW_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

out vec4 outColor;

${CAMERA_GLSL}
/* the fog in full light: the sky that lights the stone */
uniform vec3 uLit;
/* seconds of the lake's own time: the meniscus breaks with it */
uniform float uWaterTime;
${STONE_GLSL}
${SLOT_GLSL}

/* The pixel's rays, as shares of its steps across and up: its centre, then
   four on a rotated grid — no two share a row or a column, so a near-level
   edge is resolved as well as a near-vertical one. */
const vec2 SLOT_RAYS[5] = vec2[5](vec2(0.0), vec2(-0.125, -0.375), vec2(0.375, -0.125), vec2(0.125, 0.375),
                                  vec2(-0.375, 0.125));

void main() {
  int slot = int(uSlot);
  bool normals = slot >= 5;
  vec3 ray = cameraRay(vUv);
  vec3 rx = dFdx(ray);
  vec3 ry = dFdy(ray);
  vec2 step_ = SLOT_RAYS[normals ? slot - 5 : slot];
  vec3 d = ray + rx * step_.x + ry * step_.y;
  /* The pixel's angular width: the grain is filtered to it. */
  float spread = length(rx) / length(ray);
  vec3 local;
  vec3 normal;
  float t = stoneAbove(uCamPos, d, true, local, normal);
  float hit = t > 0.0 ? 1.0 : 0.0;
  if (normals) {
    outColor = vec4(normal, hit);
    return;
  }
  vec3 light = vec3(0.0);
  if (t > 0.0) light = stoneLight(uCamPos, d, t, local, normal, spread, uLit);
  outColor = vec4(light, hit);
}
`;

export const STONE_MIRROR_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

out vec4 outLight;

${CAMERA_GLSL}
uniform vec3 uLit;
${WATER_GLSL}
${STONE_GLSL}
${SURFACE_GLSL}
${PIXEL_GLSL}
${SLOT_GLSL}

/* The stone in a reflection. The ripples too fine to draw spread the
   reflected ray over a small cone (\`roughSubject\`, radians across and
   up); the stone is solved in closed form, so the cone is sampled: four
   rays at the quartiles of its spread, mostly up and down. Without it the
   stone's reflection is a second stone, every seam in place. This draws
   slot's ray of the four; a mirror-still patch has one, the reflected ray
   itself, in slot 0. */
void main() {
  int slot = int(uSlot);
  vec3 ray = cameraRay(vUv);
  vec2 sigma = waterFootprint(ray);
  outLight = vec4(0.0);
  if (ray.y >= 0.0) return;
  vec3 origin = uCamPos;
  LakeSurface s = lakeSurface(origin, ray, waterDepth(origin, ray), sigma);
  /* Where the scene will not ask: nothing to trace. */
  if (!beforeStone(s) || !reflectsStone(s)) return;
  vec2 rough = s.roughSubject;
  /* The cone's width is the footprint the stone's grain is filtered to. */
  float spread = max(rough.y, 0.002);
  bool cone = rough.y >= 0.001;
  vec3 dir = normalize(s.wavering);
  vec3 across = normalize(vec3(dir.z, 0.0, -dir.x));
  vec3 up = cross(dir, across);
  /* The quartile midpoints of a unit Gaussian, ±0.32 and ±1.15. */
  float v = (slot < 2 ? -1.0 : 1.0) * (slot == 0 || slot == 3 ? 1.15 : 0.32);
  float a = (slot == 1 || slot == 3 ? 0.6 : -0.6);
  vec3 d = cone ? dir + across * (a * rough.x) + up * (v * rough.y) : s.wavering;
  vec3 local;
  vec3 normal;
  float t = stoneAbove(s.surface, d, false, local, normal);
  if (t > 0.0) outLight = vec4(stoneLight(s.surface, d, t, local, normal, spread, uLit), 1.0);
}
`;

/**
 * The scene's side. Needs STONE_GLSL, SURFACE_GLSL and SET_GLSL (Hit)
 * before it.
 */
export const SLOTS_GLSL = /* glsl */ `
/* the stone's slots (stone/stone.ts): as the camera sees it, light and
   hit (slots 0–4) and normal (5–9); as the lake mirrors it, light and hit */
uniform sampler2D uStoneSeen;
uniform sampler2D uStoneMirror;
/* each set of slots: its rect's corner in the scene's target and one
   slot's size (px); the step from one slot to the next (px) */
uniform vec4 uStoneSeenRect;
uniform vec2 uStoneSeenStep;
uniform vec4 uStoneMirrorRect;
uniform vec2 uStoneMirrorStep;

/* This pixel in slot 0 of a set, or −1 outside the rect — where the stone
   cannot show (stone/stone.ts draws the rect round all of it). */
ivec2 slotTexel(vec4 rect) {
  ivec2 at = ivec2(floor(gl_FragCoord.xy - rect.xy));
  return any(lessThan(at, ivec2(0))) || any(greaterThanEqual(at, ivec2(rect.zw))) ? ivec2(-1) : at;
}

/* The stone, where the camera's ray through this pixel meets it. \`rx\`:
   the ray's step to the next pixel across; \`spread\`: the pixel's
   angular width.
   THE STONE'S EDGES ARE RESOLVED, NOT STEPPED. One ray a pixel draws its
   sloping edges as stairs, the surest mark of a render — at its silhouette
   and as much where its bright top meets a dark face. So four rays cross
   each pixel near it: where all four land on the centre's face, the centre
   is the pixel's light; where they disagree (an edge, the silhouette, the
   waterline), the four are averaged. Only what stands above the water
   counts: below it, the lake is in front. */
Hit stoneSeen(vec3 origin, vec3 ray, vec3 rx, float spread) {
  Hit h = noHit();
  ivec2 at = slotTexel(uStoneSeenRect);
  if (at.x < 0) return h;
  ivec2 next = ivec2(uStoneSeenStep);
  vec4 centre = texelFetch(uStoneSeen, at, 0);
  bool hit = centre.a > 0.0;
  h.alpha = hit ? 1.0 : 0.0;
  /* Do the four rays agree with the centre: all on its face, or all off?
     Only near it: two pixels' width round the block. */
  bool mixed = false;
  if (dot(rx, rx) > 0.0 && nearStone(origin, ray, 2.0 * spread * uStonePlan.y)) {
    vec3 normal = texelFetch(uStoneSeen, at + 5 * next, 0).xyz;
    float hits = 0.0;
    for (int i = 1; i <= 4; i++) {
      ivec2 edge = at + i * next;
      bool on = texelFetch(uStoneSeen, edge, 0).a > 0.0;
      hits += on ? 1.0 : 0.0;
      mixed = mixed || on != hit || (on && dot(texelFetch(uStoneSeen, edge + 5 * next, 0).xyz, normal) < 0.5);
    }
    h.alpha = 0.25 * hits;
  }
  if (mixed) {
    for (int i = 1; i <= 4; i++) {
      vec4 edge = texelFetch(uStoneSeen, at + i * next, 0);
      if (edge.a > 0.0) h.color += 0.25 * edge.rgb;
    }
  } else if (hit) {
    h.color = centre.rgb;
  }
  return h;
}

/* The stone in the lake at this pixel: the cone's four rays averaged, or
   the one where the water is mirror-still. Only asked where
   reflectsStone(s). */
Hit stoneMirrored(LakeSurface s) {
  Hit sum = noHit();
  ivec2 at = slotTexel(uStoneMirrorRect);
  if (at.x < 0) return sum;
  ivec2 next = ivec2(uStoneMirrorStep);
  bool cone = s.roughSubject.y >= 0.001;
  float share = cone ? 0.25 : 1.0;
  for (int i = 0; i < 4; i++) {
    if (i > 0 && !cone) break;
    vec4 ray = texelFetch(uStoneMirror, at + i * next, 0);
    sum.color += share * ray.rgb;
    sum.alpha += share * ray.a;
  }
  return sum;
}
`;
