/**
 * ─── Water · the open water, in GLSL ───
 *
 * Its own program (stage/shaders/scene.ts, the top): for every pixel of the
 * lake, the water's light as the camera sees it — the moving surface, the
 * stone and the plant mirrored in it, the stone's foot seen through it, the
 * photograph's share (water/shaders/lake.ts drew it), the fog over all of it
 * and the mist — which the scene reads back at its own pixel (uWaterOpen)
 * and burns in. The scene's own code, moved here whole: the same sums in the
 * same order, handed over in 32-bit floats.
 *
 * WHY A PROGRAM OF ITS OWN (2026-10-23). On a first visit the scene was the
 * last program to compile by seconds — 5.9 s alone on Windows, 14.5 s with
 * the curtain's animations running, everything else done by 7 — and the
 * water was most of it. Direct3D's compiler takes far longer over one big
 * program than over its parts: split here, the two compile in 0.63 s and
 * 0.29 s where the one took 1.48 (single-threaded, offline, FXC), and side
 * by side.
 *
 * Only below the horizon (the pass is scissored there: water/open.ts), and
 * only where the photograph's own shoreline says the pixel shows water.
 */

import { FOG_GLSL } from "../../atmosphere/shaders/fog";
import { BACKDROP_GLSL } from "../../stage/shaders/backdrop";
import { CAMERA_GLSL } from "../../stage/shaders/camera";
import { FILM_GLSL } from "../../stage/shaders/film";
import { PIXEL_GLSL } from "../../stage/shaders/pixel";
import { SET_GLSL } from "../../stage/shaders/set";
import { SLOTS_GLSL } from "../../stone/shaders/slots";
import { STONE_GLSL } from "../../stone/shaders/stone";
import { WATER } from "../optics";
import { SURFACE_GLSL } from "./surface";
import { WATER_GLSL } from "./water";

export const OPEN_WATER_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
out vec4 outColor;

${CAMERA_GLSL}
${FOG_GLSL}
${WATER_GLSL}
${STONE_GLSL}
${FILM_GLSL}
${BACKDROP_GLSL}
${SET_GLSL}
${SURFACE_GLSL}
${PIXEL_GLSL}
${SLOTS_GLSL}

/* the lake's harder paper (.w: contrast against the fog's glow; the burn
   itself, .xyz, the scene lays on) */
uniform vec4 uLakeBurn;
/* the photograph in the lake (water/lake.ts), at this target's pixels */
uniform sampler2D uLakePhoto;
/* The plant on the stone (bloom/) as the still lake mirrors it, over a rect
   of the frame (uv: corner, size) that fills a share of its texture; the
   plant's depth plane (m). */
uniform sampler2D uBloomMirror;
uniform vec4 uBloomMirrorRect;
uniform vec2 uBloomMirrorFill;
uniform float uBloomPlane;

/* The plant in the lake, over the stone's reflection: where the reflected
   ray (from \`surface\`, along \`dir\`) crosses the plant's depth, mirrored
   under the water, is where the mirror pass drew it — so the lake's tilt
   moves its reflection exactly as it moves the stone's. */
Hit plantMirrored(Hit h, vec3 surface, vec3 dir) {
  if (dir.z <= 1e-4) return h;
  vec3 q = surface + dir * ((uBloomPlane - surface.z) / dir.z);
  q.y = -q.y;
  vec2 at = (projectUv(q) - uBloomMirrorRect.xy) / uBloomMirrorRect.zw;
  if (any(lessThan(at, vec2(0.0))) || any(greaterThan(at, vec2(1.0)))) return h;
  vec4 plant = textureLod(uBloomMirror, at * uBloomMirrorFill, 0.0);
  h.color = plant.rgb + plant.a * h.color;
  h.alpha = 1.0 - plant.a * (1.0 - h.alpha);
  return h;
}

/* What the lake gives back where this ray meets it, in two parts: its own
   light, as seen at the water (the stone reflected, and the dark
   body under the reflection), and the photograph reflected — already as the
   camera sees it (water/shaders/lake.ts) — with the share of it the water
   returns. */
struct Lake {
  vec3 own;
  /* the part of \`own\` that is the stage's: the stone reflected,
     and the stone's foot seen through the water */
  vec3 subject;
  vec3 photo;
  float share;
};

