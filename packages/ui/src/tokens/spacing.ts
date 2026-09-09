/**
 * Spacing — 8pt grid expressed in 4pt increments, per DESIGN_SYSTEM.md ("`space.1` = 4, `space.2` = 8, ...
 * multiples of 4 with 8 as the base unit").
 *
 * The 4pt steps exist for optical adjustments inside a component (icon-to-label gaps); layout between components
 * should prefer even steps so the 8pt rhythm survives. `GRID_BASE` is the unit the token tests assert against.
 */

export const GRID_UNIT = 4;
export const GRID_BASE = 8;

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

export type SpaceToken = keyof typeof space;

/** Standard horizontal page gutter. */
export const SCREEN_GUTTER = space[5];
