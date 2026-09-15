import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { useReducedMotion } from "../a11y/useReducedMotion";
import { Glyph } from "./Glyph";

export interface RepMarksProps {
  /** Repetitions counted so far. */
  count: number;
  /** The step's target. */
  target: number;
  size?: number;
  /** Describes the count for assistive technology; the marks themselves are decorative. */
  accessibilityLabel: string;
  testID?: string;
}

/**
 * One mark per repetition, filling from the start edge as they are counted.
 *
 * An empty mark is a quiet ring; a counted one is the reward colour with a treat inside — the only place amber
 * appears in a session, because a counted rep is the thing that was earned. The fill springs in (0.6 → 1, the
 * `responsive` spring, no overshoot); under Reduce Motion the mark is simply filled.
 *
 * The row follows the reading direction, so the marks fill right-to-left in Hebrew without any direction logic.
 */
export function RepMarks({
  count,
  target,
  size = 28,
  accessibilityLabel,
  testID,
}: RepMarksProps) {
  const theme = useTheme();
  const safeTarget = Math.max(1, Math.floor(target));
  const safeCount = Math.min(safeTarget, Math.max(0, Math.floor(count)));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round((safeCount / safeTarget) * 100),
      }}
      testID={testID}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: theme.space[2],
        alignItems: "center",
      }}
    >
      {Array.from({ length: safeTarget }, (_, index) => (
        <Mark key={index} filled={index < safeCount} size={size} />
      ))}
    </View>
  );
}

function Mark({ filled, size }: { filled: boolean; size: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(filled ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(filled ? 1 : 0);
      return;
    }
    const { damping, stiffness, mass } = theme.spring.responsive;
    const animation = filled
      ? Animated.spring(progress, {
          toValue: 1,
          damping,
          stiffness,
          mass,
          useNativeDriver: true,
        })
      : Animated.timing(progress, {
          toValue: 0,
          duration: theme.duration.exit,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        });
    animation.start();
    return () => animation.stop();
  }, [
    filled,
    reduceMotion,
    progress,
    theme.spring.responsive,
    theme.duration.exit,
  ]);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: theme.colors.border.separator,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: -2,
          start: -2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.accent.reward,
          alignItems: "center",
          justifyContent: "center",
          opacity: progress,
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.6, 1],
              }),
            },
          ],
        }}
      >
        <Glyph
          name="treat"
          size={Math.round(size * 0.5)}
          color={theme.colors.text.onBrand}
        />
      </Animated.View>
    </View>
  );
}
