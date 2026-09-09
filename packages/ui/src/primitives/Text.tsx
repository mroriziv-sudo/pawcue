import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme, useDirection } from "../theme/ThemeProvider";
import {
  resolveTextStyle,
  type TextTone,
  type TextAlignment,
} from "./styles/text-styles";
import type { TypographyVariant } from "../tokens/typography";

export interface TextProps extends Omit<RNTextProps, "style"> {
  variant?: TypographyVariant;
  tone?: TextTone;
  /** Logical alignment. There is no `left`/`right` on purpose — see DESIGN_SYSTEM.md §RTL. */
  align?: TextAlignment;
  style?: RNTextProps["style"];
}

/**
 * The only text primitive. Screens never reach for React Native's `Text` directly, which is what keeps the type
 * scale, colour roles, RTL alignment and Dynamic Type behaviour consistent instead of re-decided per screen.
 */
export function Text({
  variant = "body",
  tone = "primary",
  align = "start",
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const direction = useDirection();
  const resolved = resolveTextStyle({ variant, tone, align, direction, theme });

  return (
    <RNText
      {...rest}
      style={[resolved.style, style]}
      /**
       * Font scaling stays ON everywhere. Headings get a ceiling (so a Display line can't push the primary action
       * off-screen at the largest accessibility sizes) but body copy is never clamped.
       */
      allowFontScaling
      maxFontSizeMultiplier={resolved.maxFontSizeMultiplier}
    />
  );
}
