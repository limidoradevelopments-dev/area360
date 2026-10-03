/**
 * ─── Stage · the scene ───
 *
 * The one full-resolution pass. For every pixel, one ray from the camera,
 * front to back: the fog in front of the stone, the stone (10 m), then
 * whatever lies behind — the lake, or the photograph of the shores
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
 * (water/) — onto the stone if it stands in its way, and then onto
 * the photograph, found by marching the reflected ray against its depth.
 * By the mirror's symmetry, a reflected shore lies as far down the reflected
 * path as the shore itself lies from the camera, and so carries the same
 * fog: the photograph's value IS the reflection's, as the camera sees it.
 * Only the lake's own share (its body, under the reflection) takes the
 * stage's fog in front of the water.
 *
 * The fog sheets are the half-resolution volume pass (atmosphere): a local
 * density and light per sheet. The direct ray reads them at its own pixel; a
 * reflected ray reads each where it crosses it, projected back into the
 * frame.
 *
 * OUT: linear light, and (alpha) how much of it is the photograph seen
 * straight. The film pass (post.ts) develops it at the screen's own
 * resolution, and uses the alpha to put the photograph's finer detail back.
 */

import { FOG_GLSL } from "../../atmosphere/shaders/fog";
import { STONE_GLSL } from "../../stone/shaders/stone";
import { WATER_GLSL } from "../../water/shaders/water";
import { WATER } from "../../water/optics";
import { BACKDROP_GLSL } from "./backdrop";
import { CAMERA_GLSL } from "./camera";
import { FILM_GLSL } from "./film";

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

/* the fog sheets: density per sheet; light on sheets 0–2 and the plain light */
uniform sampler2D uSheetDensity;
uniform sampler2D uSheetLight;
/* each sheet's average density: the fog the photograph already holds */
uniform vec4 uSheetMean;
/* how much of each sheet's departure from that average shows over the
   photograph, times the overall amount */
uniform vec4 uSheetLife;
uniform float uFogLife;
/* the most any patch may thicken or thin, as optical depth (soft limit) */
uniform float uFogReach;
/* aerial depth (atmosphere/optics.ts AERIAL): optical depth per metre, the
   depth it is zero at, the share kept nearer than that, the most it may add
   or take (soft limit) */
uniform vec4 uAerial;
/* soft blacks (atmosphere/optics.ts SOFT_BLACK): optical depth added at a
   black, by darkness squared; full nearer than y metres, gone by z */
uniform vec3 uSoftBlack;
/* the mist seen moving (atmosphere/optics.ts MIST_SEEN): its veil over the
   dark, its self-shading over the open fog, and where it fades in over the
   water (metres) */
uniform vec4 uMistSeen;
/* the stone's centre plane (DEPTH.subject, m): where the near fog ends */
uniform float uSubjectDepth;
/* the lowest a reflected ray may dip, as a share of its mirror elevation */
uniform float uMinElevation;
/* the lake burned in: stops at the horizon and at the frame's foot, the
   power of the ramp between (below 1: it deepens fast under the shores),
   and the harder paper it is printed on (contrast against the fog's glow) */
uniform vec4 uLakeBurn;

struct Hit {
  /* premultiplied */
  vec3 color;
  float alpha;
  /* depth along the ray (metres), to order it against the water */
  float depth;
};

Hit noHit() {
  Hit h;
  h.color = vec3(0.0);
  h.alpha = 0.0;
  h.depth = 1e6;
  return h;
}

/* A sheet's light: sheets 0–2 carry their own; the far sheet and the sky
   share the plain light. */
float lightOf(vec4 light, int k) {
  return k >= 3 ? light.w : light[k];
}

/* The sheet just behind depth z: what a thing standing at z is seen
   against (4: past the last edge, the sky). */
int sheetBehind(float z) {
  return int(z >= uSheetEdge.x) + int(z >= uSheetEdge.y) + int(z >= uSheetEdge.z) + int(z >= uSheetEdge.w);
}

