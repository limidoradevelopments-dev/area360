/**
 * ─── Bloom · in GLSL ───
 *
 * The night bloom (bloom/optics.ts BLOOM) as a small mesh, drawn by its own
 * pass into the pictures the scene reads (bloom/bloom.ts) — never inside the
 * scene shader: a big program compiles far slower than its parts on a first
 * visit under Direct3D (stage/shaders/scene.ts, the top).
 *
 *   PLANT_VERT     builds each vertex from its sample of a spine (the pose
 *                  texture, bloom/shape.ts): a tepal's cupped, creased and
 *                  ruffled cross-section, a stem's fleshy lens with its
 *                  midrib, a round tube, stem or root; or, for the heart,
 *                  from a filament's own few numbers; the moss as it is —
 *                  and projects it into this picture's rect of the frame, as
 *                  the camera sees it or as the still lake mirrors it
 *   PLANT_FRAG     its light: the overcast dome, through the thin tepals
 *                  from behind, their veins and satin, the stems' waxy
 *                  gloss and their areoles, the bark, the moss's fur; hidden
 *                  where the stone stands in front
 *   RESOLVE_FRAG   a picture down to its pixels: the supersampled plant to
 *                  the screen's or the scene's (the mirror's softened by the
 *                  lake's unseen ripples), or the screen's picture to the
 *                  scene's; and on the stone under the plant, the share of
 *                  the sky it keeps
 *   HALO_FRAG      the light the flower holds, in the fog round it: its
 *                  petals' light past a threshold, gathered small and
 *                  spread — a tiny program of its own (~0.04 s cold), not
 *                  a mode of the resolve, whose stone and contact shade
 *                  make it the heavier compile
 *
 * The pollen's motes are drawn by PLANT_* too, as points, straight into the
 * scene's light (bloom.ts drawMotes).
 *
 * SUPERSAMPLED, NOT TRACED. The plant is drawn at several samples a pixel
 * each way and averaged: every outline — a tepal's curling tip, a filament
 * finer than a pixel, a stem turning edge-on — is as smooth as the samples
 * are many, and stays smooth while it moves, where a single sample a pixel
 * crawls. A filament or an anther finer than a sample is drawn a sample
 * wide and as faint as it is narrow: what shows of a hundred threads is
 * their sum. The moss's fur is the same trick: near its outline, where its
 * tips stand against what is behind, samples fall between them.
 *
 * FOR DIRECT3D (every Windows browser): every loop runs to a uniform's count,
 * never a constant (the compiler pastes a constant loop's body once per
 * turn); every texture read names its level; one output a draw.
 */

import { CAMERA_GLSL } from "../../stage/shaders/camera";
import { STONE_SHAPE_GLSL } from "../../stone/shaders/stone";
import { BLOOM } from "../optics";
import { KIND, MATTER, POSE_ROW } from "../shape";

/** The same numbers as shape.ts KIND and MATTER, for the shaders' branches. */
const K = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [k, `${v}.0`])) as Record<keyof typeof KIND, string>;
const M = Object.fromEntries(Object.entries(MATTER).map(([k, v]) => [k, `${v}.0`])) as Record<keyof typeof MATTER, string>;
/** How far the moss's grit reaches past its outline (the mesh's, fixed). */
const GRIT = BLOOM.mossForm.grit.toFixed(4);

/** Points of the runs the contact shade reads (the stems, the old stem, the
 *  roots), at most, and the chunks they are read in (bloom.ts fills them). */
export const CONTACT_POINTS = 80;
export const CONTACT_CHUNKS = 28;
/** Moss cushions the contact shade reads, at most. */
export const CONTACT_MOSS = 6;
/** The noise volume's texels each way (bloom.ts makes it). */
export const NOISE_SIZE = 32;

export const PLANT_VERT = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

/* (sample, across, side, kind), then (along, share, hash, space); for the
   heart: (index, across, along, kind), then (angle, length share, throat
   share, splay); for the moss: (point, kind), then (normal, how far out);
   for the pollen: (point, its strength). */
layout(location = 0) in vec4 aSpine;
layout(location = 1) in vec4 aMore;

${CAMERA_GLSL}

/* the spines this frame: three texels a sample (bloom/shape.ts) */
uniform sampler2D uPose;
/* the flower's frame: where it is, and its across, up and axis */
uniform vec3 uFlowerOrigin;
uniform mat3 uFlowerBasis;
/* the heart: how open, a filament's width, an anther's length and width (m) */
uniform vec4 uHeart;
/* where the filaments are set in the throat (m, deepest and shallowest),
   their lengths (m, shortest and longest) */
uniform vec4 uHeartSpan;
/* their splay: closed, open (deep, mouth); the throat's radius (m) */
uniform vec4 uHeartSplay;
/* the style's tip (the flower's frame), its lobes' length (m) */
uniform vec4 uStyleTip;
/* the stems' midrib: how far it stands, how wide (m); the tube's ridges:
   how many round it, how deep */
uniform vec4 uRibs;
/* the tepals: their crease, open (outermost, innermost); their margin's
   ruffle (m: outermost, innermost) */
uniform vec4 uTepalForm;
/* the frame's rect this picture covers (uv: corner, size) */
uniform vec4 uTargetRect;
/* drawn as the lake mirrors it (1) or as the camera sees it */
uniform float uMirror;
/* the pollen as points (1) or the mesh; a mote's radius (m); this
   picture's samples per CSS px */
uniform vec3 uPoints;
/* a mote's halo: its width (m); the halo's light against the core's; the
   core's light */
uniform vec3 uMote;

