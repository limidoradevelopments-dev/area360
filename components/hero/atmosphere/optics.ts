/**
 * ─── Atmosphere · optics ───
 *
 * How the fog LOOKS: how much light it takes out of a view, where it glows
 * and where it goes grey. How it moves is in ./motion.ts; its two greys are
 * CSS tokens (hero.css).
 *
 * THE MODEL. Fog is a participating medium. Along any line of sight, what
 * arrives is the thing at the end of it, dimmed by the transmittance
 * T = e^(−τ), plus the fog's own glow (airlight) filling in (1 − T) — the
 * Koschmieder relation every photograph of fog obeys. τ, the optical depth,
 * is the integral of the extinction β along the line. Everything else here
 * says what β is, where.
 */

import { DEPTH } from "../stage/layers";

/**
 * EXTINCTION, per metre, as a bank: thin air near the shore the camera
 * stands on, a little thicker over the open lake. Real lake fog is this
 * shape: it forms over the water and lies against the shore, and what
 * stands on the near edge of it stands in clearer air.
 *
 * THE FOG IS LIFTING. The same spruce, at the same distance, stand dark at
 * the water and fade toward their tops: several times the fog aloft. That
 * is a lifting fog — the air nearest the water clearing first, the way a
 * lake's morning fog burns off. So β also grows with height, by `lift` ×
 * between `liftFrom` and `liftTo` metres, which keeps the stone in clearer
 * air.
 *
 * READ OFF THE PHOTOGRAPH. The shores are a photograph taken in this fog
 * (stage/layers.ts BACKDROP), so the fog in front of the stone and over the water
 * must be ITS fog, or the stage and the photograph would disagree about the
 * air. By Koschmieder (a dark conifer at depth z prints as A·(1 − e^(−τ))
 * over a sky of A): its near spruce, ~60 m out, are barely veiled at the
 * water (τ ≈ 0.1–0.2) and half gone at their tops; its far ones, ~130 m
 * out, are half veiled at the water. Hence the numbers: thin, thickening
 * a little over the open lake, and three times thicker aloft.
 *
 * ALMOST NONE IN FRONT OF THE STONE. The design prints its darks near
 * black (~28) and the stone's shaded face at ~35: in a brightly graded
 * frame even 1% of the fog's glow in front of them lifts a black to ~35,
 * so the near air is nearly clear.
 */
export const EXTINCTION = {
  /* β in the clear air near the shore: almost none, so the near darks stay
   * near-black. */
  near: 0.0004,
  /* β over the open lake, at the water. Visibility (3.912 / β) ≈ 830 m. */
  far: 0.0047,
  /* Where the thickening begins, and where it is full (smoothstep). */
  bankFrom: 12.5,
  bankTo: 40,
  /* The lift: β × (1 + lift) at `liftTo` metres up and above: the tree
   * tops fade into the fog while the banks stand clear. */
  lift: 2,
  liftFrom: 1,
  liftTo: 12,
} as const;

export interface Sheet {
  /** The sheet's near and far edge, metres: the depth planes around it. */
  readonly from: number;
  readonly to: number;
  /** Where its billows are drawn: one plane inside the sheet. */
  readonly plane: number;
  /** Size of a billow, metres. Near wisps are small; far banks are large. */
  readonly scale: number;
  /** Billow contrast, ±share of the sheet's density. */
  readonly detail: number;
  /** How much of the simulated air reaches this sheet (0–1). The hand is in
   *  front of the stone; the far banks feel it as a breath, not a stir. */
  readonly response: number;
  /** How strongly a billow's lit top outshines its underside. */
  readonly form: number;
  /** The simulated air is read this soft here, in cells: a far bank moves
   *  as a body, never in hand-sized pieces. */
  readonly blurCells: number;
  /** The sheet's own wisps: optical depth on top of the bank's, carried only
   *  where its billows are dense (see `sharpness`). */
  readonly veil: number;
  /** How the billows are shaped into density: 1 is soft banks; higher
   *  concentrates the fog into separate wisps with clear air between. */
  readonly sharpness: number;
}

