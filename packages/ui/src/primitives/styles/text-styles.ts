import type { TextStyle } from "react-native";
import type { AppTheme } from "../../tokens/theme";
import type { TypographyVariant } from "../../tokens/typography";
import type { Direction } from "../../a11y/direction";
import { textAlignFor } from "../../a11y/direction";

/**
 * Pure style resolution for the Text primitive.
 *
 * React Native is imported for types only, so this module never loads the native runtime and can be unit-tested
 * directly. Keeping the decisions here rather than inside the component is what makes "does Hebrew align to the
 * right", "is Dynamic Type capped correctly" and "which colour role applies" assertable.
 */

export type TextTone =
  "primary" | "muted" | "disabled" | "onBrand" | "error" | "success" | "brand";

export type TextAlignment = "start" | "end" | "center" | "auto";

export interface TextStyleOptions {
  variant: TypographyVariant;
  tone?: TextTone;
  align?: TextAlignment;
  direction: Direction;
  theme: AppTheme;
}

export interface ResolvedTextStyle {
  style: TextStyle;
  /** Passed to RN's `maxFontSizeMultiplier`; `undefined` means uncapped, which is the default for body copy. */
  maxFontSizeMultiplier: number | undefined;
}

function toneColor(tone: TextTone, theme: AppTheme): string {
  switch (tone) {
    case "primary":
      return theme.colors.text.primary;
    case "muted":
      return theme.colors.text.muted;
    case "disabled":
      return theme.colors.text.disabled;
    case "onBrand":
      return theme.colors.text.onBrand;
    case "error":
      return theme.colors.text.error;
    case "success":
      return theme.colors.text.success;
    case "brand":
      return theme.colors.brand.primary;
  }
}

/**
 * Resolves alignment. `start`/`end` are logical: they follow the reading direction, which is why screens must never
 * pass `left`/`right` (DESIGN_SYSTEM.md bans physical values in this package).
 */
function resolveAlign(
  align: TextAlignment,
  direction: Direction,
): TextStyle["textAlign"] {
  switch (align) {
    case "center":
      return "center";
    case "auto":
      return "auto";
    case "start":
      return textAlignFor(direction);
    case "end":
      return direction === "rtl" ? "left" : "right";
  }
}

export function resolveTextStyle({
  variant,
  tone = "primary",
  align = "start",
  direction,
  theme,
}: TextStyleOptions): ResolvedTextStyle {
  const scale = theme.typography[variant];
  return {
    style: {
      fontSize: scale.fontSize,
      lineHeight: scale.lineHeight,
      fontWeight: scale.fontWeight,
      color: toneColor(tone, theme),
      textAlign: resolveAlign(align, direction),
      /**
       * Keeps mixed Hebrew/Latin runs — a Hebrew sentence containing a Latin dog name, which is extremely common
       * for this product — ordered correctly rather than by the first strong character alone.
       */
      writingDirection: direction,
    },
    maxFontSizeMultiplier: theme.maxFontSizeMultiplier[variant],
  };
}
