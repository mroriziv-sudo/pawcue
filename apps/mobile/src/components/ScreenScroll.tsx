import { ScrollView, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@pawcue/ui";

/**
 * The standard scrolling screen.
 *
 * Extracted because every destination was re-deriving the same three measurements by hand and arriving at
 * different answers: `insets.top + space[4]` on one screen and `+ space[5]` on the next, a bottom pad that
 * respected the home indicator on some and not others, section gaps of 16 beside gaps of 20. None of that was a
 * decision — it was drift — and it is exactly the kind of inconsistency a user reads as "unfinished" without ever
 * being able to name.
 *
 * One component means the page rhythm is stated once. A screen that needs something different says so through a
 * prop rather than by rebuilding the scaffold.
 */
export function ScreenScroll({
  children,
  /** Centres content vertically. For short, terminal screens — completion, an error, an empty result. */
  center = false,
  gap,
  testID,
  ...rest
}: {
  children: React.ReactNode;
  center?: boolean;
  gap?: number;
  testID?: string;
} & Pick<ViewProps, "accessibilityLabel">) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        // Grows to fill so `center` has something to centre within; otherwise identical.
        flexGrow: center ? 1 : undefined,
        justifyContent: center ? "center" : undefined,
        paddingTop: insets.top + theme.space[5],
        // The home indicator is part of the safe area, not a constant — a fixed bottom pad clips on some devices
        // and floats on others.
        paddingBottom: insets.bottom + theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: gap ?? theme.space[5],
      }}
      testID={testID}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/**
 * A group of related rows under one heading.
 *
 * The grouping is the point, not the heading: a section heading governs everything until the next one, and Phase 4
 * shipped a bug where two navigation cards sat under a "Language" heading and were read as language options. This
 * makes the boundary explicit rather than implied by whatever happens to be rendered next.
 */
export function Section({
  children,
  gap,
}: {
  children: React.ReactNode;
  gap?: number;
}) {
  const theme = useTheme();
  return <View style={{ gap: gap ?? theme.space[2] }}>{children}</View>;
}
