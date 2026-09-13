import { Linking, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme, useDirection } from "@pawcue/ui";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@pawcue/i18n";
import { useSettingsStore } from "../src/state/settings-store";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useDogStore } from "../src/state/dog-store";
import { CLICK_SOUNDS } from "../src/audio/click-sounds";
import { ensureClicker, playClick } from "../src/audio/clicker-audio";
import { BillingSection } from "../src/components/BillingSection";
import { DevBillingPanel } from "../src/components/DevBillingPanel";
import { ScreenScroll, Section } from "../src/components/ScreenScroll";
import { SectionHeader } from "../src/components/SectionHeader";
import { env } from "../src/lib/env";

/**
 * Settings — Phase 2 covers language, sound and haptics.
 *
 * Language is here rather than in onboarding because changing it flips the whole app's layout direction, and this
 * is the screen that can honestly report that a restart is needed instead of showing a half-mirrored layout.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const direction = useDirection();
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
  const dog = useDogStore((s) => s.dog);
  const dogId = useDogStore((s) => s.dogId);

  /**
   * Named after the dog once it is loaded.
   *
   * "Edit profile" does not read as "my dog" to someone looking for their dog. The name is the thing they are
   * actually looking for, so it is what the row says as soon as it is known.
   */
  const dogProfileLabel = dog?.name
    ? t("dogProfile.title", { name: dog.name })
    : t("dogProfile.edit");

  return (
    <ScreenScroll testID="settings-screen">
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

      {/*
        The dog comes first, and each group carries its own heading.

        These two cards were previously rendered between the language options and the Sound heading with no
        heading of their own. A section heading governs everything until the next one, so they read as two more
        language choices — which is why the profile was reported as unreachable even though the route existed.
      */}
      {dogId ? (
        <Section>
          <SectionHeader title={t("settings.dogSection")} />
          <Card
            padding="compact"
            onPress={() => router.push("/dog-profile")}
            accessibilityLabel={dogProfileLabel}
            testID="open-dog-profile"
          >
            <Text variant="body">{dogProfileLabel}</Text>
          </Card>
        </Section>
      ) : null}

      <Section>
        <SectionHeader title={t("settings.accountSection")} />
        <Card
          padding="compact"
          onPress={() => router.push("/account")}
          accessibilityLabel={t("account.title")}
          testID="open-account"
        >
          <Text variant="body">{t("account.title")}</Text>
        </Card>
      </Section>

      <BillingSection />

      <Section>
        <SectionHeader title={t("settings.language")} />
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
      </Section>

      <Section>
        <SectionHeader title={t("settings.sound")} />
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
      </Section>

      {/*
        Legal links, shown only when the build carries real URLs.

        The paywall is where the store requires them and where it says "not set up" when they are absent. Here
        they are a convenience for a user looking for the policy outside a purchase, so an unconfigured build
        simply omits the section rather than offering two dead links.
      */}
      {env.termsUrl || env.privacyUrl ? (
        <Section>
          <SectionHeader title={t("settings.legalSection")} />
          {env.termsUrl ? (
            <Card
              padding="compact"
              onPress={() => void Linking.openURL(env.termsUrl ?? "")}
              accessibilityLabel={t("settings.termsOfUse")}
              testID="open-terms"
            >
              <Text variant="body">{t("settings.termsOfUse")}</Text>
            </Card>
          ) : null}
          {env.privacyUrl ? (
            <Card
              padding="compact"
              onPress={() => void Linking.openURL(env.privacyUrl ?? "")}
              accessibilityLabel={t("settings.privacyPolicy")}
              testID="open-privacy"
            >
              <Text variant="body">{t("settings.privacyPolicy")}</Text>
            </Card>
          ) : null}
        </Section>
      ) : null}

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
        Development-only entitlement simulator. Its own `__DEV__` gate lives inside the component, so the guard
        holds even if this block is ever moved.
      */}
      <DevBillingPanel />

      {/*
        Development-only. Gated on __DEV__ so it cannot reach a release build, and present because the foundations
        it reports on (bootstrap, session, direction) are otherwise invisible from the UI.
      */}
      {__DEV__ ? (
        <View style={{ gap: theme.space[2] }} testID="diagnostics">
          <Text variant="h3">{t("settings.diagnostics")}</Text>
          <Card
            padding="compact"
            onPress={() => router.push("/dev-plan")}
            accessibilityLabel="Plan inspector"
            testID="open-dev-plan"
          >
            <Text variant="body">Plan inspector (dev only)</Text>
          </Card>
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
    </ScreenScroll>
  );
}
