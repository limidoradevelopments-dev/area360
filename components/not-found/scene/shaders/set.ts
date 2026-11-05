/**
 * ─── 404 · the set: the hero's stone, broken ───
 *
 * One distance field, sphere-traced over the rect where the set stands,
 * into a picture the composite lays over the water: THE HERO'S STONE — its
 * block, by the hero's own functions (hero/stone/shaders/stone.ts: toStone,
 * stoneRounded at the hero's radius, 0 since 2026-11-05: sharp), SHADED BY THE HERO'S OWN shadeStone with the
 * hero's own values (its granite, flecks, lichen, chips and pits, rain's
 * runs, the lake's stain band, its relief, its meniscus) — cut by the
 * fracture and the bites, with what broke off lying on it (ruin.ts). The
 * same program draws it as the lake mirrors it (`uMirror`): the camera
 * below the water, the ray turned up, starting where it leaves the water.
 *
 * It writes a DEPTH, so the hero's flowers drawn after it into the same
 * picture (scene/engine.ts, the hero's own flower programs) hide behind
 * the stone as they should and lie on it.
 *
 * DRAWN ONLY WHEN THE CAMERA HAS MOVED, AND PROGRESSIVELY (scene/
 * engine.ts). WHAT THE COMPILER IS SPARED (Direct3D's FXC, every Windows
 * browser; measured cold): every loop runs to a uniform's count; the field
 * is pasted once (the march and the taps after it in one loop); the
 * break's roughness is read once and shared; the shapes are a texture,
 * never constant arrays.
 *
 * Its output: the print's levels premultiplied by coverage — a texel the
 * set does not cover is clear — so the composite's filtered read of it is
 * antialiased by the samples it averages.
 */

import { STONE_GLSL } from "@/components/hero/stone/shaders/stone";

import { RUIN_GLSL } from "../ruin";
import { CAMERA_GLSL, DEPTH_GLSL, HEAD_GLSL, HERO_PRINT_GLSL, NOISE_GLSL, PRINT_GLSL } from "./common";

export const SET_UNIFORMS = [
  "uView", "uFocal", "uCenter", "uCamPos", "uCamRot", "uNoise", "uRuin",
  "uFrame", "uRect", "uScale", "uMirror", "uFootprint", "uSteps", "uTaps", "uChunks", "uBites", "uCracks",
  "uLit", "uWaterTime", "uFogLight", "uFogPerMetre", "uPrint", "uCrack", "uOcclusion", "uShade", "uShadeCount", "uContact",
  "uStonePlan", "uStoneSpan", "uStoneAlbedo", "uStoneLight", "uLightSide", "uStoneFoot", "uStoneSheen",
  "uStoneGrain", "uStoneFine", "uStoneWeather", "uStoneLichen", "uStoneWear", "uStoneWater", "uStoneUnder",
  "uStoneMeniscus", "uSubjectDepth", "uStoneNoise",
] as const;

/** Tubes of the flowers' contact shade the program holds (flowers.ts). */
export const SHADE_TUBES = 40;

