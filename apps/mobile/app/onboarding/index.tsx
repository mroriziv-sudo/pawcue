import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { Text, Button, useTheme } from "@pawcue/ui";
import { useOnboardingStore } from "../../src/state/onboarding-store";

/**
 * The welcome screen, and the escape from onboarding.
 *
 * Startup routes a guest with no dog here, which is what the phase asks for. But the product's first
 * non-negotiable is that PawCue works immediately with no account and no setup, so this screen must offer a way
 * straight to the clicker — and that choice is remembered, because being dropped back into a flow you have
 * already declined is worse than never being offered it.
 */
export default function OnboardingWelcomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const skip = useOnboardingStore((s) => s.skip);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        gap: theme.space[4],
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[6],
        paddingHorizontal: theme.screenGutter,
        backgroundColor: theme.colors.background.base,
      }}
      testID="onboarding-welcome"
    >
      <Text variant="h1" testID="welcome-title">
        {t("onboarding.welcomeTitle")}
      </Text>
      <Text variant="body" tone="muted" testID="welcome-body">
        {t("onboarding.welcomeBody")}
      </Text>

      <View style={{ gap: theme.space[2] }}>
        <Button
          label={t("onboarding.welcomeCta")}
          onPress={() => router.push("/onboarding/steps")}
          testID="welcome-start"
        />
        <Pressable
          onPress={() => {
            void skip().then(() => router.replace("/"));
          }}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.welcomeSkip")}
          hitSlop={12}
          testID="welcome-skip"
        >
          <Text variant="small" tone="muted" align="center">
            {t("onboarding.welcomeSkip")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
