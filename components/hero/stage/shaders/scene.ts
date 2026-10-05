/**
 * ─── Stage · the scene ───
 *
 * The composite. For every pixel of the scene's target, one ray from the
 * camera, front to back: the fog in front of the stone, the stone (10 m),
 * then whatever lies behind — the lake, or the photograph of the shores
 * (stage/layers.ts BACKDROP), whichever the photograph's own shoreline says
 * the pixel shows.
 *
 * THE PHOTOGRAPH HOLDS THE AVERAGE FOG. It was taken in fog, and every
 * pixel of it carries the fog between the camera and that point. So the
 * stage does not lay its own fog over it again; it adds only the fog's
 * DEPARTURE from its average, at that pixel's own depth: where the sheets
 * run denser than their mean, a tree sinks into the fog; where they run
 * thinner — a gap in a bank, a hand's swipe — it comes forward. Which is
 * what fog does to a real forest, tree by tree, and why this one is a
 * volume and not a stack of sheets.
 *
 * THE LAKE. A ray that meets the water splits there (Fresnel): a share goes
 * into the dark lake, and the rest is reflected by the moving surface
 * (water/) — onto the stone if it stands in its way, and then onto the
 * photograph. Only the lake's own share (its body, under the reflection)
 * takes the stage's fog in front of the water.
 *
 * The fog sheets are the half-resolution volume pass (atmosphere): a local
 * density and light per sheet. The direct ray reads them at its own pixel; a
 * reflected ray reads each where it crosses it, projected back into the
 * frame.
 *
 * OUT: linear light, and (alpha) how much of it is the photograph seen
 * straight. The film pass (post.ts) develops it at the screen's own
 * resolution, and uses the alpha to put the photograph's finer detail back.
 *
 * ONE SCENE, SEVERAL PROGRAMS. A first visit on Windows waited ~25 s for
 * this shader to compile (a GTX 1050 Ti, an empty shader cache; repeat
 * visits ~1.5 s): Direct3D's compiler, which every Windows browser runs,
 * takes far longer over one big program than over its parts — the stone's
 * shading alone cost ~15 s of it here and 0.6 s in a program of its own.
 * So the heavy subjects are drawn by their own small programs first, and
 * this one reads what they drew, at its own pixel:
 *
 *   stone/shaders/slots.ts   the stone as the camera sees it and as the
 *                            lake mirrors it, one ray a pixel into slots,
 *                            over a rect round where it can show
 *   water/shaders/lake.ts    the photograph reflected in the lake
 *   bloom/shaders/bloom.ts   the plant on the stone, and in the lake
 *
 * The same rays, the same sums in the same order: every pass draws the
 * scene's own pixels (stage/shaders/pixel.ts), and what passes between them
 * is kept in 32-bit floats. The programs compile side by side on the
 * browser's threads — but only about two at once, so what counts is the
 * work in all of them. Measure a change by its cold compile (an empty
 * shader cache) as well as by its frame: a first visit waits once, every
 * frame pays.
 *
 * EVERY READ NAMES ITS LEVEL (textureLod, textureGrad or texelFetch), never
 * texture(). A plain texture() needs the screen's gradients, which do not
 * exist inside a branch or a loop the pixels take differently — so
 * Direct3D's compiler flattens the branches round it and every pixel runs
 * both sides. The fog's sheets and the plant's pictures have one level, so
 * level 0 IS what texture() read.
 */

import { FOG_GLSL } from "../../atmosphere/shaders/fog";
import { SLOTS_GLSL } from "../../stone/shaders/slots";
import { STONE_GLSL } from "../../stone/shaders/stone";
import { SURFACE_GLSL } from "../../water/shaders/surface";
import { WATER_GLSL } from "../../water/shaders/water";
import { WATER } from "../../water/optics";
import { BACKDROP_GLSL } from "./backdrop";
import { CAMERA_GLSL } from "./camera";
import { FILM_GLSL } from "./film";
import { PIXEL_GLSL } from "./pixel";
import { SET_GLSL } from "./set";

