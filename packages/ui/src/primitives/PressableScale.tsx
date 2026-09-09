import { useCallback, useRef } from "react";
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { useReducedMotion } from "../a11y/useReducedMotion";
import { pressScaleFor, type PressScaleToken } from "../tokens/motion";

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
  /** Which documented press scale to use: clicker 0.96, button 0.97, card 0.985. */
  scaleToken?: PressScaleToken;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}

/**
 * Shared press-compression behaviour for every tappable surface, so the Button, Card and (in Phase 2) the Clicker
 * all feel like the same system rather than three separately-tuned animations.
 *
 * Uses React Native's `Animated` with `useNativeDriver`, which keeps the transform on the UI thread. That matters
 * most for the clicker, where DESIGN_SYSTEM.md puts perceived latency above animation richness — the press must
 * never wait on JS.
 *
 * Under Reduce Motion the scale factor collapses to 1, so the element does not move at all; the pressed *state* is
 * still conveyed by the caller's own styling, so feedback is never removed outright.
 */
export function PressableScale({
  scaleToken = "button",
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const target = pressScaleFor(scaleToken, reduceMotion);

  const animateTo = useCallback(
    (value: number) => {
      Animated.timing(scale, {
        toValue: value,
        duration: theme.duration.fast,
        useNativeDriver: true,
      }).start();
    },
    [scale, theme.duration.fast],
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (target !== 1) animateTo(target);
      onPressIn?.(event);
    },
    [animateTo, target, onPressIn],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      if (target !== 1) animateTo(1);
      onPressOut?.(event);
    },
    [animateTo, target, onPressOut],
  );

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        {...rest}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
