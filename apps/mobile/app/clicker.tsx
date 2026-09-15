import { Pressable, View } from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Button, Clicker, Reveal, useTheme } from "@pawcue/ui";
import { useClicker } from "../src/hooks/useClicker";
import { useDogStore } from "../src/state/dog-store";
import { useOnboardingStore } from "../src/state/onboarding-store";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { resolveStartupRoute } from "../src/state/startup-route";
import { BackControl } from "../src/components/BackControl";

/** After this many intentional presses the app offers the first lesson (brief §4 Screen 1: "2–3 presses"). */
const PRESSES_BEFORE_PROMPT = 3;

/**
 * The free clicker.
 *
 * No login, no onboarding, no permission prompt: the first thing the app does is work. Everything on this screen
 * is local, so it behaves identically offline. The clicker is the one thing on the page, centred, with the press
 * count as a plain line beneath it — a tool, not a dashboard.
 */
export default function ClickerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { click, pressCount } = useClicker();

  const bootstrapStatus = useBootstrapStore((s) => s.status);
  const dogId = useDogStore((s) => s.dogId);
  const onboardingSkipped = useOnboardingStore((s) => s.skipped);
  const draft = useOnboardingStore((s) => s.draft);

  /**
   * Startup routing lives here, on the entry screen, rather than in the root layout. A `<Redirect>` in the layout
   * replaces the `<Stack>` it returns, which unmounts the navigator the redirect is trying to navigate with.
   */
  const startup = resolveStartupRoute({
    hydrated: bootstrapStatus === "ready",
    dogId,
    onboardingSkipped,
    draft,
  });

  if (startup.kind === "onboarding") return <Redirect href="/onboarding" />;
  if (startup.kind === "onboarding_resume") {
    return <Redirect href="/onboarding/steps" />;
  }

  const showPrompt = pressCount >= PRESSES_BEFORE_PROMPT;
  const canGoBack =
    typeof router.canGoBack === "function" && router.canGoBack();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background.base,
        paddingTop: insets.top + theme.space[2],
        paddingBottom: insets.bottom + theme.space[6],
        paddingHorizontal: theme.screenGutter,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: theme.minTouchTarget,
        }}
      >
        {canGoBack ? (
          <BackControl onPress={() => router.back()} testID="clicker-back" />
        ) : (
          <View />
        )}
        <Pressable
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel={t("settings.title")}
          hitSlop={theme.space[2]}
          testID="open-settings"
          style={({ pressed }) => ({
            minHeight: theme.minTouchTarget,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text variant="body" tone="brand">
            {t("settings.title")}
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          alignItems: "center",
          marginTop: theme.space[6],
          gap: theme.space[2],
        }}
      >
        <Text
          variant="headline"
          align="center"
          accessibilityRole="header"
          testID="clicker-title"
        >
          {t("clicker.freeTitle")}
        </Text>
        <Text variant="body" tone="secondary" align="center">
          {t("clicker.freeSubtitle")}
        </Text>
      </View>

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: theme.space[5],
        }}
      >
        {/* The signature element: squircle, inset highlight, amber ring on press. */}
        <Clicker
          size={220}
          onPress={click}
          /** Spelled out for screen readers: the sound is the whole point, so it must be announced. */
          accessibilityLabel={t("clicker.accessibilityLabel")}
          testID="clicker-button"
        />
        <Text
          variant="secondary"
          tone="secondary"
          align="center"
          tabular
          testID="press-count"
        >
          {t("clicker.pressCount", { count: pressCount })}
        </Text>
      </View>

      {showPrompt ? (
        <Reveal style={{ gap: theme.space[2] }} testID="ready-prompt">
          <Text variant="title" accessibilityRole="header">
            {t("clicker.readyPrompt")}
          </Text>
          <Text variant="body" tone="secondary">
            {t("clicker.readySubtitle")}
          </Text>
          <View style={{ height: theme.space[2] }} />
          <Button
            label={t("clicker.startFirstLesson")}
            /** The Name Game is the free first lesson (brief §9): no account, no plan, no paywall in the way. */
            onPress={() => router.push("/lesson/name_game")}
            testID="start-first-lesson"
          />
        </Reveal>
      ) : null}
    </View>
  );
}
