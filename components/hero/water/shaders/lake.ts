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
  vec4 lightNear = textureLod(uSheetLight, uv, 0.0);
  /* The fog over the photograph from the camera to the water... */
  vec3 glow = vec3(0.0);
  float weight = 0.0;
  float departure = fogDeparture(origin, ray, origin.z, zWater, perDepth, densityNear, lightNear, glow, weight);

  LakeSurface s = lakeSurface(origin, ray, zWater, sigma);
  float depth;
  vec2 at = reflectBackdrop(s.surface, s.r, depth);
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
  departure += fogDeparture(s.surface, s.r, s.surface.z, depth, s.perDepth, density, light, glow, weight);
  vec3 air = airOf(glow, weight, lightNear);
  vec3 photo = mix(air, plateRadiance(at, gx, gy), plateCover(at));
  float gain;
  outColor = vec4(throughFog(photo, air, departure, depth, gain), 1.0);
}
`;
