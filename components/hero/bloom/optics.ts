/**
 * ─── Bloom · optics ───
 *
 * TWO CUT CHAMOMILES LYING ON THE STONE, THEIR STEMS TIED WITH A STRIP OF
 * CLOTH (2026-10-20, the user's two references: assets/sources/flowers/
 * chamomile.webp, the flower; and tied.png, their frame of two cut daisies
 * laid across a stone's top, heads to its left, stems running right past it, a white
 * cloth knotted round them and hanging down its right face). Placed as that
 * frame places them, each as a share of the stone's width on the screen:
 * the nearer head at 0.26, at the top's front-left edge; the other at 0.40,
 * on its side; the knot at 0.72; the cloth's long tail over the front-right
 * edge at 0.79 and down the face; the short one lying on the top toward the
 * front; the stems past the stone's right side, one of them with a cut
 * side shoot. It replaced a kadupul (2026-10-04 to 10-20), first rooted and
 * opening on the visit's clock, then cut and laid on its side.
 *
 * CHAMOMILE AS IT GROWS (Matricaria chamomilla; floras: 14–26 white rays
 * with three-toothed tips, bending back as the head ages; a hollow yellow
 * receptacle, domed and then conical, of 250–570 tiny five-lobed florets;
 * a small cup of green bracts in two or three rows, their margins pale and
 * papery). LARGER THAN LIFE: a real head is ~2 cm across, which at the
 * stone's distance is four pixels; here ~10 cm, the reference's heads to
 * its stone (a twelfth of its width), the size of a large marguerite. The
 * stems the reference's too: as thick to the stone as its are (~5 mm), and
 * long enough to run past it (~70–80 cm, a long-stemmed daisy).
 *
 * MODELLED, NOT CUT OUT. Every part is a surface swept along a curve
 * (shape.ts): the rays strap-shaped, channelled, a little twisted, their
 * tips toothed; the disc a dome of revolution; the bracts small cupped
 * scales; the stems round and ribbed; the cloth a thin band, wound round
 * the stems, knotted, its tails laid over the stone.
 *
 * Placed in world metres, on the stone's frame (stone/optics.ts STONE). The
 * stone is a diamond prism stretched down the lens's axis to play a cube: a
 * point's DEPTH barely moves it on screen, so everything is placed by x and
 * its depth chosen to keep it on the top: along the line between the top's
 * left and right corners, square to the lens, where a stem's length on the
 * screen costs the least. The top is seen almost edge-on (the eye is 0.7 m
 * above it, 10 m away): what reads is what stands up from it — the heads,
 * on their sides — what hangs off it, and what runs past its edges.
 */

type Vec3 = readonly [number, number, number];
type Plan = readonly [number, number];

export interface HeadDesign {
  /** Where its disc's base is, on the top (x, z; m): its height is found by
   *  laying it there, on its lowest rays (BLOOM.lie). */
  readonly center: Plan;
  /** The way its face looks. */
  readonly facing: Vec3;
  /** Its size against the design's (BLOOM.head). */
  readonly size: number;
  /** Its stem, from the head: the points it lies through on the top (x, z;
   *  m), past the knot, to its cut — the last past the stone's edge, held
   *  out over the air (a thin stem droops a little, `droop` m at its cut). */
  readonly stem: readonly Plan[];
  readonly droop: number;
}

export interface ClothTail {
  /** Its spine (m, world), from the knot outward: a smooth curve through
   *  them, then laid onto the stone where it rests. */
  readonly points: readonly Vec3[];
  /** Which way its flat side faces, at the knot and at its end: it turns
   *  between them (a strip of cloth twists as it falls). */
  readonly face: readonly [Vec3, Vec3];
  /** Where it rests on the stone (shares of its length): from `from`
   *  (eased down to it over the share before) to `to`, past which it peels
   *  away to its end, `lift` m off at the end. */
  readonly rest: { readonly from: number; readonly to: number; readonly lift: number };
  /** Its half-width, as a share of the cloth's (a torn strip: wandering
   *  along it, spreading at its end where its threads let go); how much its
   *  margins curl (1/m); and its end, cut on a slant (radians off square). */
  readonly width: number;
  readonly curl: number;
  readonly slant: number;
}

