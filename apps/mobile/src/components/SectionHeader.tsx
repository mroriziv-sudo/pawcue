import { View } from "react-native";
import { Text, useTheme } from "@pawcue/ui";

/**
 * A section heading, optionally with a value on the trailing edge.
 *
 * The trailing slot is what stops a secondary fact — a duration, a count — from being rendered as a second
 * paragraph underneath the heading. Today previously showed "Your training plan" with "About 3 minutes" beneath
 * it *and* the same duration on the only card below, so the same number appeared twice within 80 points.
 *
 * `flex: 1` on the title and a trailing element that can shrink is what keeps this from truncating badly in
 * Hebrew, where the heading is often longer than its English counterpart.
 */
export function SectionHeader({
  title,
  trailing,
  testID,
}: {
  title: string;
  trailing?: string;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: theme.space[3],
      }}
    >
      <Text variant="h3" style={{ flex: 1 }} testID={testID}>
        {title}
      </Text>
      {trailing ? (
        <Text
          variant="small"
          tone="muted"
          {...(testID ? { testID: `${testID}-trailing` } : {})}
        >
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}
