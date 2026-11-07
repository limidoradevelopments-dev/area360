/**
 * ─── Works · optics ───
 *
 * How the breath looks on the glass (breath.ts, shaders/breath.ts): the
 * film of condensation and the droplets at its margin. Every value is a
 * share of white, of a thickness, or a size in CSS px, as said.
 *
 * MONOCHROME, AS THE SITE PRINTS: the film scatters every colour alike
 * (droplets far larger than light's wavelength: Mie), so it is a grey —
 * the hero's fog's — and what it veils loses its colour as it loses its
 * contrast, by the veil alone.
 */
export const BREATH_LOOK = {
  /** The film's light, of white: the room's light scattered back by the
   *  droplets (a grey like the hero's fog). */
  light: 0.6,
  /** How far the thickest film takes what is behind toward that light. */
  veil: 0.34,
  /** Thickness to veil: 1 − e^(−κ·h). */
  kappa: 2.4,
  /** The film's edge: thickness over which it goes from clear to whole. */
  edge: 0.06,
  /** LIT FROM ABOVE (the hero's mist, MIST.volume): the side of a patch
   *  toward the light brighter, the far side a little darker — by the
   *  film's thickness rising toward the light, per CSS px. */
  rim: 0.35,
  rimSlope: 16,

  /** The glass's own unevenness (fbm, `scaleRem` across, stretched along
   *  a wiped pane's strokes by `wipe`): where it fogs first and clears
   *  last. FIXED PER CARD — breathe on the same glass twice and the same
   *  pattern comes back. A deposit ×(1 ± `contrast`). */
  glass: {
    scaleRem: 3.25,
    wipe: 1.7,
    contrast: 0.45,
    /** NO BREATH IS A CIRCLE: the glass's nucleation is uneven, so a
     *  patch's outline wanders — every puff is laid through one warp of
     *  the glass, this share of its scale either way. */
    warp: 0.5,
  },

  /** Frosting what is behind (a picture's mip levels at a whole film). */
  frost: 4.2,
  /** How far the film's thickness bends what is seen through it, CSS px a
   *  unit of thickness a px. */
  bend: 14,

  /** THE MARGIN BREAKS INTO DROPLETS (a breath figure): a cell of the
   *  glass `size` CSS px across holds one, its radius a share of the cell;
   *  each a little dark, only the largest (`glinting`, a share of them)
   *  lit at its top; seen where the film thins and a little past where it
   *  has gone (`past`, in thickness), a faint grain through the film.
   *  KEPT FAINT ON PURPOSE: lit brighter, or lingering, they read as white
   *  dust over the dark — a screen's noise, not water. */
  droplets: {
    size: 3.4,
    radius: [0.16, 0.4],
    dark: 0.1,
    light: 0.09,
    glinting: 0.25,
    past: 0.05,
    grain: 0.12,
  },
} as const;
