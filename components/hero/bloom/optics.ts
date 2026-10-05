/**
 * ─── Bloom · optics ───
 *
 * The night bloom on the stone: Epiphyllum oxypetalum, the kadupul — a
 * climbing cactus whose flat stems root in any crevice that holds a little
 * humus, and whose one large white flower opens after dark and is gone by
 * morning. Here it has rooted in a crack on the stone's top: its stems arch
 * over the edge, and the flower, on its long bent tube, faces the lake.
 *
 * MODELLED, NOT CUT OUT. Every part is a surface swept along a curve
 * (shape.ts): the tepals curved along their length and cupped across, each
 * curling its own way; the stems thick and fleshy, lens-shaped across with
 * a raised midrib and rounded margins, scalloped between their areoles,
 * round where they leave the root, twisting as they fall; the tube round
 * and tapering; the heart a dome of filaments, each one its own thread. The
 * first build traced flat pieces hinged together, and close to, it read as
 * green card and a paper star.
 *
 * LIT AS THE STONE IS: by the overcast dome (stone/optics.ts STONE.light),
 * the same light from above and from the open lake on the left. A white
 * flower in that light is the brightest thing in the frame without giving
 * off any: what reads as glowing is thin petals with the fog's light behind
 * them, never an added glow (the stone's rule, and the flower's).
 *
 * Placed in world metres, on the stone's frame (stone/optics.ts STONE). The
 * stone is a diamond prism stretched down the lens's axis to play a cube
 * (see STONE): a point's DEPTH barely moves it on screen, so the plant is
 * placed by x and height, and its depth is chosen only to keep it in front
 * of the face it hangs over. The stone's top is seen almost edge-on (the
 * eye is 0.7 m above it, 10 m away): whatever lies flat on it is a line, so
 * the stems arch up off it before they fall.
 */

/** Golden angle (radians): each tepal turned from the last by it, as a
 *  cactus flower's tepals stand on their spiral. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type Vec3 = readonly [number, number, number];

export interface StemDesign {
  /** The spine's control points (m): the root in the crack, then along its
   *  arch — a smooth curve through all of them. */
  readonly points: readonly Vec3[];
  /** Its greatest half-width (m). */
  readonly width: number;
  /** Which way its flat side faces, at the root and at the tip: the blade
   *  turns between them as it falls (a cladode twists under its weight). */
  readonly face: readonly [Vec3, Vec3];
  /** 0 an old stem, 1 this season's: paler, yellower, thinner. */
  readonly young: number;
}

