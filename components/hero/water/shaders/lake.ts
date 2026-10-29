/**
 * ─── Water · the photograph in the lake, in GLSL ───
 *
 * Its own program (stage/shaders/scene.ts, the top): for every pixel of
 * the lake, the photograph of the shores as the water reflects it, through
 * the fog both ways — to the water and from it to the shore. The scene
 * reads it back at its own pixel (uLakePhoto) and lays it into the lake
 * with Fresnel, the stone's reflection and the dark body under it.
 *
 * BY THE MIRROR'S SYMMETRY, a reflected shore lies as far down the
 * reflected path as the shore itself lies from the camera, and so carries
 * the same fog: the photograph's value IS the reflection's, as the camera
 * sees it. What is added is the fog's departure from its average along
 * both stretches, as over the shores themselves (SET_GLSL throughFog).
 *
 * Only below the horizon (the pass is scissored there: water/lake.ts), and
 * only where the photograph's own shoreline says the pixel shows water.
 */

import { FOG_GLSL } from "../../atmosphere/shaders/fog";
import { BACKDROP_GLSL } from "../../stage/shaders/backdrop";
import { BACKDROP } from "../../stage/layers";
import { CAMERA_GLSL } from "../../stage/shaders/camera";
import { FILM_GLSL } from "../../stage/shaders/film";
import { PIXEL_GLSL } from "../../stage/shaders/pixel";
import { SET_GLSL } from "../../stage/shaders/set";
import { STONE_GLSL } from "../../stone/shaders/stone";
import { SURFACE_GLSL } from "./surface";
import { WATER_GLSL } from "./water";

export const LAKE_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
/* Texel indices and shifts (reachesSky): highp, said outright — a
   fragment shader's integers are mediump unless told (stone/shaders/
   slots.ts, the PowerVR). */
precision highp int;

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

/* Per column of the depth map, the rows where land nearer than the sky
   stands (stage/plates.ts createSkyBand): their top and bottom, over 2^L
   columns at level L. */
uniform sampler2D uSkyBand;

/* Whether the reflected ray from \`origin\` along \`ray\` can only meet the
   sky. Its image on the photograph is a straight line (shaders/backdrop.ts
   reflectBackdrop), from where its march starts out to its end at
   infinity; if no read along it can touch a row where land nearer than the
   sky stands, the march would meet the sky — or the far bank's smudge, at
   the sky's depth — and nothing nearer. */
bool reachesSky(vec3 origin, vec3 ray) {
  origin -= uPlateShift;
  float zStart = max(origin.z, uBackdropNearest);
  vec2 a = plateUv(origin + ray * ((zStart - origin.z) / ray.z));
  vec2 b = plateUvAt(ray);
  ivec2 texels = textureSize(uBackdropDepth, 0);
  vec2 size = vec2(texels);
  /* Every texel a bilinear read anywhere on the line can touch. */
  ivec2 lo = clamp(ivec2(floor(min(a, b) * size - 0.5)), ivec2(0), texels - 1);
  ivec2 hi = clamp(ivec2(floor(max(a, b) * size - 0.5)) + 1, ivec2(0), texels - 1);
  /* The level whose blocks are at least as wide as the span: two of them
     cover it. */
  int level = min(int(ceil(log2(float(hi.x - lo.x + 1)))), int(log2(float(textureSize(uSkyBand, 0).x))));
  vec2 first = texelFetch(uSkyBand, ivec2(lo.x >> level, 0), level).rg;
  vec2 last = texelFetch(uSkyBand, ivec2(hi.x >> level, 0), level).rg;
  return float(hi.y) < min(first.x, last.x) || float(lo.y) > max(first.y, last.y);
}

