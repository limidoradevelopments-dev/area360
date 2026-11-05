/**
 * ─── 404 · the composite: fog, the hero's water, the set, the print ───
 *
 * Every pixel of the frame, every frame drawn (scene/engine.ts):
 *
 *   THE FIELD   the user's frame's own fog, far banks and water (plate.ts),
 *               read by the pixel's direction from the camera, so it stays
 *               in the world as the camera leans
 *   THE WATER   THE HERO'S LAKE (2026-11-05, the user: "the water needs to
 *               be like the hero one"): its surface by the hero's own code
 *               and values (hero/water/shaders: waterNormal, the lapping
 *               at the stone, lakeSurface — its undulation under the long
 *               exposure, its Fresnel, the stone's reflection wavering as
 *               the hero's does and blurred by the hero's cone). What it
 *               reflects is the field where the flat lake would have shown
 *               that ray, and the set's mirror picture where the hero's
 *               wavering ray meets it
 *   THE SET     the stone's picture, with the flowers (shaders/set.ts)
 *   THE PRINT   the frame's grain at the screen's CSS pixels, its warm tone
 *
 * No march: the waves (the hero's few, worked out on the CPU each frame:
 * hero/stage/uniforms.ts), two pictures already made. It is what runs 30
 * times a second at rest.
 */

import { PIXEL_GLSL } from "@/components/hero/stage/shaders/pixel";
import { STONE_GLSL } from "@/components/hero/stone/shaders/stone";
import { SURFACE_GLSL } from "@/components/hero/water/shaders/surface";
import { WATER_GLSL } from "@/components/hero/water/shaders/water";

import { CAMERA_GLSL, HEAD_GLSL, NOISE_GLSL, NOISE_SIZE, PRINT_GLSL } from "./common";

export const COMPOSITE_UNIFORMS = [
  "uView", "uFocal", "uCenter", "uCamPos", "uCamRot", "uNoise",
  "uFrame", "uPlate", "uPlateSpan", "uSet", "uSetRect", "uSetScale", "uSetTexels", "uMirrorImage", "uMirrorRect",
  "uMirrorScale", "uMirrorTexels", "uGrainSeed", "uGrain", "uCssPerPx", "uTone", "uFogLight", "uWaterBase", "uRings",
  "uWaterBody", "uWaterR0", "uWaves", "uWaterTime", "uWaterGain", "uWaterSmear", "uCatsPaws", "uWind",
  "uWaterClarity", "uSubjectWaver", "uMinElevation", "uLaps", "uLapFade",
  "uStonePlan", "uStoneSpan", "uStoneAlbedo", "uStoneLight", "uLightSide", "uStoneFoot", "uStoneSheen",
  "uStoneGrain", "uStoneFine", "uStoneWeather", "uStoneLichen", "uStoneWear", "uStoneWater", "uStoneUnder",
  "uStoneMeniscus", "uSubjectDepth", "uStoneNoise",
] as const;

