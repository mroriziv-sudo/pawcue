import { useEffect, useRef, useState } from "react";
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
  const seenKey = useRef(stateKey);
  const lastChildren = useRef<React.ReactNode>(children);
  const [outgoing, setOutgoing] = useState<React.ReactNode>(null);

  // While the key is unchanged, the latest children are what a future change will fade out.
  useEffect(() => {
    if (stateKey === seenKey.current) lastChildren.current = children;
  });

  // Only a key change starts a transition, and only the next key change (or unmount) cuts one short.
  useEffect(() => {
    if (stateKey === seenKey.current) return;
    const previous = lastChildren.current;
    seenKey.current = stateKey;
    lastChildren.current = children;
    setOutgoing(previous);
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
  }, [stateKey]);

  return (
    <View style={style} testID={testID}>
      {outgoing ? (
        // The old state, leaving: faster than the arrival, out of the way of touches at once, and never a second
        // copy of a control to assistive technology.
        <Animated.View
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
          {outgoing}
        </Animated.View>
      ) : null}
      <Animated.View
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
