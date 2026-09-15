/**
 * Type scale — the field-notebook hierarchy (DESIGN_SYSTEM.md §Typography).
 *
 * No `fontFamily` is set anywhere: React Native falls back to the platform system face (San Francisco / SF Hebrew
 * on iOS, the device default on Android), which is exactly what the brief requires and avoids redistributing
 * Apple's fonts. What the scale *does* commit to is the full weight range — the earlier system used 400 and 600
 * only, which is why every screen read at the same volume.
 *
 * Sizes are unscaled design values. Components must let the OS scale them (Dynamic Type / Android font scale) —
 * see `allowFontScaling` handling in the Text primitive. Nothing here may be used as a fixed pixel height.
 *
 * Hebrew is adjusted at the primitive, not here: `resolveTextStyle` adds 2pt of line height and drops negative
 * tracking for RTL, so one scale serves both scripts.
 */

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export type FontWeight = (typeof fontWeight)[keyof typeof fontWeight];

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  /** Latin tracking only. Hebrew never tracks; the primitive drops it under RTL. */
  letterSpacing?: number;
}

/**
 * The scale, in iOS points.
 *
 * The first block is the hierarchy every redesigned surface is built from. The second block keeps the names the
 * earlier screens still use; their values sit on the same scale so both read as one system while those screens
 * are migrated.
 */
export const typography = {
  /** The dog's name on its own page. The one large title in the app. */
  largeTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
  /** The coach line on Today, the step instruction in a session, an onboarding question. */
  headline: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.2,
  },
  /** A lesson's title on its overview; the completion line. */
  title: { fontSize: 20, lineHeight: 25, fontWeight: fontWeight.semibold },
  /** All reading text. iOS body is 17, not 16. */
  body: { fontSize: 17, lineHeight: 24, fontWeight: fontWeight.regular },
  /** Row titles. */
  bodyStrong: { fontSize: 17, lineHeight: 24, fontWeight: fontWeight.semibold },
  /** Row meta, hints, the line under a headline. */
  secondary: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.regular },
  /** A section's signpost. Sentence case; space above it does the separating. */
  sectionLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeight.semibold,
  },
  /** Timestamps, disclosures, legal. Meant to disappear at a glance. */
  caption: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.regular },
  button: { fontSize: 17, lineHeight: 22, fontWeight: fontWeight.semibold },
  buttonCompact: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: fontWeight.semibold,
  },
  /** The rep count in the practice dock. The only display-sized number in the product. */
  displayNumeral: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: fontWeight.bold,
    letterSpacing: -1.5,
  },

  // Legacy names, kept for screens not yet moved to the scale above.
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: fontWeight.semibold },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: fontWeight.semibold },
  h3: { fontSize: 20, lineHeight: 25, fontWeight: fontWeight.semibold },
  small: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.regular },
} as const satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;

/**
 * Caps how far OS font scaling may stretch a given variant. Reading copy is deliberately uncapped — clamping the
 * text users actually read would defeat Dynamic Type. Only the large sizes are capped, because an unbounded
 * headline pushes the primary action off-screen at the largest accessibility sizes, and the display numeral is
 * already the largest thing on its screen.
 */
export const maxFontSizeMultiplier = {
  largeTitle: 1.5,
  headline: 1.7,
  title: 1.8,
  body: undefined,
  bodyStrong: undefined,
  secondary: undefined,
  sectionLabel: undefined,
  caption: undefined,
  button: 1.8,
  buttonCompact: 1.8,
  displayNumeral: 1.4,
  display: 1.6,
  h1: 1.6,
  h2: 1.7,
  h3: 1.8,
  small: undefined,
} as const satisfies Record<TypographyVariant, number | undefined>;

/** Extra line height Hebrew gets over the Latin value: the script sits taller and needs the room. */
export const RTL_LINE_HEIGHT_OFFSET = 2;

/** The heaviest weight Hebrew display type is set at; SF Hebrew fills in above it. */
export const RTL_MAX_FONT_WEIGHT: FontWeight = fontWeight.bold;
