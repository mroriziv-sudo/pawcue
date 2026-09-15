/**
 * Colour tokens — "Calm Premium Playful" (DESIGN_SYSTEM.md is the source of truth for every value here).
 *
 * Two layers on purpose:
 *   `palette` — the ten literal brand colours. Nothing outside this file may use a hex literal.
 *   `lightTheme` — semantic roles that point at the palette. Components consume roles, never palette entries, so a
 *                  second theme map is the only thing a future dark mode would need (see theme.ts).
 */

/**
 * The brand colours. Ten came from the original brief; the eleventh, Amber, was added by the art direction
 * ("A trainer's field notebook") as the one colour for something *earned* — a rep that counted, a lesson or a day
 * finished. It is the only hue the redesign introduced, and it exists because the previous accent (Apricot) is too
 * light to read as a 3:1 mark on white. Do not add a twelfth without a design decision.
 */
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
  /** Reward. Deep enough to clear 3:1 on both paper and white as a filled mark (asserted in color.test.ts). */
  amber: "#BF7A1E",
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
  /**
   * Charcoal at 72% — secondary copy on the tinted surfaces below. The 64% `charcoalMuted` measures ~4.4:1 on the
   * lavender tint and only ~4.5–4.6:1 on the other two (verified in color.test.ts) — a fail and two near-misses —
   * so tinted cards use this slightly darker variant, which clears 5.3:1 on all three.
   */
  charcoalMutedOnTint: "rgba(31, 37, 35, 0.72)",
  /** Charcoal at 8% — skeleton bones on a white card. Decorative; carries no information. */
  charcoalSkeleton: "rgba(31, 37, 35, 0.08)",
  /** White at 78% — secondary copy on the brand surface (7.0:1 on Deep Evergreen). */
  whiteMutedOnBrand: "rgba(255, 255, 255, 0.78)",
  /**
   * The accent colours at 18% over white, flattened. These are the "tinted" card surfaces — done, resume, premium —
   * and they are opaque on purpose: a translucent card would composite differently over the ivory canvas than over
   * a white one, and every contrast figure below assumes one known background. Derivation is asserted in
   * color.test.ts, so these cannot drift from the palette they come from.
   */
  sageTint: "#E9F2ED",
  apricotTint: "#FDF1E7",
  lavenderTint: "#EFEDF6",
  /**
   * Charcoal at 72% flattened over Warm Ivory. The redesign's secondary text is a *solid*: an alpha value
   * composites differently on every surface it lands on, which is how `mutedOnTint` came to exist. One solid
   * that clears 4.5:1 on both paper and white (asserted) means secondary copy has one colour everywhere.
   */
  inkSecondary: "#5C605E",
  /** Amber darkened for text use — "5 reps" beside an amber mark. 5.4:1 on paper (asserted). */
  amberText: "#8F5A12",
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
    /** The one dark surface a screen may carry: the hero card and the clicker share it with `brand.primary`. */
    brand: palette.deepEvergreen,
    /** Soft state tints. Colour says what state a card is in — never decoration — and is always paired with an icon and a word. */
    tintSage: derived.sageTint,
    tintWarm: derived.apricotTint,
    tintCool: derived.lavenderTint,
    /** Skeleton bones while content loads. */
    skeleton: derived.charcoalSkeleton,
  },
  brand: {
    primary: palette.deepEvergreen,
    secondary: palette.softSage,
    /** Pressed overlay applied on top of `brand.primary`. */
    onPrimaryPressed: derived.whitePressOverlay,
  },
  accent: {
    /** Legacy warm highlight. On redesigned surfaces reward uses `accent.reward`, never this. */
    warm: palette.warmApricot,
    /** Legacy. Premium has no colour in the redesign (lock glyph plus the word); nothing new should use this. */
    cool: palette.mutedLavender,
    /** The reward fill: a counted rep mark, the click ring, the treat. Never a surface, never a track. */
    reward: palette.amber,
  },
  text: {
    /** Ink. All primary copy. */
    primary: palette.charcoal,
    /**
     * Secondary ink — meta lines, hints, section labels' trailing facts. Solid, so it reads the same on paper and
     * on white. Prefer this over `muted` on every redesigned surface.
     */
    secondary: derived.inkSecondary,
    /** Legacy secondary/caption copy (alpha). Kept for screens not yet moved to the field-notebook system. */
    muted: derived.charcoalMuted,
    disabled: derived.charcoalDisabled,
    /** Copy sitting on `brand.primary`. */
    onBrand: palette.white,
    /** Secondary copy sitting on `brand.primary` / `surface.brand`. */
    onBrandMuted: derived.whiteMutedOnBrand,
    /** Secondary copy on the `surface.tint*` cards, where `muted` falls just short of 4.5:1. */
    mutedOnTint: derived.charcoalMutedOnTint,
    /** Status copy — darker than the brand status colours so body text clears 4.5:1. */
    error: derived.errorText,
    success: derived.successText,
    /** "Done" text beside a completed mark. The same green as `success`; the role name says what it means here. */
    completed: derived.successText,
    /** Text about something earned — a rep count, a finished lesson's facts. */
    reward: derived.amberText,
  },
  border: {
    subtle: palette.softBorder,
    /** The inset hairline between list rows and the resting edge of a field. Same value as `subtle`; the role is the point. */
    separator: palette.softBorder,
    /** Hairlines and tracks drawn on the brand surface — the progress ring's track, an inset highlight. */
    onBrand: derived.whitePressOverlay,
    /** Focus ring — deliberately the brand colour, never colour alone (paired with a visible outline width). */
    focus: palette.deepEvergreen,
  },
  status: {
    /** Icons, fills and borders. For status *text* use `text.error` / `text.success`. */
    error: palette.error,
    success: palette.success,
    /**
     * The "done" mark: a filled disc with a check, a completed trail segment. This is the success green rather
     * than Soft Sage because Soft Sage measures only 2.2:1 on paper — fine as a tint, unusable as a mark.
     */
    completed: palette.success,
  },
} as const;

export type Theme = typeof lightTheme;
export type ColorRole = Theme;
