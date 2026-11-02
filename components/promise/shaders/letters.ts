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
 *   THE BLOOM (aBloom, as the page goes on to the works): from the moth's
 *   body outward, each letter lets go — the whole moth opening as one
 *   widening shell, as a firework's stars do (some toward the eye, larger
 *   and soft; some away, smaller), stopped almost at once by the air; then
 *   hanging, swaying, drifting down at a steady pace like an ember or a
 *   dandelion's seed, its light burning out with a last uneven flicker,
 *   and gone before it reaches the next section. While the page moves,
 *   each is smeared along its own way, as a shutter smears a moving
 *   light. Gone, it is not drawn.
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
layout(location = 5) in vec4 aBloom; // when it lets go (px of scroll), how far it opens (px, x and y), its depth (-1 away, 1 toward)

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
uniform float uSpeed;   // the scroll's speed, px a second, smoothed: a falling letter's streak

// The motion's constants (motion.ts ASSEMBLY), in a block of their own.
uniform vec4 uNear;     // grow, dim, -, -
uniform vec4 uSwing;    // swing least, swing most, tilt, rise
uniform vec4 uFlap;     // a swing every (screens), seconds least, seconds most, -
uniform vec4 uTurn;     // turn, tip, yaw, swoop
uniform vec3 uGlint;    // at, sharpness, strength
uniform vec4 uOpen;     // the opening's and the drift's settling (px of scroll), its drift (px a px of scroll), its life (px of scroll)
uniform vec4 uEmber;    // its light's half-life (px of scroll), the catch of light at letting go, the shutter (s), the fade at the layer's foot (px)
uniform float uPinEnd;  // the scroll at which the mark is let go to move on with the page

out vec2 vUv;
out vec4 vCell;     // its cell in the atlas: a smeared read stays inside it
out vec2 vSmear;    // its streak, in the atlas's uv
out float vStreak;  // its streak's length on the screen, px
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

