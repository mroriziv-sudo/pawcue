/**
 * Corner radii. The field-notebook system draws three: a field, a control, an object — plus the sheet's top edge
 * and two geometric shapes (the pill and the clicker squircle). Everything else in the product is unrounded.
 *
 * The legacy names (`sm`, `card`, `cardLarge`, `button`, `buttonLarge`) resolve onto the same three values, so a
 * screen not yet moved to the new names still draws the same corners as one that has.
 */

export const radius = {
  /** Text inputs and the search field. */
  field: 12,
  /** Buttons and segmented controls. 14 at 52pt tall is clearly a button, not a pill. */
  control: 14,
  /** The one card: a standalone tappable object that is not in a list. */
  object: 16,
  /** A sheet's top corners. */
  sheet: 20,
  /** Fully rounded: avatars, the trail's marks, the odd status pill on a legacy screen. */
  pill: 999,

  // Legacy aliases.
  sm: 12,
  card: 16,
  cardLarge: 16,
  button: 14,
  buttonLarge: 14,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * The clicker's corner, as a fraction of its size. The clicker is a "large rounded squircle", not a circle, and a
 * squircle's corner has to scale with the surface — 220pt on the clicker screen, ~132pt in the practice dock,
 * 40pt as a toolbar control — so it is a ratio rather than a fixed radius.
 */
export const CLICKER_CORNER_RATIO = 0.28;

/** The committed values, asserted in the token tests so a future edit cannot silently add a fourth radius. */
export const RADIUS_BOUNDS = {
  card: { min: 16, max: 16 },
  button: { min: 14, max: 14 },
} as const;
