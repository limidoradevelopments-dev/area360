/**
 * ─── Bloom · in GLSL ───
 *
 * The two cut chamomiles and their cloth (bloom/optics.ts BLOOM) as a small
 * mesh, drawn by its own pass into the pictures the scene reads (bloom/
 * bloom.ts) — never inside the scene shader: a big program compiles far
 * slower than its parts on a first visit under Direct3D (stage/shaders/
 * scene.ts, the top).
 *
 *   PLANT_VERT     builds each vertex from its sample of a spine (the pose
 *                  texture, bloom/shape.ts): a ray's channelled, creased and
 *                  ruffled strap, a bract, the cloth's thin pleated band, a
 *                  round stem or disc — and projects it into this picture's
 *                  rect of the frame, as the camera sees it or as the still
 *                  lake mirrors it
 *   PLANT_FRAG     its light: the overcast dome, through the thin rays from
 *                  behind, their veins and satin and toothed tips, the
 *                  disc's florets, the stems' waxy gloss and their cuts, the
 *                  cloth's weave and fray; hidden where the stone stands in
 *                  front
 *   RESOLVE_FRAG   a picture down to its pixels: the supersampled flowers to
 *                  the screen's or the scene's (the mirror's softened by the
 *                  lake's unseen ripples), or the screen's picture to the
 *                  scene's; and on the stone under them, the share of the
 *                  sky it keeps
 *   HALO_FRAG      the light the heads hold, in the fog round them: their
 *                  rays' light past a threshold, gathered small and spread
 *                  — a tiny program of its own (~0.04 s cold), not a mode of
 *                  the resolve, whose stone and contact shade make it the
 *                  heavier compile
 *
 * The pollen's motes are drawn by PLANT_* too, as points, straight into the
 * scene's light (bloom.ts drawMotes).
 *
 * SUPERSAMPLED, NOT TRACED. The flowers are drawn at several samples a pixel
 * each way and averaged: every outline — a ray's toothed tip, a stem finer
 * than a pixel, the cloth's frayed edge — is as smooth as the samples are
 * many, and stays smooth while it moves, where a single sample a pixel
 * crawls. The cloth's fray is samples falling between its loose threads.
 *
 * FOR DIRECT3D (every Windows browser): every loop runs to a uniform's count,
 * never a constant (the compiler pastes a constant loop's body once per
 * turn); every texture read names its level; one output a draw.
 */

import { CAMERA_GLSL } from "../../stage/shaders/camera";
import { STONE_SHAPE_GLSL } from "../../stone/shaders/stone";
import { KIND, MATTER, POSE_ROW } from "../shape";

/** The same numbers as shape.ts KIND and MATTER, for the shaders' branches. */
const K = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [k, `${v}.0`])) as Record<keyof typeof KIND, string>;
const M = Object.fromEntries(Object.entries(MATTER).map(([k, v]) => [k, `${v}.0`])) as Record<keyof typeof MATTER, string>;

/** Points of the runs the contact shade reads (the stems, the wrap, the
 *  cloth's tails), at most, and the chunks they are read in (bloom.ts fills
 *  them). */
export const CONTACT_POINTS = 48;
export const CONTACT_CHUNKS = 20;
/** The noise volume's texels each way (bloom.ts makes it). */
export const NOISE_SIZE = 32;

export const PLANT_VERT = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

/* (sample, across, side, kind), then (along, share, hash, last): for a ray
   its head and whether it is ruffled; for the cloth which piece, its
   length (m) and how its end is cut; for the pollen: (point, its strength). */
layout(location = 0) in vec4 aSpine;
layout(location = 1) in vec4 aMore;

${CAMERA_GLSL}

/* the spines this frame, in the world: three texels a sample (bloom/shape.ts) */
uniform sampler2D uPose;
/* the rays' margins' ruffle (m) */
uniform float uRayRuffle;
/* the stems' ribs: how many round them, how much they tilt the light */
uniform vec2 uRidges;
/* the cloth's pleats: how high (m) */
uniform float uClothPleat;
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
/* hash (the cloth's: its length, m; a stem's: 1 on its cut), side (the
   cloth's: how its end is cut), coverage, half-width or radius (m); for a
   mote: its core's width and its halo's (px), its light, its sprite's
   half-size */
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
   asked), with a depth for the flowers' own depth test. */
