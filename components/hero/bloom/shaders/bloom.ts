/**
 * ─── Bloom · in GLSL ───
 *
 * The night bloom (bloom/optics.ts BLOOM) as a small mesh, drawn by its own
 * pass into the pictures the scene reads (bloom/bloom.ts) — never inside the
 * scene shader: a big program compiles far slower than its parts on a first
 * visit under Direct3D (stage/shaders/scene.ts, the top).
 *
 *   PLANT_VERT     builds each vertex from its sample of a spine (the pose
 *                  texture, bloom/shape.ts): a tepal's cupped and creased
 *                  cross-section, a stem's fleshy lens with its midrib, a
 *                  round tube; or, for the heart, from a filament's own few
 *                  numbers — and projects it into this picture's rect of the
 *                  frame, as the camera sees it or as the still lake mirrors
 *                  it
 *   PLANT_FRAG     its light: the overcast dome, through the thin tepals
 *                  from behind, the stems' waxy gloss; hidden where the
 *                  stone stands in front
 *   RESOLVE_FRAG   the supersampled picture down to the scene's pixels (the
 *                  mirror's softened by the lake's unseen ripples), and on
 *                  the stone under the plant, the share of the sky it keeps
 *
 * SUPERSAMPLED, NOT TRACED. The plant is drawn at several samples a pixel
 * each way and averaged: every outline — a tepal's curling tip, a filament
 * finer than a pixel, a stem turning edge-on — is as smooth as the samples
 * are many, and stays smooth while it moves, where a single sample a pixel
 * crawls. A filament or an anther finer than a sample is drawn a sample
 * wide and as faint as it is narrow: what shows of a hundred threads is
 * their sum.
 *
 * FOR DIRECT3D (every Windows browser): every loop runs to a uniform's count,
 * never a constant (the compiler pastes a constant loop's body once per
 * turn); every texture read names its level; one output a draw.
 */

import { CAMERA_GLSL } from "../../stage/shaders/camera";
import { STONE_SHAPE_GLSL } from "../../stone/shaders/stone";
import { KIND, POSE_ROW } from "../shape";

/** The same numbers as shape.ts KIND, for the shaders' branches. */
const K = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [k, `${v}.0`])) as Record<keyof typeof KIND, string>;

/** Stem segments the contact shade reads, at most (bloom.ts fills them). */
export const CONTACT_POINTS = 48;

export const PLANT_VERT = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

/* (sample, across, side, kind), then (along, share, hash, space); for the
   heart: (index, across, along, kind), then (angle, length share, throat
   share, splay); for the pollen: (point, its strength). */
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
/* the frame's rect this picture covers (uv: corner, size) */
uniform vec4 uTargetRect;
/* drawn as the lake mirrors it (1) or as the camera sees it */
uniform float uMirror;
/* the pollen as points (1) or the mesh; a speck's radius (m); this
   picture's samples per CSS px */
uniform vec3 uPoints;