/* The binding point, on the top: the stems meet and are tied there. */
const KNOT: Plan = [0.31, 10.18];

export const BLOOM = {
  /**
   * WHICH FLOWERS: the seed their rays are grown from (shape.ts grow) — how
   * many, their lengths, angles, twist. Fixed: the first paint (HeroStill)
   * is these flowers, and the live frame must land on them.
   */
  seed: 0.37,

  /**
   * THE TWO HEADS, each lying on its side where its stem left it. The
   * nearer looks toward the camera and the open lake and up, its face seen
   * three-quarter (the reference's left head, its dark disc an ellipse);
   * the other more to the left, nearly in profile, its rays fanned up (the
   * reference's second). Their stems run right along the top, meet at the
   * knot, and go on past the stone's right side: the nearer's out past it
   * (the reference's, out to 1.07 of the stone's width), the other's to its
   * edge (1.0), with a cut side shoot.
   */
  heads: [
    {
      center: [-0.134, 10.12],
      facing: [-0.46, 0.52, -0.72],
      size: 1.32,
      stem: [[-0.06, 10.16], [0.12, 10.175], [KNOT[0], KNOT[1] - 0.003], [0.47, 10.235], [0.665, 10.305]],
      droop: 0.012,
    },
    {
      center: [0.0005, 10.22],
      facing: [-0.84, 0.46, -0.3],
      size: 1.12,
      stem: [[0.085, 10.215], [0.19, 10.19], [KNOT[0], KNOT[1] + 0.003], [0.45, 10.29], [0.622, 10.425]],
      droop: 0.008,
    },
  ] as readonly HeadDesign[],

  /**
   * HOW THEY LIE: each head's lowest rays pressed `press` m onto the top,
   * and bent onto it there over `soft` m (a ray under the head's weight
   * lies on the stone rather than through it).
   */
  lie: { press: 0.006, soft: 0.006 },

  /**
   * A HEAD, at size 1 (~10 cm across). THE RAYS, one series round the disc:
   *   `count`       how many, at least and at most (the seed picks)
   *   `length`      m from the disc's rim to the tip, shortest and longest
   *   `halfWidth`   m, at its widest (a ray ~3.5× as long as it is wide)
   *   `widest`      where along it that is; `claw` its width where it leaves
   *                 the disc (share): it is a floret, a tube opening into a
   *                 strap; `tip` the end's shape (1 rounded)
   *   `base`, `end` its angle from the head's axis at its base and its tip
   *                 (radians): spread flat (π/2), bending back past it as
   *                 the head ages
   *   `curl`        how much more its tip bends back (radians)
   *   `cup`         its channel across (1/m)
   *   `crease`      its midrib's fold
   *   `twist`       how far its tip turns about its length, at most
   *   `jitter`      how far its angles stray from its neighbours' — the
   *                 user's photograph: no two alike, some crossing
   *   `teeth`       how deep the three teeth at its tip are cut (share of
   *                 its length)
   *   `ruffle`      m: how far its margin rises and falls
   */
  rays: {
    count: [20, 24] as const,
    length: [0.034, 0.04] as const,
    halfWidth: 0.0052,
    widest: 0.55,
    claw: 0.32,
    tip: 1.4,
    base: [1.42, 1.62] as const,
    end: [1.6, 1.95] as const,
    curl: 0.25,
    cup: 70,
    crease: 0.035,
    twist: 0.45,
    jitter: 0.14,
    teeth: 0.05,
    ruffle: 0.0003,
  },

  /**
   * THE DISC: a dome of florets on the hollow receptacle, `radius` m at its
   * foot, standing `height` m (a chamomile's is domed, coning as it ages;
   * the user's photograph shows a flatter one: between).
   */
  disc: { radius: 0.0135, height: 0.0075 },

  /**
   * THE INVOLUCRE: the small green bracts cupped behind the rays, in
   * `rows`, `count` to a row; their length and half-width (m); their angle
   * back from the head's axis (radians).
   */
  bracts: { rows: 2, count: 9, length: [0.0055, 0.0075] as const, halfWidth: 0.0021, angle: [2.0, 2.35] as const },

  /**
   * THE STEMS: round, finely ribbed, `radius` m along them and where they
   * swell into the head's receptacle; `ribs` round them and how much they
   * show. Each leaves the back of its head along its axis and bends down to
   * the stone over `bend` m (the user's photograph: a stem curving into its
   * head). The side shoot, on the second stem: `at` share along it from the
   * head, its length, its angle off the stem and up from the top (radians),
   * cut: standing off the stem as a fork, as the reference's does.
   */
  stem: {
    radius: 0.0025,
    receptacle: 0.0075,
    ribs: [10, 0.22] as const,
    bend: 0.03,
    shoot: { stem: 1, at: 0.8, length: 0.05, angle: 0.55, rise: 0.75, radius: 0.0016 },
  },

  /**
   * THE CLOTH: a strip torn from undyed cotton, frayed along its edges and
   * at its ends — wound round both stems where they meet (`wrap`: turns,
   * how far apart, standing off them), knotted on top in a double knot
   * pulled snug (`knot`), and its tails let go: the long one across the top
   * toward the camera, over the front-right edge and down the face — the
   * white the eye finds first against the stone's darker face — and the
   * short one lying on the top toward the front, as a florist leaves the
   * tails of a tie: unequal, cut on a slant.
   *   `at`         the binding point (x, z; m)
   *   `halfWidth`  m: ~3.8 cm wide, as the reference's is to its stone
   *   `thick`      m: half its thickness
   *   `wrap`       `turns` round the stems, `pitch` m from one to the next
   *                (less than its width: they overlap), `stand` m off the
   *                stems' bundle
   *   `knot`       how far it stands over the wrap (m), how long across the
   *                stems (m)
   *   `fray`       how far into its margins the frayed threads reach
   *                (share of its half-width), and at its ends (m)
   *   `pleat`      m: how high the soft creases along it stand (flat, it
   *                printed as one even white, a card)
   */
  cloth: {
    at: KNOT,
    halfWidth: 0.019,
    thick: 0.0005,
    wrap: { turns: 2.4, pitch: 0.013, stand: 0.0022 },
    knot: { height: 0.022, length: 0.04 },
    fray: [0.14, 0.014] as const,
    pleat: 0.0016,
    tails: [
      {
        /* The long one: from the knot toward the camera across the top, over
           the front-right edge (x, z on the edge there), down the face,
           turning off it at the end with a half twist. */
        points: [
          [0.316, 0.572, 10.16], [0.33, 0.546, 10.04], [0.348, 0.5445, 9.88], [0.3605, 0.538, 9.778],
          [0.368, 0.49, 9.768], [0.373, 0.44, 9.775], [0.371, 0.39, 9.782], [0.381, 0.335, 9.791],
        ],
        face: [[0, 1, 0], [0.15, 0.05, -0.99]],
        rest: { from: 0.04, to: 0.5, lift: 0.022 },
        width: 1,
        curl: 22,
        slant: 0.5,
      },
      {
        /* The short one: up off the knot and over toward the front-left in
           a loose flap (the reference's, standing over its knot), then down
           onto the top, its end lifted a little where it curls. */
        points: [[0.3, 0.572, 10.17], [0.29, 0.592, 10.15], [0.272, 0.588, 10.12], [0.252, 0.556, 10.085], [0.228, 0.546, 10.045]],
        face: [[-0.2, 0.2, -0.96], [0.05, 1, -0.1]],
        rest: { from: 0.62, to: 0.9, lift: 0.004 },
        width: 0.9,
        curl: 26,
        slant: -0.6,
      },
    ] as readonly ClothTail[],
  },

  /**
   * HOW IT TAKES THE LIGHT.
   *   `transmit`  the share of the light on a ray's far side that comes
   *               through it — a white ray is a thin, scattering sheet; at
   *               its tip and margins more
   *   `sheen`     the rays' satin: the dome in their fine papillae
   *   `wax`       the stems' cuticle: reflectance head-on
   *   `through`   the stems' own translucency; the cloth's
   *   `dome`      the overcast dome's light on the flowers, as a share of
   *               the full sky light: on a surface facing up, one facing
   *               away from the open lake, one facing it — the dome as it
   *               is for anything upright in fog (the stone's own is fitted
   *               to the design's stylised faces, and under it every white
   *               upright thing printed mid-grey)
   *   `veins`     how many veins run along a ray, and how much they show
   *   `satin`     the satin's streak along the ray: sharpness, strength
   *   `florets`   how much the disc's florets show (its grain), and how
   *               much lighter its outer ring of open florets is
   *   `weave`     how much the cloth's weave and its slubs show
   *   `cloth`     the dome's light on the cloth against the flowers': a
   *               matte cotton takes the whole dome a ray shares with the
   *               light through it (at 1 it printed with the fog, ~130, and
   *               read as grey card)
   */
  light: {
    transmit: 0.36,
    sheen: 0.06,
    wax: 0.04,
    through: [0.15, 0.25] as const,
    dome: [0.82, 0.62, 0.85] as const,
    veins: [5, 0.06] as const,
    satin: [40, 0.07] as const,
    florets: [0.3, 0.25] as const,
    weave: 0.12,
    cloth: 1.25,
  },

  /** Its reflection's blur (radians): the lake's ripples too fine to draw
   *  spread a reflection; the stone's under it is spread by about this. */
  mirrorBlur: 0.0025,

  /**
   * Where they lie on the stone, the stone's light is shaded: under the
   * stems and the wrap (`reach` m past their margins, `depth`), a thin dark
   * line where a stem touches (`crease`: depth, width m), round the cloth's
   * margins where it lies flat (`cloth`: m past them), and each head's
   * shade on the top under it (`head`: the sphere that stands for it, as a
   * share of its rays' length).
   */
  contact: { reach: 0.02, depth: 0.55, crease: [0.5, 0.0016] as const, cloth: 0.005, head: 0.9 },

  /**
   * THE LIGHT THEY HOLD: a soft light in the fog round the heads (the
   * user's brief: "a delicate glow around the focal point"): how much of
   * their light past `threshold` (linear: the rays pass it, the discs and
   * stems never do) spreads into the air, over `reach` m (a Gaussian's
   * width at the heads). Never on the cloth (bloom.ts: its box is left out).
   */
  glow: { halo: 0.245, threshold: 0.42, reach: 0.05 },

  /**
   * THEIR OWN PRINT (2026-10-20, the user: "the flower looks washed out —
   * make it detailed, clear"). Lit as they truly are, the rays carry more
   * light than the fog round them, and the print lays the fog at the top of
   * its curve, where all of that is pressed into the fog's own tone: they
   * dissolved into the air behind them. A printer dodges such a thing; so
   * their whites get a curve of their own, in the film pass (stage/shaders/
   * post.ts): their light `r` against the air's round them, printed
   * `white`·(1 − e^(−`rise`·r)) — the shading kept, the brightest rolling
   * off near 190 instead of clipping — where `r` passes `from`, fully by
   * `to` (the discs and stems keep the frame's print: the dark centres the
   * reference's heads have), within the heads' own box.
   * THE CLOTH the same way, in its own box, to a lower `white` (cotton
   * under the flowers' white, as the reference prints it): printed with the
   * frame it was the fog's own grey, a card. Its light against the air
   * round the heads where the air beside it is darker (the stone's face
   * behind the tail: against that it read as all white, its folds gone);
   * from `from` (the stems under the knot keep the frame's print), fully
   * by `to`.
   */
  print: { white: 0.86, rise: 1.4, amount: 1, from: 0.9, to: 1.3, cloth: { white: 0.8, from: 0.6, to: 0.9 } },

  /**
   * THE POLLEN: motes of pale gold (hero.css --color-hero-pollen), shed from
   * the discs, each a soft point of light: its core `radius` m holding
   * `light` times the sky's light, as bright as its size leaves it (finer
   * than 0.6 px, drawn at that and dimmed, so it is the same speck on every
   * screen); its halo `halo` of the sky's light, `haloWidth` m wide. In the
   * lake, `mirror` of it, spread wider. `veil`: the fog in front of it.
   */
  pollen: { radius: 0.0018, light: 2.2, halo: 0.045, haloWidth: 0.009, mirror: 0.3, veil: 0.85 },
} as const;