out vec3 vWorld;
out vec3 vNormal;
/* kind, along, share, across */
out vec4 vMat;
/* hash (a stem's: where along its margin, in areoles), side, coverage (the
   finer-than-a-sample parts), half-width or radius (m); for a mote: its
   core's width and its halo's (px), its light, its sprite's half-size */
out vec4 vMore;
/* the surface's way along its spine */
out vec3 vAlong;

vec4 poseAt(float index, int texel) {
  int i = int(index + 0.5);
  return texelFetch(uPose, ivec2((i % ${POSE_ROW}) * 3 + texel, i / ${POSE_ROW}), 0);
}

/* Metres a sample of this picture spans at camera depth z. */
float sampleSize(float z) {
  return z / (uFocal * uPoints.z);
}

/* Projects a world point into this picture (mirrored under the water when
   asked), with a depth for the plant's own depth test. */
vec4 project(vec3 p) {
  if (uMirror > 0.5) p.y = -p.y;
  vec3 c = transpose(uCamRot) * (p - uCamPos);
  vec2 uv = c.xy / c.z * uFocal / uView + uCenter;
  vec2 ndc = (uv - uTargetRect.xy) / uTargetRect.zw * 2.0 - 1.0;
  /* An ordinary perspective depth over 5–20 m: the plant spans ~2 m of it. */
  const float near_ = 5.0;
  const float far_ = 20.0;
  return vec4(ndc * c.z, (far_ + near_) / (far_ - near_) * c.z - 2.0 * far_ * near_ / (far_ - near_), c.z);
}

/* The eye this picture is seen from: the camera, or its image under the
   water. */
vec3 eye() {
  return uMirror > 0.5 ? vec3(uCamPos.x, -uCamPos.y, uCamPos.z) : uCamPos;
}

/* A filament (the flower's frame) at \`s\` along it: its point and its way. */
vec3 filamentAt(float s, vec4 f, out vec3 tangent) {
  float throat = f.z;
  float z0 = mix(uHeartSpan.x, uHeartSpan.y, throat);
  float ring = uHeartSplay.w * mix(0.7, 1.15, throat);
  float len = mix(uHeartSpan.z, uHeartSpan.w, f.y);
  float splay = mix(uHeartSplay.x, mix(uHeartSplay.y, uHeartSplay.z, throat) + (f.w - 0.5) * 0.2, uHeart.x);
  vec3 r = vec3(cos(f.x), sin(f.x), 0.0);
  vec3 axis = vec3(0.0, 0.0, 1.0);
  vec3 b = r * ring + axis * z0;
  /* Bowed outward along its length: it leaves the throat steeper than it
     ends. */
  vec3 m = b + 0.5 * len * (cos(splay * 0.55) * axis + sin(splay * 0.55) * r);
  vec3 e = b + len * (cos(splay) * axis + sin(splay) * r);
  tangent = normalize(2.0 * (1.0 - s) * (m - b) + 2.0 * s * (e - m));
  return (1.0 - s) * (1.0 - s) * b + 2.0 * (1.0 - s) * s * m + s * s * e;
}

