import { useCallback, useRef } from "react";
import { Animated, Easing, View, type AccessibilityProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { useReducedMotion } from "../a11y/useReducedMotion";
import { CLICKER_CORNER_RATIO } from "../tokens/radius";
import { PressableScale } from "./PressableScale";
import { Glyph } from "./Glyph";

export interface ClickerProps extends Pick<
  AccessibilityProps,
  "accessibilityLabel" | "accessibilityHint"
> {
  onPress: () => void;
  /** Outer size. 220 on the clicker screen, ~120 inside a training step, ~88 beside a rep counter. */
  size?: number;
  testID?: string;
}

/**
 * The clicker — the product's signature element (DESIGN_SYSTEM.md §The clicker).
 *
 * A Deep Evergreen squircle — flat ink, no highlight — with the product mark. On press it compresses (the 0.96
 * token, via `PressableScale`), the caller's handler fires — audio first, always — and then a ring expands
 * outward and fades. The ring starts *after* `onPress` returns, so no visual work sits in front of playback;
 * perceived latency is this component's whole budget.
 *
 * Under Reduce Motion the compression is already cancelled by `PressableScale`, and the ring is simply not
 * started: the sound and the haptic are the feedback, and they are not motion.
 */
export function Clicker({
  onPress,
  size = 220,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ClickerProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const ring = useRef(new Animated.Value(0)).current;

  const handlePress = useCallback(() => {
    onPress();
    if (reduceMotion) return;
    ring.setValue(0);
    Animated.timing(ring, {
      toValue: 1,
      duration: theme.duration.state + 20,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [onPress, reduceMotion, ring, theme.duration.state]);

  const radius = Math.round(size * CLICKER_CORNER_RATIO);

  return (
    <View style={{ width: size, height: size }}>
      {/* The outward ring. Behind the surface, so it reads as a pulse leaving the clicker rather than covering it. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          start: 0,
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: 2,
          // Amber: the click is the promise of a treat.
          borderColor: theme.colors.accent.reward,
          opacity: ring.interpolate({
            inputRange: [0, 0.15, 1],
            outputRange: [0, 0.8, 0],
          }),
          transform: [
            {
              scale: ring.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.18],
              }),
            },
          ],
        }}
      />
      <PressableScale
        scaleToken="clicker"
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: theme.colors.brand.primary,
          alignItems: "center",
          justifyContent: "center",
          ...theme.shadow.card,
        }}
      >
        {/* Deliberately not mirrored in RTL — see icon-mirroring.ts. */}
        <Glyph
          name="clicker-glyph"
          size={Math.round(size * 0.36)}
          color={theme.colors.text.onBrand}
          fixed
        />
      </PressableScale>
    </View>
  );
}
