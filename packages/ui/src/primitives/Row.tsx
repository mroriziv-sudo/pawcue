import { Pressable, View, type AccessibilityProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";
import type { TextTone } from "./styles/text-styles";

/** The 28pt leading column every row shares, so text after a mark lines up from row to row. */
export const ROW_LEADING_WIDTH = 28;

export interface RowProps extends Pick<
  AccessibilityProps,
  "accessibilityLabel" | "accessibilityHint" | "accessibilityState"
> {
  /** The row's first line. */
  title?: string | undefined;
  /** The row's second line: the meta sentence. */
  meta?: string | undefined;
  titleTone?: TextTone;
  metaTone?: TextTone;
  /** A mark in the leading column — a trail mark, a check, a lock. Decorative; the row carries the name. */
  leading?: React.ReactNode;
  /** A control or a mark on the trailing edge — a chevron, a check, a value. */
  trailing?: React.ReactNode;
  /**
   * The trailing node is a real control (a Switch) that must stay reachable by assistive technology. The row then
   * neither groups itself nor hides the slot; the control carries its own label.
   */
  trailingInteractive?: boolean;
  /**
   * Draws the trail's line through the leading column, from the top of the row to the mark and from the mark to
   * the bottom. What joins one plan activity to the next.
   */
  connector?: { above: boolean; below: boolean };
  /** The inset hairline beneath the row. Off for the last row of a group. */
  separator?: boolean;
  /** Supplying `onPress` makes the row a button; without it the row is one read-only announcement. */
  onPress?: () => void;
  disabled?: boolean;
  /** Replaces title/meta with arbitrary content while keeping the column, padding and separator. */
  children?: React.ReactNode;
  testID?: string;
}

/**
 * A list row — the field-notebook system's list vocabulary.
 *
 * Full width, an inset hairline beneath, tappable across the whole width, and one fixed leading column so a
 * mark and the text after it share edges with every other row on the screen. There is no card: the page is the
 * container. A pressed row darkens rather than scales, which is what a grouped list does on the platform.
 *
 * Read-only rows with a label become one accessibility element, so "Sit" and "Done at 10:42" are announced as
 * one sentence rather than two unrelated pieces of text.
 */
export function Row({
  title,
  meta,
  titleTone = "primary",
  metaTone = "secondary",
  leading,
  trailing,
  trailingInteractive = false,
  connector,
  separator = true,
  onPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  children,
  testID,
}: RowProps) {
  const theme = useTheme();
  const hasLeading = leading != null || connector != null;

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space[3],
        minHeight: 60,
        paddingVertical: theme.space[3],
      }}
    >
      {hasLeading ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: ROW_LEADING_WIDTH,
            alignSelf: "stretch",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {connector ? (
            <>
              <View
                style={{
                  position: "absolute",
                  top: -theme.space[3],
                  bottom: "50%",
                  width: 2,
                  backgroundColor: connector.above
                    ? theme.colors.border.separator
                    : "transparent",
                }}
              />
              <View
                style={{
                  position: "absolute",
                  top: "50%",
                  bottom: -theme.space[3],
                  width: 2,
                  backgroundColor: connector.below
                    ? theme.colors.border.separator
                    : "transparent",
                }}
              />
            </>
          ) : null}
          {leading}
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        {children ?? (
          <>
            {title ? (
              <Text variant="bodyStrong" tone={titleTone}>
                {title}
              </Text>
            ) : null}
            {meta ? (
              <Text variant="secondary" tone={metaTone}>
                {meta}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {trailing ? (
        <View
          {...(trailingInteractive
            ? {}
            : {
                accessibilityElementsHidden: true,
                importantForAccessibility: "no-hide-descendants" as const,
              })}
          style={{ alignItems: "center", justifyContent: "center" }}
        >
          {trailing}
        </View>
      ) : null}
    </View>
  );

  const hairline = separator ? (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 0,
        start: hasLeading ? ROW_LEADING_WIDTH + theme.space[3] : 0,
        end: 0,
        height: theme.border.hairline,
        backgroundColor: theme.colors.border.separator,
      }}
    />
  ) : null;

  if (!onPress) {
    return (
      <View
        style={{ position: "relative" }}
        {...(accessibilityLabel && !trailingInteractive
          ? { accessible: true, accessibilityLabel }
          : {})}
        {...(accessibilityHint ? { accessibilityHint } : {})}
        testID={testID}
      >
        {content}
        {hairline}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }}
      testID={testID}
      style={({ pressed }) => ({
        position: "relative",
        // The row bleeds to the screen edge when pressed, the way a grouped list highlights, so the gutter is
        // undone here and restored inside.
        marginHorizontal: -theme.screenGutter,
        paddingHorizontal: theme.screenGutter,
        backgroundColor: pressed ? theme.colors.surface.pressed : "transparent",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      {content}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 0,
          start:
            theme.screenGutter +
            (hasLeading ? ROW_LEADING_WIDTH + theme.space[3] : 0),
          end: theme.screenGutter,
          height: separator ? theme.border.hairline : 0,
          backgroundColor: theme.colors.border.separator,
        }}
      />
    </Pressable>
  );
}
