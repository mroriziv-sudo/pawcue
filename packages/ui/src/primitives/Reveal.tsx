import { useEffect, useRef } from "react";
import { Animated, Easing, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { useReducedMotion } from "../a11y/useReducedMotion";

export interface RevealProps {
  children: React.ReactNode;
  /** Stagger, in ms, for a list of reveals. */
  delay?: number;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Content arriving: a short fade with a small rise.
 *
 * Give it a `key` that changes when the content does — a step id, a state name — and the new content is
 * introduced rather than swapped in. Under Reduce Motion the rise is dropped and only the fade remains, which is
 * the token layer's documented substitution (`reducedMotionAlternative`), never a jump cut.
 *
 * Opacity and translate only, so it runs on the native driver.
 */
export function Reveal({ children, delay = 0, style, testID }: RevealProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const [x1, y1, x2, y2] = theme.easing.decelerate;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? theme.duration.fast : theme.duration.base,
      delay,
      easing: Easing.bezier(x1, y1, x2, y2),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, delay, theme.duration, theme.easing]);

  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: reduceMotion
                ? 0
                : progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [theme.space[3], 0],
                  }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
