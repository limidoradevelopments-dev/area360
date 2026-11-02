/**
 * ─── Promise · the letters' shaders ───
 *
 * Every letter a quad of the atlas (glyphAtlas.ts), all of them in one
 * instanced draw; EVERY LETTER'S PLACE WORKED OUT HERE, from the scroll
 * and the clock — the main thread sends a handful of numbers a frame and
 * nothing a letter (assembly.ts, motion.ts ASSEMBLY).
 *
 * A letter's life, by the scroll `t` past the moment it left its line:
 *
 *   ON ITS LINE (t ≤ 0): not drawn; the page's own letter shows.
 *   FALLING (`fall`): leaving at the page's own speed, carried on up a
 *   little, slowing, falling behind the page and coming down into its
 *   place in the cloud — nearer the eye as it goes (larger, out of
 *   focus), fluttering, turning, glinting.
 *   SETTLING (`settle`, ending at the letter's landing): from the cloud to
 *   its place on the mark, coming into focus, a reflected letter turning
 *   over as it comes.
 *   LANDED: on the mark; the sheen passes over it.
 *
 * Everything that moves with the clock is scaled by `air` — how far into
 * the air a letter is, 0 on its line and 0 landed — so a letter is exactly
 * the page's letter when it leaves and exactly its slot when it lands,
 * whatever the time.
 *
 * Coordinates are CSS px of the canvas (the screen, while the section's
 * air layer is pinned), y down.
 */

