/**
 * Corner radii. DESIGN_SYSTEM.md specifies cards at 20–24 and buttons at 18–24; both are ranges, so this file
 * commits to values inside them and the token tests assert the bounds still hold.
 */

export const radius = {
  /** Dense elements: chips, small badges, inputs. */
  sm: 12,
  /** Compact cards and list rows. */
  card: 20,
  /** Feature cards — the upper end of the documented card range. */
  cardLarge: 24,
  /** Default button radius. */
  button: 20,
  /** Large/primary CTA. */
  buttonLarge: 24,
  /** Fully rounded: pills, avatars, the clicker surface. */
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/** Documented ranges, asserted in radius.test.ts so a future edit cannot silently leave the design spec. */
export const RADIUS_BOUNDS = {
  card: { min: 20, max: 24 },
  button: { min: 18, max: 24 },
} as const;