/* The fog between depths za and zb, across whichever sheets lie there. */
void fogSpan(inout vec3 color, inout float transmit, vec3 origin, vec3 ray, float za, float zb, float perDepth,
             vec4 density, vec4 light) {
  for (int k = 0; k < 4; k++) {
    float a = max(za, sheetStart(k));
    float b = min(zb, uSheetEdge[k]);
    fogBetween(color, transmit, origin, ray, k, a, b, perDepth, density[k], lightOf(light, k));
  }
}

/* The fog over the photograph between za and zb. Returns its DEPARTURE
   from its average, as optical depth (positive: denser than the fog the
   photograph holds), each sheet weighed by the average fog in front of it.
   Adds the glow of that fog, weighed the same way, to \`glow\` and \`weight\`
   (airOf turns them into the fog's colour): a reflection's fog is the sum
   of two stretches, the one to the water and the one beyond it. */
float fogDeparture(vec3 origin, vec3 ray, float za, float zb, float perDepth, vec4 density, vec4 light,
                   inout vec3 glow, inout float weight) {
  float departure = 0.0;
  float held = 0.0;
  for (int k = 0; k < 4; k++) {
    float a = max(za, sheetStart(k));
    float b = min(zb, uSheetEdge[k]);
    if (b <= a) continue;
    float zMid = 0.5 * (a + b);
    float yMid = origin.y + ray.y * ((zMid - origin.z) / ray.z);
    float share = (b - a) / (uSheetEdge[k] - sheetStart(k));
    float base = ((opticalDepthTo(b) - opticalDepthTo(a)) * liftAt(yMid) + uSheetVeil[k] * share) * perDepth;
    float front = exp(-held);
    departure += front * base * uSheetLife[k] * (density[k] - uSheetMean[k]);
    glow += front * base * fogRadiance(lightOf(light, k));
    weight += front * base;
    held += base * uSheetMean[k];
  }
  return departure * uFogLife;
}

/* The fog's colour from a gathered glow. A stretch past the last sheet
   gathers none; there the fog is the plain light's (the sky's). */
vec3 airOf(vec3 glow, float weight, vec4 light) {
  return weight > 1e-4 ? glow / weight : fogRadiance(light.w);
}

/* The photograph's light, with the fog's departure laid over it. A pixel of
   it is what stands there seen through the fog in front — T·thing +
   (1 − T)·air — so thicken that fog by a departure d and the part of the
   pixel that is not fog (air − photo) shows through e^(−d) of itself; thin
   it, and e^(+d). ONE LAW BOTH WAYS: fog drifting about its average leaves
   the forest, on average, as photographed. (A thinning that revealed less
   than a thickening hid hazed the whole forest by ~18 levels.)
   HOW FAR A PIXEL CAN COME FORWARD IS IN THE PIXEL: the sky, the fog's own
   glow, does not move at all, since there is nothing behind fog but more
   fog; and nothing clears past the photograph's own black, the darkest any
   of its trees prints, so a gap reveals the dark forest and never a hole
   darker than it. Softly limited (uFogReach): fog moves through a forest,
   it does not swallow it or strip it. \`gain\` returns how much of the
   photograph's own light comes through. */
