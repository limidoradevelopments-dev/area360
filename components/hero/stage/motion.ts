/**
 * ─── Stage · motion ───
 *
 * The camera's motion, with the reason for each number. The fog's motion is
 * in atmosphere/motion.ts; the weather's in weather/motion.ts.
 */

import { STONE } from "../stone/optics";

/**
 * THE PARALLAX: the visitor leans, the camera leans with them.
 *
 * The camera ORBITS A POINT IN THE LAKE BEYOND THE STONE (`orbit`): it
 * moves toward the pointer's side and turns, a little, toward that point —
 * what a head does when it leans while looking out over a scene. Everything
 * nearer than the point slides against the lean, the nearer the more (the
 * near fog and water most, then the stone and its flowers), and everything
 * beyond it slides with the lean (the shores, the sky): the stone moves in
 * the space, against the shores moving the other way. Until 2026-10-20 the
 * point was the stone itself, so it held perfectly still while the world
 * slid behind it — the user: "too flat", a cut-out over a moving picture.
 *
 * DEEP ENOUGH TO READ AS DEPTH (2026-10-20, the user: "it reads as an
 * image or a video"). At the first lean of 5 cm the shores moved ~8 px on a
 * 1440×810 frame — 0.55% of it, under what the eye takes for depth in soft,
 * low-contrast fog: it read as drift. Now 12 cm, about the point beyond the
 * stone: every depth moves its own way and its own distance, the stone
 * against the shores. NO DEEPER FOR THE PHOTOGRAPH: the shores are one
 * photograph warped by its depth (shaders/backdrop.ts), so where trees
 * stand against the sky their edges smear by the difference of the two
 * shifts — ~2 px at 5 cm, ~5 at 12 cm, ~6 at 15, softened by the fog
 * (`plateMost`). And a little up and down (it was 0.02 until 2026-10-17,
 * when the user stilled the horizon; on 2026-10-20 they asked for "a
 * little"): the horizon moves ~2 px, the stone ~4. The frame's edges keep
 * the turn's reach clear of the photograph's (camera.ts CAMERA.edge.lean).
 */
export const PARALLAX = {
  /* The lean at the frame's edge, metres: sideways, and up/down. 12 cm
   * the user's choice for the whole scene ("a subtle feel is enough"); the
   * up and down 3 cm. At 1440×810 the stone moves ~14 px and the shores
   * ~6 px the other way (the sky ~10), the near water ~30 px. */
  sway: [0.15, 0.12] as const,
  /* Metres down the lens's axis to the point the camera turns about: past
   * the stone (10 m), short of the shores (40–80 m). Nearer the stone it
   * pins the stone again; further, the shores stop answering. */
  orbit: 25,
  /* THE MOST LEAN THE PHOTOGRAPH TAKES, metres, sideways and up/down. The
   * shores are one photograph warped by its depth, and a camera that moves
   * further tears it where trees stand against the sky (at 15 cm the sky
   * between the branches stretched into streaks). Everything else is truly
   * built — the stone, the flowers, the water, the fog — so past this the
   * camera goes on moving for them while the photograph's eye stays here
   * (camera.ts `plateShift`): a forest 60 m off moving a few pixels less
   * than it should is not something an eye can tell. With the lean at 12
   * cm the two are the same; the tuner's lean can go further without
   * tearing (the frame's edges keep 0.014 tan of the photograph for the
   * turn, enough to ~35 cm: camera.ts CAMERA.edge.lean). */
  plateMost: [0.12, 0.06] as const,
  /* +1: the camera leans toward the pointer. −1 inverts it. */
  lean: 1,
  /* The spring, rad/s. Critically damped: it arrives and stops, no
   * overshoot. At 3.5 the camera settles in ~1.3 s — the weight of a head,
   * not the snap of a UI (at 4.5, with the deeper lean, it slid). A tween
   * cannot do this: the target moves mid-flight with every pointer event,
   * and a curve interrupted halfway restarts its easing; a spring just
   * keeps the velocity it has. */
  frequency: 6.0,
  damping: 1,
  /* A LITTLE SMOOTHER, TOWARD THE USER'S OWN (2026-10-29: "make the old
   * spring a bit smooth, but not fully like my reference"). Their camera
   * damps straight toward the pointer (three.js MathUtils.damp at smoothK
   * 5, which is ui/easing.ts approach): it moves the instant the hand does
   * and glides in. The spring starts gently, as a weight does, and the
   * first tenth of a second of every lean is spent getting going. So the
   * lean is `mix` of their damp (`rate`, e-foldings a second) and the rest
   * the spring: from rest, measured at 60 fps, 22% of the way at 0.1 s
   * (the spring 13%, theirs 39%), 45% at 0.2 s (35%, 63%), 96% at 0.8 s
   * (95%, 98%) — off the mark sooner, still settling as the spring does.
   * At 1 it is theirs; at 0 the spring of before (`?tune`). */
  follow: { rate: 5, mix: 0.4 },
  /* Fixed step, drained from wall time (the house rule for springs), and
   * the longest frame honoured before the rest is dropped. THE FRAME IS
   * DRAWN BETWEEN THE LAST TWO STEPS (camera.ts update): drawn at the last
   * whole step, a frame of 4 steps followed by one of 3 or 5 (a frame's
   * time is never a whole number of them) jerked the lean. */
  step: 1 / 120,
  maxFrame: 0.1,
  /* Below this (metres, m/s) the camera is at rest and costs nothing. */
  restEpsilon: 1e-5,
} as const;