out vec3 vWorld;
out vec3 vNormal;
/* kind, along, share, across */
out vec4 vMat;
/* hash, side, coverage (the finer-than-a-sample parts), unused */
out vec4 vMore;

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

  if (uPoints.x > 0.5) {
    /* A speck of pollen: a point, its size its own, a sample at least. */
    vWorld = aSpine.xyz;
    vNormal = vec3(0.0, 1.0, 0.0);
    vec4 clip = project(aSpine.xyz);
    float size = 2.0 * uPoints.y / sampleSize(clip.w);
    gl_PointSize = max(size, 1.5);
    vMat = vec4(6.0, 0.0, 0.0, 0.0);
    vMore = vec4(0.0, 0.0, aSpine.w * min(size / 1.5, 1.0) * min(size / 1.5, 1.0), 0.0);
    gl_Position = clip;
    return;
  }

  vec3 p;
  vec3 n;
  bool local = aMore.w > 0.5;

  if (kind < ${K.stem} + 0.5) {
    /* A tepal (the flower's frame) or a stem (the world). */
    vec4 t0 = poseAt(aSpine.x, 0);
    vec4 t1 = poseAt(aSpine.x, 1);
    vec4 t2 = poseAt(aSpine.x, 2);
    float w = t0.w;
    vec3 across = t1.xyz;
    float k = t1.w;
    vec3 face = t2.xyz;
    float u = aSpine.y;
    float x = u * w;
    /* The cross-section, an arc cupped toward the face. */
    float a = k * x;
    vec3 tc = across * cos(a) + face * sin(a);
    vec3 nc = -across * sin(a) + face * cos(a);
    p = t0.xyz + (abs(k) > 1e-3 ? (across * sin(a) + face * (1.0 - cos(a))) / k : across * x);
    if (kind < ${K.tepal} + 0.5) {
      /* The midrib's fold: each half lifted toward the face. */
      float crease = t2.w;
      p += nc * crease * abs(x);
      n = nc - tc * crease * sign(x);
      local = true;
    } else {
      /* A fleshy lens: thickest at the midrib, rounded to the margin; as
         thick as it is wide where it leaves the root (round there). */
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
      local = false;
    }
  } else if (kind < ${K.tube} + 0.5) {
    /* Round: the tube (the world) or the style (the flower's frame). */
    vec4 t0 = poseAt(aSpine.x, 0);
    vec4 t1 = poseAt(aSpine.x, 1);
    vec4 t2 = poseAt(aSpine.x, 2);
    float a = aSpine.y * 6.2831853;
    vec3 out_ = cos(a) * t1.xyz + sin(a) * t2.xyz;
    vec3 round_ = -sin(a) * t1.xyz + cos(a) * t2.xyz;
    p = t0.xyz + out_ * t0.w;
    /* Its fine ridges, in the light only (the style has none). */
    n = out_ + round_ * uRibs.w * sin(uRibs.z * a) * (local ? 0.0 : 1.0);
    vMat.z = aMore.w;
  } else {
    /* The heart, in the flower's frame. */
    local = true;
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
    vec3 along = normalize(uFlowerBasis * tangent);
    vec3 view = normalize(eye() - world);
    vec3 across = normalize(cross(along, view));
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
      world += across * aSpine.y * 0.5 * wid + along * aSpine.z * 0.5 * len;
      vMore.z = (uHeart.z * uHeart.w) / (len * wid);
      vMat.w = aSpine.y;
      vMat.y = aSpine.z;
      n = normalize(across * aSpine.y * 0.5 + view);
    }
    vWorld = world;
    vNormal = n;
    gl_Position = project(world);
    return;
  }

  vec3 world = local ? uFlowerOrigin + uFlowerBasis * p : p;
  vWorld = world;
  vNormal = local ? uFlowerBasis * n : n;
  gl_Position = project(world);
}
`;

export const PLANT_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vNormal;
in vec4 vMat;
in vec4 vMore;
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
/* the tepals' transmitted share, the cup's light, their sheen; the stems'
   wax */
uniform vec4 uBloomLight;
/* the stems' and the tube's translucency; the pollen's tone; where the
   inner series begins */
uniform vec3 uBloomMore;
uniform float uMirror;

/* The dome's light on a surface turned to \`n\`: brightest facing up, more
   toward the open lake than away from it, carried on below the level to
   the dark lake. */
float bloomSky(vec3 n) {
  vec2 level = n.xz / max(length(n.xz), 1e-4);
  float side = mix(uBloomDome.y, uBloomDome.z, dot(level, uLightSide) * 0.5 + 0.5);
  return n.y >= 0.0 ? mix(side, uBloomDome.x, n.y) : side * (1.0 + 0.8 * n.y);
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

  if (kind < ${K.tepal} + 0.5) {
    /* A TEPAL. Its face (toward the flower's heart) white, cream on the
       outer series; its back greener; the claw greener still. */
    float inner = smoothstep(uBloomMore.z - 0.18, uBloomMore.z + 0.06, share);
    vec3 face = mix(uSepal, uPetal, inner);
    /* The outermost's backs green-grey like the tube — what a bud shows of
       itself — paling inward to cream, then white. */
    vec3 back = mix(mix(uTubeTone * 1.12, uSepal * 0.93, smoothstep(0.0, uBloomMore.z, share)), uPetal * 0.96,
                    smoothstep(uBloomMore.z, uBloomMore.z + 0.3, share));
    vec3 albedo = facing ? face : back;
    albedo *= mix(vec3(0.82, 0.9, 0.74), vec3(1.0), smoothstep(0.0, 0.3, s));
    /* Deep in the cup the tepals and the filaments hide the sky from it;
       the outer series' backs from the tube and receptacle under them. */
    float cupped = mix(mix(0.72, uBloomLight.y, inner), 1.0, smoothstep(0.0, 0.72, s));
    float under = mix(0.6, 1.0, smoothstep(0.0, 0.4, s));
    float aoSeen = facing ? cupped : under;
    float aoBack = facing ? under : cupped;
    /* Thinnest at its margins and tip: more of the light behind comes
       through — the bright rim a backlit white petal has in every
       photograph of one. */
    float thin = 1.0 + 0.6 * smoothstep(0.55, 1.0, abs(across)) + 0.5 * smoothstep(0.65, 1.0, s);
    float through = uBloomLight.x * thin;
    color = albedo * (seen * aoSeen * (1.0 - 0.3 * uBloomLight.x) + through * behind * aoBack);
    /* Satin: the dome in its papillae, more toward grazing. */
    color += uBloomLight.z * (0.3 + graze * graze) * dome(reflect(-v, nv)) * aoSeen;
  } else if (kind < ${K.stem} + 0.5) {
    /* A STEM: fleshy and waxy. This season's paler and yellower; woody and
       browner where it leaves the root; the underside greyer. */
    vec3 albedo = mix(uLeaf, uLeaf * vec3(1.3, 1.32, 0.95), share);
    albedo = mix(albedo * vec3(0.82, 0.74, 0.6), albedo, smoothstep(0.02, 0.1, s));
    float side = vMore.y;
    if (side > 0.0) albedo *= 1.0 + 0.16 * exp(-across * across / 0.008);
    else albedo *= vec3(1.1, 1.08, 1.02);
    float ao = mix(0.7, 1.0, smoothstep(0.0, 0.12, s));
    /* The cuticle: a dielectric's reflectance (Fresnel, Schlick), rough
       enough that its mirror is the dome blurred — the gloss that shows a
       stem is round. */
    float c = max(dot(nv, v), 0.0);
    float f = uBloomLight.w + (1.0 - uBloomLight.w) * pow(1.0 - c, 5.0) * 0.55;
    f *= smoothstep(0.02, 0.12, s) * 0.6 + 0.4;
    color = albedo * (seen * ao + uBloomMore.x * behind) * (1.0 - f) + f * dome(reflect(-v, nv)) * ao;
  } else if (kind < ${K.tube} + 0.5) {
    /* THE TUBE, or the style (drawn in the flower's frame: share 1). */
    bool style = share > 0.5;
    vec3 albedo = uTubeTone * mix(vec3(0.9, 0.85, 0.78), vec3(1.0), smoothstep(0.0, 0.4, s));
    /* Its last part flares into the flower's throat: cream inside, where
       the cup holds it; under the reflexed crown outside. */
    albedo = mix(albedo, uSepal, smoothstep(0.86, 0.98, s));
    float ao = 1.0 - 0.3 * smoothstep(0.7, 0.88, s) * (1.0 - smoothstep(0.9, 1.0, s));
    float c = max(dot(nv, v), 0.0);
    float f = uBloomLight.w + (1.0 - uBloomLight.w) * pow(1.0 - c, 5.0) * 0.45;
    color = albedo * (seen * ao + uBloomMore.x * behind) * (1.0 - f) + f * dome(reflect(-v, nv)) * ao;
    if (style) color = uPetal * (seen * 0.8 + 0.35 * behind);
  } else if (kind < ${K.anther} + 0.5 && kind > ${K.anther} - 0.5) {
    /* AN ANTHER: a round cream grain. */
    float r = across * across + s * s;
    if (r > 1.0) discard;
    color = uAnther * (seen * 0.85 + 0.25 * behind);
    alpha = coverage;
  } else if (kind < 5.5) {
    /* A FILAMENT or a stigma lobe: a white thread, lit through. Deep in the
       throat the tepals hide the sky from it. */
    float ao = kind > ${K.anther} + 0.5 ? 1.0 : mix(0.5, 1.0, smoothstep(0.0, 0.8, s));
    color = uPetal * (0.62 * seen + 0.45 * behind) * ao;
    alpha = coverage;
  } else {
    /* POLLEN: a speck catching the fog's light. */
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = dot(q, q);
    if (r > 1.0) discard;
    color = uAnther * uBloomMore.y * (0.7 * bloomSky(v) + 0.3 * uBloomDome.x);
    alpha = coverage * (1.0 - smoothstep(0.5, 1.0, r));
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

/* the plant at uResolve.x samples a pixel each way */
uniform sampler2D uSource;
/* samples a pixel each way; the blur's reach (samples, 0 for none) and its
   width (samples); the contact shade on (1) or off */
uniform vec4 uResolve;
/* this picture's rect in the scene's target (px: corner), and the scene's
   size (px) */
uniform vec4 uRectPx;
/* the stems' spines, a point and its half-width each, stem after stem */
uniform vec4 uStemPoints[${CONTACT_POINTS}];
/* how many stems, points a stem */
uniform vec2 uStemLoops;
/* the flower, as a sphere that shades the top under it */
uniform vec4 uFlowerShade;
/* the root's crack: centre, radius */
uniform vec4 uRoot;
/* the stems' shade: reach (m) past their margins, depth */
uniform vec2 uContactShade;

/* A normal of the block's frame (stone/shaders/stone.ts toStone), in the
   world: through the map's transpose (the plan is not square). */
vec3 stoneNormal(vec3 n) {
  float h = STONE_HALF_SIDE;
  return normalize(vec3(h / uStonePlan.z * (n.x - n.z), n.y, h / uStonePlan.w * (n.x + n.z)));
}

/* How much of the sky a point on the stone keeps under the plant. */
float keepAt(vec3 p, vec3 n) {
  float keep = 1.0;
  /* The crack the root is in: humus, and the moss that holds it. */
  float dr = length(p - uRoot.xyz);
  keep *= 1.0 - 0.72 * (1.0 - smoothstep(0.3 * uRoot.w, uRoot.w, dr));
  /* The stems lying close over it. */
  int stems = int(uStemLoops.x);
  int points = int(uStemLoops.y);
  float reach2 = uContactShade.x * uContactShade.x;
  for (int j = 0; j < stems; j++) {
    for (int i = 0; i < points - 1; i++) {
      vec4 a = uStemPoints[j * points + i];
      vec4 b = uStemPoints[j * points + i + 1];
      vec3 ba = b.xyz - a.xyz;
      float h = clamp(dot(p - a.xyz, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
      vec3 q = p - a.xyz - ba * h;
      /* Only what stands over the surface shades it. */
      float over = smoothstep(-0.2, 0.4, dot(normalize(-q + vec3(0.0, 1e-5, 0.0)), n));
      float gap = max(length(q) - 0.6 * mix(a.w, b.w, h), 0.0);
      keep *= 1.0 - uContactShade.y * over * exp(-gap * gap / reach2);
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
  int k = int(uResolve.x + 0.5);
  ivec2 size = textureSize(uSource, 0);
  vec4 sum = vec4(0.0);
  float weight = 0.0;
  if (uResolve.y < 0.5) {
    /* Each pixel the mean of its own samples: a box, the pixel itself. */
    for (int j = 0; j < k; j++) {
      for (int i = 0; i < k; i++) sum += texelFetch(uSource, px * k + ivec2(i, j), 0);
    }
    weight = float(k * k);
  } else {
    /* The mirror: a Gaussian over its samples, the lake's unseen ripples. */
    int reach = int(uResolve.y + 0.5);
    vec2 c = (vec2(px) + 0.5) * float(k);
    ivec2 at = ivec2(floor(c));
    float inv = 0.5 / (uResolve.z * uResolve.z);
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
  float keep = 1.0;
  if (uResolve.w > 0.5) {
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