export const SET_FRAG = /* glsl */ `${HEAD_GLSL}
${CAMERA_GLSL}
${NOISE_GLSL}
${PRINT_GLSL}
${DEPTH_GLSL}
${HERO_PRINT_GLSL}

/* the composite's frame (px), this pass's rect in it (origin, size: px),
   target texels a frame px, and whether this is the lake's mirror */
uniform vec2 uFrame;
uniform vec4 uRect;
uniform float uScale;
uniform float uMirror;
/* a target texel's angle (rad): a hit is a surface within a part of it */
uniform float uFootprint;
/* the march's steps, the normal's taps (4), the chunks, the bites, the
   cracks' segments: uniforms, so no loop is pasted out */
uniform int uSteps;
uniform int uTaps;
uniform int uChunks;
uniform int uBites;
uniform int uCracks;

/* the fog in full light: the sky that lights the stone (the hero's) */
uniform vec3 uLit;
/* seconds of the lake's own time: the meniscus breaks with it */
uniform float uWaterTime;
/* the fog's light in the print (linear) and how much of it lies in each
   metre between the camera and the stone */
uniform float uFogLight;
uniform float uFogPerMetre;
/* cracks: core, shadow reach (× half-width), shadow, wander (m) */
uniform vec4 uCrack;
/* contact shade: reach (m), strength */
uniform vec2 uOcclusion;
/* the flowers' contact shade on the stone: tubes (a, radius), (b, 0), how
   many, and how near (m) and how dark */
uniform vec4 uShade[${SHADE_TUBES * 2}];
uniform int uShadeCount;
uniform vec2 uContact;

out vec4 outColor;

${STONE_GLSL}

${RUIN_GLSL}

/* What a point is. */
const int M_STONE = 0;
const int M_FRACTURE = 1;
const int M_CHUNK = 2;

/* The hero's block (hero/stone/shaders/stone.ts hitStoneRound: the same
   box, the same radius — none: its arrises are sharp), as a distance: in its own frame the block is
   the same size every way, its height scaled to its plan's units; that
   frame stretches the world by at most 1/across, so a distance there,
   times across, is never more than the true one. */
float stoneDistance(vec3 p) {
  float k = 1.0 / uStonePlan.z;
  vec3 q = toStone(p);
  q.y *= k;
  vec3 b = vec3(STONE_HALF_SIDE, 0.5 * (uStoneSpan.y - uStoneSpan.x) * k, STONE_HALF_SIDE);
  return stoneRounded(q, b, uStoneWeather.x * k) * uStonePlan.z;
}

/* A world normal → the block's frame (its plan's units, its height
   scaled), as hitStoneRound gives it: normals go by the inverse transpose. */
vec3 normalToStone(vec3 n) {
  vec2 s = n.xz * uStonePlan.zw;
  return normalize(vec3((s.x + s.y) * STONE_HALF_SIDE, n.y * uStonePlan.z, (s.y - s.x) * STONE_HALF_SIDE));
}

/* The distance to the set, and what is nearest. */
float map(vec3 p, out int matter) {
  float d = stoneDistance(p);
  matter = M_STONE;
  /* THE BREAK'S ROUGHNESS, read once and shared by the fracture, the
     bites and the chunks (each read pasted into the program was a third of
     a second of a cold compile), and only where something broken is near:
     inside the chunks' box, grown. */
  float rough = 0.0;
  float grit = 0.0;
  if (all(greaterThan(p, CHUNKS_LO - 0.12)) && all(lessThan(p, CHUNKS_HI + 0.12))) {
    rough = BREAK_ROUGH.x * (noise3(p * BREAK_SIZE.x) - 0.5);
    grit = noise3(p * BREAK_SIZE.y + 7.3) - 0.5;
    rough += BREAK_ROUGH.y * grit;
  }
  /* The fracture: above its plane is gone; its slope bounded by 3.4 (the
     plane's 1 and the two noises' most), so the march never steps past. */
  float f = (dot(p, BREAK_NORMAL) - BREAK_OFFSET + rough) / 3.4;
  if (f > d) {
    d = f;
    matter = M_FRACTURE;
  }
  /* The bites out of the right face, rough as the fracture. */
  for (int i = 0; i < uBites; i++) {
    vec4 sphere = row(BITE + i * 5);
    vec3 q = p - sphere.xyz;
    if (length(q) - sphere.w > abs(d) + 0.05) continue;
    vec3 r0 = row(BITE + i * 5 + 1).xyz;
    vec3 r1 = row(BITE + i * 5 + 2).xyz;
    vec3 r2 = row(BITE + i * 5 + 3).xyz;
    vec3 h = row(BITE + i * 5 + 4).xyz;
    vec3 a = abs(vec3(dot(r0, q), dot(r1, q), dot(r2, q))) - h;
    float b = length(max(a, 0.0)) + min(max(a.x, max(a.y, a.z)), 0.0) - rough;
    float cut = -b / 3.4;
    if (cut > d) {
      d = cut;
      matter = M_FRACTURE;
    }
  }
  /* What broke off and stayed: one sphere round them all first. */
  vec4 cluster = row(CLUSTER);
  if (length(p - cluster.xyz) - cluster.w < d) {
    for (int i = 0; i < uChunks; i++) {
      vec4 bound = row(CHUNK + i * 5);
      vec3 q = p - bound.xyz;
      if (length(q) - bound.w > d) continue;
      vec3 r0 = row(CHUNK + i * 5 + 1).xyz;
      vec3 r1 = row(CHUNK + i * 5 + 2).xyz;
      vec3 r2 = row(CHUNK + i * 5 + 3).xyz;
      vec3 h = row(CHUNK + i * 5 + 4).xyz;
      /* A box with sharp edges (ruin.ts: every joint sharp). */
      vec3 a = abs(vec3(dot(r0, q), dot(r1, q), dot(r2, q))) - h;
      float c = length(max(a, 0.0)) + min(max(a.x, max(a.y, a.z)), 0.0);
      /* Broken granite, not cut: its faces rough. */
      c += 0.26 * rough + 0.004 * grit;
      if (c < d) {
        d = c;
        matter = M_CHUNK;
      }
    }
  }
  return d;
}

/* Where a ray enters and leaves a box (t), or an empty span. */
vec2 boxSpan(vec3 ro, vec3 rd, vec3 lo, vec3 hi) {
  vec3 inv = 1.0 / (rd + vec3(1e-7) * (1.0 - abs(sign(rd))));
  vec3 t0 = (lo - ro) * inv;
  vec3 t1 = (hi - ro) * inv;
  vec3 a = min(t0, t1);
  vec3 b = max(t0, t1);
  return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z));
}

/* How near a crack a point on the stone is, in its half-widths. */
float crackAt(vec3 p) {
  vec3 q = p + uCrack.w * 2.0 * (vec3(noise3(p * 95.0), noise3(p * 95.0 + 5.1), noise3(p * 95.0 + 9.7)) - 0.5);
  float best = 1e3;
  for (int i = 0; i < uCracks; i++) {
    vec4 a = row(CRACK + i * 2);
    vec4 b = row(CRACK + i * 2 + 1);
    vec3 pa = q - a.xyz;
    vec3 ba = b.xyz - a.xyz;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    best = min(best, length(pa - ba * h) / mix(a.w, b.w, h));
  }
  return best;
}

/* The flowers' and the cloth's contact shade on the stone, as the hero's
   resolve lays it under them (hero/bloom: the stems and the wrap softly,
   each head a ball's shade): 1 clear, less under them. */
float contactShade(vec3 p) {
  float near = 1e3;
  for (int i = 0; i < uShadeCount; i++) {
    vec4 a = uShade[i * 2];
    vec3 b = uShade[i * 2 + 1].xyz;
    vec3 pa = p - a.xyz;
    vec3 ba = b - a.xyz;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    near = min(near, length(pa - ba * h) - a.w);
  }
  return mix(1.0 - uContact.y, 1.0, smoothstep(0.0, uContact.x, near));
}

void main() {
  gl_FragDepth = 1.0;
  vec2 framePx = uRect.xy + gl_FragCoord.xy / uScale;
  vec3 rd = normalize(cameraRay(framePx / uFrame));
  vec3 ro = uCamPos;
  float tStart = 0.0;
  float tEnd = 1e4;
  if (uMirror > 0.5) {
    ro.y = -ro.y;
    rd.y = -rd.y;
    if (rd.y <= 0.0) {
      outColor = vec4(0.0);
      return;
    }
    tStart = -ro.y / rd.y;
  } else if (rd.y < 0.0) {
    /* The water hides what is under it. */
    tEnd = -ro.y / rd.y;
  }
  /* WHERE TO MARCH: from the nearer entry to the farther exit of the two
     things a ray can meet — the stone's own prism (exact, in its plan's
     frame, grown a few millimetres for the roughness) and the box of what
     broke off. A ray that crosses neither is clear at once. */
  float k = 1.0 / uStonePlan.z;
  vec3 po = toStone(ro);
  vec3 pd = dirToStone(rd);
  po.y *= k;
  pd.y *= k;
  vec3 half_ = vec3(STONE_HALF_SIDE, 0.5 * (uStoneSpan.y - uStoneSpan.x) * k, STONE_HALF_SIDE) + 0.006 * k;
  vec2 stone = boxSpan(po, pd, -half_, half_);
  vec2 chunks = boxSpan(ro, rd, CHUNKS_LO, CHUNKS_HI);
  float enter = 1e4;
  float leave = -1e4;
  if (stone.y > stone.x) { enter = min(enter, stone.x); leave = max(leave, stone.y); }
  if (chunks.y > chunks.x) { enter = min(enter, chunks.x); leave = max(leave, chunks.y); }
  tStart = max(tStart, enter);
  tEnd = min(tEnd, leave);
  if (tEnd <= tStart) {
    outColor = vec4(0.0);
    return;
  }

  /* ONE LOOP FOR THE MARCH AND THE TAPS AFTER IT — the normal (four taps
     of a tetrahedron) and the contact shade (four out along it) — so the
     field is pasted into the program once. tap is −1 while marching. */
  float t = tStart;
  int matter = 0;
  int found = 0;
  int tap = -1;
  vec3 p = vec3(0.0);
  vec3 n = vec3(0.0);
  float h = 0.0;
  float occlusion = 0.0;
  for (int i = 0; i < uSteps + 2 * uTaps; i++) {
    vec3 q;
    if (tap < 0) q = ro + rd * t;
    else if (tap < uTaps) q = p + (vec3(float(((tap + 3) >> 1) & 1), float((tap >> 1) & 1), float(tap & 1)) * 2.0 - 1.0) * h;
    else q = p + n * (uOcclusion.x * float(tap - uTaps + 1) / float(uTaps));
    int m;
    float d = map(q, m);
    if (tap < 0) {
      if (d < max(0.0002, t * uFootprint * 0.5)) {
        p = q;
        found = 1;
        matter = m;
        h = max(0.0004, t * uFootprint);
        tap = 0;
      } else {
        t += d * 0.9;
        if (t > tEnd || i >= uSteps) break;
      }
    } else if (tap < uTaps) {
      n += (vec3(float(((tap + 3) >> 1) & 1), float((tap >> 1) & 1), float(tap & 1)) * 2.0 - 1.0) * d;
      tap++;
      if (tap == uTaps) n = normalize(n);
    } else {
      float s = float(tap - uTaps + 1) / float(uTaps);
      occlusion += (uOcclusion.x * s - d) / uOcclusion.x * (1.2 - 0.5 * s);
      tap++;
      if (tap == 2 * uTaps) break;
    }
  }
  if (found == 0 || tap < 2 * uTaps) {
    outColor = vec4(0.0);
    return;
  }
  float shade = clamp(1.0 - uOcclusion.y * occlusion / float(uTaps), 0.0, 1.0);

  /* THE HERO'S LIGHT. Its whole faces by the hero's own shading; what is
     broken — the fracture, the bites, the chunks — the hero's granite
     fresh, as its chips are (paler: uStoneWear.z), under the hero's dome,
     its feet falling toward the water as the hero's faces' do. */
  vec3 local = toStone(p);
  vec3 bent = normalToStone(n);
  float footprint = t * uFootprint;
  vec3 c;
  if (matter == M_STONE) {
    c = shadeStone(p, local, bent, rd, footprint, uLit);
    if (uMirror < 0.5 && abs(n.y) < 0.7) {
      float near = crackAt(p);
      float core = 1.0 - smoothstep(0.55, 1.0, near);
      float shadow = 1.0 - smoothstep(1.0, uCrack.y, near);
      c *= 1.0 - uCrack.x * core - uCrack.z * shadow * (1.0 - core);
    }
  } else {
    vec3 a = abs(n);
    vec2 st = a.y > max(a.x, a.z) ? p.xz : (a.x > a.z ? p.zy : p.xy);
    float albedo = granite(st + float(matter) * 5.3, footprint) * uStoneWear.z;
    vec3 face = cubeDirection(bent);
    float toward = dot(normalize(n.xz + 1e-5), uLightSide) * 0.5 + 0.5;
    float foot = mix(mix(uStoneFoot.y, uStoneFoot.z, toward), 1.0, smoothstep(0.0, uStoneFoot.x, p.y));
    c = uStoneAlbedo * albedo * stoneIrradiance(face) * mix(foot, 1.0, max(n.y, 0.0)) * uLit;
  }
  c *= shade * contactShade(p);

  /* Into this print, then what little fog lies between. */
  c = heroToPrint(c);
  c = mix(vec3(uFogLight), c, exp(-uFogPerMetre * t));
  if (uMirror < 0.5) gl_FragDepth = depthOf(p);
  outColor = vec4(toPrint(c), 1.0);
}
`;