export const COMPOSITE_FRAG = /* glsl */ `${HEAD_GLSL}
${CAMERA_GLSL}
${NOISE_GLSL}
${PRINT_GLSL}
${PIXEL_GLSL}
${WATER_GLSL}
${STONE_GLSL}
${SURFACE_GLSL}

uniform vec2 uFrame;
/* the field (sRGB levels, R8) and the directions it spans: across (left,
   right), up (lowest, highest), as tan */
uniform sampler2D uPlate;
uniform vec4 uPlateSpan;
/* the set's picture and its mirror: each its rect in the frame (origin,
   size: px), its texels a frame px, its target's size (texels) */
uniform sampler2D uSet;
uniform vec4 uSetRect;
uniform float uSetScale;
uniform vec2 uSetTexels;
uniform sampler2D uMirrorImage;
uniform vec4 uMirrorRect;
uniform float uMirrorScale;
uniform vec2 uMirrorTexels;
/* the grain's frame (a new seed each) and its amount (± a share of white
   at mid-grey); CSS px a frame px */
uniform float uGrainSeed;
uniform float uGrain;
uniform float uCssPerPx;
/* the print's warm tone: red, blue (a share of white) */
uniform vec2 uTone;
/* the fog's light and the lake's own, in the print (linear); how much of
   the hero's surface the print shows */
uniform float uFogLight;
uniform float uWaterBase;
uniform float uRings;

out vec4 outColor;

/* The field, as the frame prints it (linear), along a direction. */
float fieldAlong(vec3 d) {
  vec2 dir = d.xy / d.z;
  vec2 at = (dir - uPlateSpan.xz) / (uPlateSpan.yw - uPlateSpan.xz);
  return toLight1(textureLod(uPlate, at, 0.0).r);
}

/* A picture's premultiplied read at a frame px, clear outside its rect. */
vec4 pictureAt(sampler2D image, vec4 rect, float scale, vec2 texels, vec2 px) {
  vec2 local = px - rect.xy;
  if (any(lessThan(local, vec2(0.0))) || any(greaterThan(local, rect.zw))) return vec4(0.0);
  return textureLod(image, local * scale / texels, 0.0);
}

/* Where in the frame (px) the camera looks along a world direction. */
vec2 framePxOf(vec3 d) {
  vec3 c = transpose(uCamRot) * d;
  return (c.xy / c.z * uFocal / uView + uCenter) * uFrame;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec3 ray = cameraRay(px / uFrame);
  /* The pixel's footprint on the water: derivatives, so here, before any
     branch. */
  vec2 sigma = waterFootprint(ray);

  float light = fieldAlong(ray);
  if (ray.y < 0.0) {
    LakeSurface s = lakeSurface(uCamPos, ray, waterDepth(uCamPos, ray), sigma);
    /* THE HERO'S LAKE, OVER THE USER'S FIELD. The field below the horizon
       is the frame's water as a flat lake gives it: its own light, and the
       sky it mirrors along the flat mirror's ray. The hero's surface
       changes what it mirrors — the sky along the ray its tilt reflects
       (the field above the horizon: the banks waver with it) and how much
       (its Fresnel at that tilt) — and the field is moved by that, against
       the flat lake's, as much as the hero's print shows of it (uRings:
       registered on the hero's frame, its rings a few levels). */
    vec3 flatMirror = vec3(s.d.x, max(-s.d.y, 0.0), s.d.z);
    vec3 tilted = vec3(s.r.x, max(s.r.y, 0.0), s.r.z);
    float moved = s.reflectance * fieldAlong(tilted) / max(waterReflectance(-s.d.y) * fieldAlong(flatMirror), 1e-4) - 1.0;
    light = uWaterBase + (light - uWaterBase) * max(1.0 + uRings * moved, 0.0);
    float share = max(light - uWaterBase, 0.0) / uFogLight;

    /* The set's mirror image, where the hero's wavering ray finds it, in
       the hero's cone (its spread across and up): four reads. A tilt moves
       a reflection by the tilt times the path from the water to what it
       reflects (hero/water/shaders/surface.ts): at the stone's foot almost
       nothing, further out more — so the wavering ray's turn is carried
       onto the picture by that path's share of the whole, from the camera
       to the reflected stone (read as infinitely far, the foot's
       reflection broke into spikes). */
    vec2 away;
    float path = stoneWaterline(s.surface.xz, away) + uStoneSpan.y;
    float near_ = path / (path + length(s.surface - uCamPos));
    vec2 at = px + (framePxOf(vec3(s.wavering.x, -s.wavering.y, s.wavering.z)) - px) * near_;
    vec2 spread = s.roughSubject * uFocal * (uFrame.x / uView.x) * 0.5 * near_;
    vec4 m = 0.25 * (pictureAt(uMirrorImage, uMirrorRect, uMirrorScale, uMirrorTexels, at + vec2(-spread.x, -spread.y))
                   + pictureAt(uMirrorImage, uMirrorRect, uMirrorScale, uMirrorTexels, at + vec2(spread.x, -spread.y))
                   + pictureAt(uMirrorImage, uMirrorRect, uMirrorScale, uMirrorTexels, at + vec2(-spread.x, spread.y))
                   + pictureAt(uMirrorImage, uMirrorRect, uMirrorScale, uMirrorTexels, at + vec2(spread.x, spread.y)));
    if (m.a > 0.002) {
      float mirrored = toLight(m.rgb / m.a).g;
      light = mix(light, uWaterBase + share * mirrored, m.a);
    }
  }

  /* To the print, then the set over it (its picture is in print levels,
     premultiplied: its edges average there). */
  vec3 c = toPrint(vec3(light));
  vec4 set = pictureAt(uSet, uSetRect, uSetScale, uSetTexels, px);
  c = c * (1.0 - set.a) + set.rgb;

  /* The grain: a new frame of it at the film's rate, a speck a CSS px,
     most in the midtones as film's is. */
  vec2 cell = floor(px * uCssPerPx) + vec2(uGrainSeed * 73.0, uGrainSeed * 151.0);
  float g = texelFetch(uNoise, ivec2(mod(cell, ${NOISE_SIZE}.0)), 0).r - 0.5;
  float mid = 4.0 * c.g * (1.0 - c.g);
  c += g * 2.0 * uGrain * (0.35 + 0.65 * mid);

  c.r += uTone.x;
  c.b += uTone.y;
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
