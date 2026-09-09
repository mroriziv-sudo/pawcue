import { createContext, useContext, useMemo, type ReactNode } from "react";
import { I18nManager } from "react-native";
import {
  createTheme,
  defaultTheme,
  type AppTheme,
  type ColorSchemeName,
} from "../tokens/theme";
import type { Direction } from "../a11y/direction";

interface ThemeContextValue {
  theme: AppTheme;
  direction: Direction;
}

/**
 * Defaults are real values rather than `undefined`, so a primitive rendered outside the provider (a Storybook
 * snippet, an isolated test) still styles correctly instead of throwing. `useTheme` therefore never needs a
 * null check at the call site.
 */
const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
  direction: I18nManager.isRTL ? "rtl" : "ltr",
});

export interface ThemeProviderProps {
  children: ReactNode;
  colorScheme?: ColorSchemeName;
  /**
   * Overrides the direction taken from `I18nManager`. Intended for tests and previews — the app itself should let
   * the locale drive `I18nManager` so React Native's own logical-property handling stays in sync.
   */
  direction?: Direction;
}

export function ThemeProvider({
  children,
  colorScheme,
  direction,
}: ThemeProviderProps) {
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: colorScheme ? createTheme(colorScheme) : defaultTheme,
      direction: direction ?? (I18nManager.isRTL ? "rtl" : "ltr"),
    }),
    [colorScheme, direction],
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