/**
 * THE FOG SHEETS, near to far. Each fills the space between two planes of
 * the set; its billows are drawn in metres at its own depth, so a sheet's
 * features shrink and slow with distance exactly as a camera sees them.
 * Billow sizes grow with depth by less than the depth does (a far bank is
 * bigger in the world but smaller on screen): 1.3 m at 5.5 m out, 17 m at
 * 90 m.
 *
 * THE NEAR AIR IS WISPS, NOT HAZE. The fit wants the air in front of the
 * stone almost clear (the design's darks there print near-black), but
 * clear air gives a hand nothing to move. A lake morning has both: clear
 * air with thin, separate wisps drifting through it at eye level. So sheet
 * 0 is sharpened into wisps with a veil of their own — mostly clear, now
 * and then a faint strand crossing the stone — and those are what the hand
 * stirs and tears. Faint by need: a thicker veil greys the near darks (see
 * EXTINCTION). The bank behind the stone answers the hand fully: a pass
 * opens a lane in it.
 */
export const SHEETS: readonly Sheet[] = [
  { from: 0, to: DEPTH.subject, plane: 5.5, scale: 1.1, detail: 1, response: 1, form: 0.35, blurCells: 0, veil: 0.012, sharpness: 4 },
  { from: DEPTH.subject, to: DEPTH.nearShore, plane: 21, scale: 4, detail: 0.65, response: 1, form: 0.35, blurCells: 2, veil: 0, sharpness: 1 },
  { from: DEPTH.nearShore, to: DEPTH.farShore, plane: 46, scale: 8.5, detail: 0.55, response: 0.45, form: 0.25, blurCells: 6, veil: 0, sharpness: 1 },
  { from: DEPTH.farShore, to: DEPTH.horizon, plane: 90, scale: 17, detail: 0.45, response: 0.25, form: 0, blurCells: 10, veil: 0, sharpness: 1 },
] as const;

/**
 * LIGHT, from above the frame and a little right — where the brightest air
 * is in the reference. The fog is marched toward it to find how much light
 * reaches each point through the fog above: the fall from bright sky to the
 * greyer air over the water is the depth of fog in the way, not a gradient
 * painted on.
 */
export const LIGHT = {
  /* In frame uv of the camera at rest, y up: above the top edge. */
  position: [0.56, 1.35] as const,
  /* Extinction per frame height of simulated fog, along the march. */
  extinction: 1.1,
  /* Sky light reaching the fog from every side, however deep. */
  ambient: 0.45,
} as const;

/**
 * THE FOG OVER THE PHOTOGRAPH. The backdrop was photographed in fog, so it
 * already holds the fog's average; the stage lays over it only each sheet's
 * DEPARTURE from that average, at every pixel's own depth (stage/shaders/
 * scene.ts). So each sheet's average density must be known — `mean`,
 * measured off the running volume pass (the dev handle's probe(), averaged
 * over a minute of drift); a wrong mean reads as the whole forest hazed or
 * cleared at once — and how much of its departure is let show (`life`):
 * all of the near wisps and the bank the hand opens, less of the far
 * banks, whose departures over a hundred metres of fog would otherwise
 * swallow the forest whole or strip it bare. Each sheet's departure is
 * weighed by the average fog in front of it: fog moving behind other fog
 * changes little, as in the real thing. And a tree can come forward only
 * as far as the fog in front of it allows: you cannot clear more fog than
 * there is.
 */
export const OVER_PHOTO = {
  /* Measured: each sheet's density over two minutes of drift, region by
   * region (probe()). */
  mean: [0.64, 0.96, 0.93, 0.9] as const,
  /* The near wisps barely: they are sharp by design (strands for the hand
   * to tear in front of the stone), and over a photograph a sharp edge of fog
   * reads as a cut-out. The soft banks behind carry the movement. */
  life: [0.25, 1, 0.8, 0.6] as const,
  /* Overall: 1 = each sheet's departure at full strength. Under 1: a
   * thinning now reveals as much as a thickening hides (stage/shaders/
   * scene.ts throughFog), so the same drift shows twice the movement it
   * did when only the thickening showed. */
  amount: 0.65,
  /* The most any patch may thicken or thin, as optical depth (a soft
   * limit): past it a bank swallows trees whole, or a gap goes black. */
  reach: 0.7,
} as const;

