import { Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Glyph, Text, useTheme } from "@pawcue/ui";

/**
 * The way back from a pushed screen.
 *
 * The app draws its own headers, so this is the platform's back affordance in the design system's hand: a
 * chevron pointing along the reading direction (mirrored by the icon registry in Hebrew) and the word. A full
 * 44pt target, on the reading edge, and never the only way out — the edge-swipe gesture still works.
 */
export function BackControl({
  onPress,
  label,
  testID,
}: {
  onPress: () => void;
  label?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const text = label ?? t("common.cta.back");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={theme.space[2]}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        minHeight: theme.minTouchTarget,
        // Pulls the chevron onto the gutter edge so the label's text aligns with the screen's content.
        marginStart: -theme.space[1],
        paddingEnd: theme.space[2],
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Glyph
        name="chevron-start"
        size={22}
        color={theme.colors.brand.primary}
      />
      <Text variant="body" tone="brand">
        {text}
      </Text>
    </Pressable>
  );
}
