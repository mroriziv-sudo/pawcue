import { View, type AccessibilityProps, type ViewProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { resolveCardStyle, type CardPadding } from "./styles/card-styles";

export interface CardProps extends Pick<
  AccessibilityProps,
  "accessibilityHint" | "accessibilityLabel"
> {
  children: React.ReactNode;
  emphasis?: "default" | "feature";
  padding?: CardPadding;
  elevated?: boolean;
  /** Supplying `onPress` makes the card a button; without it the card is a plain container. */
  onPress?: () => void;
  style?: ViewProps["style"];
  testID?: string;
}

export function Card({
  children,
  emphasis = "default",
  padding = "comfortable",
  elevated = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CardProps) {
  const theme = useTheme();
  const cardStyle = resolveCardStyle({ emphasis, padding, elevated, theme });

  if (!onPress) {
    /**
     * A non-interactive card with a label is still an accessibility element.
     *
     * It previously accepted `accessibilityLabel` and silently dropped it on this branch, so every screen that
     * described a read-only card — the Progress history rows, most obviously — was writing a name that never
     * reached anyone. An unlabelled group is also read child by child, which is how "Sit" and "Completed" end up
     * announced as two unrelated pieces of text.
     *
     * `accessible` is set only when there is a name to give. Grouping a card that has nothing to say would make
     * its contents *less* navigable, not more.
     */
    return (
      <View
        style={[cardStyle, style]}
        {...(accessibilityLabel
          ? { accessible: true, accessibilityLabel }
          : {})}
        {...(accessibilityHint ? { accessibilityHint } : {})}
        testID={testID}
      >
        {children}
      </View>
    );
  }

  /**
   * An interactive card gets an explicit `button` role and label. The hairline border is far too low-contrast
   * (1.18:1, measured in color.test.ts) to identify a control on its own, so the accessible name is what actually
   * makes it operable — for screen-reader users and as the non-visual half of WCAG 1.4.11.
   */
  return (
    <PressableScale
      scaleToken="card"
      onPress={onPress}
      style={[cardStyle, style].flat().filter(Boolean) as never}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {children}
    </PressableScale>
  );
}
