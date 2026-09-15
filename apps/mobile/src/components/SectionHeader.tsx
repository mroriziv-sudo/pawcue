import { View } from "react-native";
import { Text, useTheme } from "@pawcue/ui";

/**
 * A section label, optionally with a value on the trailing edge.
 *
 * A signpost, not a headline: 15pt semibold in ink, the same size as the secondary copy beneath it. Space above
 * the section does the separating (see `Section`), so every group no longer shouts at the same volume as the
 * screen's one real headline.
 *
 * The trailing slot is what stops a secondary fact — a duration, a count — from being rendered as a second
 * paragraph underneath the label. `flex: 1` on the title and a trailing element that can shrink is what keeps
 * this from truncating badly in Hebrew, where the label is often longer than its English counterpart.
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
      <Text
        variant="sectionLabel"
        style={{ flex: 1 }}
        accessibilityRole="header"
        testID={testID}
      >
        {title}
      </Text>
      {trailing ? (
        <Text
          variant="secondary"
          tone="secondary"
          {...(testID ? { testID: `${testID}-trailing` } : {})}
        >
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}