vec3 throughFog(vec3 photo, vec3 air, float departure, float depth, out float gain) {
  /* Over the open sky the photograph's fog is smooth; there the movement is
     a breath, not a bank. */
  float far = smoothstep(250.0, 700.0, depth);
  departure = uFogReach * tanh(departure / uFogReach) * mix(1.0, 0.35, far);
  /* The still fog of distance, by the same law: far banks further in, near
     ones out. */
  float aerial = uAerial.x * (depth - uAerial.y);
  departure += uAerial.w * tanh(aerial * (aerial < 0.0 ? uAerial.z : 1.0) / uAerial.w);
  /* The near bank's darkest trees, a little further into the air. */
  float dark = clamp(1.0 - photo.g / max(air.g, 1e-4), 0.0, 1.0);
  departure += uSoftBlack.x * dark * dark * (1.0 - smoothstep(uSoftBlack.y, uSoftBlack.z, depth));
  gain = exp(-departure);
  vec3 c = air - (air - photo) * gain;
  /* A smooth floor at the photograph's black (or the pixel itself, if
     darker): the soft max of the two, so no contour where it takes hold. */
  float floor_ = min(photo.g, undevelop(0.0).g);
  float v = c.g - floor_;
  float k = 0.25 * floor_ + 1e-5;
  float r = sqrt(v * v + k * k);
  gain *= 0.5 * (1.0 + v / r);
  return c + 0.5 * (r - v);
}

/* The near bank of mist over light \`c\`: its density's departure from its
   mean, as an overcast afternoon shows it — over the dark, a veil of its
   light (denser: lighter); over the open fog, its self-shading (denser:
   greyer). Smooth wherever the density is: no lit tops, whose gradient drew
   hard bands. \`light.w\`: the light falling through the air here. */
vec3 mistSeen(vec3 c, vec4 density, vec4 light) {
  float m = clamp(density.y - uSheetMean.y, -0.7, 0.7);
  vec3 plain = fogRadiance(light.w);
  float open = clamp(c.g / max(plain.g, 1e-4), 0.0, 1.0);
  return max(c + m * (uMistSeen.x * (plain - c) - uMistSeen.y * open * plain), vec3(0.0));
}

/* Four rays across a pixel, as shares of its steps (a rotated grid: no two
   share a row or a column, so a near-level edge is resolved as well as a
   near-vertical one). */
const vec2 PIXEL_GRID[4] = vec2[4](vec2(-0.125, -0.375), vec2(0.375, -0.125), vec2(0.125, 0.375), vec2(-0.375, 0.125));

/* Where a ray meets the stone above the water: t, or −1. \`rounded\`: its
   edges rounded, as the camera sees them; a reflection, broken by the
   ripples and blurred, never shows them, and the sharp block is cheaper
   and never lets a grazing ray slip past a corner into the fog. */
float stoneAbove(vec3 origin, vec3 ray, bool rounded, out vec3 local, out vec3 normal) {
  float t = rounded ? hitStoneRound(origin, ray, local, normal) : hitStone(origin, ray, local, normal);
  return t > 0.0 && origin.y + ray.y * t > 0.0 ? t : -1.0;
}

/* The stone's light where a ray meets it (at t). */
vec3 stoneLight(vec3 origin, vec3 ray, float t, vec3 local, vec3 normal, float spread, vec3 sky) {
  return shadeStone(origin + ray * t, local, normal, normalize(ray), spread * t * length(ray), sky);
}

/* The stone, where a ray meets it. \`rx\`, \`ry\`: the ray's step to the next
   pixel across and up (zero: one ray, as in a reflection); \`spread\`: the
   pixel's angular width. \`sky\` lights the stone.
   THE STONE'S EDGES ARE RESOLVED, NOT STEPPED. One ray a pixel draws its
   sloping edges as stairs, the surest mark of a render — at its silhouette
   and as much where its bright top meets a dark face. So four rays cross
   each pixel: where all four land on one face, it is shaded once; where
   they disagree (an edge, the silhouette, the waterline), each is shaded
   and the four averaged. Only what stands above the water counts: below
   it, the lake is in front. */
