import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";
import { Glyph } from "./Glyph";

/**
 * Where a thing is on its route.
 *
 *  - `next`: the one to do now — an evergreen ring with its number.
 *  - `later`: still to come — a quiet ring with its number.
 *  - `current`: the step in progress — an evergreen disc with its number.
 *  - `done`: finished — the completed disc with a check.
 *  - `locked`: not yet available — a quiet ring with a lock.
 *  - `paused`: begun and set down — an evergreen ring with a pause mark.
 *
 * Every state differs in shape or mark, never in colour alone; the row around it carries the words.
 */
export type TrailState =
  "next" | "later" | "current" | "done" | "locked" | "paused";

export interface TrailMarkProps {
  state: TrailState;
  /** The position on the route, shown inside `next`, `later` and `current`. */
  label?: string;
  size?: number;
  testID?: string;
}

/**
 * The trail's mark: a 24pt circle that sits in a row's leading column and is joined to its neighbours by the
 * row's connector. The one structural motif in the product — it replaces cards, rings and dots for progress.
 */
export function TrailMark({ state, label, size = 24, testID }: TrailMarkProps) {
  const theme = useTheme();
  const ringWidth = 2;

  const ringColor =
    state === "next" || state === "paused"
      ? theme.colors.brand.primary
      : theme.colors.border.separator;
  const filled = state === "done" || state === "current";
  const fill =
    state === "done"
      ? theme.colors.status.completed
      : state === "current"
        ? theme.colors.brand.primary
        : "transparent";

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: filled ? 0 : ringWidth,
        borderColor: ringColor,
        backgroundColor: fill,
        alignItems: "center",
        justifyContent: "center",
        // The paper behind the mark hides the connector line passing under it.
        ...(filled ? {} : { overflow: "hidden" }),
      }}
    >
      {!filled ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            start: 0,
            end: 0,
            bottom: 0,
            backgroundColor: theme.colors.background.base,
          }}
        />
      ) : null}
      {state === "done" ? (
        <Glyph
          name="check"
          size={Math.round(size * 0.6)}
          color={theme.colors.text.onBrand}
        />
      ) : state === "locked" ? (
        <Glyph
          name="lock"
          size={Math.round(size * 0.55)}
          color={theme.colors.text.secondary}
        />
      ) : state === "paused" ? (
        <Glyph
          name="pause"
          size={Math.round(size * 0.5)}
          color={theme.colors.brand.primary}
        />
      ) : label ? (
        <Text
          variant="caption"
          tone={
            state === "current"
              ? "onBrand"
              : state === "next"
                ? "brand"
                : "secondary"
          }
          align="center"
          tabular
          style={{ fontWeight: "600", lineHeight: size - (filled ? 0 : 4) }}
          maxFontSizeMultiplier={1.2}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
