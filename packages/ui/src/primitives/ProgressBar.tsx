import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export interface ProgressBarProps {
  /** 0–1. Values outside the range are clamped rather than trusted. */
  ratio: number;
  /** Describes the progress for assistive technology; required, because a bare bar announces nothing useful. */
  accessibilityLabel: string;
  testID?: string;
}

/**
 * A thin, non-animated progress indicator.
 *
 * Two deliberate choices:
 *
 *  - **No animation.** A progress bar that slides is a motion effect on a screen whose whole job is to stay calm
 *    while someone is handling a dog, and it would need a Reduce Motion branch to be correct. A bar that simply
 *    redraws needs neither.
 *  - **No numeric text inside.** The bar is decorative reinforcement; the authoritative "Step 2 of 4" is rendered
 *    as real text next to it, so the information survives when the bar cannot be seen.
 *
 * The track is a plain row, so the fill grows from the start edge and mirrors in RTL without any direction logic
 * of its own.
 */
export function ProgressBar({
  ratio,
  accessibilityLabel,
  testID,
}: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      testID={testID}
      style={{
        flexDirection: "row",
        height: 6,
        borderRadius: theme.radius.pill,
        /**
         * A subtle border tone, not Soft Sage.
         *
         * Caught on the simulator: with the brand's secondary green as the track, an empty bar is a solid
         * saturated bar across the full width, which reads as *finished* rather than *not started*. The track has
         * to be quiet enough that the filled portion is the only thing that looks like progress.
         */
        backgroundColor: theme.colors.border.subtle,
        overflow: "hidden",
      }}
    >
      <View
        testID={testID ? `${testID}-fill` : undefined}
        style={{
          width: `${clamped * 100}%`,
          backgroundColor: theme.colors.brand.primary,
          borderRadius: theme.radius.pill,
        }}
      />
    </View>
  );
}