Hit subjectAt(vec3 origin, vec3 ray, vec3 rx, vec3 ry, float spread, vec3 sky) {
  Hit h = noHit();
  vec3 local;
  vec3 normal;
  bool grid = dot(rx, rx) > 0.0;
  float t = stoneAbove(origin, ray, grid, local, normal);
  float cover = t > 0.0 ? 1.0 : 0.0;
  /* Do the four rays agree with the centre: all on its face, or all off? */
  bool mixed = false;
  /* Only near it: two pixels' width round the block. */
  if (grid && nearStone(origin, ray, 2.0 * spread * uStonePlan.y)) {
    float hits = 0.0;
    for (int i = 0; i < 4; i++) {
      vec3 l;
      vec3 n;
      float ti = stoneAbove(origin, ray + rx * PIXEL_GRID[i].x + ry * PIXEL_GRID[i].y, true, l, n);
      hits += ti > 0.0 ? 1.0 : 0.0;
      mixed = mixed || (ti > 0.0) != (t > 0.0) || (ti > 0.0 && dot(n, normal) < 0.5);
    }
    cover = 0.25 * hits;
  }

  /* Shaded once where the rays agree — nearly every pixel of it — and only
     on its edges once a ray. */
  vec3 stone = vec3(0.0);
  float stoneDepth = 1e6;
  if (mixed) {
    for (int i = 0; i < 4; i++) {
      vec3 d = ray + rx * PIXEL_GRID[i].x + ry * PIXEL_GRID[i].y;
      vec3 l;
      vec3 n;
      float ti = stoneAbove(origin, d, true, l, n);
      if (ti > 0.0) {
        stone += 0.25 * stoneLight(origin, d, ti, l, n, spread, sky);
        stoneDepth = min(stoneDepth, origin.z + d.z * ti);
      }
    }
  } else if (t > 0.0) {
    stone = stoneLight(origin, ray, t, local, normal, spread, sky);
    stoneDepth = origin.z + ray.z * t;
  }
  h.color = stone;
  h.alpha = cover;
  h.depth = stoneDepth;
  return h;
}

/* The stone in a reflection. The ripples too fine to draw spread
   the reflected ray over a small cone (\`rough\`, radians across and up);
   the stone is solved in closed form, so the cone is sampled: four
   rays at the quartiles of its spread, mostly up and down. Without it the
   stone's reflection is a second stone, every seam in place. */
Hit subjectReflected(vec3 origin, vec3 ray, vec2 rough) {
  /* The cone's width is the footprint the stone's grain is filtered to. */
  float spread = max(rough.y, 0.002);
  if (rough.y < 0.001) return subjectAt(origin, ray, vec3(0.0), vec3(0.0), spread, uLit);
  vec3 dir = normalize(ray);
  vec3 across = normalize(vec3(dir.z, 0.0, -dir.x));
  vec3 up = cross(dir, across);
  Hit sum = noHit();
  for (int i = 0; i < 4; i++) {
    /* The quartile midpoints of a unit Gaussian, ±0.32 and ±1.15. */
    float v = (i < 2 ? -1.0 : 1.0) * (i == 0 || i == 3 ? 1.15 : 0.32);
    float a = (i == 1 || i == 3 ? 0.6 : -0.6);
    Hit h = subjectAt(origin, dir + across * (a * rough.x) + up * (v * rough.y), vec3(0.0), vec3(0.0), spread, uLit);
    sum.color += 0.25 * h.color;
    sum.alpha += 0.25 * h.alpha;
    sum.depth = min(sum.depth, h.depth);
  }
  return sum;
}

/* The sheets where a reflected ray crosses the middle of each one's
   stretch, projected back into the frame. */
void sheetsAlong(vec3 origin, vec3 ray, float zEnd, out vec4 density, out vec4 light) {
  density = vec4(0.0);
  light = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    float a = max(origin.z, sheetStart(k));
    float b = min(zEnd, uSheetEdge[k]);
    if (b <= a) continue;
    float zMid = 0.5 * (a + b);
    vec2 at = clamp(projectUv(origin + ray * ((zMid - origin.z) / ray.z)), 0.0, 1.0);
    density[k] = texture(uSheetDensity, at)[k];
    vec4 l = texture(uSheetLight, at);
    light[k] = k == 3 ? l.w : l[k];
  }
}