/**
 * THE SCENE'S CLOCKS KEEP REAL TIME. The springs and the simulated air take
 * at most PARALLAX.maxFrame of a frame: a longer step throws them. What is
 * only a function of time — the waves, the mist's drift, the rain's fall,
 * the grain — takes the frame's real length, up to `maxFrame` (s): held to
 * 0.1 s a frame too, it ran in slow motion on a device below 10 fps (half
 * speed at 5). At 10 fps and faster nothing changes. Past `maxFrame` (a
 * device waking from sleep with the page shown) the time is dropped.
 */
export const CLOCKS = {
  maxFrame: 1,
} as const;

/**
 * THE ARRIVAL (2026-10-20, the user: the scene should not start at rest;
 * "a bit of a top view, then gently down to our angle"). The scene comes
 * up out of black with the camera settling into place: from `back` m
 * further from the stone and `up` m higher, eased to rest over `seconds` —
 * a crane coming down as it pushes in. The stone grows faster than the
 * shores as it comes (it is ten metres off, they sixty): ~10% on the
 * screen against ~2%, the depth the eye reads first; the horizon settles
 * ~45 px at 810; and from a little higher a little more of the top and the
 * flowers on it shows. (At 0.6 m and 18 cm — ~6% and ~30 px — nobody saw
 * the camera move.) Turned all the way, as the lean is, so the stone stays
 * where it stands in the frame.
 * NOT A TRUE TOP VIEW: the shores are one photograph with a fixed horizon.
 * A metre up would be needed to look down on the stone's top; at 28 cm,
 * moving fastest while the frame is darkest (an ease-out, `power`), the
 * smear where trees stand against the sky is hidden by the motion and the
 * fade (hero/motion.ts ENTRANCE).
 * A tween, not a spring: it has one fixed job, to arrive.
 */
export const ARRIVAL = {
  back: 1.0,
  up: 0.28,
  seconds: 3,
  power: 3,
  /* THE OPENING SHOT (2026-10-20, the user: "like a real cinematic shot —
   * zoom on the stone first, then gently zoom out while the camera moves").
   * It opens on a lens `from` × the resting one, tilted down so the
   * flowers on the stone's top (`frameOn`) stand `frame` of the height
   * from the top — the stone and the flowers fill the shot — and widens
   * to the resting lens over `seconds`, in and out: held while the frame
   * is still coming up out of black, through the middle as the lake and
   * the shores open round the stone, landing without a jolt, after the
   * crane has nearly settled. Zoom and tilt are pure turns of the view:
   * the photograph takes them without tearing (only the camera's travel
   * tears it). On a 4K screen the photograph is drawn ~1.6× larger than
   * its own texels in the first second: soft, in fog, moving, half lit.
   * THE STONE LOW IN THE SHOT: tilted down, the frame shows more of the
   * lake, the costliest thing in it to draw — at `frame` 0.6 the water
   * filled ~65% of the frame against ~41% at rest, +1.7 ms of the lake's
   * pass at 1440 for the shot's first seconds; at 0.66, less tilt, less
   * water, the stone and its flowers still filling the lower half. */
  zoom: { from: 1.6, seconds: 4.2, frame: 0.66 },
  frameOn: [STONE.center[0] - 0.05, STONE.top + 0.05, STONE.center[1] - 0.1] as const,
} as const;

