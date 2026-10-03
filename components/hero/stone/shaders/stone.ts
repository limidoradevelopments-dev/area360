/**
 * ─── Stone · in GLSL ───
 *
 * An analytic block: a ray–box intersection in the block's own frame, so its
 * parallax, its waterline, its reflection and its foot under the water are
 * exact 3D for free. Its plan (stone/optics.ts STONE), scaled by its
 * half-diagonals and turned 45°, is a square, and the block an ordinary box.
 * The map is affine, so a ray's parameter is the same in both. Seen from the
 * camera its edges are ROUNDED, in its outline as in its light: from the
 * sharp box's entry the ray is marched onto the rounded box inside it.
 *
 * WEATHERED LAKE GRANITE, shaded as a cube turned 45°: the grain at its true
 * scale, lit by the fog's dome, rough and unevenly so, chipped along its
 * edges and pitted, lichen where it stays dry, rain's runs down its faces,
 * the lake's stain band above the waterline growing glossier toward it, a
 * soaked last few centimetres and a broken meniscus — and under the water,
 * its coated foot, lit by what light reaches down through the lake.
 *
 * Its noise is cheap value noise, not simplex: the block is a few percent of
 * the frame, but a compiler that flattens branches would run simplex for
 * every pixel of it anyway.
 */

/* E[smoothstep(0.25, 0.6, n)] over value noise n (measured, 2·10⁶ samples):
   the flecks' mean, taken out so they darken nothing on average. */
const FLECK_MEAN = 0.1876;

