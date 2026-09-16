import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Animated, Easing, View, type ViewStyle } from "react-native";
import { useReducedMotion, useTheme } from "@pawcue/ui";

/**
 * A change of state in place.
 *
 * Give it a `stateKey` that changes when the content does — a breed, an expression, a photo, a count, whether a
 * button is primary — and the outgoing content fades out beneath the incoming one, which arrives from 0.96 on the
 * `responsive` spring (no overshoot) instead of swapping in a frame. Nothing in the real world appears from
 * nothing, so nothing here starts from zero scale. Both layers are the same box, so the layout never jumps.
 *
 * The outgoing content is the very instance that was on screen, moved to the fading layer, never a fresh copy:
 * a re-mounted `Svg` draws nothing on its first frame, so the copy used to blank the dog for a frame at every
 * change (found on the motion pass, phase-11-the-dog-at-work.md). The layers are keyed by state so React keeps
 * the old one, and the incoming opacity is set before the first paint, so the new state never flashes at full
 * strength before its fade.
 *
 * Opacity and transform only, on the native driver. Under Reduce Motion the scale and rise are dropped and only
 * the fade remains, at the fast duration.
 */
export function Crossfade({
  stateKey,
  children,
  style,
  /** How far the incoming content rises from, in points. Zero for a pure cross-fade. */
  rise = 0,
  testID,
}: {
  stateKey: string;
  children: React.ReactNode;
  style?: ViewStyle;
  rise?: number;
  testID?: string;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const lastChildren = useRef<React.ReactNode>(children);
  const [currentKey, setCurrentKey] = useState(stateKey);
  const [outgoing, setOutgoing] = useState<{
    key: string;
    node: React.ReactNode;
  } | null>(null);

  // A key change is answered in the same render: the previous content becomes the outgoing layer before anything
  // commits, so its instance is kept rather than unmounted and mounted again.
  if (currentKey !== stateKey) {
    setOutgoing({ key: currentKey, node: lastChildren.current });
    setCurrentKey(stateKey);
  }

  // While the key is unchanged, the latest children are what a future change will fade out.
  useEffect(() => {
    if (stateKey === currentKey) lastChildren.current = children;
  });

  // The transition starts before the first paint of the new state, and only the next change or unmount cuts one
  // short.
  useLayoutEffect(() => {
    if (!outgoing) return;
    progress.setValue(0);
    const animation = reduceMotion
      ? Animated.timing(progress, {
          toValue: 1,
          duration: theme.duration.fast,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      : Animated.spring(progress, {
          toValue: 1,
          ...theme.spring.responsive,
          useNativeDriver: true,
        });
    animation.start(({ finished }) => {
      if (finished) setOutgoing(null);
    });
    // The outgoing layer is gone by the time any spring has settled, whether or not the callback fires.
    const clear = setTimeout(() => setOutgoing(null), 450);
    return () => {
      animation.stop();
      clearTimeout(clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  return (
    <View style={style} testID={testID}>
      {outgoing ? (
        // The old state, leaving: faster than the arrival, out of the way of touches at once, and never a second
        // copy of a control to assistive technology.
        <Animated.View
          key={outgoing.key}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            top: 0,
            start: 0,
            end: 0,
            bottom: 0,
            opacity: progress.interpolate({
              inputRange: [0, 0.6, 1],
              outputRange: [1, 0, 0],
            }),
          }}
        >
          {outgoing.node}
        </Animated.View>
      ) : null}
      <Animated.View
        key={currentKey}
        style={{
          opacity: progress,
          transform: reduceMotion
            ? []
            : [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1],
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [rise, 0],
                  }),
                },
              ],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
