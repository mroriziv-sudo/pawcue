/**
 * Type scale — values from DESIGN_SYSTEM.md.
 *
 * No `fontFamily` is set anywhere: React Native falls back to the platform system face (San Francisco on iOS, the
 * device default on Android), which is exactly what the brief requires and avoids redistributing Apple's fonts.
 *
 * Sizes are unscaled design values. Components must let the OS scale them (Dynamic Type / Android font scale) —
 * see `allowFontScaling` handling in the Text primitive. Nothing here may be used as a fixed pixel height.
 */

export const fontWeight = {
  regular: "400",
  semibold: "600",
} as const;

export type FontWeight = (typeof fontWeight)[keyof typeof fontWeight];

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
}

/**
 * DESIGN_SYSTEM.md gives Caption as "12–13 / 17" and Button as "16–17"; both are ranges, so this file commits to a
 * single value each (Caption 13, Button 17, with a 16pt `buttonCompact` for dense rows). Picking the upper end of
 * the caption range favours legibility, which matters more than density for a training app used one-handed.
 */
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: fontWeight.semibold },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: fontWeight.semibold },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: fontWeight.semibold },
  h3: { fontSize: 20, lineHeight: 26, fontWeight: fontWeight.semibold },
  body: { fontSize: 16, lineHeight: 23, fontWeight: fontWeight.regular },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: fontWeight.semibold },
  small: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.regular },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: fontWeight.regular },
  button: { fontSize: 17, lineHeight: 22, fontWeight: fontWeight.semibold },
  buttonCompact: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: fontWeight.semibold,
  },
} as const satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;

/**
 * Caps how far OS font scaling may stretch a given variant. Body copy is deliberately uncapped — clamping the text
 * users actually read would defeat Dynamic Type. Only headings are capped, because an unbounded Display line
 * pushes primary actions off-screen at the largest accessibility sizes.
 */
export const maxFontSizeMultiplier = {
  display: 1.6,
  h1: 1.6,
  h2: 1.7,
  h3: 1.8,
  body: undefined,
  bodyStrong: undefined,
  small: undefined,
  caption: undefined,
  button: 1.8,
  buttonCompact: 1.8,
} as const satisfies Record<TypographyVariant, number | undefined>;