/**
 * THE DESCENT (2026-10-30, the user: scrolling on from the hero, "the
 * camera moves down on the y axis while the hero fades and the page
 * scrolls to the next section"; 2026-10-31: "a stone-focused camera angle
 * … not 100% smooth"). The scene stays where it is while the page scrolls
 * over it (hero.css: the frame is pinned), and the scroll's way through
 * the hero's height (0–1, StageCanvas) takes the camera down:
 *
 *   A CRANE DOWN, THE STONE HELD (camera.ts pose). The camera sinks
 *   `down` metres toward the water and turns, as it goes, so the flowers
 *   on the stone's top (ARRIVAL.frameOn) stay exactly where they stood in
 *   the frame: the stone is the still point, and the world settles round
 *   it — the far shore sinks toward the stone's top, the stone rises
 *   against it, the lake between them closes up. At 0.5 m the camera ends
 *   ~0.14 m over the flowers, looking across the water at the stone. And
 *   the lens closes on it by `push` (6%), about the flowers, the stone
 *   held still across too: the visit's last look is the stone.
 *
 *   Measured at 1440×810: the flowers held to 0.01 px the whole way; the
 *   far shore's waterline comes down ~81 px, settling just over them, the
 *   horizon 96 px; the stone's foot 9 px lower as the lens closes.
 *
 *   IT REPLACED A TILT DOWN (9°, the night before): the world rose
 *   through the frame, the stone with it — nothing held — and the frame
 *   filled with lake, the costliest thing to draw: the GPU's frame ~25%
 *   dearer on the way down (8.7 → 10.7–11 ms at 1440, the AMD integrated
 *   GPU), enough to tip a device near its rung's edge into missed frames —
 *   a shake, the user's "vibration". Held on the stone, the lake shrinks
 *   as the shore comes down: the way down costs less than rest (8.6 →
 *   8.3 → 8.0 ms).
 *
 *   IN STEP WITH THE SCROLL, DONE AS THE LIGHT GOES: linear in the scroll
 *   (a curve would make the scene's speed wander against the page's),
 *   the whole way down by hero/motion.ts DESCENT_FADE.to, where the scene
 *   is gone — eased so that most of it came after the scene was half dark,
 *   it barely read. The follow below is the ease: it gathers from rest.
 *
 *   FOLLOWED, NOT STEPPED (`follow`, e-foldings a second; camera.ts
 *   update, ui/easing.ts approach, exact at any frame length). The scroll
 *   arrives as events, a frame late or early against the engine's own
 *   frames (a wheel through Lenis, a 120 Hz screen drawn every other
 *   frame), and a camera set straight from them moved in uneven steps —
 *   the other half of the shake. Followed on the engine's clock it glides,
 *   ~0.14 s behind the scroll: the weight of a camera on a crane, too
 *   short to read as lag. Back from the dark (the engine parked) it starts
 *   where the scroll is, never gliding there in sight.
 *
 *   THE PHOTOGRAPH'S EYE STAYS (camera.ts `plateShift`, as for the lean
 *   past what it takes): travel tears it where trees stand against the
 *   sky, and shores 40–80 m off moving a few pixels less than they should
 *   is not something an eye can tell; the stone, the water and the fog
 *   are built and move truly. The turn and the lens take the photograph
 *   without tearing.
 *
 * A function of the scroll, not a tween: the scroll is the clock, and a
 * restored scroll position is simply the camera there.
 */
export const DESCENT = {
  down: 0.5,
  push: 0.06,
  follow: 7,
} as const;