void main() {
  float kind = aSpine.w;
  vMore = vec4(aMore.z, aSpine.z, 1.0, 0.0);
  vMat = vec4(kind, aMore.x, aMore.y, aSpine.y);
  vAlong = vec3(0.0, 1.0, 0.0);

  if (uPoints.x > 0.5) {
    /* A mote of pollen: a soft point of light — its core its own size, but
       never under 0.6 px (finer, its light swam as it crossed the pixel
       grid), as bright as that leaves it; in a halo \`uMote.x\` m wide. */
    vWorld = aSpine.xyz;
    vNormal = vec3(0.0, 1.0, 0.0);
    vec4 clip = project(aSpine.xyz);
    float perPx = sampleSize(clip.w);
    float core = uPoints.y / perPx;
    float drawn = max(core, 0.6);
    float halo = max(uMote.x / perPx, drawn * 1.5);
    float half_ = max(3.0 * halo, 2.0);
    gl_PointSize = 2.0 * half_;
    /* The core as bright as its own size leaves it; the halo, as wide as
       the frame makes it, its own light (tied to the core's, it swelled
       into an orb wherever the core was resolved). */
    vMat = vec4(6.0, (core * core) / (drawn * drawn), 0.0, 0.0);
    vMore = vec4(drawn, halo, aSpine.w, half_);
    gl_Position = clip;
    return;
  }

  if (kind > ${K.moss} - 0.5) {
    /* The moss: its point and its normal are its own. */
    vWorld = aSpine.xyz;
    vNormal = aMore.xyz;
    vMat = vec4(kind, aMore.w, 0.0, 0.0);
    gl_Position = project(aSpine.xyz);
    return;
  }

  vec3 p;
  vec3 n;
  vec3 along;
  bool local = aMore.w > 0.5;

  if (kind < ${K.stem} + 0.5) {
    /* A tepal or a bract (the flower's frame, or the world) or a stem (the
       world). */
    vec4 t0 = poseAt(aSpine.x, 0);
    vec4 t1 = poseAt(aSpine.x, 1);
    vec4 t2 = poseAt(aSpine.x, 2);
    float w = t0.w;
    vec3 across = t1.xyz;
    float k = t1.w;
    vec3 face = t2.xyz;
    along = cross(across, face);
    float u = aSpine.y;
    float x = u * w;
    /* The cross-section, an arc cupped toward the face. */
    float a = k * x;
    vec3 tc = across * cos(a) + face * sin(a);
    vec3 nc = -across * sin(a) + face * cos(a);
    p = t0.xyz + (abs(k) > 1e-3 ? (across * sin(a) + face * (1.0 - cos(a))) / k : across * x);
    vMore.w = w;
    if (kind < ${K.tepal} + 0.5) {
      /* The midrib's fold: each half lifted toward the face. */
      float crease = t2.w;
      p += nc * crease * abs(x);
      n = nc - tc * crease * sign(x);
      if (local) {
        /* The margin's ruffle: rising and falling along the tepal, more as
           it opens (its crease tells how open it is), none at its claw. */
        float q = aMore.y;
        float open = crease / max(mix(uTepalForm.x, uTepalForm.y, smoothstep(0.18, 0.82, q)), 1e-4);
        float amp = mix(uTepalForm.z, uTepalForm.w, q) * open * smoothstep(0.12, 0.45, aMore.x);
        float wave = sin(aMore.x * (8.0 + 6.0 * aMore.z) + aMore.z * 6.2831853);
        float t = clamp((abs(u) - 0.55) / 0.45, 0.0, 1.0);
        float edge = t * t * (3.0 - 2.0 * t);
        p += nc * amp * wave * edge;
        n -= tc * amp * wave * sign(u) * 6.0 * t * (1.0 - t) / (0.45 * max(w, 1e-4));
      }
    } else {
      /* A fleshy lens: thickest at the midrib, rounded to the margin; as
         thick as it is wide where it leaves the old stem (round there). */
      float side = aSpine.z;
      float h = t2.w;
      float e = mix(0.72, 0.5, smoothstep(0.5, 0.95, h / max(w, 1e-5)));
      float m = max(1.0 - u * u, 1e-3);
      float hh = h * pow(m, e);
      float dh = -2.0 * u * h * e * pow(m, e - 1.0) / max(w, 1e-5);
      if (side > 0.0) {
        float rib = uRibs.x * exp(-(x * x) / (uRibs.y * uRibs.y));
        hh += rib;
        dh += rib * -2.0 * x / (uRibs.y * uRibs.y);
      }
      p += nc * side * hh;
      n = side * nc - tc * dh;
    }
  } else if (kind < ${K.round} + 0.5) {
    /* Round: the tube, the second bud, the old stem, a root (the world), or
       the style (the flower's frame). */
    vec4 t0 = poseAt(aSpine.x, 0);
    vec4 t1 = poseAt(aSpine.x, 1);
    vec4 t2 = poseAt(aSpine.x, 2);
    float a = aSpine.y * 6.2831853;
    vec3 out_ = cos(a) * t1.xyz + sin(a) * t2.xyz;
    vec3 round_ = -sin(a) * t1.xyz + cos(a) * t2.xyz;
    p = t0.xyz + out_ * t0.w;
    along = cross(t1.xyz, t2.xyz);
    /* The tube's fine ridges, in the light only. */
    n = out_ + round_ * uRibs.w * sin(uRibs.z * a) * (aMore.y < ${M.tube} + 0.5 || aMore.y > ${M.bud} - 0.5 ? 1.0 : 0.0);
    vMore.w = t0.w;
  } else {
    /* The heart, in the flower's frame. */
    vec3 tangent;
    if (kind < ${K.anther} + 0.5) {
      p = filamentAt(kind < ${K.filament} + 0.5 ? aSpine.z : 1.0, aMore, tangent);
    } else {
      /* A stigma lobe: from the style's tip, out and curling back. */
      float s = aSpine.z;
      float beta = mix(0.2, 1.3, uHeart.x);
      vec3 r = vec3(cos(aMore.x), sin(aMore.x), 0.0);
      vec3 axis = vec3(0.0, 0.0, 1.0);
      vec3 b = uStyleTip.xyz;
      vec3 m = b + 0.5 * uStyleTip.w * (cos(beta * 0.6) * axis + sin(beta * 0.6) * r);
      vec3 e = b + uStyleTip.w * (cos(beta * 1.25) * axis + sin(beta * 1.25) * r);
      tangent = normalize(2.0 * (1.0 - s) * (m - b) + 2.0 * s * (e - m));
      p = (1.0 - s) * (1.0 - s) * b + 2.0 * (1.0 - s) * s * m + s * s * e;
    }
    vec3 world = uFlowerOrigin + uFlowerBasis * p;
    vec3 way = normalize(uFlowerBasis * tangent);
    vec3 view = normalize(eye() - world);
    vec3 across = normalize(cross(way, view));
    float z = (transpose(uCamRot) * (world - uCamPos)).z;
    float least = 1.4 * sampleSize(z);
    if (kind < ${K.anther} - 0.5 || kind > ${K.anther} + 0.5) {
      /* A thread turned to the eye: a sample wide at least, and as faint
         as it is finer than that. */
      float thread = kind > ${K.anther} + 0.5 ? uHeart.y * 2.2 : uHeart.y;
      float drawn = max(thread, least);
      world += across * aSpine.y * 0.5 * drawn;
      vMore.z = thread / drawn;
      n = normalize(across * aSpine.y + view * 0.6);
    } else {
      /* An anther: a little card along the filament's tip, its round
         outline cut in the light stage. */
      float len = max(uHeart.z, least);
      float wid = max(uHeart.w, least);
      world += across * aSpine.y * 0.5 * wid + way * aSpine.z * 0.5 * len;
      vMore.z = (uHeart.z * uHeart.w) / (len * wid);
      vMat.w = aSpine.y;
      vMat.y = aSpine.z;
      n = normalize(across * aSpine.y * 0.5 + view);
    }
    vWorld = world;
    vNormal = n;
    vAlong = way;
    gl_Position = project(world);
    return;
  }

  vec3 world = local ? uFlowerOrigin + uFlowerBasis * p : p;
  vWorld = world;
  vNormal = local ? uFlowerBasis * n : n;
  vAlong = local ? uFlowerBasis * along : along;
  gl_Position = project(world);
}
`;

export const PLANT_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;

in vec3 vWorld;
in vec3 vNormal;
in vec4 vMat;
in vec4 vMore;
in vec3 vAlong;
out vec4 outColor;

${CAMERA_GLSL}
${STONE_SHAPE_GLSL}

/* the full sky light */
uniform vec3 uLit;
/* the dome's light on the plant: up, away from the open lake, toward it
   (bloom/optics.ts BLOOM.light.dome), and that side, on the water */
uniform vec3 uBloomDome;
uniform vec2 uLightSide;
/* reflectances (linear) */
uniform vec3 uPetal;
uniform vec3 uSepal;
uniform vec3 uLeaf;
uniform vec3 uTubeTone;
uniform vec3 uAnther;
uniform vec3 uMoss;
uniform vec3 uBark;
uniform vec3 uPollen;
/* the tepals' transmitted share, the cup's light, their sheen; the stems'
   wax */
uniform vec4 uBloomLight;
/* the stems' and the tube's translucency; the light the cup holds this
   frame (bloom/optics.ts BLOOM.glow.lantern, motion.ts GLOW); where the
   inner series begins */
uniform vec3 uBloomMore;
/* a mote's halo: its width (m); the halo's light against the core's; the
   core's light */
uniform vec3 uMote;
/* the tepals' veins: how many, how much they show; their satin: its
   sharpness, its strength */
uniform vec4 uTepalLook;
/* the cup's cream; an areole's radius and their spacing (m); where the
   second bud's body begins along its spine */
uniform vec4 uPlantMore;
uniform float uMirror;
/* random values, repeating every NOISE_SIZE texels each way (bloom.ts) */
uniform sampler3D uNoise;

/* The dome's light on a surface turned to \`n\`: brightest facing up, more
   toward the open lake than away from it; facing down, what the pale
   stone's top and the lake give back. (At the dark lake's alone, a stem's
   underside printed near black, a dead leaf.) */
float bloomSky(vec3 n) {
  vec2 level = n.xz / max(length(n.xz), 1e-4);
  float side = mix(uBloomDome.y, uBloomDome.z, dot(level, uLightSide) * 0.5 + 0.5);
  return n.y >= 0.0 ? mix(side, uBloomDome.x, n.y) : mix(side, 0.15 * uBloomDome.x, -n.y);
}

/* What a gloss mirrors along \`d\`, as a share of the full sky light: the
   fog's bright horizon dimming a little toward the zenith, brighter toward
   the open lake; under the horizon, the lake — the fog lying on it near the
   horizon, dark water below. */
float dome(vec3 d) {
  vec2 level = d.xz / max(length(d.xz), 1e-4);
  float toward = mix(0.9, 1.05, dot(level, uLightSide) * 0.5 + 0.5);
  return d.y >= 0.0 ? mix(1.0, 0.85, sqrt(d.y)) * toward : mix(0.35, 0.1, sqrt(min(-d.y * 3.0, 1.0)));
}

/* Value noise, four values 0–1, on a lattice of one unit: for the
   textures too fine to model — the stems' mottling, the bark, the moss.
   Each is sized in metres, so it holds still on the plant. Read from a
   small repeating volume of random values (bloom.ts), filtered by the
   texture unit: the same noise computed here — eight hashes a value —
   cost a first visit's compile ~0.35 s. */
vec4 noise(vec3 p) {
  return textureLod(uNoise, p * ${(1 / NOISE_SIZE).toFixed(6)}, 0.0);
}

/* A waxy gloss: a dielectric's reflectance (Fresnel, Schlick), rough enough
   that its mirror is the dome blurred. */
float gloss(vec3 nv, vec3 v, float headOn, float most) {
  float c = max(dot(nv, v), 0.0);
  return headOn + (1.0 - headOn) * pow(1.0 - c, 5.0) * most;
}

void main() {
  vec3 eye = uCamPos;
  if (uMirror > 0.5) eye.y = -eye.y;

  /* Hidden where the stone stands in front: a mirrored ray from where it
     comes out of the lake. */
  vec3 ray = vWorld - eye;
  vec3 from = eye;
  if (uMirror > 0.5 && ray.y > 0.0) from = eye + ray * (-eye.y / ray.y);
  vec3 local;
  vec3 normal;
  float t = hitStoneRound(from, ray, local, normal);
  if (t > 0.0 && t < dot(vWorld - from, ray) / dot(ray, ray) && from.y + ray.y * t >= -1e-4) discard;

  float kind = vMat.x;
  float s = vMat.y;
  float share = vMat.z;
  float across = vMat.w;
  float coverage = vMore.z;
  vec3 v = normalize(eye - vWorld);
  vec3 n = normalize(vNormal);
  bool facing = dot(n, v) >= 0.0;
  vec3 nv = facing ? n : -n;
  float seen = bloomSky(nv);
  float behind = bloomSky(-nv);
  float graze = 1.0 - abs(dot(v, nv));
  vec3 color;
  float alpha = 1.0;

  /* THE TEXTURES TOO FINE TO MODEL — a tepal's streaks; a stem's mottling,
     speckle, cork and wax; the bark; the moss's tips and clumps — two reads
     of the noise, a coarse and a fine, four values each, at the sizes this
     part wants, made once here: every read is pasted whole into the
     program, and a first visit's compile grew 2.6× with one per use. */
  vec3 qa = vWorld * 45.0;
  vec3 qb = vWorld * 420.0;
  if (kind < ${K.tepal} + 0.5) {
    qa = vec3(across * 9.0, s * 1.6, vMore.x * 17.0);
  } else if (kind > ${K.stem} + 0.5 && kind < ${K.round} + 0.5) {
    float a = across * 6.2831853;
    qa = vec3(cos(a) * 2.6, sin(a) * 2.6, s * 3.2);
    qb = vWorld * 300.0;
  } else if (kind > ${K.moss} - 0.5) {
    qa = vWorld * 160.0;
    qb = vWorld * 900.0;
  }
  vec4 na = noise(qa);
  vec4 nb = noise(qb);

  if (kind < ${K.tepal} + 0.5) {
    /* A TEPAL, or a bract. Its face (toward the flower's heart) white,
       cream on the outer series; its back greener; the claw greener still. */
    float inner = smoothstep(uBloomMore.z - 0.18, uBloomMore.z + 0.06, share);
    vec3 face = mix(uSepal, uPetal, inner);
    /* The outermost's backs green-grey like the tube — what a bud shows of
       itself — paling inward to cream, then white. */
    vec3 back = mix(mix(uTubeTone * 1.12, uSepal * 0.93, smoothstep(0.0, uBloomMore.z, share)), uPetal * 0.96,
                    smoothstep(uBloomMore.z, uBloomMore.z + 0.3, share));
    vec3 albedo = facing ? face : back;
    albedo *= mix(vec3(0.82, 0.9, 0.74), vec3(1.0), smoothstep(0.0, 0.3, s));
    /* A bract (share below zero): the tube's green, flushed bronze toward
       its tip, as the kadupul's are. */
    if (share < -0.5) albedo = uTubeTone * mix(vec3(1.04), vec3(1.14, 0.94, 0.86), smoothstep(0.2, 1.0, s));
    /* The cup warmer deep inside, where the heart's light gathers: cream. */
    if (facing) albedo *= 1.0 + uPlantMore.x * vec3(0.3, 0.0, -1.2) * inner * (1.0 - smoothstep(0.1, 0.6, s));
    /* THE VEINS: fine lines up the tepal, following its outline from the
       claw — fewer on the narrow outer ones — and streaks along them where
       its satin catches. Seen only where a pixel is finer than a vein: on
       a 4K screen. */
    float veins = pow(abs(cos(across * uTepalLook.x * mix(0.45, 1.0, inner) * 1.5707963)), 6.0);
    float streak = na.r;
    albedo *= 1.0 - uTepalLook.y * (veins - 0.35) * smoothstep(0.05, 0.3, s);
    /* Deep in the cup the tepals and the filaments hide the sky from it;
       the outer series' backs from the tube and receptacle under them. */
    float cupped = mix(mix(0.72, uBloomLight.y, inner), 1.0, smoothstep(0.0, 0.72, s));
    float under = mix(0.6, 1.0, smoothstep(0.0, 0.4, s));
    float aoSeen = facing ? cupped : under;
    float aoBack = facing ? under : cupped;
    /* Thinnest at its margins and tip: more of the light behind comes
       through — the bright rim a backlit white petal has in every
       photograph of one. */
    float thin = 1.0 + 0.8 * smoothstep(0.6, 1.0, abs(across)) + 0.5 * smoothstep(0.65, 1.0, s);
    float through = uBloomLight.x * thin * (1.0 + 0.25 * (streak - 0.5));
    color = albedo * (seen * aoSeen * (1.0 - 0.3 * uBloomLight.x) + through * behind * aoBack);
    /* Sheen: the dome in its papillae, more toward grazing. */
    color += uBloomLight.z * (0.3 + graze * graze) * dome(reflect(-v, nv)) * aoSeen;
    /* SATIN: its papillae and veins run along it, so its sheen is a streak
       across it (a fibre's highlight), not a spot. */
    vec3 light = normalize(vec3(uLightSide.x * 0.7, 1.0, uLightSide.y * 0.7));
    float th = dot(normalize(vAlong), normalize(light + v));
    float satin = pow(max(1.0 - th * th, 0.0), 0.5 * uTepalLook.z);
    color += uTepalLook.w * satin * (0.6 + 0.8 * streak) * (0.7 + 0.6 * veins) * aoSeen * uBloomDome.x;
    /* THE LIGHT IT HOLDS: the cup, as it opens, lit from within — the
       light through its walls filling it, deepest in it most; on the backs
       of the crown, what of that comes through. Never on a bract. */
    float held = uBloomMore.y * mix(0.5, 1.0, inner) * (1.0 - 0.4 * s) * uBloomDome.x * step(-0.5, share);
    color += albedo * held * (facing ? 1.0 : 0.6 * uBloomLight.x);
  } else if (kind < ${K.stem} + 0.5) {
    /* A STEM: fleshy and waxy. This season's paler and yellower; woody and
       browner where it leaves the old stem; the underside greyer. */
    vec3 albedo = mix(uLeaf, uLeaf * vec3(1.3, 1.32, 0.95), share);
    albedo = mix(albedo * vec3(0.82, 0.74, 0.6), albedo, smoothstep(0.02, 0.1, s));
    /* Never one flat green: mottled in blotches a couple of centimetres
       across, speckled finer; the old ones corky in patches; this season's
       flushed at its tip. */
    albedo *= (0.9 + 0.2 * na.r) * (0.96 + 0.08 * nb.r);
    float cork = smoothstep(0.66, 0.78, na.g) * (1.0 - share) * smoothstep(0.05, 0.3, s);
    albedo = mix(albedo, uBark * 1.1, 0.55 * cork);
    albedo *= mix(vec3(1.0), vec3(1.06, 0.95, 0.92), share * smoothstep(0.7, 1.0, s));
    float side = vMore.y;
    if (side > 0.0) albedo *= 1.0 + 0.16 * exp(-across * across / 0.008);
    else albedo *= vec3(1.1, 1.08, 1.02);
    /* THE AREOLES, one in each notch of the margin: a small felted pit,
       where every shoot and flower comes from. None on the round stalk. */
    float place = vMore.x;
    float dAlong = abs(place - floor(place + 0.5)) * uPlantMore.z;
    float dIn = (1.0 - abs(across)) * vMore.w;
    float pit = (1.0 - smoothstep(0.55, 1.0, length(vec2(dAlong, dIn - 0.5 * uPlantMore.y)) / uPlantMore.y)) * smoothstep(0.12, 0.25, s);
    albedo = mix(albedo, uBark * 0.55, 0.85 * pit);
    float ao = mix(0.7, 1.0, smoothstep(0.0, 0.12, s));
    /* The cuticle: the gloss that shows a stem is round, thicker in some
       places than others. */
    float f = gloss(nv, v, uBloomLight.w, 0.55);
    f *= (smoothstep(0.02, 0.12, s) * 0.6 + 0.4) * (0.6 + 0.8 * na.b) * (1.0 - pit);
    color = albedo * (seen * ao + uBloomMore.x * behind) * (1.0 - f) + f * dome(reflect(-v, nv)) * ao;
  } else if (kind < ${K.round} + 0.5) {
    float matter = share;
    if (matter < ${M.tube} + 0.5 || matter > ${M.bud} - 0.5) {
      /* THE TUBE, or the second bud on its own. */
      vec3 albedo = uTubeTone * mix(vec3(0.9, 0.85, 0.78), vec3(1.0), smoothstep(0.0, 0.4, s));
      float ao = 1.0;
      if (matter < ${M.tube} + 0.5) {
        /* Its last part flares into the flower's throat: cream inside,
           where the cup holds it; under the reflexed crown outside. */
        albedo = mix(albedo, uSepal, smoothstep(0.86, 0.98, s));
        ao = 1.0 - 0.3 * smoothstep(0.7, 0.88, s) * (1.0 - smoothstep(0.9, 1.0, s));
      } else {
        /* The bud's body, under its bracts: cream-green, finely ribbed. */
        float body = smoothstep(uPlantMore.w - 0.03, uPlantMore.w + 0.03, s);
        albedo = mix(albedo, mix(uTubeTone, uSepal, 0.6) * (0.95 + 0.05 * cos(across * 43.98)), body);
      }
      float f = gloss(nv, v, uBloomLight.w, 0.45);
      color = albedo * (seen * ao + uBloomMore.x * behind) * (1.0 - f) + f * dome(reflect(-v, nv)) * ao;
    } else if (matter < ${M.style} + 0.5) {
      /* THE STYLE: white, a little lit through, and in the cup's light. */
      color = uPetal * (seen * 0.8 + 0.35 * behind) * (1.0 + 0.6 * uBloomMore.y);
    } else if (matter < ${M.wood} + 0.5) {
      /* THE OLD STEM: grey-brown bark, split along its length, dark down
         in the moss at its foot. */
      vec3 albedo = uBark * (0.78 + 0.34 * nb.r) * (1.0 - 0.45 * smoothstep(0.52, 0.72, na.r));
      float ao = mix(0.5, 1.0, smoothstep(0.0, 0.4, s));
      color = albedo * seen * ao;
    } else {
      /* A ROOT: pale and wiry, faintly glossy. */
      vec3 albedo = uBark * 1.35 * (0.85 + 0.3 * nb.r);
      float f = gloss(nv, v, 0.04, 0.3);
      color = albedo * seen * (1.0 - f) + f * dome(reflect(-v, nv));
    }
  } else if (kind < ${K.anther} + 0.5 && kind > ${K.anther} - 0.5) {
    /* AN ANTHER: a round cream grain. */
    float r = across * across + s * s;
    if (r > 1.0) discard;
    color = uAnther * (seen * 0.85 + 0.25 * behind) * (1.0 + 0.5 * uBloomMore.y);
    alpha = coverage;
  } else if (kind < ${K.lobe} + 0.5) {
    /* A FILAMENT or a stigma lobe: a white thread, lit through. Deep in the
       throat the tepals hide the sky from it; the cup's own light fills
       it. */
    bool lobe = kind > ${K.anther} + 0.5;
    float ao = lobe ? 1.0 : mix(0.55, 1.0, smoothstep(0.0, 0.8, s));
    /* The stigma's lobes cream, as in both references. */
    color = (lobe ? mix(uPetal, uAnther, 0.35) : uPetal) * (0.8 * seen + 0.55 * behind) * ao * (1.0 + 0.8 * uBloomMore.y);
    alpha = coverage;
  } else if (kind > ${K.moss} - 0.5 && s > 1.0) {
    /* THE GRIT round the moss (bloom/optics.ts BLOOM.mossForm): dark damp
       humus and pale grains, a thin layer broken into grains toward its
       edge, where the stone shows through — so the clump sinks into the
       stone instead of standing on it. */
    float g = clamp((s - 1.0) / ${GRIT}, 0.0, 1.0);
    if (0.75 * nb.r + 0.25 * na.g < 1.05 * g * g) discard;
    vec3 albedo = mix(uBark * 0.34, uBark * 0.95, smoothstep(0.55, 0.85, nb.g));
    albedo *= mix(0.75, 1.0, g);
    vec3 m = normalize(n + 0.6 * (vec3(nb.b, 0.0, nb.a) - vec3(0.5, 0.0, 0.5)));
    color = albedo * bloomSky(m);
  } else if (kind > ${K.moss} - 0.5) {
    /* THE MOSS. Seen almost edge-on, it is all slope and outline. Where it
       turns from the eye — its outline against what is behind — samples
       fall between its tips: a fur, never a line. */
    float out_ = s;
    float tips = nb.r;
    float clump = na.r;
    if (dot(n, v) < 0.16 * tips * tips * (0.5 + clump)) discard;
    /* Each tip its own little slope to the light: a soft speckle, the
       cushion's own roundness kept. */
    vec3 tilt = vec3(nb.g, 0.0, nb.b) - vec3(0.5, 0.0, 0.5);
    vec3 m = normalize(n + 0.45 * tilt);
    vec3 albedo = uMoss * (0.75 + 0.5 * tips) * (0.85 + 0.3 * clump);
    /* Its humus showing round the outline, and down in its hollows. */
    float humus = smoothstep(0.78, 1.0, out_) * (0.3 + 0.7 * (1.0 - tips));
    albedo = mix(albedo, uBark * 0.4, 0.6 * humus);
    float ao = mix(0.7, 1.0, tips) * mix(1.0, 0.8, smoothstep(0.85, 1.0, out_));
    color = albedo * bloomSky(m) * ao;
    /* Its tips catch the light at grazing: a velvet. */
    color += uMoss * 0.35 * pow(1.0 - max(dot(v, m), 0.0), 4.0) * uBloomDome.x * tips;
  } else {
    /* POLLEN: a mote of pale gold holding a little light — a core and its
       halo — added to the frame's light, hiding nothing (bloom.ts
       drawMotes). */
    vec2 d = (gl_PointCoord * 2.0 - 1.0) * vMore.w;
    float r2 = dot(d, d);
    float glow = s * exp(-0.5 * r2 / (vMore.x * vMore.x)) + uMote.y * exp(-0.5 * r2 / (vMore.y * vMore.y));
    outColor = vec4(uPollen * uLit * (uMote.z * vMore.z * glow), 0.0);
    return;
  }
  /* Premultiplied: the plant's own parts are whole (alpha 1); the threads,
     the anthers and the pollen are laid over with what they cover. */
  outColor = vec4(color * uLit * alpha, alpha);
}
`;