void main() {
  /* This pixel's footprints, taken here in uniform control flow, where
     screen derivatives are defined: on the water, and on the photograph. */
  vec2 uv = vUv;
  vec3 ray = cameraRay(uv);
  vec2 sigma = waterFootprint(ray);
  vec2 onPlate = plateUvAt(ray);
  vec2 dx = dFdx(onPlate);
  vec2 dy = dFdy(onPlate);
  outColor = vec4(0.0);
  if (ray.y >= 0.0) return;

  /* The photograph's own shoreline: where it shows land, the scene never
     asks. (A hair looser than the scene's own test, so the two can never
     disagree about a pixel the scene needs.) */
  vec3 origin = uCamPos;
  float zBack;
  vec2 backUv = locateBackdrop(origin, ray, zBack);
  if (backdropAt(backUv).y * plateCover(backUv) >= 0.9999) return;

  float perDepth = length(ray) / ray.z;
  float zWater = waterDepth(origin, ray);
  vec4 densityNear = textureLod(uSheetDensity, uv, 0.0);
  /* Held still where the air by place says (LOCAL_AIR), as in the scene. */
  float still = localAir(ray.xy / ray.z).y;
  densityNear = mix(densityNear, uSheetMean, still);
  vec4 lightNear = textureLod(uSheetLight, uv, 0.0);
  /* The fog over the photograph from the camera to the water... */
  vec3 glow = vec3(0.0);
  float weight = 0.0;
  float departure = fogDeparture(origin, ray, origin.z, zWater, perDepth, densityNear, lightNear, glow, weight);

  LakeSurface s = lakeSurface(origin, ray, zWater, sigma);
  float depth;
  vec2 at;
  if (uPlateTrees.x < 0.5 || reachesSky(s.surface, s.r)) {
    /* THE SKY WITHOUT THE MARCH (2026-10-29). A ray that can only meet the
       sky meets it at the sky's depth, at once: ~44 dependent reads a pixel
       fewer — most of the open water. AND ON A PHONE ALWAYS (the user: "no
       tree reflections on mobile"): with no trees drawn there is nothing
       for the march to find; a phone's own crop was the same to a level
       already, and only an upright window 640–700 px wide, which shows a
       little of the hidden banks, moves (≤ 7 levels on ~0.2% of pixels). */
    depth = ${BACKDROP.depthFar.toFixed(1)};
    vec3 from = s.surface - uPlateShift;
    at = plateUv(from + s.r * ((depth - from.z) / s.r.z));
  } else {
    at = reflectBackdrop(s.surface, s.r, depth);
  }
  /* A mirror keeps scale: the pixel's own footprint on the photograph,
     widened by the ripples' spread over the reflected path. */
  float path = max(min(depth, 2000.0) - s.surface.z, 0.0) / max(depth, 1.0);
  vec2 spread = s.rough * path * uPlateGeo.xy;
  vec2 gx = vec2(max(length(dx), spread.x), 0.0);
  vec2 gy = vec2(0.0, max(length(dy), spread.y));
  /* ...and from the water to the shore. */
  vec4 density;
  vec4 light;
  sheetsAlong(s.surface, s.r, depth, density, light);
  density = mix(density, uSheetMean, still);
  departure += fogDeparture(s.surface, s.r, s.surface.z, depth, s.perDepth, density, light, glow, weight);
  vec3 air = airOf(glow, weight, lightNear);
  /* THE STREAK, IN FOUR. A smear far longer than it is wide (the long
     exposure's: water/motion.ts exposure) is more than one read can take:
     the GPU filters at most 8:1 along a footprint, and past that widens it,
     and the streaks went soft across. So it is read as four abutting lengths
     of it, each within that. */
  vec2 step_ = 0.25 * gy;
  vec3 seen = vec3(0.0);
  if (uPlateTrees.x > 0.5) {
    for (int k = 0; k < 4; k++) seen += plateRadiance(at + (float(k) - 1.5) * step_, gx, step_);
  } else {
    /* On a phone, the photograph's fog only (shaders/backdrop.ts plateLight). */
    seen = 4.0 * plateLight(at, gx, step_);
  }
  vec3 photo = mix(air, 0.25 * seen, plateCover(at));
  float gain;
  /* The shore it mirrors carries the air by place it carries over it. */
  outColor = vec4(throughFog(photo, air, departure, depth, localAir(tanOfPlate(at)).x, gain), 1.0);
}
`;