export const SCENE_FRAG = /* glsl */ `#version 300 es
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

/* the lake burned in: stops at the horizon and at the frame's foot, the
   power of the ramp between (below 1: it deepens fast under the shores),
   and the harder paper it is printed on (contrast against the fog's glow) */
uniform vec4 uLakeBurn;
/* the photograph in the lake (water/lake.ts), at this target's pixels */
uniform sampler2D uLakePhoto;
/* The plant on the stone (bloom/), drawn by its own pass: as the camera sees
   it, over a rect of this target's own pixels (corner and size, px) — its
   light (premultiplied), and what it leaves of what lies behind it, the
   stone's share of the sky under it taken in; and as the still lake mirrors
   it, over a rect of the frame (uv: corner, size) that fills a share of its
   texture; the plant's depth plane (m). */
uniform sampler2D uBloomNear;
uniform sampler2D uBloomMirror;
uniform vec4 uBloomRect;
uniform vec4 uBloomMirrorRect;
uniform vec2 uBloomMirrorFill;
uniform float uBloomPlane;

/* The plant over the stone, as the camera sees it at this pixel: the stone
   shaded where the plant rests on it, the plant laid over (its own pass
   has already hidden what the stone hides of it). */
Hit plantOver(Hit h) {
  ivec2 at = ivec2(gl_FragCoord.xy) - ivec2(uBloomRect.xy);
  if (any(lessThan(at, ivec2(0))) || any(greaterThanEqual(at, ivec2(uBloomRect.zw)))) return h;
  vec4 plant = texelFetch(uBloomNear, at, 0);
  h.color = plant.rgb + plant.a * h.color;
  h.alpha = 1.0 - plant.a * (1.0 - h.alpha);
  return h;
}

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

/* \`dx\`, \`dy\`: the photograph's footprint for this pixel; \`rx\`, \`ry\`: the
   ray's step to the next pixel (derivatives, taken in uniform control flow
   in main). Returns the light, and how much of it is the photograph seen
   straight. */
vec4 shade(vec2 uv, vec2 sigma, vec2 dx, vec2 dy, vec3 rx, vec3 ry) {
  vec3 origin = uCamPos;
  vec3 ray = cameraRay(uv);
  float perDepth = length(ray) / ray.z;
  float zWater = waterDepth(origin, ray);
  vec4 density = textureLod(uSheetDensity, uv, 0.0);
  vec4 light = textureLod(uSheetLight, uv, 0.0);

  float zBack;
  vec2 backUv = locateBackdrop(origin, ray, zBack);
  /* The photograph's own shoreline decides: where it shows its lake, ours.
     Past its sides there is no shore: open water to the horizon. */
  float land = ray.y >= 0.0 ? 1.0 : backdropAt(backUv).y * plateCover(backUv);

  /* The fog in front of the stone, then the stone. */
  vec3 color = vec3(0.0);
  float transmit = 1.0;
  float zFront = min(uSubjectDepth, zWater);
  fogSpan(color, transmit, origin, ray, origin.z, zFront, perDepth, density, light);
  vec3 fogFront = color;
  float transmitFront = transmit;
  Hit hit = plantOver(stoneSeen(origin, ray, rx, length(rx) / length(ray)));
  /* The stone counts only above the water (stoneAbove): what it covers of
     this pixel stands in front of whatever lies behind. */
  if (hit.alpha > 0.0) {
    color += transmit * hit.color;
    transmit *= 1.0 - hit.alpha;
    /* Fully covered by the stone: nothing behind can show. */
    if (transmit < 0.004) return vec4(color, 0.0);
  }

  /* What lies behind the stone, as the camera sees it. */
  vec3 behind = vec3(0.0);
  if (land < 0.999) {
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
    float burn = exp2(-mix(uLakeBurn.x, uLakeBurn.y, pow(down, uLakeBurn.z)));
    vec3 mirrored = fogTransmit * lake.subject;
    vec3 water = fog + fogTransmit * lake.own + lake.share * (lake.photo - fog) - mirrored;
    float glowLevel = fogRadiance(light.w).g;
    water *= pow(clamp(water.g / glowLevel, 1e-4, 1.0), uLakeBurn.w * down);
    vec3 open = water + mirrored;
    /* The mist over the water, fading in with distance, never switched. */
    open = mix(open, mistSeen(open, density, light), smoothstep(uMistSeen.z, uMistSeen.w, zWater));
    behind += (1.0 - land) * burn * open;
  }
  float straight = 0.0;
  if (land > 0.001) {
    vec3 glow = vec3(0.0);
    float weight = 0.0;
    float departure = fogDeparture(origin, ray, origin.z, zBack, perDepth, density, light, glow, weight);
    vec3 air = airOf(glow, weight, light);
    float cover = plateCover(backUv);
    vec3 photo = mix(air, plateRadiance(backUv, dx, dy), cover);
    float gain;
    vec3 seen = throughFog(photo, air, departure, zBack, gain);
    behind += land * mistSeen(seen, density, light);
    straight = land * gain * cover;
  }
  /* The stone over it: the fog in front of what lies behind is the
     photograph's own, so only the stone's share of the near fog stays. */
  float keep = transmit / transmitFront;
  return vec4(color + keep * (behind - fogFront), keep * straight);
}

void main() {
  /* This pixel's footprints — on the water, from how the water point moves
     between neighbouring pixels, and on the photograph — taken here, in
     uniform control flow, where screen derivatives are defined. */
  vec2 uv = vUv;
  vec3 ray = cameraRay(uv);
  vec2 sigma = waterFootprint(ray);
  vec2 onPlate = plateUvAt(ray);
  vec2 dx = dFdx(onPlate);
  vec2 dy = dFdy(onPlate);

  outColor = shade(uv, sigma, dx, dy, dFdx(ray), dFdy(ray));
}
`;
