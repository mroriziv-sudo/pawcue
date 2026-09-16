import type { Insets, TextStyle, ViewStyle } from "react-native";
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
 *
 * `inverted` is the primary action when it sits *on* the brand surface — the ivory button inside the Evergreen hero.
 * A brand-coloured button on a brand-coloured card would vanish; this keeps one primary action per screen while
 * letting that action live inside the one dark card.
 */
export type ButtonVariant =
  "primary" | "secondary" | "tertiary" | "destructive" | "inverted";
/** md 48: a compact control. lg 52: the standard full-width button. xl 56: the one control a busy hand reaches for in a session. */
export type ButtonSize = "md" | "lg" | "xl";

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
  /** Tappable area beyond the container: what a text control gives up in padding it keeps here. */
  hitSlop?: Insets;
}

const SIZE_SPEC = {
  md: {
    minHeight: 48,
    paddingH: 20,
    radius: "control",
    labelVariant: "buttonCompact",
  },
  lg: {
    minHeight: 52,
    paddingH: 24,
    radius: "control",
    labelVariant: "button",
  },
  xl: {
    minHeight: 56,
    paddingH: 24,
    radius: "control",
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

  /**
   * A text control standing on its own — tertiary, hugging its label — sits on the text edge: "Not working?"
   * under the instruction, "Choose a photo" under the dog's name, on the same edge as the words above them
   * (DESIGN_SYSTEM.md: marks and text share edges). Its horizontal padding goes to zero and comes back as
   * hitSlop, so the tap target is what it was and the ink is where the text is. A stretched tertiary button
   * (a centred "Not now" under a primary) keeps its padding, because its label is centred, not on an edge.
   */
  const onTextEdge = variant === "tertiary" && !fullWidth;

  const base: ViewStyle = {
    /**
     * Never below the accessible minimum, whatever the size variant. This is the enforcement point for
     * DESIGN_SYSTEM.md's touch-target rule — a caller cannot style their way under it.
     */
    minHeight: Math.max(spec.minHeight, theme.minTouchTarget),
    paddingHorizontal: onTextEdge ? 0 : spec.paddingH,
    borderRadius: theme.radius[spec.radius],
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.space[2],
    borderWidth: theme.border.hairline,
    alignSelf: fullWidth ? "stretch" : "flex-start",
    // The transparent hairline every variant carries would still hold the label a point off the edge.
    ...(onTextEdge ? { marginHorizontal: -theme.border.hairline } : {}),
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
    case "inverted":
      container = {
        ...base,
        backgroundColor: theme.colors.background.base,
        borderColor: theme.colors.background.base,
      };
      labelTone = "brand";
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
    ...(onTextEdge
      ? { hitSlop: { left: spec.paddingH, right: spec.paddingH } }
      : {}),
  };
}
