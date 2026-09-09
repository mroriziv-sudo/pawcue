/**
 * Colour tokens — "Calm Premium Playful" (DESIGN_SYSTEM.md is the source of truth for every value here).
 *
 * Two layers on purpose:
 *   `palette` — the ten literal brand colours. Nothing outside this file may use a hex literal.
 *   `lightTheme` — semantic roles that point at the palette. Components consume roles, never palette entries, so a
 *                  second theme map is the only thing a future dark mode would need (see theme.ts).
 */

/** The ten brand colours, exactly as specified. Do not add an eleventh without a design decision. */
export const palette = {
  warmIvory: "#FAF8F4",
  deepEvergreen: "#23473C",
  softSage: "#82B79A",
  warmApricot: "#F2B27B",
  mutedLavender: "#A79ACD",
  charcoal: "#1F2523",
  white: "#FFFFFF",
  softBorder: "#E7E6E1",
  error: "#C75A55",
  success: "#4E8E68",
} as const;

export type PaletteColor = keyof typeof palette;

/**
 * Derived values. These are not new brand colours — each is an existing palette colour at reduced alpha, kept here
 * so the derivation is visible rather than sprinkled through components as ad-hoc `opacity` props.
 */
const derived = {
  /** Charcoal at 64% — secondary/caption text. */
  charcoalMuted: "rgba(31, 37, 35, 0.64)",
  /** Charcoal at 38% — disabled text/icons. */
  charcoalDisabled: "rgba(31, 37, 35, 0.38)",
  /** Charcoal at 8% — pressed-state overlay on light surfaces. */
  charcoalPressOverlay: "rgba(31, 37, 35, 0.08)",
  /** White at 16% — pressed-state overlay on brand-coloured surfaces. */
  whitePressOverlay: "rgba(255, 255, 255, 0.16)",
  /**
   * Deep Evergreen darkened for text use. `success`/`error` at their brand values do not reach 4.5:1 on Warm Ivory
   * (verified in color.test.ts), so status *text* uses these darker variants while the brand values stay for icons,
   * borders and fills. Contrast is a correctness constraint, not a preference — see a11y/contrast.ts.
   */
  errorText: "#A33F3B",
  successText: "#2F6B49",
} as const;

export const lightTheme = {
  background: {
    /** App canvas. */
    base: palette.warmIvory,
  },
  surface: {
    /** Cards sitting on the canvas. */
    raised: palette.white,
    /** Pressed state for a raised surface. */
    pressed: derived.charcoalPressOverlay,
  },
  brand: {
    primary: palette.deepEvergreen,
    secondary: palette.softSage,
    /** Pressed overlay applied on top of `brand.primary`. */
    onPrimaryPressed: derived.whitePressOverlay,
  },
  accent: {
    warm: palette.warmApricot,
    cool: palette.mutedLavender,
  },
  text: {
    primary: palette.charcoal,
    /** Secondary/caption copy. */
    muted: derived.charcoalMuted,
    disabled: derived.charcoalDisabled,
    /** Copy sitting on `brand.primary`. */
    onBrand: palette.white,
    /** Status copy — darker than the brand status colours so body text clears 4.5:1. */
    error: derived.errorText,
    success: derived.successText,
  },
  border: {
    subtle: palette.softBorder,
    /** Focus ring — deliberately the brand colour, never colour alone (paired with a visible outline width). */
    focus: palette.deepEvergreen,
  },
  status: {
    /** Icons, fills and borders. For status *text* use `text.error` / `text.success`. */
    error: palette.error,
    success: palette.success,
  },
} as const;

export type Theme = typeof lightTheme;
export type ColorRole = Theme;
