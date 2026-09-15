import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Button, Reveal, useTheme } from "@pawcue/ui";
import { useOnboardingStore } from "../../src/state/onboarding-store";
import { DogAvatar } from "../../src/components/DogAvatar";

/**
 * The welcome screen, and the escape from onboarding.
 *
 * Startup routes a guest with no dog here. But the product's first non-negotiable is that PawCue works
 * immediately with no account and no setup, so this screen must offer a way straight to the clicker — and that
 * choice is remembered, because being dropped back into a flow you have already declined is worse than never
 * being offered it.
 *
 * The first thing on screen is a dog, at scene size, because that is what the app is about. Then one headline,
 * one sentence, and the way in. No feature bullets, no floating tiles: the dog and the sentence are the pitch.
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
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[6],
        paddingHorizontal: theme.screenGutter,
        backgroundColor: theme.colors.background.base,
      }}
      testID="onboarding-welcome"
    >
      <Text variant="bodyStrong" tone="brand">
        {t("common.appName")}
      </Text>

      <View style={{ flex: 1, justifyContent: "center", gap: theme.space[8] }}>
        <Reveal>
          <View style={{ alignItems: "center" }}>
            <DogAvatar breed={null} size={220} pose="sit" />
          </View>
        </Reveal>

        <Reveal delay={80} style={{ gap: theme.space[3] }}>
          <Text
            variant="headline"
            accessibilityRole="header"
            testID="welcome-title"
          >
            {t("onboarding.welcomeTitle")}
          </Text>
          <Text variant="body" tone="secondary" testID="welcome-body">
            {t("onboarding.welcomeBody")}
          </Text>
        </Reveal>
      </View>

      <View style={{ gap: theme.space[2] }}>
        <Button
          label={t("onboarding.welcomeCta")}
          onPress={() => router.push("/onboarding/steps")}
          testID="welcome-start"
        />
        <Button
          label={t("onboarding.welcomeSkip")}
          variant="tertiary"
          onPress={() => {
            void skip().then(() => router.replace("/"));
          }}
          testID="welcome-skip"
        />
      </View>
    </View>
  );
}
