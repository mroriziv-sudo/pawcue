import { View, Pressable } from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Button, PressableScale, useTheme } from "@pawcue/ui";
import { useClicker } from "../src/hooks/useClicker";
import { useDogStore } from "../src/state/dog-store";
import { useOnboardingStore } from "../src/state/onboarding-store";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { resolveStartupRoute } from "../src/state/startup-route";

/** After this many intentional presses the app offers the first lesson (brief §4 Screen 1: "2–3 presses"). */
const PRESSES_BEFORE_PROMPT = 3;

/**
 * Screen 1 — the free clicker.
 *
 * No login, no onboarding, no permission prompt: the first thing the app does is work. Everything on this screen
 * is local, so it behaves identically offline.
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
   * Startup routing lives here, on the entry screen, rather than in the root layout.
   *
   * A `<Redirect>` in the layout replaces the `<Stack>` it returns, which unmounts the navigator the redirect is
   * trying to navigate with — the result is an infinite render loop ("Maximum update depth exceeded"), which is
   * exactly what the first simulator run produced. Redirecting from a screen keeps the navigator mounted.
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

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background.base,
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[6],
        paddingHorizontal: theme.screenGutter,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <Pressable
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel={t("settings.title")}
          hitSlop={12}
          testID="open-settings"
        >
          <Text variant="small" tone="muted">
            {t("settings.title")}
          </Text>
        </Pressable>
      </View>

      <View style={{ alignItems: "center", marginTop: theme.space[6] }}>
        <Text variant="h1" align="center" testID="clicker-title">
          {t("clicker.freeTitle")}
        </Text>
        <View style={{ height: theme.space[3] }} />
        <Text variant="body" tone="muted" align="center">
          {t("clicker.freeSubtitle")}
        </Text>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <PressableScale
          scaleToken="clicker"
          onPress={click}
          accessibilityRole="button"
          /** Spelled out for screen readers: the sound is the whole point, so it must be announced. */
          accessibilityLabel={t("clicker.accessibilityLabel")}
          testID="clicker-button"
          style={{
            width: 220,
            height: 220,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.brand.primary,
            alignItems: "center",
            justifyContent: "center",
            ...theme.shadow.card,
          }}
        >
          {/* Minimal clicker glyph. Deliberately not mirrored in RTL — see icon-mirroring.ts. */}
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: theme.radius.pill,
              borderWidth: 3,
              borderColor: theme.colors.text.onBrand,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.text.onBrand,
              }}
            />
          </View>
        </PressableScale>

        <View style={{ height: theme.space[4] }} />
        <Text variant="caption" tone="muted" testID="press-count">
          {String(pressCount)}
        </Text>
      </View>

      {showPrompt ? (
        <View testID="ready-prompt">
          <Text variant="h3" align="center">
            {t("clicker.readyPrompt")}
          </Text>
          <View style={{ height: theme.space[2] }} />
          <Text variant="body" tone="muted" align="center">
            {t("clicker.readySubtitle")}
          </Text>
          <View style={{ height: theme.space[4] }} />
          <Button
            label={t("clicker.startFirstLesson")}
            /** The Name Game is the free first lesson (brief §9): no account, no plan, no paywall in the way. */
            onPress={() => router.push("/lesson/name_game")}
            testID="start-first-lesson"
          />
        </View>
      ) : null}
    </View>
  );
}
