import { lightTheme, type Theme } from "./color";
import { typography, maxFontSizeMultiplier } from "./typography";
import { space, SCREEN_GUTTER } from "./spacing";
import { radius } from "./radius";
import { shadow, border } from "./elevation";
import { duration, easing, pressScale, spring } from "./motion";
import { MIN_TOUCH_TARGET } from "./layout";

/**
 * The object components consume. Colour is the only axis that would vary by scheme, so it is the only one keyed by
 * scheme name — type scale, spacing and motion are scheme-independent and stay flat.
 *
 * **Dark mode is deliberately not implemented.** The product brief specifies a single light identity built on Warm
 * Ivory and does not ask for a dark theme, and DESIGN_SYSTEM.md records that decision. What is done here is the
 * readiness work the spec *does* ask for: components resolve colour through semantic roles
 * (`theme.colors.text.primary`), never through `palette`, so adding dark mode means adding one `darkTheme` map to
 * `colorSchemes` — not touching component code. Shipping a half-considered dark palette would be worse than not
 * having one, since the ten brand colours were chosen against a light ground.
 */
export const colorSchemes = {
  light: lightTheme,
} as const;

export type ColorSchemeName = keyof typeof colorSchemes;

export const DEFAULT_COLOR_SCHEME: ColorSchemeName = "light";

export interface AppTheme {
  colorScheme: ColorSchemeName;
  colors: Theme;
  typography: typeof typography;
  maxFontSizeMultiplier: typeof maxFontSizeMultiplier;
  space: typeof space;
  screenGutter: number;
  radius: typeof radius;
  shadow: typeof shadow;
  border: typeof border;
  duration: typeof duration;
  easing: typeof easing;
  pressScale: typeof pressScale;
  spring: typeof spring;
  minTouchTarget: number;
}

export function createTheme(
  colorScheme: ColorSchemeName = DEFAULT_COLOR_SCHEME,
): AppTheme {
  return {
    colorScheme,
    colors: colorSchemes[colorScheme],
    typography,
    maxFontSizeMultiplier,
    space,
    screenGutter: SCREEN_GUTTER,
    radius,
    shadow,
    border,
    duration,
    easing,
    pressScale,
    spring,
    minTouchTarget: MIN_TOUCH_TARGET,
  };
}

export const defaultTheme = createTheme();