export const RESOLVE_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
out vec4 outColor;

${CAMERA_GLSL}
${STONE_SHAPE_GLSL}

/* what is resolved: the plant's supersamples (light premultiplied, its
   coverage), or a resolved picture (light, what it leaves) */
uniform sampler2D uSource;
/* an output pixel's footprint in the source's texels: where the first
   one's begins (x, y), how many texels it spans each way, and how many
   texels each way to visit */
uniform vec4 uFoot;
/* the mirror's blur: its reach and its width (texels; reach 0: a box) */
uniform vec2 uBlur;
/* the contact shade on (1) or off; the source already resolved (1) */
uniform vec2 uMode;
/* this picture's rect in its frame (px: corner), and the frame's size (px) */
uniform vec4 uRectPx;
/* the runs the stone is shaded under — the stems, the old stem, the roots —
   as points and their half-widths or radii, run after run */
uniform vec4 uRuns[${CONTACT_POINTS}];
/* the runs read in chunks of a few points: a sphere round each chunk and
   its shade (centre, radius), its first and last point; how many */
uniform vec4 uChunks[${CONTACT_CHUNKS}];
uniform vec2 uChunkSpan[${CONTACT_CHUNKS}];
uniform float uChunkCount;
/* the moss's cushions: middle (x, z), half-spans (m) */
uniform vec4 uMoss[${CONTACT_MOSS}];
/* the moss's shade: reach (m) past its outline, depth; the top's height;
   how many cushions */
