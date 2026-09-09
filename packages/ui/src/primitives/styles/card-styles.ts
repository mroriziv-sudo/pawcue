import type { ViewStyle } from "react-native";
import type { AppTheme } from "../../tokens/theme";

/** Pure style resolution for the Card primitive. RN is imported for types only (see text-styles.ts). */

export type CardPadding = "none" | "compact" | "comfortable";

export interface CardStyleOptions {
  /** Feature cards use the larger radius; list rows use the compact one. */
  emphasis?: "default" | "feature";
  padding?: CardPadding;
  /** Cards are flat by default; elevation is opt-in so the ivory canvas stays calm. */
  elevated?: boolean;
  pressed?: boolean;
  theme: AppTheme;
}

const PADDING_SPEC = { none: 0, compact: 3, comfortable: 5 } as const;

export function resolveCardStyle({
  emphasis = "default",
  padding = "comfortable",
  elevated = false,
  pressed = false,
  theme,
}: CardStyleOptions): ViewStyle {
  const base: ViewStyle = {
    backgroundColor: theme.colors.surface.raised,
    borderRadius:
      emphasis === "feature" ? theme.radius.cardLarge : theme.radius.card,
    padding: theme.space[PADDING_SPEC[padding]],
    /**
     * The hairline border is what separates a white card from the ivory canvas at low contrast (1.18:1 — measured
     * in color.test.ts). It is decorative: a card that is *interactive* must also carry a label or affordance,
     * because this border alone cannot identify a control under WCAG 1.4.11.
     */
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.border.subtle,
  };

  const withElevation: ViewStyle = elevated
    ? { ...base, ...theme.shadow.card }
    : base;

  return pressed
    ? { ...withElevation, backgroundColor: theme.colors.surface.pressed }
    : withElevation;
}