Lake lakeAt(vec3 origin, vec3 ray, float zWater, vec2 sigma) {
  LakeSurface s = lakeSurface(origin, ray, zWater, sigma);

  /* The stone, from the water in front of it. */
  vec3 subject = vec3(0.0);
  float cover = 1.0;
  if (beforeStone(s)) {
    /* The stone's slots in the lake (stone/shaders/slots.ts) — and where
       nothing is reflected, the fog in front of it weighs nothing: fogged
       only where it shows. */
    Hit hit = noHit();
    if (reflectsStone(s)) hit = stoneMirrored(s);
    hit = plantMirrored(hit, s.surface, s.wavering);
    if (hit.alpha > 0.0) {
      vec4 density;
      vec4 light;
      float zSubject = max(uSubjectDepth, s.surface.z);
      sheetsAlong(s.surface, s.r, zSubject, density, light);
      vec3 fog = vec3(0.0);
      float transmit = 1.0;
      fogSpan(fog, transmit, s.surface, s.r, s.surface.z, zSubject, s.perDepth, density, light);
      /* The fog in front of the stone is its own: the photograph behind
         carries its own. */
      subject = fog * hit.alpha + transmit * hit.color;
      cover = 1.0 - hit.alpha;
    }
  }

  /* INTO THE WATER. What the surface lets through is the lake's dark body —
     and, below the stone's waterline, its foot: lit by what daylight
     reaches that deep, seen through as much water as its light crosses
     coming up, wavering with every tilt of the surface. It shows for a
     hand's depth and is gone by half a metre: the stone goes on down.
     WHERE, AS THE DESIGN'S VIEW HAS IT: the faces carried straight on down
     under the surface, as the frame draws the stone (stone/optics.ts
     STONE). Bent at the surface as light is, a ray meets the block's
     steeply turned faces only in slivers round its front corner; carried
     on, it finds the foot under each face, and the surface's tilt still
     sways it — as much as it sways the bent ray. HOW DIM: by the path its
     light takes up through the water, which is the bent one. */
  vec3 under = uWaterBody;
  vec3 bentLevel = refract(s.d, vec3(0.0, 1.0, 0.0), 1.0 / ${WATER.ior.toFixed(3)});
  vec3 into = normalize(s.d + refract(s.d, s.n, 1.0 / ${WATER.ior.toFixed(3)}) - bentLevel);
  vec3 footLocal;
  vec3 footNormal;
  float tFoot = hitStone(s.surface, into, footLocal, footNormal);
  if (tFoot > 0.0) {
    vec3 q = s.surface + into * tFoot;
    float depth = max(-q.y, 0.0);
    float reach = uWaterClarity.z * exp(-uWaterClarity.y * depth);
    float seen = exp(-uWaterClarity.x * depth / max(-bentLevel.y, 0.1));
    under = mix(uWaterBody, shadeStoneUnder(q, footLocal, footNormal, reach, uLit), seen);
  }

  Lake lake;
  /* The stage's own light in the water — the stone mirrored, its foot
     through it — kept apart from the photograph's (see the harder paper,
     in shade). */
  lake.subject = s.reflectance * subject + (1.0 - s.reflectance) * (under - uWaterBody);
  lake.own = s.reflectance * subject + (1.0 - s.reflectance) * under;
  lake.share = s.reflectance * cover;
  lake.photo = vec3(0.0);
  if (lake.share > 0.002) lake.photo = texelFetch(uLakePhoto, ivec2(gl_FragCoord.xy), 0).rgb;
  return lake;
}

void main() {
  /* This pixel's footprint on the water, from how the water point moves
     between neighbouring pixels — taken here, in uniform control flow,
     where screen derivatives are defined. */
  vec2 uv = vUv;
  vec3 ray = cameraRay(uv);
  vec2 sigma = waterFootprint(ray);
  outColor = vec4(0.0);
  if (ray.y >= 0.0) return;

  /* The photograph's own shoreline: where it shows land, the scene never
     asks. (A hair looser than the scene's own test, so the two can never
     disagree about a pixel the scene needs.) */
  vec3 origin = uCamPos;
  float zBack;
  vec2 backUv = locateBackdrop(origin, ray, zBack);
  if (backdropAt(backUv).y * plateCover(backUv) >= 0.9999) return;

  /* As the scene has them: the fog's sheets at this pixel, and the fog in
     front of the stone (or of the water, short of it). */
  float perDepth = length(ray) / ray.z;
  float zWater = waterDepth(origin, ray);
  vec4 density = textureLod(uSheetDensity, uv, 0.0);
  density = mix(density, uSheetMean, localAir(ray.xy / ray.z).y);
  vec4 light = textureLod(uSheetLight, uv, 0.0);
  vec3 fogFront = vec3(0.0);
  float transmitFront = 1.0;
  float zFront = min(uSubjectDepth, zWater);
  fogSpan(fogFront, transmitFront, origin, ray, origin.z, zFront, perDepth, density, light);

  vec3 fog = fogFront;
  float fogTransmit = transmitFront;
  fogSpan(fog, fogTransmit, origin, ray, zFront, zWater, perDepth, density, light);
  Lake lake = lakeAt(origin, ray, zWater, sigma);
  /* R·photo + (1 − R)·(fog + T·body), with the stone in it, then
     burned in (stage/optics.ts FILM.lakeBurn). The harder paper is for
     the photograph's reflections, whose darks the moving ripples fill
     with sky; the stone's reflection is the stage's own, and
     printed on it went near black, under the design's (~24). */
  float down = clamp((uCenter.y - uv.y) / uCenter.y, 0.0, 1.0);
  vec3 mirrored = fogTransmit * lake.subject;
  vec3 water = fog + fogTransmit * lake.own + lake.share * (lake.photo - fog) - mirrored;
  float glowLevel = fogRadiance(light.w).g;
  water *= pow(clamp(water.g / glowLevel, 1e-4, 1.0), uLakeBurn.w * down);
  vec3 open = water + mirrored;
  /* The mist over the water, fading in with distance, never switched. */
  open = mix(open, mistSeen(open, density, light), smoothstep(uMistSeen.z, uMistSeen.w, zWater));
  outColor = vec4(open, 0.0);
}
`;