uniform vec4 uMossShade;
/* the flower, as a sphere that shades the top under it */
uniform vec4 uFlowerShade;
/* the runs' shade: reach (m) past their margins, depth; under a root, the
   line where it touches: depth, width (m) */
uniform vec4 uContactShade;

/* A normal of the block's frame (stone/shaders/stone.ts toStone), in the
   world: through the map's transpose (the plan is not square). */
vec3 stoneNormal(vec3 n) {
  float h = STONE_HALF_SIDE;
  return normalize(vec3(h / uStonePlan.z * (n.x - n.z), n.y, h / uStonePlan.w * (n.x + n.z)));
}

/* How much of the sky a point on the stone keeps under the plant. */
float keepAt(vec3 p, vec3 n) {
  float keep = 1.0;
  /* Round the moss's foot, and under its fur: the humus it holds. */
  int cushions = int(uMossShade.w);
  for (int i = 0; i < cushions; i++) {
    vec4 m = uMoss[i];
    float e = length((p.xz - m.xy) / m.zw);
    vec2 gap = vec2(max(e - 1.0, 0.0) * min(m.z, m.w), max(uMossShade.z - p.y, 0.0));
    keep *= 1.0 - uMossShade.y * exp(-dot(gap, gap) / (uMossShade.x * uMossShade.x));
  }
  /* The runs lying close over it: a wide shade under a broad stem, a thin
     one under a root. Only the chunks whose shade reaches this point are
     read: each pixel reading every segment cost a 4K frame ~0.4 ms. */
  int chunks = int(uChunkCount);
  for (int c = 0; c < chunks; c++) {
    vec4 bound = uChunks[c];
    vec3 off = p - bound.xyz;
    if (dot(off, off) > bound.w * bound.w) continue;
    int last = int(uChunkSpan[c].y);
    for (int i = int(uChunkSpan[c].x); i < last; i++) {
      vec4 a = uRuns[i];
      vec4 b = uRuns[i + 1];
      vec3 ba = b.xyz - a.xyz;
      float h = clamp(dot(p - a.xyz, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
      vec3 q = p - a.xyz - ba * h;
      float r = mix(a.w, b.w, h);
      /* Only what stands over the surface shades it. */
      float over = smoothstep(-0.2, 0.4, dot(normalize(-q + vec3(0.0, 1e-5, 0.0)), n));
      float gap = max(length(q) - 0.6 * r, 0.0);
      float reach = clamp(4.0 * r, 0.003, uContactShade.x);
      keep *= 1.0 - uContactShade.y * mix(0.5, 1.0, smoothstep(0.002, 0.01, r)) * over * exp(-gap * gap / (reach * reach));
      /* Where a root touches, a thin dark line: the wet it holds against
         the stone. */
      float touch = max(length(q) - r, 0.0) / uContactShade.w;
      keep *= 1.0 - uContactShade.z * (1.0 - smoothstep(0.002, 0.004, r)) * over * exp(-touch * touch);
    }
  }
  /* The flower over the top: a sphere's share of the sky above the point. */
  vec3 to = uFlowerShade.xyz - p;
  float d2 = dot(to, to);
  keep *= 1.0 - clamp(uFlowerShade.w * uFlowerShade.w / d2 * max(dot(n, to) * inversesqrt(d2), 0.0), 0.0, 0.5);
  return keep;
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(uSource, 0);
  vec4 sum = vec4(0.0);
  float weight = 0.0;
  if (uBlur.x < 0.5) {
    /* A box over this pixel's own footprint: the texels inside it whole,
       those its edges cut by the share of them it covers — so a picture
       goes down by any ratio (the screen's 1.5 to the scene's 1) and each
       pixel is exactly the mean of what it covers. */
    vec2 a = uFoot.xy + vec2(px) * uFoot.z;
    vec2 b = a + uFoot.z;
    ivec2 first = ivec2(floor(a));
    int n = int(uFoot.w);
    for (int j = 0; j < n; j++) {
      float y = float(first.y + j);
      float wy = max(min(b.y, y + 1.0) - max(a.y, y), 0.0);
      for (int i = 0; i < n; i++) {
        float x = float(first.x + i);
        float w = max(min(b.x, x + 1.0) - max(a.x, x), 0.0) * wy;
        sum += w * texelFetch(uSource, clamp(first + ivec2(i, j), ivec2(0), size - 1), 0);
        weight += w;
      }
    }
  } else {
    /* The mirror: a Gaussian over its samples, the lake's unseen ripples. */
    int reach = int(uBlur.x + 0.5);
    vec2 c = (vec2(px) + 0.5) * uFoot.z;
    ivec2 at = ivec2(floor(c));
    float inv = 0.5 / (uBlur.y * uBlur.y);
    for (int j = -reach; j <= reach; j++) {
      for (int i = -reach; i <= reach; i++) {
        ivec2 q = clamp(at + ivec2(i, j), ivec2(0), size - 1);
        vec2 d = vec2(at + ivec2(i, j)) + 0.5 - c;
        float w = exp(-dot(d, d) * inv);
        sum += w * texelFetch(uSource, q, 0);
        weight += w;
      }
    }
  }
  vec4 plant = sum / max(weight, 1e-6);
  if (uMode.y > 0.5) {
    /* Already resolved: only fewer pixels. */
    outColor = plant;
    return;
  }
  float keep = 1.0;
  if (uMode.x > 0.5) {
    vec2 uv = (vec2(px) + uRectPx.xy + 0.5) / uRectPx.zw;
    vec3 ray = cameraRay(uv);
    vec3 local;
    vec3 normal;
    float t = hitStoneRound(uCamPos, ray, local, normal);
    vec3 p = uCamPos + ray * t;
    if (t > 0.0 && p.y >= 0.0) keep = keepAt(p, stoneNormal(normal));
  }
  /* rgb: the plant's light, premultiplied. a: what it leaves of what lies
     behind it — the share it does not cover, times the sky the stone keeps
     under it (stage/shaders/scene.ts plantOver). */
  outColor = vec4(plant.rgb, (1.0 - plant.a) * keep);
}
`;

export const HALO_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

out vec4 outColor;

/* the near picture (light premultiplied; what it leaves), or the halo's
   last pass */
uniform sampler2D uSource;
/* gathering: where this picture's first pixel begins in the near picture,
   and how many of its texels a pixel spans each way; blurring: the way
   (texels), the Gaussian's width (texels) and its reach */
uniform vec4 uFoot;
/* the source's used size (texels); the threshold (linear light); gather
   (0) or blur (1) */
uniform vec4 uHalo;

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  ivec2 used = ivec2(uHalo.xy);
  vec3 sum = vec3(0.0);
  if (uHalo.w < 0.5) {
    /* The plant's light past the threshold — its petals, never its stems —
       averaged down over each pixel's footprint; nothing past the near
       picture's edge. */
    int n = int(uFoot.z);
    ivec2 first = ivec2(uFoot.xy) + px * n;
    for (int j = 0; j < n; j++) {
      for (int i = 0; i < n; i++) {
        ivec2 t = first + ivec2(i, j);
        if (any(lessThan(t, ivec2(0))) || any(greaterThanEqual(t, used))) continue;
        vec4 p = texelFetch(uSource, t, 0);
        sum += max(p.rgb - uHalo.z * (1.0 - p.a), vec3(0.0));
      }
    }
    outColor = vec4(sum / float(n * n), 1.0);
    return;
  }
  /* One way of a separable Gaussian; past the used edge, nothing. */
  int reach = int(uFoot.w);
  ivec2 way = ivec2(uFoot.xy);
  float inv = 0.5 / (uFoot.z * uFoot.z);
  float weight = 0.0;
  for (int k = -reach; k <= reach; k++) {
    float w = exp(-float(k * k) * inv);
    weight += w;
    ivec2 t = px + way * k;
    if (any(lessThan(t, ivec2(0))) || any(greaterThanEqual(t, used))) continue;
    sum += w * texelFetch(uSource, t, 0).rgb;
  }
  outColor = vec4(sum / weight, 1.0);
}
`;
