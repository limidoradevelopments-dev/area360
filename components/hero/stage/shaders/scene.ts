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
 * takes the stage's fog in front of the water. All of it is the water's own
 * pass (water/shaders/open.ts); this one burns it in.
 *
 * THE LOW MIST (atmosphere/shaders/mist.ts): the user's reference's steam
 * fog along the shores, read per direction, laid over all that lies behind
 * the stone — here, not in a pass of its own, because it is one read and a
 * few multiplies: measured, ~0.07 s more of this program's cold compile and
 * 0.07–0.2 ms of its frame, where its own full-frame pass would cost more.
 *
 * The fog sheets are the quarter-resolution volume pass (atmosphere): a local
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
 *   water/shaders/open.ts    the open water's light: its surface, the stone
 *                            and the plant mirrored, the foot under it,
 *                            the photograph's share, the fog and mist over
 *                            it (split off 2026-10-23: it was most of this
 *                            program, and a first visit's last compile)
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
import { MIST_GLSL } from "../../atmosphere/shaders/mist";
import { SLOTS_GLSL } from "../../stone/shaders/slots";
import { STONE_GLSL } from "../../stone/shaders/stone";
import { SURFACE_GLSL } from "../../water/shaders/surface";
import { WATER_GLSL } from "../../water/shaders/water";
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
${MIST_GLSL}
${SURFACE_GLSL}
${PIXEL_GLSL}
${SLOTS_GLSL}

/* the lake burned in: stops at the horizon and at the frame's foot, the
   power of the ramp between (below 1: it deepens fast under the shores) —
   its harder paper (.w) is laid in by the water's own pass */
uniform vec4 uLakeBurn;
/* the open water's light as the camera sees it (water/open.ts), at this
   target's pixels */
uniform sampler2D uWaterOpen;
/* The plant on the stone (bloom/), drawn by its own pass, as the camera sees
   it, over a rect of this target's own pixels (corner and size, px) — its
   light (premultiplied), and what it leaves of what lies behind it, the
   stone's share of the sky under it taken in. (In the lake: water/open.ts.) */
uniform sampler2D uBloomNear;
uniform vec4 uBloomRect;

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

/* \`dx\`, \`dy\`: the photograph's footprint for this pixel; \`rx\`, \`ry\`: the
   ray's step to the next pixel (derivatives, taken in uniform control flow
   in main). Returns the light, and how much of it is the photograph seen
   straight. */
vec4 shade(vec2 uv, vec2 dx, vec2 dy, vec3 rx, vec3 ry) {
  vec3 origin = uCamPos;
  vec3 ray = cameraRay(uv);
  float perDepth = length(ray) / ray.z;
  float zWater = waterDepth(origin, ray);
  vec4 density = textureLod(uSheetDensity, uv, 0.0);
  /* Where the air by place holds the fog still (LOCAL_AIR), its sheets are
     their average: no movement, over the shore or the water. */
  density = mix(density, uSheetMean, localAir(ray.xy / ray.z).y);
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
  /* THE LOW MIST (atmosphere/shaders/mist.ts): steam fog along the shores
     and lying on the water, in a grey light of its own. */
  float mistLit;
  float mist = mistDepth(ray, density, mistLit);
  vec3 mistLight = mix(uShade, fogRadiance(light.w), uMistLook.w) * mistLit;
  Hit hit = plantOver(stoneSeen(origin, ray, rx, length(rx) / length(ray)));
  /* THE STEAM ROUND THE STONE'S FOOT. The mist on the water round it lies
     on the water the stone stands in: as thick at its foot as over the
     water beside it (and its reflection) — read here, where the veil is the
     water's round it — thinning up its faces by the steam's height, a
     little of it all the way up (atmosphere/optics.ts MIST.stone). Laid
     only behind it, the moving mist stopped at its waterline and greyed its
     reflection under a dark stone: a cut-out. The plant above it, by the
     stone's plane. */
  if (hit.alpha > 0.0 && mist > 0.0) {
    float along = hit.depth < 1e5 ? hit.depth : (uSubjectDepth - origin.z) * perDepth;
    float above = max(origin.y + ray.y / length(ray) * along, 0.0);
    float through = exp(-mist * (uMistStone.x * exp(-above / uMistStone.y) + uMistStone.z));
    hit.color = hit.color * through + hit.alpha * (1.0 - through) * mistLight;
  }
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
    /* The open water, drawn by its own pass (water/open.ts: the lake's
       surface, the stone and the plant mirrored, the foot through it, the
       photograph's share, the fog over it and the mist), burned in here. */
    float down = clamp((uCenter.y - uv.y) / uCenter.y, 0.0, 1.0);
    float burn = exp2(-mix(uLakeBurn.x, uLakeBurn.y, pow(down, uLakeBurn.z)));
    behind += (1.0 - land) * burn * texelFetch(uWaterOpen, ivec2(gl_FragCoord.xy), 0).rgb;
  }
  float straight = 0.0;
  if (land > 0.001) {
    vec3 glow = vec3(0.0);
    float weight = 0.0;
    float departure = fogDeparture(origin, ray, origin.z, zBack, perDepth, density, light, glow, weight);
    vec3 air = airOf(glow, weight, light);
    float cover = plateCover(backUv);
    vec3 photo = mix(air, plateLight(backUv, dx, dy), cover);
    float gain;
    vec3 seen = throughFog(photo, air, departure, zBack, localAir(tanOfPlate(backUv)).x, gain);
    behind += land * mistSeen(seen, density, light);
    /* On a phone there is no photograph's detail to put back (plateLight). */
    straight = land * gain * cover * uPlateTrees.x;
  }
  /* The low mist over all that lies behind the stone — the trees' feet,
     the water by them, the treetops faintly; and the photograph's finer
     detail (post.ts) as dimmed as what it sharpens. */
  if (mist > 0.0) {
    float through = exp(-mist);
    behind = behind * through + (1.0 - through) * mistLight;
    straight *= through;
  }
  /* The stone over it: the fog in front of what lies behind is the
     photograph's own, so only the stone's share of the near fog stays. */
  float keep = transmit / transmitFront;
  return vec4(color + keep * (behind - fogFront), keep * straight);
}

void main() {
  /* This pixel's footprint on the photograph, taken here, in uniform
     control flow, where screen derivatives are defined (the water's own:
     water/open.ts). */
  vec2 uv = vUv;
  vec3 ray = cameraRay(uv);
  vec2 onPlate = plateUvAt(ray);
  vec2 dx = dFdx(onPlate);
  vec2 dy = dFdy(onPlate);

  outColor = shade(uv, dx, dy, dFdx(ray), dFdy(ray));
}
`;
