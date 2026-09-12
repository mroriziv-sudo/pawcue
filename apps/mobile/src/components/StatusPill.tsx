import { View } from "react-native";
import { Text, useTheme } from "@pawcue/ui";

/**
 * The small badge that says what state a thing is in.
 *
 * Every state the app shows — completed, unfinished, prerequisite-locked, premium — was a bare `<Text>` with a
 * `tone`. The word was always present, so it was never a contrast failure, but at a glance the states were
 * interchangeable: same size, same weight, same position, differing only in hue.
 *
 * This gives each state a **glyph and a frame** as well as a word, which is DESIGN_SYSTEM.md's rule ("completion
 * states are never conveyed by color alone — always paired with an icon/shape change") made structural instead of
 * something each screen has to remember.
 *
 * The frame is deliberately drawn in `border.subtle` for every state rather than in the state's own colour. Tinted
 * borders would mean four new colour-on-background pairs to verify, and the frame is doing shape work, not
 * signalling work — the glyph and the word carry the meaning. Text uses the contrast-verified `text.*` roles, never
 * the `status.*` fill colours.
 */

export type StatusTone = "success" | "brand" | "muted";

export function StatusPill({
  label,
  tone = "muted",
  /** A short leading mark. One character: this sits in a caption-sized pill. */
  glyph,
  testID,
}: {
  label: string;
  tone?: StatusTone;
  glyph?: string;
  testID?: string;
}) {
  const theme = useTheme();

  const colour =
    tone === "success"
      ? theme.colors.text.success
      : tone === "brand"
        ? theme.colors.brand.primary
        : theme.colors.text.muted;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space[1],
        paddingVertical: theme.space[1],
        paddingHorizontal: theme.space[3],
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.border.subtle,
      }}
      /**
       * No accessibility props of its own, deliberately.
       *
       * Every card that shows a pill carries the status in its own `accessibilityLabel`, and `Card` makes itself
       * an accessibility element whenever it has one — so the pill is already inside a group that speaks for it,
       * and its text is never announced separately.
       *
       * Marking it `accessibilityElementsHidden` as well would be belt-and-braces, but it also removes the node
       * from the testing tree, which is how this component's own tests stopped being able to see it.
       */
    >
      {glyph ? (
        <Text variant="caption" style={{ color: colour }}>
          {glyph}
        </Text>
      ) : null}
      {/*
        The testID sits on the label, not on the frame around it.

        The frame is layout; the label is the thing that has a language, a writing direction and text content, so
        it is what a test asserting any of those needs to be holding.
      */}
      <Text
        variant="caption"
        style={{ color: colour }}
        {...(testID ? { testID } : {})}
      >
        {label}
      </Text>
    </View>
  );
}
