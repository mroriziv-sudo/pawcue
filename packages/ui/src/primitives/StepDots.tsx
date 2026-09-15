import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export interface StepDotsProps {
  /** How many steps there are. */
  total: number;
  /** The step in progress, 1-based. Steps before it are done; steps after it are still to come. */
  current: number;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * The session's step trail — one segment per step, so the structure of the session is visible, not only how far
 * through it the user is. A 4-step lesson looks like four things; a thin bar at 25% looks like nothing much.
 *
 * Done steps are filled evergreen, the current one is an evergreen outline (in progress, not yet earned), and
 * the rest are the quiet separator. Amber is not used here: progress through steps is not a reward. The row
 * follows the reading direction (`flexDirection: "row"` mirrors under RTL), which is the same decision the
 * mirrored `nav-progress` glyph records: progress through time reads along the line.
 */
export function StepDots({
  total,
  current,
  accessibilityLabel,
  testID,
}: StepDotsProps) {
  const theme = useTheme();
  const safeTotal = Math.max(1, Math.floor(total));
  const safeCurrent = Math.min(safeTotal, Math.max(1, Math.floor(current)));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      // Reported as a percentage, the same convention as ProgressBar and ProgressRing, so every progress control in
      // the app announces the same way.
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(((safeCurrent - 1) / safeTotal) * 100),
      }}
      testID={testID}
      style={{ flexDirection: "row", gap: theme.space[1] }}
    >
      {Array.from({ length: safeTotal }, (_, index) => {
        const step = index + 1;
        const state =
          step < safeCurrent
            ? "done"
            : step === safeCurrent
              ? "current"
              : "next";
        return (
          <View
            key={step}
            style={{
              flex: 1,
              height: 6,
              borderRadius: theme.radius.pill,
              borderWidth: state === "current" ? 1.5 : 0,
              borderColor: theme.colors.brand.primary,
              backgroundColor:
                state === "done"
                  ? theme.colors.brand.primary
                  : state === "current"
                    ? theme.colors.background.base
                    : theme.colors.border.separator,
            }}
          />
        );
      })}
    </View>
  );
}
