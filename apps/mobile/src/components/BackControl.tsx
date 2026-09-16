import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Glyph, Text, useTheme } from "@pawcue/ui";

/**
 * The way back from a pushed screen.
 *
 * The app draws its own headers, so this is the platform's back affordance in the design system's hand: a
 * chevron pointing along the reading direction (mirrored by the icon registry in Hebrew) and the word. A full
 * 44pt target, on the reading edge, and never the only way out — the edge-swipe gesture still works.
 *
 * Without an `onPress` it goes back — and when there is nothing behind it (a screen reached by deep link) it
 * goes to Today instead of doing nothing and warning in development (phase-10-native-acceptance.md, finding 16).
 * A caller with its own idea of "back" (onboarding's step navigation) still passes a handler.
 */
export function BackControl({
  onPress,
  label,
  testID,
}: {
  onPress?: () => void;
  label?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const text = label ?? t("common.cta.back");
  const goBack = () => {
    if (typeof router.canGoBack === "function" && !router.canGoBack()) {
      router.replace("/");
      return;
    }
    router.back();
  };
  return (
    <Pressable
      onPress={onPress ?? goBack}
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