export const STONE_GLSL = /* glsl */ `
/* the plan: centre (x, z), half-diagonal across the lens's axis, along it */
uniform vec4 uStonePlan;
/* its foot and top above the water (m) */
uniform vec2 uStoneSpan;
/* granite reflectance (linear) */
uniform vec3 uStoneAlbedo;
/* irradiance share: the top, a face turned from the light, one turned to it */
uniform vec3 uStoneLight;
/* the light's side, as a direction on the water (x, z) */
uniform vec2 uLightSide;
/* the foot's shade: up to this height (m), down to this share on the face
   turned from the light, on the face turned to it */
uniform vec3 uStoneFoot;
/* sheen: reflectance head-on, at grazing; the share of the sky light its
   reflection gathers on the top, on a face */
uniform vec4 uStoneSheen;
/* granite: cloud size (m) and amount, fleck size (m) and amount */
uniform vec4 uStoneGrain;
/* granite: fine grain size (m) and amount */
uniform vec2 uStoneFine;
/* weathering: the arrises' radius (m), the runs, lichen size (m) and its
   cover of the top */
uniform vec4 uStoneWeather;
/* lichen tone against the stone's: the pale, the dark */
uniform vec2 uStoneLichen;
/* wear: how unevenly rough (share), the deepest chip (m) and a chip's tone,
   the pits' darkening */
uniform vec4 uStoneWear;
/* the lake's stain band height (m) and darkening, the soaked line's height
   (m) and darkening */
uniform vec4 uStoneWater;
/* the coat on it under the water: its darkening */
uniform float uStoneUnder;
/* the meniscus: its height (m), and the share of the sky light it mirrors */
uniform vec2 uStoneMeniscus;

/* Half the side of the plan's square in the block's frame. */
const float STONE_HALF_SIDE = 0.70710678;

float stoneMid() {
  return 0.5 * (uStoneSpan.x + uStoneSpan.y);
}

/* World → the block's frame: (P, y, Q), the plan a square of half-side
   1/√2. A direction maps the same way, without the offset. */
vec3 dirToStone(vec3 d) {
  vec2 s = d.xz / uStonePlan.zw;
  return vec3((s.x + s.y) * STONE_HALF_SIDE, d.y, (s.y - s.x) * STONE_HALF_SIDE);
}

vec3 toStone(vec3 p) {
  return dirToStone(p - vec3(uStonePlan.x, stoneMid(), uStonePlan.y));
}

/* Entry point of a ray (origin + ray·t) into the sharp block: t, or −1 for
   a miss. \`local\` is the hit in the block's frame, \`normal\` its face's
   normal there. */
float hitStone(vec3 origin, vec3 ray, out vec3 local, out vec3 normal) {
  vec3 o = toStone(origin);
  vec3 d = dirToStone(ray);
  /* No axis of a ray is ever exactly zero here, but a division by zero is
     undefined in GLSL ES; nudge it rather than trust the hardware. */
  d += vec3(1e-7) * (1.0 - abs(sign(d)));
  vec3 half_ = vec3(STONE_HALF_SIDE, 0.5 * (uStoneSpan.y - uStoneSpan.x), STONE_HALF_SIDE);
  vec3 t0 = (-half_ - o) / d;
  vec3 t1 = (half_ - o) / d;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  local = o + d * tn;
  normal = vec3(0.0, 1.0, 0.0);
  if (tf < tn || tf <= 0.0) return -1.0;
  /* A ray from inside: a reflection off the water right at the waterline,
     where a pixel's centre meets the lake just behind the face. It sees the
     face it starts on, not the fog beyond the stone. */
  if (tn <= 0.0) {
    local = o;
    normal = abs(o.x) > abs(o.z) ? vec3(sign(o.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(o.z));
    return 1e-4;
  }
  if (tn == tmin.x) normal = vec3(-sign(d.x), 0.0, 0.0);
  else if (tn == tmin.y) normal = vec3(0.0, -sign(d.y), 0.0);
  else normal = vec3(0.0, 0.0, -sign(d.z));
  return tn;
}

/* The rounded block's distance, in plan units (P, Y, Q all in metres of the
   cube over its half-diagonal): a box of half-size \`b\` with edges of radius
   \`r\`. */
float stoneRounded(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

/* Where a ray meets the ROUNDED block: t, or −1. From the sharp box's entry
   it is marched onto the rounded box inside it; a ray that only grazes a
   rounded-off edge never arrives, and misses. \`normal\` is the rounded
   surface's, in the block's frame. */
float hitStoneRound(vec3 origin, vec3 ray, out vec3 local, out vec3 normal) {
  float t = hitStone(origin, ray, local, normal);
  /* A miss, or a ray from inside it (hitStone): nothing to round. */
  if (t <= 1e-3) return t;
  /* In plan units the box is the same size every way, so its rounding is
     round: the height is scaled to them. */
  float k = 1.0 / uStonePlan.z;
  vec3 o = toStone(origin);
  vec3 d = dirToStone(ray);
  o.y *= k;
  d.y *= k;
  vec3 b = vec3(STONE_HALF_SIDE, 0.5 * (uStoneSpan.y - uStoneSpan.x) * k, STONE_HALF_SIDE);
  float r = uStoneWeather.x * k;
  float len = length(d);
  float s = 1.0;
  for (int i = 0; i < 8; i++) {
    s = stoneRounded(o + d * t, b, r);
    if (s < 1e-4) break;
    t += s / len;
  }
  if (s > 1e-3) return -1.0;
  vec3 p = o + d * t;
  vec3 q = max(abs(p) - b + r, 0.0);
  normal = dot(q, q) > 1e-12 ? sign(p) * normalize(q) : normal;
  local = vec3(p.x, p.y / k, p.z);
  return t;
}

/* Whether a ray passes within \`grow\` metres of the block above the water
   (a slab test on that part, grown by it): cheap, so the pixels far from
   it skip the rest. */
bool nearStone(vec3 origin, vec3 ray, float grow) {
  vec3 o = toStone(origin);
  o.y = origin.y - 0.5 * uStoneSpan.y;
  vec3 d = dirToStone(ray);
  d += vec3(1e-7) * (1.0 - abs(sign(d)));
  /* Grown in the plan's units by its narrower half-diagonal: generous. */
  vec3 half_ = vec3(STONE_HALF_SIDE, 0.5 * uStoneSpan.y, STONE_HALF_SIDE)
             + grow * vec3(1.0 / uStonePlan.z, 1.0, 1.0 / uStonePlan.z);
  vec3 t0 = (-half_ - o) / d;
  vec3 t1 = (half_ - o) / d;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return min(min(tmax.x, tmax.y), tmax.z) >= max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
}

/* Distance (m) from a point on the water (x, z) to the stone's waterline —
   its diamond plan — and the unit direction away from it there. */
float stoneWaterline(vec2 xz, out vec2 away) {
  vec2 b = uStonePlan.zw;
  vec2 p = xz - uStonePlan.xy;
  vec2 q = abs(p);
  /* The nearest point of the diamond's edge in this quadrant, clamped to
     the edge between its corners (b.x, 0) and (0, b.y). */
  vec2 edge = vec2(-b.x, b.y);
  float h = clamp(dot(q - vec2(b.x, 0.0), edge) / dot(edge, edge), 0.0, 1.0);
  vec2 to = q - (vec2(b.x, 0.0) + edge * h);
  float d = length(to);
  away = d > 1e-5 ? to / d * sign(p + 1e-9) : normalize(vec2(b.y, b.x));
  return d;
}

float stoneHash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

/* Value noise, −1…1: a smooth random field from hashed lattice corners. */
float stoneNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = stoneHash(dot(i, vec2(1.0, 57.0)));
  float b = stoneHash(dot(i + vec2(1.0, 0.0), vec2(1.0, 57.0)));
  float c = stoneHash(dot(i + vec2(0.0, 1.0), vec2(1.0, 57.0)));
  float d = stoneHash(dot(i + vec2(1.0, 1.0), vec2(1.0, 57.0)));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) * 2.0 - 1.0;
}

/* How much of a pattern of \`size\` (m) a pixel covering \`footprint\` (m)
   still shows: all of it at four pixels a cycle, none under one. */
float stoneResolved(float size, float footprint) {
  return 1.0 - smoothstep(0.5 * size, 2.0 * size, footprint);
}

/* The granite's reflectance at \`st\` (m on the cube's face), as a multiple
   of its mean. */
float granite(vec2 st, float footprint) {
  float cloud = 0.65 * stoneNoise(st / uStoneGrain.x) + 0.35 * stoneNoise(st * 2.7 / uStoneGrain.x + 3.1);
  float a = 1.0 + uStoneGrain.y * cloud * stoneResolved(uStoneGrain.x, footprint);
  float fleck = smoothstep(0.25, 0.6, stoneNoise(st / uStoneGrain.z + 11.3)) - ${FLECK_MEAN};
  a *= 1.0 - uStoneGrain.w * fleck * stoneResolved(uStoneGrain.z, footprint);
  a *= 1.0 + uStoneFine.y * stoneNoise(st / uStoneFine.x + 27.1) * stoneResolved(uStoneFine.x, footprint);
  return a;
}

/* Crustose lichen at \`st\` (m) where the stone is \`dry\` (0–1), as a
   multiple of the stone's tone: pale rosettes, a few dark ones. Patches
   cover about \`dry\` × the top's cover; the threshold on the noise is set
   from that cover (the noise's spread is ~0.29). */
float lichen(vec2 st, float dry, float footprint) {
  if (dry <= 0.0) return 1.0;
  vec2 q = st / uStoneWeather.z;
  float n = 0.6 * stoneNoise(q) + 0.3 * stoneNoise(q * 2.3 + 5.7) + 0.1 * stoneNoise(q * 5.1 + 1.3);
  float edge = 0.06 + footprint / uStoneWeather.z;
  float pale = smoothstep(0.0, edge, n - 0.29 * (1.4 - 3.0 * uStoneWeather.w * dry));
  float d = 0.6 * stoneNoise(q * 1.7 + 41.0) + 0.4 * stoneNoise(q * 4.3 + 9.0);
  float dark = smoothstep(0.0, edge, d - 0.29 * (1.4 - 0.25 * uStoneWeather.w * dry)) * (1.0 - pale);
  /* A rosette is not flat: its areoles crack it into a finer pattern. */
  float tone = uStoneLichen.x * (1.0 + 0.12 * stoneNoise(q * 9.0) * stoneResolved(uStoneWeather.z / 9.0, footprint));
  return mix(mix(1.0, tone, pale), uStoneLichen.y, dark);
}

/* A direction in the block's frame → the cube's: the plan's square turned
   back by 45°. */
vec3 cubeDirection(vec3 v) {
  return normalize(vec3((v.x - v.z) * STONE_HALF_SIDE, v.y, (v.x + v.z) * STONE_HALF_SIDE));
}

/* The face a normal in the block's frame belongs to: its largest axis. */
vec3 stoneFace(vec3 n) {
  vec3 a = abs(n);
  if (a.y >= a.x && a.y >= a.z) return vec3(0.0, sign(n.y), 0.0);
  return a.x >= a.z ? vec3(sign(n.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(n.z));
}

/* Irradiance share for a normal: the dome's by how far it turns up, a
   side's by which way it faces the light. */
float stoneIrradiance(vec3 n) {
  vec2 level = n.xz / max(length(n.xz), 1e-4);
  float side = mix(uStoneLight.y, uStoneLight.z, dot(level, uLightSide) * 0.5 + 0.5);
  return mix(side, uStoneLight.x, max(n.y, 0.0));
}

/* On a side face, in metres of the cube: how far across it. */
float stoneAcross(vec3 local, vec3 face) {
  return (abs(face.x) > 0.5 ? local.z : local.x) * uStonePlan.z;
}

/* Radiance of the block at a hit, lit by \`sky\` (the full sky light):
   \`world\` the hit, \`local\` and \`normal\` it in the block's frame (the
   rounded surface's normal), \`view\` the ray's direction, \`footprint\` the
   pixel's width there (m). */
vec3 shadeStone(vec3 world, vec3 local, vec3 normal, vec3 view, float footprint, vec3 sky) {
  float height = world.y;
  vec3 facing = stoneFace(normal);
  bool top = facing.y > 0.5;
  /* The face's own normal, and the rounded surface's: on an edge the light
     turns with the stone, catching the dome a little before the top does. */
  vec3 n = cubeDirection(facing);
  vec3 bent = cubeDirection(normal);
  float across = stoneAcross(local, facing);
  float face = facing.x + 2.0 * facing.z + 3.0 * facing.y;
  vec2 st = (top ? local.xz * uStonePlan.z : vec2(across, height)) + face * 7.31;
  float cosView = max(dot(n, -view), 0.05);
  /* A pixel's width along the surface, foreshortened. */
  float spread = footprint / max(cosView, 0.25);

  /* How far to the nearest edge (m), and where along it. */
  float toEdge;
  float alongEdge;
  if (top) {
    bool p = abs(local.x) > abs(local.z);
    toEdge = (STONE_HALF_SIDE - max(abs(local.x), abs(local.z))) * uStonePlan.z;
    alongEdge = (p ? local.z : local.x) * uStonePlan.z;
  } else {
    float toSide = STONE_HALF_SIDE * uStonePlan.z - abs(across);
    float toTop = uStoneSpan.y - height;
    toEdge = min(toSide, toTop);
    alongEdge = toSide < toTop ? height : across;
  }

  float albedo = granite(st, spread);
  float irradiance = stoneIrradiance(bent);
  /* WEAR. Chips along the edges, where frost and ice took a flake: fresh
     granite under the weathered skin, paler and rougher, a few centimetres
     deep at most, here and there. Pits in the faces, where a crystal fell
     out, as fine as the grain. */
  float chipDepth = uStoneWear.y * smoothstep(0.35, 0.85, stoneNoise(vec2(alongEdge * 22.0, face * 4.7)));
  float chip = 1.0 - smoothstep(0.6 * chipDepth, chipDepth, toEdge);
  albedo *= mix(1.0, uStoneWear.z, chip);
  float pit = smoothstep(0.7, 0.9, stoneNoise(st / 0.007 + 51.0)) * stoneResolved(0.007, spread);
  albedo *= 1.0 - uStoneWear.w * pit;

  float soaked = 0.0;
  float wet = 0.0;
  float toward = dot(n.xz, uLightSide) * 0.5 + 0.5;
  if (top) {
    albedo *= lichen(st, 1.0 - chip, spread);
  } else {
    /* The lake's stain: a band where the water stands half the year, its
       top level and ragged, with tongues where it ran down; its grain
       drowned, darker and glossier toward the water. */
    float line = uStoneWater.x + 0.02 * stoneNoise(vec2(across * 6.0, face * 3.1))
               + 0.03 * max(stoneNoise(vec2(across * 37.0, face * 1.7)), 0.0);
    float stain = 1.0 - smoothstep(line - 0.04, line + 0.01, height);
    float deep = clamp(height / max(line, 0.01), 0.0, 1.0);
    albedo = mix(albedo, 1.0, 0.4 * stain) * mix(1.0, uStoneWater.y * mix(0.8, 1.2, deep), stain);
    soaked = 1.0 - smoothstep(uStoneWater.z - 0.01, uStoneWater.z + 0.01, height);
    albedo *= mix(1.0, uStoneWater.w, soaked);
    wet = max(soaked, 0.5 * stain * (1.0 - deep));
    /* Lichen above the stain, half the top's and thinning toward it. */
    albedo *= lichen(st, (1.0 - chip) * 0.5 * smoothstep(line + 0.02, uStoneSpan.y - 0.05, height), spread);
    /* Rain's runs, off the top's edge and down the faces: dark streaks,
       fast across, slow down, strongest under the edge. */
    float runs = smoothstep(0.1, 0.8, stoneNoise(vec2(across * 9.0 + face * 3.0, height * 0.6)))
               * (0.4 + 0.6 * exp(-(uStoneSpan.y - height) / 0.2));
    albedo *= 1.0 - uStoneWeather.y * runs * (1.0 - stain);
  }

  /* The sheen: rising toward grazing — unevenly, as weathering leaves a
     stone smoother here and rougher there, rougher still in a chip — and
     toward a mirror's where the lake has wetted it. */
  float polish = clamp(1.0 + uStoneWear.x * stoneNoise(st / 0.14 + 3.3), 0.2, 2.0) * (1.0 - 0.6 * chip);
  float grazing = mix(uStoneSheen.y * polish, 1.0, wet);
  float m = 1.0 - max(dot(bent, -view), 0.05);
  float sheen = uStoneSheen.x + (grazing - uStoneSheen.x) * m * m * m * m * m;
  vec3 c = (uStoneAlbedo * albedo * irradiance * (1.0 - sheen) + sheen * (top ? uStoneSheen.z : uStoneSheen.w)) * sky;
  /* The meniscus: the water climbs the stone a few millimetres and curls,
     a curved mirror that catches the sky — faint, and broken as the lake
     lifts and drops along the waterline. Narrower than a pixel at most
     sizes: spread over the pixel's footprint, its light kept. */
  if (!top) {
    float wide = max(uStoneMeniscus.x, spread);
    float broken = smoothstep(-0.2, 0.7, stoneNoise(vec2(across * 18.0 + face * 5.0, uWaterTime * 0.7)));
    float meniscus = (1.0 - smoothstep(0.0, wide, height)) * uStoneMeniscus.x / wide * broken;
    c = mix(c, uStoneMeniscus.y * sky, meniscus);
  }
  /* The foot of a face sees the dark lake where its top sees the sky: its
     light and its reflection both fall toward the water. */
  return top ? c : c * mix(mix(uStoneFoot.y, uStoneFoot.z, toward), 1.0, smoothstep(0.0, uStoneFoot.x, height));
}

/* The stone under the water at a hit: soaked and coated, lit by \`reach\` of
   the sky's light — the share that gets down to it through the lake, as a
   vertical face takes it there (the water spreads the daylight evenly round
   the stone: no face is turned from it). */
vec3 shadeStoneUnder(vec3 world, vec3 local, vec3 normal, float reach, vec3 sky) {
  vec3 facing = stoneFace(normal);
  float face = facing.x + 2.0 * facing.z + 3.0 * facing.y;
  vec2 st = vec2(stoneAcross(local, facing), world.y) + face * 7.31;
  /* The water blurs it far past its grain: only its clouds show. */
  float albedo = granite(st, 0.02) * uStoneWater.w * uStoneUnder;
  return uStoneAlbedo * albedo * reach * sky;
}
`;