vec4 project(vec3 p) {
  if (uMirror > 0.5) p.y = -p.y;
  vec3 c = transpose(uCamRot) * (p - uCamPos);
  vec2 uv = c.xy / c.z * uFocal / uView + uCenter;
  vec2 ndc = (uv - uTargetRect.xy) / uTargetRect.zw * 2.0 - 1.0;
  /* An ordinary perspective depth over 5–20 m: the flowers span ~1 m of it. */
  const float near_ = 5.0;
  const float far_ = 20.0;
  return vec4(ndc * c.z, (far_ + near_) / (far_ - near_) * c.z - 2.0 * far_ * near_ / (far_ - near_), c.z);
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

  vec4 t0 = poseAt(aSpine.x, 0);
  vec4 t1 = poseAt(aSpine.x, 1);
  vec4 t2 = poseAt(aSpine.x, 2);
  vec3 p;
  vec3 n;
  vec3 along;

  if (kind < ${K.cloth} + 0.5) {
    /* A ray, a bract or a band of the cloth. */
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
    if (kind < ${K.ray} + 0.5) {
      /* The midrib's fold: each half lifted toward the face. */
      float crease = t2.w;
      p += nc * crease * abs(x);
      n = nc - tc * crease * sign(x);
      if (aMore.w > 0.5) {
        /* The margin's ruffle: rising and falling along the ray, none at
           its claw. */
        float wave = sin(aMore.x * (7.0 + 5.0 * aMore.z) + aMore.z * 6.2831853);
        float t = clamp((abs(u) - 0.55) / 0.45, 0.0, 1.0);
        float edge = t * t * (3.0 - 2.0 * t);
        float amp = uRayRuffle * smoothstep(0.15, 0.5, aMore.x);
        p += nc * amp * wave * edge;
        n -= tc * amp * wave * sign(u) * 6.0 * t * (1.0 - t) / (0.45 * max(w, 1e-4));
      }
    } else {
      /* The cloth: a thin sheet, its two faces meeting at its margins,
         pleated in soft creases running along it (a strip of cotton is
         never flat: they are what its light shows), wandering across it
         as it goes — standing off its face only, never into the stone it
         lies on (there they were cut away, and it read as torn). */
      float side = aSpine.z;
      float h = t2.w;
      float m = max(1.0 - u * u, 1e-3);
      float hh = h * sqrt(m);
      float dh = -u * h / (sqrt(m) * max(w, 1e-5));
      float phase = aMore.x * min(aMore.z, 1.0) * 140.0 + aMore.y * 2.1;
      float depth = uClothPleat * (0.6 + 0.4 * sin(phase * 0.37));
      float pleat = depth * (0.5 + 0.5 * sin(u * 4.4 + phase));
      float slope = depth * 2.2 * cos(u * 4.4 + phase) / max(w, 1e-5);
      p += nc * (side * hh + pleat);
      n = side * nc - tc * (dh + side * slope);
      vMore.y = aMore.w;
    }
  } else {
    /* Round: a stem, the side shoot or a disc. The light tilts along it as
       its radius changes (a disc's dome, a stem swelling into its head);
       a stem's ribs tilt it round it; the ring at no radius at a stem's end
       is its cut, facing out of it. */
    float a = aSpine.y * 6.2831853;
    vec3 out_ = cos(a) * t1.xyz + sin(a) * t2.xyz;
    vec3 round_ = -sin(a) * t1.xyz + cos(a) * t2.xyz;
    p = t0.xyz + out_ * t0.w;
    along = cross(t1.xyz, t2.xyz);
    bool stem = aMore.y < ${M.stem} + 0.5;
    n = out_ - along * t1.w + round_ * uRidges.y * sin(uRidges.x * a) * (stem ? 1.0 : 0.0);
    if (stem && t0.w < 1e-6) {
      n = -along;
      vMore.x = 1.0;
    } else {
      vMore.x = 0.0;
    }
    vMore.w = t0.w;
  }

  vWorld = p;
  vNormal = n;
  vAlong = along;
  gl_Position = project(p);
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
/* the dome's light on the flowers: up, away from the open lake, toward it
   (bloom/optics.ts BLOOM.light.dome), and that side, on the water */
uniform vec3 uBloomDome;
uniform vec2 uLightSide;
/* reflectances (linear) */
uniform vec3 uPetal;
uniform vec3 uDisc;
uniform vec3 uStem;
uniform vec3 uCloth;
uniform vec3 uPollen;
/* the rays' transmitted share, their sheen; the stems' wax and their
   translucency */
uniform vec4 uBloomLight;
/* the cloth's translucency; how much the disc's florets show, and how much
   lighter its outer ring is; how deep the rays' teeth are cut (share) */
uniform vec4 uBloomMore;
/* a mote's halo: its width (m); the halo's light against the core's; the
   core's light */
uniform vec3 uMote;
/* the rays' veins: how many, how much they show; their satin: its
   sharpness, its strength */
uniform vec4 uRayLook;
/* how much the cloth's weave shows; how far its fray reaches into its
   margins (share) and at its end (m); the dome's light on it against the
   flowers' */
uniform vec4 uPlantMore;
uniform float uMirror;
/* random values, repeating every NOISE_SIZE texels each way (bloom.ts) */
uniform sampler3D uNoise;

/* The dome's light on a surface turned to \`n\`: brightest facing up, more
   toward the open lake than away from it; facing down, what the pale
   stone's top and the lake give back. */
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
   textures too fine to model — a ray's streaks, the disc's florets, the
   cloth's weave and fray. Read from a small repeating volume of random
   values (bloom.ts), filtered by the texture unit: the same noise computed
   here — eight hashes a value — cost a first visit's compile ~0.35 s. */
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
  if (kind > 5.5) {
    /* POLLEN: a mote of pale gold holding a little light — a core and its
       halo — added to the frame's light, hiding nothing (bloom.ts
       drawMotes). */
    vec2 d = (gl_PointCoord * 2.0 - 1.0) * vMore.w;
    float r2 = dot(d, d);
    float glow = s * exp(-0.5 * r2 / (vMore.x * vMore.x)) + uMote.y * exp(-0.5 * r2 / (vMore.y * vMore.y));
    outColor = vec4(uPollen * uLit * (uMote.z * vMore.z * glow), 0.0);
    return;
  }
  vec3 v = normalize(eye - vWorld);
  vec3 n = normalize(vNormal);
  bool facing = dot(n, v) >= 0.0;
  vec3 nv = facing ? n : -n;
  float seen = bloomSky(nv);
  float behind = bloomSky(-nv);
  float graze = 1.0 - abs(dot(v, nv));
  vec3 color;

  bool band = kind > ${K.cloth} - 0.5 && kind < ${K.cloth} + 0.5;

  /* THE TEXTURES TOO FINE TO MODEL — a ray's streaks; the disc's florets;
     the cloth's threads, its slubs and its fray — two reads of the noise,
     a coarse and a fine, four values each, at the sizes this part wants,
     made once here: every read is pasted whole into the program, and a
     first visit's compile grew 2.6× with one per use. */
  vec3 qa = vWorld * 160.0;
  vec3 qb = vWorld * 1100.0;
  if (kind < ${K.ray} + 0.5) {
    qa = vec3(across * 9.0, s * 1.6, vMore.x * 17.0);
  } else if (band) {
    /* Along the band: its warp threads (fine across it, long along it)
       and the weft across them (fine along it). */
    float metres = s * min(vMore.x, 1.0);
    qa = vec3(across * 18.0, metres * 45.0, share * 7.0);
    qb = vec3(across * 3.0, metres * 700.0, share * 3.0 + 0.5);
  }
  vec4 na = noise(qa);
  vec4 nb = noise(qb);

  if (band) {
    /* THE CLOTH: undyed cotton, torn into a strip and frayed. Matte — its
       fibres scatter the dome — with a soft fuzz at grazing; a little of
       the light behind a single layer comes through. Frayed along its
       margins (the weft's ends standing past it) and at its cut ends, cut
       on a slant (the warp's loose ends, each its own length): samples fall
       between them. */
    float margin = abs(across);
    float edge = 1.0 - uPlantMore.y;
    if (margin > edge && nb.r < (margin - edge) / uPlantMore.y) discard;
    float toEnd = (1.0 - s) * vMore.x + across * vMore.w * tan(vMore.y);
    if (toEnd < 0.0) discard;
    if (toEnd < uPlantMore.z && na.g > toEnd / uPlantMore.z) discard;
    /* Its weave and slubs: the cloth's own grain, in the light. */
    vec3 m = normalize(nv + 0.22 * (nb.rgb - 0.5));
    vec3 albedo = uCloth * (1.0 - uPlantMore.x * (0.5 - na.b) - 0.5 * uPlantMore.x * (0.5 - nb.a));
    color = albedo * (uPlantMore.w * bloomSky(m) + uBloomMore.x * behind);
    color += uCloth * 0.05 * graze * graze * uBloomDome.x;
  } else if (kind < ${K.ray} + 0.5 && share < -0.5) {
    /* A BRACT behind a head: green, its margins pale and papery, as a
       chamomile's are; a little lit through. */
    float papery = smoothstep(0.45, 0.9, abs(across)) + 0.6 * smoothstep(0.7, 1.0, s);
    vec3 albedo = mix(uStem * 1.05, uPetal * 0.82, clamp(papery, 0.0, 1.0));
    color = albedo * (seen * mix(0.75, 1.0, s) + 0.3 * behind);
  } else if (kind < ${K.ray} + 0.5) {
    /* A RAY: a white strap, its tip cut in three teeth, grooved along its
       length by its veins; thin enough that the light behind it comes
       through, most at its margins and tip; its satin a streak across it.
       Near the disc its claw is shaded by the florets and greener. */
    float teeth = uBloomMore.w * (0.5 - 0.5 * cos(across * 9.42477796));
    if (s > 1.0 - teeth) discard;
    vec3 albedo = uPetal * mix(vec3(0.86, 0.92, 0.8), vec3(1.0), smoothstep(0.0, 0.22, s));
    float veins = pow(abs(cos(across * uRayLook.x * 1.5707963)), 4.0);
    float streak = na.r;
    albedo *= 1.0 - uRayLook.y * (veins - 0.4) * smoothstep(0.05, 0.25, s);
    float ao = mix(0.62, 1.0, smoothstep(0.0, 0.3, s));
    float thin = 1.0 + 0.7 * smoothstep(0.6, 1.0, abs(across)) + 0.5 * smoothstep(0.7, 1.0, s);
    float through = uBloomLight.x * thin * (1.0 + 0.25 * (streak - 0.5));
    color = albedo * (seen * ao * (1.0 - 0.3 * uBloomLight.x) + through * behind * ao);
    /* Sheen: the dome in its papillae, more toward grazing. */
    color += uBloomLight.y * (0.3 + graze * graze) * dome(reflect(-v, nv)) * ao;
    /* SATIN: its papillae and veins run along it, so its sheen is a streak
       across it (a fibre's highlight), not a spot. */
    vec3 light = normalize(vec3(uLightSide.x * 0.7, 1.0, uLightSide.y * 0.7));
    float th = dot(normalize(vAlong), normalize(light + v));
    float satin = pow(max(1.0 - th * th, 0.0), 0.5 * uRayLook.z);
    color += uRayLook.w * satin * (0.6 + 0.8 * streak) * (0.7 + 0.6 * veins) * ao * uBloomDome.x;
  } else if (share > ${M.disc} - 0.5) {
    /* A DISC: a dome of hundreds of tiny florets, each a grain finer than
       a pixel (what shows is their speckle); the outer ring open and
       lighter, the buds at its tip closed and a little greener; the rays'
       claws shading its foot. */
    float grain = mix(1.0 - uBloomMore.y, 1.0 + uBloomMore.y, nb.r) * (0.92 + 0.16 * na.g);
    vec3 albedo = uDisc * grain * (1.0 + uBloomMore.z * (1.0 - smoothstep(0.15, 0.45, s)));
    albedo = mix(albedo, albedo * vec3(0.85, 0.95, 0.7), smoothstep(0.75, 1.0, s));
    float ao = mix(0.7, 1.0, smoothstep(0.05, 0.35, s));
    color = albedo * seen * ao;
  } else {
    /* A STEM, or the side shoot: green, finely ribbed, waxy — the gloss
       that shows it is round; at its cut, its pale flesh. */
    float cut = smoothstep(0.02, 0.2, vMore.x);
    vec3 albedo = mix(uStem * (0.92 + 0.16 * na.r), mix(uStem, uPetal, 0.55), cut);
    float f = gloss(nv, v, uBloomLight.z, 0.45) * (1.0 - cut);
    color = albedo * (seen + uBloomLight.w * behind) * (1.0 - f) + f * dome(reflect(-v, nv));
  }
  /* Premultiplied, and whole: what it covers it hides. */
  outColor = vec4(color * uLit, 1.0);
}
`;

export const RESOLVE_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
out vec4 outColor;

${CAMERA_GLSL}
${STONE_SHAPE_GLSL}

/* what is resolved: the flowers' supersamples (light premultiplied, its
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
/* the runs the stone is shaded under — the stems, the cloth wound round
   them, the cloth's tails — as points and their radii (a flat band of
   cloth: its half-width, negative), run after run */
uniform vec4 uRuns[${CONTACT_POINTS}];
/* the runs read in chunks of a few points: a sphere round each chunk and
   its shade (centre, radius), its first and last point; how many */
uniform vec4 uChunks[${CONTACT_CHUNKS}];
uniform vec2 uChunkSpan[${CONTACT_CHUNKS}];
uniform float uChunkCount;
/* the heads, each as a sphere that shades the top under it */
uniform vec4 uHeadShade[2];
/* the runs' shade: reach (m) past their margins, depth; under a stem, the
   line where it touches: depth, width (m) */
uniform vec4 uContactShade;
/* the cloth's: reach (m) past its margins */
uniform float uClothShade;

/* A normal of the block's frame (stone/shaders/stone.ts toStone), in the
   world: through the map's transpose (the plan is not square). */
vec3 stoneNormal(vec3 n) {
  float h = STONE_HALF_SIDE;
  return normalize(vec3(h / uStonePlan.z * (n.x - n.z), n.y, h / uStonePlan.w * (n.x + n.z)));
}

/* How much of the sky a point on the stone keeps under the flowers. */
float keepAt(vec3 p, vec3 n) {
  float keep = 1.0;
  /* The runs lying close over it: the stems and the wrap, round, shading
     it softly round them; the cloth, flat on it, darkening only a thin
     line along its margins. Only the chunks whose shade reaches this point
     are read: each pixel reading every segment cost a 4K frame ~0.4 ms. */
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
      if (r < 0.0) {
        /* The cloth: as wide as it is, its shade only past its margins. */
        float gap = max(length(q) + r, 0.0) / uClothShade;
        keep *= 1.0 - uContactShade.y * exp(-gap * gap);
        continue;
      }
      /* Only what stands over the surface shades it. */
      float over = smoothstep(-0.2, 0.4, dot(normalize(-q + vec3(0.0, 1e-5, 0.0)), n));
      float gap = max(length(q) - 0.6 * r, 0.0);
      float reach = clamp(4.0 * r, 0.003, uContactShade.x);
      keep *= 1.0 - uContactShade.y * mix(0.5, 1.0, smoothstep(0.002, 0.01, r)) * over * exp(-gap * gap / (reach * reach));
      /* Where a stem touches, a thin dark line: the wet it holds against
         the stone. */
      float touch = max(length(q) - r, 0.0) / uContactShade.w;
      keep *= 1.0 - uContactShade.z * (1.0 - smoothstep(0.004, 0.008, r)) * over * exp(-touch * touch);
    }
  }
  /* The heads over the top: each a sphere's share of the sky above the
     point. */
  vec3 to = uHeadShade[0].xyz - p;
  float d2 = dot(to, to);
  keep *= 1.0 - clamp(uHeadShade[0].w * uHeadShade[0].w / d2 * max(dot(n, to) * inversesqrt(d2), 0.0), 0.0, 0.5);
  to = uHeadShade[1].xyz - p;
  d2 = dot(to, to);
  keep *= 1.0 - clamp(uHeadShade[1].w * uHeadShade[1].w / d2 * max(dot(n, to) * inversesqrt(d2), 0.0), 0.0, 0.5);
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
  /* rgb: the flowers' light, premultiplied. a: what it leaves of what lies
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
/* gathering: the heads' own box in the near picture (texels: first,
   last) — the cloth, as pale as a ray's shade, never glows */
uniform vec4 uHaloBox;

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  ivec2 used = ivec2(uHalo.xy);
  vec3 sum = vec3(0.0);
  if (uHalo.w < 0.5) {
    /* The heads' light past the threshold — their rays, never the discs or
       the stems — averaged down over each pixel's footprint; nothing past
       the near picture's edge, nor past the heads' own box. */
    int n = int(uFoot.z);
    ivec2 first = ivec2(uFoot.xy) + px * n;
    for (int j = 0; j < n; j++) {
      for (int i = 0; i < n; i++) {
        ivec2 t = first + ivec2(i, j);
        if (any(lessThan(t, ivec2(0))) || any(greaterThanEqual(t, used))) continue;
        if (any(lessThan(vec2(t), uHaloBox.xy)) || any(greaterThan(vec2(t), uHaloBox.zw))) continue;
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
