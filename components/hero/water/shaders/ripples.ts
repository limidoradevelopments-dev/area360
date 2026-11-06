/**
 * ─── Water · the hand's ripples, in GLSL ───
 *
 * The hand's touches on the water (water/motion.ts HAND_RIPPLES), worked
 * out once a pixel by a program of their own (water/ripples.ts), into a
 * picture of the scene's pixels that the three programs drawing the lake
 * read back at theirs (shaders/surface.ts lakeSurface): its slope where
 * the camera's ray meets the water.
 *
 * A PROGRAM OF ITS OWN (2026-11-06). Inside the lake's surface, which the
 * open water, the photograph in the lake and the stone's mirror all
 * compile, the ring trains cost the open water ~0.3 s of its cold compile
 * and the mirror's surface ~0.15 s (this machine, an AMD integrated GPU,
 * a nonce in every source; the open water is among a first visit's
 * longest: stage/shaders/scene.ts, the top) — and three programs worked
 * the same rings out at the same pixel. Here: one small program, drawn
 * only while a ring lives, read with one fetch.
 */

import { CAMERA_GLSL } from "../../stage/shaders/camera";
import { PIXEL_GLSL } from "../../stage/shaders/pixel";
import { STONE_SHAPE_GLSL } from "../../stone/shaders/stone";
import { HAND_SOURCES } from "../touch";

export const RIPPLES_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;

in vec2 vUv;
out vec4 outSlope;

${CAMERA_GLSL}
${STONE_SHAPE_GLSL}
${PIXEL_GLSL}

#define HAND_SOURCES ${HAND_SOURCES}
/* The live ring trains, packed by the CPU (water/touch.ts) — where each
   comes from (x, z), its age (s) plus 100 × its kind (0 a touch clear of
   the stone, 1 a touch near it, its shadow to be cut; 2 and 3 its image
   behind the stone's front-left and front-right face, seen only through
   it), its slope now — and how many are live; the box they cover (x, z
   least, most); the longest and shortest drawn wave's wavenumber, g/4, and
   how fast a train's leading ring runs out (m/s); the stone's shadow's
   soft edge (in shares of its plan) and their gain (1 = designed). */
uniform vec4 uHandWaves[HAND_SOURCES];
uniform int uHandCount;
uniform vec4 uHandBox;
uniform vec4 uHandLook;
uniform vec2 uHand;

/* The plan's diamond at a point relative to its centre: 1 on its edge. */
float planReach(vec2 q) {
  return abs(q.x) / uStonePlan.z + abs(q.y) / uStonePlan.w;
}

/* How much of a ring running straight from \`from\` reaches \`to\`: none
   where the stone stands between them, eased at its edges (the ring bends
   round a corner). The diamond's measure along the line is convex and
   piecewise straight: its least is at an end or where the line crosses an
   axis. */
float handClear(vec2 from, vec2 to) {
  vec2 a = from - uStonePlan.xy;
  vec2 d = to - from;
  float least = min(planReach(a), planReach(a + d));
  float sx = clamp(-a.x / (abs(d.x) > 1e-6 ? d.x : 1e-6), 0.0, 1.0);
  float sz = clamp(-a.y / (abs(d.y) > 1e-6 ? d.y : 1e-6), 0.0, 1.0);
  least = min(least, min(planReach(a + d * sx), planReach(a + d * sz)));
  return smoothstep(1.0, 1.0 + uHand.x, least);
}

/* How much of an echo — a ring from the image \`image\` behind the face
   from \`a\` to \`b\` (relative to the stone's centre) — is seen at \`p\`:
   only through that face, so where the line from the image to p crosses
   it, eased at its corners. */
float handThrough(vec2 image, vec2 p, vec2 a, vec2 b) {
  vec2 q = image - uStonePlan.xy;
  vec2 to = p - image;
  vec2 face = b - a;
  float denom = to.x * face.y - to.y * face.x;
  if (abs(denom) < 1e-6) return 0.0;
  vec2 qa = a - q;
  float s = (qa.x * face.y - qa.y * face.x) / denom;
  float u = (qa.x * to.y - qa.y * to.x) / denom;
  if (s <= 0.0 || s >= 1.0) return 0.0;
  return smoothstep(-0.06, 0.06, u) * smoothstep(-0.06, 0.06, 1.0 - u);
}

/* The hand's ripples at \`p\` on the water: every live ring train — the
   touches, cut off behind the stone, and the stone's echoes of them. Each
   train at r metres from where it starts, t seconds after: the phase
   g·t²/(4r), its local wavenumber that over r; drawn only over the band's
   lengths, filtered by the pixel's footprint as the waves are. One loop to
   a uniform's count, one copy of each test. */
vec2 handSlope(vec2 p, vec2 sigma) {
  vec2 slope = vec2(0.0);
  vec2 corner = vec2(uStonePlan.z, 0.0);
  vec2 front = vec2(0.0, -uStonePlan.w);
  for (int i = 0; i < uHandCount; i++) {
    vec4 w = uHandWaves[i];
    float kind = floor(w.z * 0.01);
    float t = w.z - 100.0 * kind;
    vec2 to = p - w.xy;
    float r = length(to) + 1e-4;
    if (r >= t * uHandLook.w) continue;
    float seen = 1.0;
    if (kind > 1.5) seen = handThrough(w.xy, p, kind < 2.5 ? -corner : front, kind < 2.5 ? front : corner);
    else if (kind > 0.5) seen = handClear(w.xy, p);
    if (seen <= 0.0) continue;
    float phase = uHandLook.z * t * t / r;
    float k = phase / r;
    float band = smoothstep(0.6 * uHandLook.x, uHandLook.x, k) * (1.0 - smoothstep(0.7 * uHandLook.y, uHandLook.y, k));
    vec2 dir = to / r;
    vec2 ks = k * dir * sigma;
    slope += w.w * uHand.y * seen * band * sin(phase) * exp(-0.5 * dot(ks, ks)) * dir;
  }
  return slope;
}

void main() {
  /* The footprint first, in uniform control flow (shaders/pixel.ts). */
  vec3 ray = cameraRay(vUv);
  vec2 sigma = waterFootprint(ray);
  outSlope = vec4(0.0);
  if (ray.y >= 0.0) return;
  vec2 at = (uCamPos + ray * (uCamPos.y / -ray.y)).xz;
  if (any(lessThan(at, uHandBox.xy)) || any(greaterThan(at, uHandBox.zw))) return;
  outSlope = vec4(handSlope(at, sigma), 0.0, 0.0);
}
`;
