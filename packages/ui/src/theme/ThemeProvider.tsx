import { createContext, useContext, useMemo, type ReactNode } from "react";
import { I18nManager } from "react-native";
import {
  createTheme,
  defaultTheme,
  type AppTheme,
  type ColorSchemeName,
} from "../tokens/theme";
import type { Direction } from "../a11y/direction";

/**
 * A platform symbol renderer, injected by the app. Given a mark's name, size and colour it returns a node — an
 * SF Symbol on iOS — or `null` to let the design system draw its own vector path. Kept as a callback rather than a
 * component so the ui package never imports a platform module it cannot run under test.
 */
export type GlyphRenderer = (props: {
  name: string;
  size: number;
  color: string;
}) => React.ReactNode | null;

interface ThemeContextValue {
  theme: AppTheme;
  direction: Direction;
  renderGlyph: GlyphRenderer | null;
}

/**
 * Defaults are real values rather than `undefined`, so a primitive rendered outside the provider (a Storybook
 * snippet, an isolated test) still styles correctly instead of throwing. `useTheme` therefore never needs a
 * null check at the call site.
 */
const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
  direction: I18nManager.isRTL ? "rtl" : "ltr",
  renderGlyph: null,
});

export interface ThemeProviderProps {
  children: ReactNode;
  colorScheme?: ColorSchemeName;
  /**
   * Overrides the direction taken from `I18nManager`. Intended for tests and previews — the app itself should let
   * the locale drive `I18nManager` so React Native's own logical-property handling stays in sync.
   */
  direction?: Direction;
  /** Substitutes platform symbols for the standard marks. Absent under test and on platforms without a set. */
  renderGlyph?: GlyphRenderer;
}

export function ThemeProvider({
  children,
  colorScheme,
  direction,
  renderGlyph,
}: ThemeProviderProps) {
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: colorScheme ? createTheme(colorScheme) : defaultTheme,
      direction: direction ?? (I18nManager.isRTL ? "rtl" : "ltr"),
      renderGlyph: renderGlyph ?? null,
    }),
    [colorScheme, direction, renderGlyph],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext).theme;
}

export function useDirection(): Direction {
  return useContext(ThemeContext).direction;
}

export function useIsRtl(): boolean {
  return useDirection() === "rtl";
}

export function useGlyphRenderer(): GlyphRenderer | null {
  return useContext(ThemeContext).renderGlyph;
}