/* What the lake gives back where this ray meets it, in two parts: its own
   light, as seen at the water (the stone reflected, and the dark
   body under the reflection), and the photograph reflected — already as the
   camera sees it (see the top) — with the share of it the water returns. */
struct Lake {
  vec3 own;
  /* the part of \`own\` that is the stage's: the stone reflected,
     and the stone's foot seen through the water */
  vec3 subject;
  vec3 photo;
  float share;
};

Lake lakeAt(vec3 origin, vec3 ray, float zWater, vec2 sigma, float departureNear, vec3 glowNear, float weightNear,
            vec4 lightNear, vec2 dx, vec2 dy) {
  vec3 surface = origin + ray * ((zWater - origin.z) / ray.z);
  surface.y = 0.0;
  vec3 d = normalize(ray);
  vec2 roughness;
  vec3 n = waterNormal(surface.xz, sigma, roughness);
  /* The lake's own tilt and blur, kept apart: the stone's reflection is
     drawn from them (below). */
  vec3 lakeTilt = reflect(d, n);
  vec2 lakeRoughness = roughness;
  /* The lake laps at the stone: small wavelets thrown back off its faces,
     dying within half a metre (water/motion.ts lapping). */
  vec2 away;
  float fromStone = stoneWaterline(surface.xz, away);
  vec3 tilted = n / n.y;
  tilted.xz -= lapSlope(fromStone, away, sigma, roughness);
  n = normalize(tilted);
  vec3 r = reflect(d, n);
  r.y = max(r.y, uMinElevation * -d.y);
  /* The unseen ripples spread the reflection: tilting the mirror toward the
     camera moves it ~2× the tilt up or down, tilting it across moves it
     only by the sine of the grazing angle — the vertical smear of every
     calm lake's reflections. */
  vec2 rough = 2.0 * sqrt(roughness) * vec2(-d.y, 1.0);
  float reflectance = waterReflectance(dot(-d, n));
  float perDepth = length(r) / r.z;

  /* The stone, from the water in front of it. */
  vec3 subject = vec3(0.0);
  float cover = 1.0;
  /* Water anywhere short of the stone's far corner can see it: its side
     corners stand behind its centre's plane (stone/optics.ts STONE). */
  if (surface.z < max(uSubjectDepth, uStonePlan.y + uStonePlan.w)) {
    vec4 density;
    vec4 light;
    float zSubject = max(uSubjectDepth, surface.z);
    sheetsAlong(surface, r, zSubject, density, light);
    vec3 fog = vec3(0.0);
    float transmit = 1.0;
    fogSpan(fog, transmit, surface, r, surface.z, zSubject, perDepth, density, light);
    /* THE STONE'S REFLECTION WAVERS AS THE TREES' DO. A tilt of the water
       moves a reflection by the tilt times the reflected path: for the
       shores, a hundred metres, so the lake's undulation slices their
       reflections into drifting bands; for the stone, half a metre, so the
       same lake left its reflection a still block under a wavering world —
       pasted, not mirrored. Its tilt is drawn larger by \`uSubjectWaver\`:
       still nothing at the waterline, where the path is nothing and the
       reflection meets the stone, and growing away from it, the way a post's
       reflection is whole at its foot and broken further out. The lapping
       is drawn at its own size, its tilt and its blur: it lives at the
       stone, where the path is short anyway, and drawn larger it threw the
       rays from round the stone's narrow front corner past it, into the
       fog — light dashes under the corner. */
    vec3 mirror = reflect(d, vec3(0.0, 1.0, 0.0));
    vec3 wavering = normalize(mirror + (lakeTilt - mirror) * uSubjectWaver + (r - lakeTilt));
    wavering.y = max(wavering.y, uMinElevation * -d.y);
    vec2 roughSubject = 2.0 * sqrt(lakeRoughness * uSubjectWaver * uSubjectWaver + roughness - lakeRoughness)
                      * vec2(-d.y, 1.0);
    Hit hit = subjectReflected(surface, wavering, roughSubject);
    /* The fog in front of the stone is its own: the photograph behind
       carries its own. */
    subject = fog * hit.alpha + transmit * hit.color;
    cover = 1.0 - hit.alpha;
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
  vec3 bentLevel = refract(d, vec3(0.0, 1.0, 0.0), 1.0 / ${WATER.ior.toFixed(3)});
  vec3 into = normalize(d + refract(d, n, 1.0 / ${WATER.ior.toFixed(3)}) - bentLevel);
  vec3 footLocal;
  vec3 footNormal;
  float tFoot = hitStone(surface, into, footLocal, footNormal);
  if (tFoot > 0.0) {
    vec3 q = surface + into * tFoot;
    float depth = max(-q.y, 0.0);
    float reach = uWaterClarity.z * exp(-uWaterClarity.y * depth);
    float seen = exp(-uWaterClarity.x * depth / max(-bentLevel.y, 0.1));
    under = mix(uWaterBody, shadeStoneUnder(q, footLocal, footNormal, reach, uLit), seen);
  }

  Lake lake;
  /* The stage's own light in the water — the stone mirrored, its foot
     through it — kept apart from the photograph's (see the harder paper,
     in shade). */
  lake.subject = reflectance * subject + (1.0 - reflectance) * (under - uWaterBody);
  lake.own = reflectance * subject + (1.0 - reflectance) * under;
  lake.share = reflectance * cover;
  lake.photo = vec3(0.0);
  if (lake.share > 0.002) {
    float depth;
    vec2 uv = reflectBackdrop(surface, r, depth);
    /* A mirror keeps scale: the pixel's own footprint on the photograph,
       widened by the ripples' spread over the reflected path. */
    float path = max(min(depth, 2000.0) - surface.z, 0.0) / max(depth, 1.0);
    vec2 spread = rough * path * uPlateGeo.xy;
    vec2 gx = vec2(max(length(dx), spread.x), 0.0);
    vec2 gy = vec2(0.0, max(length(dy), spread.y));
    vec4 density;
    vec4 light;
    sheetsAlong(surface, r, depth, density, light);
    vec3 glow = glowNear;
    float weight = weightNear;
    float departure = departureNear + fogDeparture(surface, r, surface.z, depth, perDepth, density, light, glow, weight);
    vec3 air = airOf(glow, weight, lightNear);
    vec3 photo = mix(air, plateRadiance(uv, gx, gy), plateCover(uv));
    float gain;
    lake.photo = throughFog(photo, air, departure, depth, gain);
  }
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
  vec4 density = texture(uSheetDensity, uv);
  vec4 light = texture(uSheetLight, uv);

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
  Hit hit = subjectAt(origin, ray, rx, ry, length(rx) / length(ray), uLit);
  /* The stone counts only above the water (subjectAt): what it covers of
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
    vec3 glow = vec3(0.0);
    float weight = 0.0;
    float departure = fogDeparture(origin, ray, origin.z, zWater, perDepth, density, light, glow, weight);
    Lake lake = lakeAt(origin, ray, zWater, sigma, departure, glow, weight, light, dx, dy);
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
  vec3 ray = cameraRay(vUv);
  float t = ray.y < 0.0 ? uCamPos.y / -ray.y : 0.0;
  vec2 onWater = (uCamPos + ray * t).xz;
  vec2 wx = dFdx(onWater);
  vec2 wy = dFdy(onWater);
  vec2 sigma = min(0.5 * sqrt(wx * wx + wy * wy), vec2(50.0));
  vec2 onPlate = plateUvAt(ray);
  vec2 dx = dFdx(onPlate);
  vec2 dy = dFdy(onPlate);

  outColor = shade(vUv, sigma, dx, dy, dFdx(ray), dFdy(ray));
}
`;