export const BLOOM = {
  /**
   * THE FLOWER, held up over the stone's top on its bent tube, white against
   * the grey fog. `center`: where its tepals spring from (m). `facing`: the
   * way it looks — out to the open lake on the left, toward the camera and
   * up: a THREE-QUARTER view. Face-on (the first try) it flattened into a
   * white star and read as a daisy; turned, it shows what only this flower
   * has — the deep white cup on its long curved neck, the crown swept back
   * behind it (the second reference). Hung lower, before the stone's face,
   * it was a small white burr against the granite. `budFacing`: the bud,
   * before it opens, nods at the end of its neck, as a kadupul's bud hangs
   * until its night; it lifts its head to `facing` as it opens (motion.ts
   * OPENING.lift). Facing up, the bud put a kink in the neck.
   */
  center: [-0.235, 0.715, 9.97] as Vec3,
  facing: [-0.76, 0.42, -0.5] as Vec3,
  budFacing: [-0.74, -0.08, -0.66] as Vec3,
  /** LARGER THAN LIFE, A LITTLE: a real bloom is ~17 cm across, the largest
   *  ~25; here ~26, so on a 1440 frame it spans ~50 px. Smaller, it read as
   *  a white fleck, not a flower. Every length below is before this. */
  scale: 1.45,

  /**
   * THE TEPALS, one spiral from the outside in. A cactus flower has no clean
   * line between sepals and petals: its tepals grade from the outermost —
   * narrow, greenish cream, swept back past the side and curling at their
   * tips, each its own way (the spidery crown that makes it this flower and
   * not a lily) — to the innermost — broad, white, cupped, overlapping in a
   * deep bowl that flares at the rim (both references, assets/sources/
   * flowers/). `count`: how many, at least and at most (a seed per visit
   * picks; motion.ts). Each property is given for the outermost and the
   * innermost, and every tepal between takes its share along the spiral.
   *   `length`      m along the tepal
   *   `halfWidth`   m, at its widest
   *   `widest`      where along it that is (share of its length)
   *   `claw`        its width where it springs from the tube (share)
   *   `tip`         the tip's shape: 1 rounded, higher more pointed
   *   `base`, `end` its angle from the flower's axis at the base and at the
   *                 tip (radians): the inner cup ~25°–55°; the outer crown
   *                 swept back to ~140°
   *   `curl`        how much more the last third bends back (radians)
   *   `cup`         how deeply it is cupped across (1/m: the curvature of
   *                 its cross-section; the bud's is the bud's own roundness)
   *   `crease`      its midrib's fold, as the slope of each half
   *   `twist`       how far its tip turns about its own length, at most
   *   `jitter`      how far its angles stray from its neighbours' (radians)
   *                 — a perfect star is a drawing
   */
  tepals: {
    count: [28, 34] as const,
    /** Where the outer series ends and the inner begins, as a share of the
     *  spiral: the colour and the light change across it. */
    inner: 0.45,
    length: [0.095, 0.088] as const,
    halfWidth: [0.0042, 0.019] as const,
    widest: [0.5, 0.68] as const,
    claw: [0.6, 0.2] as const,
    tip: [2.6, 2.2] as const,
    base: [1.35, 0.28] as const,
    end: [2.35, 0.74] as const,
    curl: [1.2, 0.35] as const,
    cup: [30, 18] as const,
    crease: [0.1, 0.06] as const,
    twist: [0.9, 0.25] as const,
    jitter: [0.2, 0.08] as const,
    /** Where they spring from: the receptacle's rim (m), the outer series
     *  lower down it (m behind the inner's plane, at the outermost). */
    rim: 0.011,
    lower: 0.016,
  },

  /**
   * THE BUD, before it opens: a spindle of tepals wrapped round each other,
   * the outer ones' green-cream backs all that shows. `length` m from the
   * receptacle to its point, `radius` m at its widest, `widest` where along
   * it that is. Its own size for the length: the tepals keep theirs, and
   * their tips lie along the bud's point.
   */
  bud: { length: 0.085, radius: 0.021, widest: 0.45 },

  /**
   * THE HEART. A dense dome of white filaments, each a thread, set along
   * the throat in two series, tipped with cream anthers — and the style
   * standing out of them, its stigma a star of curled lobes (both
   * references). At this size a few pixels: a finer, warmer centre the
   * tepals radiate from, and a haze of threads where the light comes
   * through them.
   *   `filaments`   how many
   *   `length`      m, shortest and longest
   *   `throat`      m: where they are set, from deep in the throat to its
   *                 mouth (behind the tepals' plane)
   *   `ring`        m: the throat's radius there
   *   `splay`       radians from the axis, open: inner and outer
   *   `thread`      m: a filament's width (finer than any pixel: what shows
   *                 is how many there are)
   *   `anther`      m: an anther's length and width
   *   `style`       m: its length past the throat's mouth, its radius
   *   `lobes`       the stigma's lobes, and their length (m)
   */
  heart: {
    filaments: 120,
    length: [0.042, 0.056] as const,
    throat: [-0.024, -0.004] as const,
    ring: 0.0075,
    splay: [0.28, 0.62] as const,
    thread: 0.0006,
    anther: [0.0026, 0.0011] as const,
    style: [0.062, 0.0014] as const,
    lobes: [15, 0.0085] as const,
  },

  /**
   * THE TUBE: the flower's long receptacle, pale green — the kadupul's
   * signature, a swan's neck (the second reference). It leaves an areole on
   * the oldest stem's margin, back on the top, arches up over it and bows
   * down into the flower's base along its axis, so the flower hangs its
   * face out over the edge. A smooth curve from `from` (the stem, nearest
   * point) over `knee` (the arch's crown). Radius at the stem and at the
   * flower (m). It thickens into the flower: the ovary, then the throat.
   * Short and dipping (the first try), it read as a bent pipe.
   */
  tube: {
    from: [0.08, 0.58, 10.33] as Vec3,
    knee: [-0.09, 0.745, 10.16] as Vec3,
    /** Which stem it grows from. */
    stem: 1,
    radius: [0.0028, 0.0055] as const,
    /** Its fine ridges (how many round it) and their depth (a normal's
     *  tilt): a smooth tube read as plastic. */
    ridges: 9,
    ridgeDepth: 0.18,
  },

  /**
   * THE STEMS: flat, leaf-like cladodes, broad, waxy and scalloped,
   * springing from one crack near the top's left. An epiphyte's stems do not
   * stand up like a seedling's (the first try read as grass): they arch and
   * fall. One arches over the left edge and falls by the stone's corner,
   * turning as it falls — its blade seen now flat, now on edge; the other,
   * the oldest, sweeps back along the top and over its far edge, and the
   * flower's tube rises from it. Two, not three: the top is seen almost
   * edge-on, so everything on it lines up in one thin strip, and a third
   * stem there crossed the tube's arch into a tangle.
   */
  stems: [
    {
      points: [[-0.03, 0.52, 10.24], [-0.13, 0.615, 10.17], [-0.27, 0.618, 10.12], [-0.365, 0.54, 10.14], [-0.39, 0.38, 10.13], [-0.395, 0.22, 10.1]],
      width: 0.04,
      face: [[0.1, 0.9, -0.42], [-0.72, 0.12, -0.68]],
      young: 0.15,
    },
    {
      points: [[0.02, 0.52, 10.26], [0.12, 0.595, 10.4], [0.26, 0.61, 10.65], [0.35, 0.57, 10.9], [0.4, 0.5, 11.1]],
      width: 0.034,
      face: [[0.0, 0.85, -0.5], [-0.2, 0.75, -0.6]],
      young: 0,
    },
  ] as readonly StemDesign[],

  /**
   * A STEM'S FORM, shared:
   *   `stalk`     how much of its length leaves the root round (share), and
   *               its radius there (m)
   *   `tip`       where the blade begins to narrow to its blunt tip (share)
   *   `lobe`      m between areoles along the margin; `notch` how deep each
   *               notch is (share of the width): long shallow scallops
   *               (short deep ones read as a fern's teeth)
   *   `thick`     m: half its thickness at the midrib — a fleshy blade,
   *               ~5 mm, thinning to a rounded margin
   *   `rib`       m: how far the midrib stands above the blade
   *   `wave`      m: how far the blade undulates between the areoles
   */
  stem: {
    stalk: [0.09, 0.0042] as const,
    tip: 0.62,
    lobe: 0.042,
    notch: 0.13,
    thick: 0.0024,
    rib: 0.0011,
    wave: 0.0016,
  },

  /**
   * HOW IT TAKES THE LIGHT.
   *   `transmit`  the share of the light on a tepal's far side that comes
   *               through it — a white petal is a thin, scattering sheet;
   *               this is what makes it read as lit from within, with no
   *               light of its own; more at its thin edges and tip
   *   `cup`       the light left deep in the cup, where the tepals and the
   *               filaments hide the sky from each other
   *   `sheen`     the tepals' satin: the dome in their fine papillae
   *   `wax`       the stems' cuticle: its reflectance head-on (a waxy leaf
   *               is ~4%, rising to a mirror at grazing) — the gloss is
   *               what shows a stem is round
   *   `through`   the stems' and the tube's own translucency
   *   `dome`      the overcast dome's light on the plant, as a share of
   *               the full sky light: on a surface facing up, one facing
   *               away from the open lake, one facing it. The stone's own
   *               (stone/optics.ts STONE.light) is fitted to the design's
   *               dark faces — a stylised block — and in it every petal that
   *               stands upright printed mid-grey: a white flower lost its
   *               white. This is the dome as it is for anything upright in
   *               fog: ~40% of the light on the level
   */
  light: { transmit: 0.55, cup: 0.42, sheen: 0.06, wax: 0.04, through: 0.12, dome: [0.82, 0.3, 0.44] as const },

  /** Its reflection's blur (radians): the lake's ripples too fine to draw
   *  spread a reflection; the stone's under it is spread by about this. */
  mirrorBlur: 0.0025,

  /**
   * Where the plant rests on the stone, its light is shaded: the root's
   * humus and moss in its crack (`root`: m, its radius), the stems where
   * they lie close (`reach` m past their margins, `depth`), and the flower's
   * shade on the top below it (`flower`: the sphere that stands for it, as
   * a share of its tepals' length).
   */
  contact: { root: 0.03, reach: 0.03, depth: 0.6, flower: 0.6 },

  /** The pollen's specks: their radius (m) — larger than a grain, which is
   *  under a pixel at 10 m: what shows of real pollen in a draught is a few
   *  clumps catching the light — and their tone against the anthers'. */
  pollen: { radius: 0.0018, tone: 1.1 },
} as const;