// THE BLOOM'S PATH on the screen, from where it let go, since px of
// scroll on: the opening (aBloom.yz) settling as the air stops it, the
// drift down reaching its pace, and the sway that grows as it sinks.
vec2 bloomAt(float since, float sinkPace, float swayPhase, float swing) {
  float open = 1.0 - exp(-since / uOpen.x);
  float settled = 1.0 - exp(-since / uOpen.y);
  float drift = since - uOpen.y * settled;
  return aBloom.yz * open + vec2(swing * 0.8 * sin(swayPhase) * settled, sinkPace * drift);
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
  float since = uScroll - aBloom.x;
  if (t <= 0.0 || held || since >= uOpen.w) {
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

  // THE BLOOM. A firework's stars leave their shell together and keep
  // its shape a moment, opening; the air stops them within a second, and
  // they droop and drift down at a steady pace (linear drag: a speed that
  // dies away exponentially, a fall that reaches its terminal pace), as an
  // ember does, or a dandelion's seed under its pappus. So: its opening
  // the shell's (aBloom.yz, out from the body), settled by uOpen.x; its
  // drift down reaching uOpen.z a px of scroll over uOpen.y, each its own
  // 0.7-1.3 of it; a gentle sway as it sinks (on the scroll and the clock:
  // a still page keeps it drifting); a little turn. Worked out on the
  // screen, from where its place was when it let go, and carried into the
  // air layer, which has gone on up with the page since the mark was let
  // go.
  float landed = step(0.999, settle);
  float catching = exp(-pow(since / (0.18 * uOpen.x), 2.0)) * uEmber.y * landed;
  float streak = 0.0;
  vec2 streakWay = vec2(0.0, 1.0);
  float fading = 1.0;
  float depthBlur = 0.0;
  if (since > 0.0) {
    if (uCalm > 0.5) {
      fading = 1.0 - smoothstep(0.0, 0.4 * uOpen.w, since);
    } else {
      vec2 origin = uMark + aSlot.xy - vec2(0.0, max(0.0, aBloom.x - uPinEnd));
      float sinkPace = uOpen.z * (0.7 + 0.6 * r3);
      float swayPhase = since * perPx * 0.6 + uTime * perSecond * 0.5 + r2 * TAU;
      vec2 here = origin + bloomAt(since, sinkPace, swayPhase, swing);
      // Its way and speed on the screen, for the shutter: the path a px of
      // scroll further on, times the scroll's speed.
      vec2 ahead = origin + bloomAt(since + 1.0, sinkPace, swayPhase + perPx * 0.6, swing);
      vec2 velocity = (ahead - here) * uSpeed;
      float speed = length(velocity);
      float height = max(aCell.y * size * 0.45, 1.0);
      streak = min(speed * uEmber.z, height * 8.0);
      if (speed > 1e-3) streakWay = velocity / speed;
      position = here + vec2(0.0, max(0.0, uScroll - uPinEnd));
      float open = 1.0 - exp(-since / uOpen.x);
      angle += (r1 - 0.5) * 1.4 * open + 0.25 * sin(swayPhase) * open;
      // ITS DEPTH: the shell opening in three dimensions, some letters
      // toward the eye (larger, soft, their light spread), some away
      // (smaller, soft, dimmer with the distance).
      float depth = aBloom.w * open;
      size *= 1.0 + 0.5 * depth;
      depthBlur = abs(depth) * 0.85;
      // ITS LIGHT BURNS OUT: halving every half-life; as it dies, an
      // uneven flicker (two sines a golden ratio apart, never a pulse);
      // and gone where the air layer ends: the next section's edge.
      float burning = exp2(-since / uEmber.x);
      float flicker = 1.0 - (1.0 - burning) * 0.35 * (0.5 + 0.5 * sin(uTime * 9.0 + r4 * TAU) * sin(uTime * 9.0 * PHI + r1 * TAU));
      float edge = 1.0 - smoothstep(uView.y - uEmber.w, uView.y, position.y);
      float end = 1.0 - smoothstep(0.8 * uOpen.w, uOpen.w, since);
      fading = burning * flicker * edge * end / (1.0 + 0.45 * max(depth, 0.0)) * (1.0 - 0.4 * max(-depth, 0.0));
    }
  }

  // The streak in the letter's own drawing: its way on the screen turned
  // back by its turn, undone of its size and face; its quad grown by half
  // the streak each way, so the smear has room (reads outside the cell are
  // dropped in the fragment stage).
  float c = cos(angle);
  float s = sin(angle);
  vec2 sized = face * size;
  vec2 wayInLetter = vec2(c * streakWay.x + s * streakWay.y, -s * streakWay.x + c * streakWay.y);
  vec2 smear = wayInLetter * streak / (sign(sized) * max(abs(sized), vec2(0.2)));
  vec2 inCell = q * aCell.xy + (q * 2.0 - 1.0) * abs(smear) * 0.5;

  // The corner, about the letter's centre: flipped, sized, turned.
  vec2 local = (inCell - aCell.zw) * sized;
  vec2 world = position + vec2(c * local.x - s * local.y, s * local.x + c * local.y);

  gl_Position = vec4(world.x / uView.x * 2.0 - 1.0, 1.0 - world.y / uView.y * 2.0, 0.0, 1.0);
  vec2 uvPerPx = (aUv.zw - aUv.xy) / aCell.xy;
  vUv = aUv.xy + inCell * uvPerPx;
  vCell = aUv;
  vSmear = smear * uvPerPx;
  vStreak = streak;
  // Out of focus as it recedes; and a little soft while it streaks, so the
  // exposure's samples run together.
  vFocus = max(max(nearness * nearing, depthBlur), streak > 1.0 ? 0.5 : 0.0);

  // ITS LIGHT: the copy's 80%, spread as it comes nearer, and less of it
  // reaching the eye as it turns edge-on (a flake seen by its edge is a
  // sliver, not a line of light); on the mark, lifted as the sheen's band
  // passes over it (from the body outward).
  float light = 0.8 / (1.0 + uNear.y * nearness * nearing) * mix(0.3, 1.0, abs(face.x * face.y));
  if (uCalm > 0.5) light = 0.8 * (settle > 0.0 ? settle : 1.0 - fall);
  float outward = abs(aSlot.x - uMarkHalf.x) / uMarkHalf.y;
  float band = exp(-pow((outward - uSheen.x) / uSheen.y, 2.0));
  light += uSheen.z * band * landed;
  // Blooming, going out (its light spread along its streak by the smear);
  // and the light it catches as it lets go.
  light *= fading;
  vLight = light + catching;
  vGlint = glint + catching * 0.6 * fading;
}
`;

export const LETTERS_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uAtlas;

in vec2 vUv;
in vec4 vCell;
in vec2 vSmear;
in float vStreak;
in float vFocus;
in float vLight;
in float vGlint;

out vec4 outColor;

// SMEAR SAMPLES: a streak read every 2 screen px along it (nine fixed
// samples left a 60px streak a ladder of copies), at most 32; only a
// falling letter while the page moves is ever smeared, and a letter that
// is not reads once.
const int SMEAR_MOST = 32;

// The atlas at a point, nothing outside the letter's own cell (its
// neighbours there).
vec3 readCell(vec2 uv, vec2 dx, vec2 dy) {
  vec2 inside = step(vCell.xy, uv) * step(uv, vCell.zw);
  return textureGrad(uAtlas, uv, dx, dy).rgb * inside.x * inside.y;
}

void main() {
  // Its level by its size on the screen (a landed letter is drawn from a
  // finer copy than the screen's), named, never left to texture().
  vec2 dx = dFdx(vUv);
  vec2 dy = dFdy(vUv);
  vec3 copies;
  if (vStreak < 1.0) {
    copies = readCell(vUv, dx, dy);
  } else {
    // THE EXPOSURE: the letter averaged along its streak.
    int count = int(clamp(ceil(vStreak / 2.0), 2.0, float(SMEAR_MOST)));
    copies = vec3(0.0);
    for (int k = 0; k < SMEAR_MOST; k += 1) {
      if (k >= count) break;
      float along = float(k) / float(count - 1) - 0.5;
      copies += readCell(vUv + vSmear * along, dx, dy);
    }
    copies /= float(count);
  }
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
