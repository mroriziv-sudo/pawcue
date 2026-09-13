import type { TextStyle, ViewStyle } from "react-native";
import type { AppTheme } from "../../tokens/theme";
import type { TypographyVariant } from "../../tokens/typography";
import type { TextTone } from "./text-styles";

/**
 * Pure style resolution for the Button primitive. RN is imported for types only (see text-styles.ts).
 */

/**
 * `destructive` is for the one irreversible action the product has (account deletion). It is a bordered, raised
 * button in the status error colour — visually unlike the primary CTA so it cannot be mistaken for "continue",
 * and never the default or the only enabled control on a screen.
 */
export type ButtonVariant =
  "primary" | "secondary" | "tertiary" | "destructive";
export type ButtonSize = "md" | "lg";

export interface ButtonStyleOptions {
  variant: ButtonVariant;
  size?: ButtonSize;
  pressed?: boolean;
  disabled?: boolean;
  /** Stretches the button to fill its container — the default for primary CTAs. */
  fullWidth?: boolean;
  theme: AppTheme;
}

export interface ResolvedButtonStyle {
  container: ViewStyle;
  label: TextStyle;
  labelVariant: TypographyVariant;
  labelTone: TextTone;
  /** Scale factor for the press animation; always 1 when Reduce Motion is on (see pressScaleFor). */
  pressedScale: number;
}

const SIZE_SPEC = {
  md: {
    minHeight: 48,
    paddingH: 20,
    radius: "button",
    labelVariant: "buttonCompact",
  },
  lg: {
    minHeight: 56,
    paddingH: 24,
    radius: "buttonLarge",
    labelVariant: "button",
  },
} as const;

export function resolveButtonStyle({
  variant,
  size = "lg",
  pressed = false,
  disabled = false,
  fullWidth = true,
  theme,
}: ButtonStyleOptions): ResolvedButtonStyle {
  const spec = SIZE_SPEC[size];

  const base: ViewStyle = {
    /**
     * Never below the accessible minimum, whatever the size variant. This is the enforcement point for
     * DESIGN_SYSTEM.md's touch-target rule — a caller cannot style their way under it.
     */
    minHeight: Math.max(spec.minHeight, theme.minTouchTarget),
    paddingHorizontal: spec.paddingH,
    borderRadius: theme.radius[spec.radius],
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.space[2],
    borderWidth: theme.border.hairline,
    alignSelf: fullWidth ? "stretch" : "flex-start",
  };

  let container: ViewStyle;
  let labelTone: TextTone;

  switch (variant) {
    case "primary":
      container = {
        ...base,
        backgroundColor: theme.colors.brand.primary,
        borderColor: theme.colors.brand.primary,
      };
      labelTone = "onBrand";
      break;
    case "secondary":
      container = {
        ...base,
        backgroundColor: theme.colors.surface.raised,
        borderColor: theme.colors.border.subtle,
      };
      labelTone = "primary";
      break;
    case "tertiary":
      container = {
        ...base,
        backgroundColor: "transparent",
        borderColor: "transparent",
      };
      labelTone = "brand";
      break;
    case "destructive":
      container = {
        ...base,
        backgroundColor: theme.colors.surface.raised,
        borderColor: theme.colors.status.error,
        borderWidth: theme.border.focus,
      };
      labelTone = "error";
      break;
  }

  /**
   * Disabled state changes opacity AND text tone rather than colour alone, and the component also sets
   * `accessibilityState.disabled` so assistive tech is told directly — the brief forbids conveying state by colour
   * alone (§22, §27).
   */
  if (disabled) {
    container = { ...container, opacity: 0.5 };
    labelTone = variant === "primary" ? "onBrand" : "disabled";
  } else if (pressed) {
    container = { ...container, opacity: 0.92 };
  }

  return {
    container,
    label: { textAlign: "center" },
    labelVariant: spec.labelVariant,
    labelTone,
    pressedScale: theme.pressScale.button,
  };
}
