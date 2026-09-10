import { ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme, useDirection } from "@pawcue/ui";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@pawcue/i18n";
import { useSettingsStore } from "../src/state/settings-store";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { CLICK_SOUNDS } from "../src/audio/click-sounds";
import { ensureClicker, playClick } from "../src/audio/clicker-audio";

/**
 * Settings — Phase 2 covers language, sound and haptics.
 *
 * Language is here rather than in onboarding because changing it flips the whole app's layout direction, and this
 * is the screen that can honestly report that a restart is needed instead of showing a half-mirrored layout.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const direction = useDirection();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const {
    language,
    soundEnabled,
    hapticsEnabled,
    pendingDirectionReload,
    clickSoundId,
    setLanguage,
    setSoundEnabled,
    setHapticsEnabled,
    setClickSoundId,
  } = useSettingsStore();
  const { sessionStatus, userId } = useBootstrapStore();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[4],
      }}
      testID="settings-screen"
    >
      <Text variant="h1" testID="settings-title">
        {t("settings.title")}
      </Text>

      {pendingDirectionReload ? (
        <Card padding="compact" testID="restart-notice">
          <Text variant="small" tone="success">
            {t("settings.restartRequired")}
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: theme.space[2] }}>
        <Text variant="h3">{t("settings.language")}</Text>
        {SUPPORTED_LOCALES.map((locale: SupportedLocale) => {
          const selected = locale === language;
          return (
            <Card
              key={locale}
              padding="compact"
              onPress={() => void setLanguage(locale)}
              accessibilityLabel={t(`settings.languageOption.${locale}`)}
              testID={`language-${locale}`}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text variant="body">
                  {t(`settings.languageOption.${locale}`)}
                </Text>
                {/*
                  Selection is a checkmark, not just a colour — the design system forbids colour-only state, and a
                  screen reader gets the same information through the "✓" glyph in the accessible text.
                */}
                <Text variant="body" tone={selected ? "success" : "muted"}>
                  {selected ? "✓" : ""}
                </Text>
              </View>
            </Card>
          );
        })}
      </View>

      <View style={{ gap: theme.space[2] }}>
        <Text variant="h3">{t("settings.sound")}</Text>
        <Card padding="compact">
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text variant="body">{t("clicker.soundEffects")}</Text>
            <Switch
              value={soundEnabled}
              onValueChange={(v) => void setSoundEnabled(v)}
              accessibilityLabel={t("clicker.soundEffects")}
              testID="switch-sound"
            />
          </View>
        </Card>
        <Card padding="compact">
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text variant="body">{t("settings.haptics")}</Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={(v) => void setHapticsEnabled(v)}
              accessibilityLabel={t("settings.haptics")}
              testID="switch-haptics"
            />
          </View>
        </Card>
      </View>

      {/*
        Development-only clicker sound selector, for the QA listening test.

        Gated on __DEV__ so it cannot reach a release build, and deliberately untranslated — translating it would
        imply it is a user-facing feature, which it is not. The final sound is an open product decision; until it
        is made, this exists purely so the three candidates can be compared on real hardware through the same
        preload/playback path the product uses.
      */}
      {__DEV__ ? (
        <View style={{ gap: theme.space[2] }} testID="dev-sound-selector">
          <Text variant="h3">Clicker sound (dev only)</Text>
          <Text variant="caption" tone="muted">
            QA listening test. Not user-facing. Select, then return to the
            clicker and test there — that is the production playback path.
          </Text>
          {CLICK_SOUNDS.map((sound) => {
            const selected = sound.id === clickSoundId;
            return (
              <Card
                key={sound.id}
                padding="compact"
                onPress={() => void setClickSoundId(sound.id)}
                accessibilityLabel={sound.label}
                testID={`click-sound-${sound.id}`}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: theme.space[2],
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{sound.label}</Text>
                    <Text variant="caption" tone="muted">
                      {sound.description}
                    </Text>
                  </View>
                  <Text variant="body" tone={selected ? "success" : "muted"}>
                    {selected ? "✓" : ""}
                  </Text>
                </View>
              </Card>
            );
          })}
          <Button
            label="Preview selected click"
            variant="secondary"
            onPress={() => {
              // Goes through the real engine rather than a one-off player, so a preview cannot sound different
              // from what the clicker screen produces.
              ensureClicker(clickSoundId);
              playClick();
            }}
            testID="preview-click"
          />
        </View>
      ) : null}

      {/*
        Development-only. Gated on __DEV__ so it cannot reach a release build, and present because the foundations
        it reports on (bootstrap, session, direction) are otherwise invisible from the UI.
      */}
      {__DEV__ ? (
        <View style={{ gap: theme.space[2] }} testID="diagnostics">
          <Text variant="h3">{t("settings.diagnostics")}</Text>
          <Card padding="compact">
            <Text variant="caption" tone="muted" testID="diag-session">
              {t("settings.sessionStatus")}: {sessionStatus}
              {userId ? ` · ${userId.slice(0, 8)}…` : ""}
            </Text>
            <Text variant="caption" tone="muted" testID="diag-direction">
              direction: {direction} · language: {language}
            </Text>
          </Card>
        </View>
      ) : null}

      <Button
        label={t("common.cta.close")}
        variant="secondary"
        onPress={() => router.back()}
        testID="close-settings"
      />
    </ScrollView>
  );
}
