import { useEffect, useRef } from "react";
import { Animated, View, type DimensionValue } from "react-native";
import { ROW_LEADING_WIDTH, useReducedMotion, useTheme } from "@pawcue/ui";

/**
 * Loading placeholders that hold the layout.
 *
 * A spinner dropped into a scroll view reserves nothing: the moment content arrives, everything below it jumps.
 * A skeleton the shape of the content it stands in for means the page's rhythm is already on screen, and the real
 * elements fade into slots that were always there.
 *
 * Bones sit directly on the paper — there is no card to hold them, because there is no card to hold the content.
 * The breath is opacity only: native-driven, and simply absent under Reduce Motion (static at 80%). No shimmer
 * sweep; a slow breath is calmer.
 */

/** One bone. Width is a fraction of its container or a fixed size; height defaults to a line of secondary text. */
export function SkeletonBone({
  width = "100%",
  height = 14,
  radius,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius ?? theme.radius.field,
        backgroundColor: theme.colors.surface.skeleton,
      }}
    />
  );
}

/**
 * Wraps bones in the shared breath and announces itself as busy — one accessible element, so a screen reader hears
 * "loading" once rather than nothing at all.
 */
export function SkeletonGroup({
  children,
  accessibilityLabel,
  testID,
}: {
  children: React.ReactNode;
  accessibilityLabel: string;
  testID?: string;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 0.8 : 1)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.8);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      testID={testID}
      style={{ opacity, gap: theme.space[6] }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The shape of Today before the plan arrives: a two-line coach line, its subline, the one button, and three
 * trail rows. The dog's bust is local data and renders for real beside it; nothing here stands in for the dog.
 */
export function TodaySkeleton() {
  const theme = useTheme();
  return (
    <>
      <View style={{ gap: theme.space[2] }}>
        <SkeletonBone width="92%" height={26} />
        <SkeletonBone width="60%" height={26} />
        <View style={{ height: theme.space[1] }} />
        <SkeletonBone width="70%" />
      </View>
      <SkeletonBone height={52} radius={theme.radius.control} />
      <View style={{ gap: 0 }}>
        <SkeletonBone width={110} height={12} />
        {[0, 1, 2].map((row) => (
          <View
            key={row}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space[3],
              minHeight: 60,
              paddingVertical: theme.space[3],
            }}
          >
            <View style={{ width: ROW_LEADING_WIDTH, alignItems: "center" }}>
              <SkeletonBone width={24} height={24} radius={12} />
            </View>
            <View style={{ flex: 1, gap: theme.space[1] }}>
              <SkeletonBone width="40%" height={16} />
              <SkeletonBone width="65%" height={12} />
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

/**
 * The shape of the Dog tab's journey before the catalogue arrives: a label and three rows, twice.
 */
export function JourneySkeleton() {
  const theme = useTheme();
  return (
    <>
      {[0, 1].map((group) => (
        <View key={group}>
          <SkeletonBone width={120} height={12} />
          {[0, 1, 2].map((row) => (
            <View
              key={row}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.space[3],
                minHeight: 60,
                paddingVertical: theme.space[3],
              }}
            >
              <View style={{ width: ROW_LEADING_WIDTH, alignItems: "center" }}>
                <SkeletonBone width={24} height={24} radius={12} />
              </View>
              <View style={{ flex: 1, gap: theme.space[1] }}>
                <SkeletonBone width="45%" height={16} />
                <SkeletonBone width="70%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}