export const LETTERS_VERT = /* glsl */ `#version 300 es
precision highp float;

// Per letter.
layout(location = 0) in vec4 aRest;  // its centre on its line (section px), when it leaves, when it lands
layout(location = 1) in vec4 aSlot;  // its centre on the mark (mark px), its turn, its size (< 0: mirrored)
layout(location = 2) in vec4 aUv;    // its cell in the atlas
layout(location = 3) in vec4 aCell;  // the cell's size and the letter's centre in it, CSS px
layout(location = 4) in vec4 aAir;   // its place in the cloud (from its slot, px), nearness, which paragraph

uniform float uScroll;  // the section's scroll: px the screen's top is past the section's
uniform float uLayer;   // where the air layer's top is, section px
uniform float uTime;    // seconds
uniform vec2 uView;     // the canvas, CSS px
uniform vec2 uMark;     // the mark's top left when held, canvas px
uniform float uPin;     // the scroll at which the mark is held
uniform vec4 uHeld;     // a paragraph still making its entrance: its letters wait
uniform vec3 uSpan;     // the fall, the settle and the loosening, px of scroll
uniform float uScreen;  // the screen's height, px
uniform vec3 uSheen;    // where the sheen is (0 at the body, 1 at the wing's tip), its band, its lift
uniform vec2 uMarkHalf; // the mark's axis (mark px) and half its width
uniform float uCalm;    // reduced motion: letters fade off their lines and onto the mark

// The motion's constants (motion.ts ASSEMBLY), in a block of their own.
uniform vec4 uNear;     // grow, dim, -, -
uniform vec4 uSwing;    // swing least, swing most, tilt, rise
uniform vec4 uFlap;     // a swing every (screens), seconds least, seconds most, -
uniform vec4 uTurn;     // turn, tip, yaw, swoop
uniform vec3 uGlint;    // at, sharpness, strength

out vec2 vUv;
out float vFocus;   // 0 sharp, 1 at its softest
out float vLight;   // how much of white it is drawn with
out float vGlint;

const float TAU = 6.28318530718;
const float PHI = 1.61803398875;

// A letter's own numbers, fixed by its index: the same letter does the
// same thing every visit.
float hash(float n) {
  return fract(sin(n * 12.9898 + 78.233) * 43758.5453);
}

float smootherstep01(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

void main() {
  // The quad's corner from the vertex's index: two triangles.
  int corner = gl_VertexID % 6;
  vec2 q = vec2(
    (corner == 1 || corner == 2 || corner == 4) ? 1.0 : 0.0,
    (corner == 2 || corner == 4 || corner == 5) ? 1.0 : 0.0
  );

  float leave = aRest.z;
  float land = aRest.w;
  float t = uScroll - leave;
  int paragraph = int(aAir.w + 0.5);
  bool held = uHeld[paragraph] > 0.5;
  if (t <= 0.0 || held) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUv = vec2(0.0);
    vFocus = 0.0;
    vLight = 0.0;
    vGlint = 0.0;
    return;
  }

  float id = float(gl_InstanceID);
  float r1 = hash(id);
  float r2 = hash(id + 0.31);
  float r3 = hash(id + 0.67);
  float r4 = hash(id + 0.93);

  // How far through each part of its journey. FIRST IT LOOSENS: for
  // the loosening's scroll it rides on with the page where it stood, lifting
  // toward the eye — larger, softer, dimmer — so a line dissolves where it
  // is, into light, before anything of it falls. Then the fall, easing out
  // only: it leaves at the page's speed (below).
  float loosened = t - uSpan.z;
  float x = clamp(loosened / uSpan.x, 0.0, 1.0);
  float fall = x * (2.0 - x);
  float settleFrom = land - uSpan.y;
  float settle = smootherstep01((uScroll - settleFrom) / uSpan.y);
  float air = fall * (1.0 - settle);
  // ITS NEARNESS comes as it loosens, before it falls: soft and dim
  // first, so a falling letter never reads as type over the lines still
  // standing below it.
  float nearing = smoothstep(0.0, uSpan.z, t) * (1.0 - settle);

  // Where it is on its line now (riding with the page as it loosens; the
  // calm fade), and where it falls from: where the page had carried it
  // when it was loose.
  vec2 onLine = vec2(aRest.x, aRest.y - uLayer);
  vec2 left = vec2(aRest.x, aRest.y - leave - uSpan.z);

  // Its place on the mark: below the held place by what the page has
  // still to scroll before the mark is held there.
  vec2 slot = uMark + aSlot.xy + vec2(0.0, max(0.0, uPin - uScroll));
  // Its place in the cloud, in the air: fixed on the screen.
  vec2 cloud = uMark + aSlot.xy + aAir.xy;

  // FALLING. IT LEAVES AT THE PAGE'S SPEED: carried on up a little as the
  // page goes, slowing, falling behind it, then coming down into its place
  // in the cloud from above — so a line comes apart from the page, it is
  // not dropped by it. A cubic: its first handle straight above where it
  // left, by what makes its speed there the page's (the fall eases out
  // from twice its average pace: 3 x 2 x handle / span = 1); its second
  // above the cloud, so it falls into it.
  float f = fall;
  vec2 lift0 = left - vec2(0.0, uSpan.x / 6.0);
  vec2 lift1 = vec2(cloud.x, cloud.y - 0.3 * abs(cloud.y - left.y) - 0.05 * uScreen);
  vec2 falling = mix(
    mix(mix(left, lift0, f), mix(lift0, lift1, f), f),
    mix(mix(lift0, lift1, f), mix(lift1, cloud, f), f),
    f
  );

  // THE FLUTTER, on the scroll and the clock together: a swing side to
  // side, rising at its turns, tilted into them.
  float swing = mix(uSwing.x, uSwing.y, r1);
  float perPx = TAU / (uFlap.x * uScreen * mix(0.8, 1.25, r2));
  float perSecond = TAU / mix(uFlap.y, uFlap.z, r3);
  float phase = t * perPx + uTime * perSecond + r4 * TAU;
  vec2 flutter = vec2(swing * sin(phase), -swing * uSwing.w * cos(2.0 * phase));
  float tilt = -uSwing.z * sin(phase);
  // The slow wander of the cloud, never coming round the same (two sines
  // a golden ratio apart).
  float wanderPhase = uTime * perSecond * 0.37 + r2 * TAU;
  vec2 wander = vec2(sin(wanderPhase), sin(wanderPhase * PHI + r1 * TAU)) * vec2(14.0, 8.0);
  vec2 floating = (loosened > 0.0 ? falling : onLine) + (flutter + wander) * air;

  // SETTLING: from the cloud to the slot, on a slight curve off the
  // straight, one side or the other.
  vec2 way = slot - floating;
  vec2 across = vec2(-way.y, way.x);
  float side = r3 < 0.5 ? -1.0 : 1.0;
  vec2 position = mix(floating, slot, settle) + across * side * uTurn.w * sin(3.14159265 * settle) * (0.4 + 0.6 * r1);

  // ITS TURN in the plane: none on its line, its slot's landed, the
  // flake's tilt and a slow turn of its own in the air.
  float turn = uTurn.x * (r2 * 2.0 - 1.0) * sin(t * perPx * 0.21 + r1 * TAU);
  float angle = aSlot.z * settle + (tilt + turn) * air;

  // ITS FACE: tipped about the horizontal and the vertical in the air (a
  // flake turning to the light and away), and a reflected letter turned
  // over as it settles — edge-on at the middle of its settle.
  float tip = uTurn.y * sin(phase * 0.5 + r3 * TAU) * air;
  float yaw = uTurn.z * sin(phase * 0.5 * PHI + r4 * TAU) * air;
  bool mirrored = aSlot.w < 0.0;
  float over = mirrored ? 3.14159265 * settle : 0.0;
  vec2 face = vec2(cos(over + yaw), cos(tip));

  // ITS SIZE: the slot's landed; nearer in the air.
  float nearness = aAir.z;
  float grow = 1.0 + uNear.x * nearness * nearing;
  float size = mix(1.0, abs(aSlot.w), settle) * grow;

  // THE GLINT: its face meeting the light.
  float glint = pow(max(cos(tip + yaw * 0.5 - uGlint.x), 0.0), uGlint.y) * uGlint.z * air;

  if (uCalm > 0.5) {
    // Reduced motion: no flight. It fades off its line and onto its slot.
    position = settle > 0.0 ? slot : onLine;
    angle = settle > 0.0 ? aSlot.z : 0.0;
    size = settle > 0.0 ? abs(aSlot.w) : 1.0;
    face = vec2(settle > 0.0 && mirrored ? -1.0 : 1.0, 1.0);
    nearness = 0.0;
    glint = 0.0;
  }

  // The corner, about the letter's centre: flipped, sized, turned.
  vec2 local = (q * aCell.xy - aCell.zw) * face * size;
  float c = cos(angle);
  float s = sin(angle);
  vec2 world = position + vec2(c * local.x - s * local.y, s * local.x + c * local.y);

  gl_Position = vec4(world.x / uView.x * 2.0 - 1.0, 1.0 - world.y / uView.y * 2.0, 0.0, 1.0);
  vUv = mix(aUv.xy, aUv.zw, q);
  vFocus = nearness * nearing;

  // ITS LIGHT: the copy's 80%, spread as it comes nearer, and less of it
  // reaching the eye as it turns edge-on (a flake seen by its edge is a
  // sliver, not a line of light); on the mark, lifted as the sheen's band
  // passes over it (from the body outward).
  float light = 0.8 / (1.0 + uNear.y * nearness * nearing) * mix(0.3, 1.0, abs(face.x * face.y));
  if (uCalm > 0.5) light = 0.8 * (settle > 0.0 ? settle : 1.0 - fall);
  float outward = abs(aSlot.x - uMarkHalf.x) / uMarkHalf.y;
  float band = exp(-pow((outward - uSheen.x) / uSheen.y, 2.0));
  light += uSheen.z * band * settle * step(0.999, settle);
  vLight = light;
  vGlint = glint;
}
`;

export const LETTERS_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uAtlas;

in vec2 vUv;
in float vFocus;
in float vLight;
in float vGlint;

out vec4 outColor;

void main() {
  // Its level by its size on the screen (a landed letter is drawn from a
  // finer copy than the screen's), named, never left to texture().
  vec3 copies = textureGrad(uAtlas, vUv, dFdx(vUv), dFdy(vUv)).rgb;
  // Out of focus as a mix of the atlas's three copies: sharp to a little
  // soft over the first half, to its softest over the second.
  float a = vFocus < 0.5
    ? mix(copies.r, copies.g, vFocus * 2.0)
    : mix(copies.g, copies.b, vFocus * 2.0 - 1.0);
  // A glint: the letter toward white, and its soft copy round it as glow.
  float alpha = a * min(1.0, vLight + vGlint) + copies.b * vGlint * 0.35;
  outColor = vec4(vec3(alpha), alpha);
}
`;
