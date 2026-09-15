import type { ViewStyle } from "react-native";
import type { AppTheme } from "../../tokens/theme";

/** Pure style resolution for the Card primitive. RN is imported for types only (see text-styles.ts). */

export type CardPadding = "none" | "compact" | "comfortable" | "spacious";

/**
 * What a card is made of. `raised` is the white card on the ivory canvas. The tints say what *state* a thing is in
 * — done, resumable, premium — and `brand` is the one dark surface a screen may carry (the hero, the clicker).
 */
export type CardSurface =
  "raised" | "brand" | "tintSage" | "tintWarm" | "tintCool";

export interface CardStyleOptions {
  /** Feature cards use the larger radius; list rows use the compact one. */
  emphasis?: "default" | "feature";
  padding?: CardPadding;
  surface?: CardSurface;
  /** Cards are flat by default; elevation is opt-in so the ivory canvas stays calm. */
  elevated?: boolean;
  pressed?: boolean;
  theme: AppTheme;
}

const PADDING_SPEC = {
  none: 0,
  compact: 3,
  comfortable: 5,
  spacious: 6,
} as const;

export function surfaceColor(surface: CardSurface, theme: AppTheme): string {
  switch (surface) {
    case "raised":
      return theme.colors.surface.raised;
    case "brand":
      return theme.colors.surface.brand;
    case "tintSage":
      return theme.colors.surface.tintSage;
    case "tintWarm":
      return theme.colors.surface.tintWarm;
    case "tintCool":
      return theme.colors.surface.tintCool;
  }
}

export function resolveCardStyle({
  emphasis = "default",
  padding = "comfortable",
  surface = "raised",
  elevated = false,
  pressed = false,
  theme,
}: CardStyleOptions): ViewStyle {
  const fill = surfaceColor(surface, theme);
  const base: ViewStyle = {
    backgroundColor: fill,
    // One card, one radius. `emphasis` is accepted for the screens that still pass it and no longer changes the corner.
    borderRadius:
      emphasis === "feature" ? theme.radius.object : theme.radius.object,
    padding: theme.space[PADDING_SPEC[padding]],
    /**
     * The hairline border is what separates a white card from the ivory canvas at low contrast (1.18:1 — measured
     * in color.test.ts). It is decorative: a card that is *interactive* must also carry a label or affordance,
     * because this border alone cannot identify a control under WCAG 1.4.11.
     *
     * A tinted or brand surface has its fill for an edge and needs no hairline — but the border *width* stays, in
     * the fill colour, so a card that changes surface (white → sage as an activity completes) keeps its content in
     * exactly the same place.
     */
    borderWidth: theme.border.hairline,
    borderColor: surface === "raised" ? theme.colors.border.subtle : fill,
  };

  const withElevation: ViewStyle = elevated
    ? { ...base, ...theme.shadow.card }
    : base;

  return pressed
    ? { ...withElevation, backgroundColor: theme.colors.surface.pressed }
    : withElevation;
}