/**
 * AERIAL DEPTH: a little more fog with distance than the photograph holds,
 * still, at every pixel's own depth — the far banks a touch further into the
 * air, the near ones a touch out of it — so the forest reads as layers of
 * distance, as a long lens in fog draws it, rather than one grey plane. The
 * same law as the fog's movement (scene.ts throughFog), as optical depth:
 * `perMetre` either side of `pivot`, the forest's median depth (measured off
 * the depth map: half its trees stand nearer than 108 m), so the forest as
 * a whole stays the design's and only its depth opens. Softly limited to
 * `most`: the treetops' edges meet the sky's depth in the depth map, and a
 * larger step there draws a pale rim round every crown. `nearer` scales
 * the side nearer than the pivot: the near banks are already the frame's
 * darkest, and drawn further out of the air against the bright fog (the
 * steepest part of the print) even 0.05 of optical depth put them 12
 * levels under the design, a heavy block; the depth reads from the far side
 * pushed back. SMALL by intent, measured at 1200×700 with the fog still:
 * the far left banks +4–5 levels, the near right bank −4, the crowns within
 * 2 of the design. Double it and the far shore washes out of the design's
 * composition.
 */
export const AERIAL = {
  pivot: 108,
  perMetre: 0.001,
  nearer: 0.2,
  most: 0.15,
} as const;

/**
 * SOFT BLACKS. Nothing sixty metres into fog is black: the air in front of
 * the nearest bank still glows. The photograph's near right bank (67–80 m,
 * measured off the depth map) printed close to it, a pitch-black wall pasted
 * over the lighter trees behind — cut-outs stacked in a row. So the fog in
 * front of each tree is thickened in proportion to how dark the tree prints
 * against the air, squared: the blacks lift into the air, the mid-greys
 * barely move, the fog not at all (scene.ts throughFog). `amount` is optical
 * depth at a black, full nearer than `from` metres and gone by `to`: the far
 * banks (115–160 m) already carry their own air in the photograph, and lifted
 * with the near one they went grey with it. TINY BY NEED: it lifts the black
 * in linear light, before the print's steep toe — 0.035 raised the right
 * bank 11 levels, 0.18 raised it 54 and the whole forest went flat grey.
 * Measured at 1200×700, the fog still.
 */
export const SOFT_BLACK = { amount: 0.035, from: 85, to: 125 } as const;


/**
 * THE MIST, SEEN MOVING. Real lake mist on an overcast afternoon drifts
 * slowly in soft banks, under a flat light: a denser patch reads a little
 * greyer against the open fog (it shades itself; there is no sun to light
 * its top), and a little lighter over anything dark behind it (more mist,
 * less of the dark). Over the photograph the fog was drawn only as a
 * departure in DEPTH, and depth over fog changes nothing — so over the open
 * sky and the lake opening, most of the frame, the mist never moved. So the
 * near bank (SHEETS[1], 21 m: in front of every shore, behind the stone)
 * shows its density's departure from its mean (scene.ts mistSeen): `veil`,
 * toward the mist's light, over what is darker than the fog; `grey`, its
 * self-shading, over the open fog. Both from the density alone, which is
 * smooth everywhere — NOT from its lit tops: a lit top is a gradient, and
 * laid flat by the stratified air it drew hard horizontal bands, a second
 * fog ending at the left bank. Over the water it fades in between
 * `water[0]` and `water[1]` metres out, never switched: switched at 21 m it
 * drew a line across the lake that never moved. Zero-mean: the frame keeps
 * its average, only the mist moves in it. It rides the simulated air, so the
 * hand moves it everywhere. SMALL: never past the reference's afternoon.
 */
export const MIST_SEEN = {
  veil: 0.035,
  grey: 0.15,
  water: [14, 40] as const,
} as const;

/** The fog sheets as a volume pass. */
export const VOLUME = {
  /* Thick billows darken themselves (e^(−k·(ρ − 1))): the grey cores. */
  selfShadow: 0.25,
  /* Evolution per second: banks re-form in place, very slowly. */
  evolve: 0.02,
  /* Rendered at this share of CSS resolution: fog has no detail finer than
   * two pixels, and this is the expensive pass. */
  scale: 0.5,
  maxWidth: 1024,
} as const;
