import { useState } from "react";
import { Linking, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Button, Glyph, Row, useTheme, useDirection } from "@pawcue/ui";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@pawcue/i18n";
import { useSettingsStore } from "../src/state/settings-store";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useDogStore } from "../src/state/dog-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { syncPendingSessions } from "../src/sync/session-sync";
import { CLICK_SOUNDS } from "../src/audio/click-sounds";
import { ensureClicker, playClick } from "../src/audio/clicker-audio";
import { BillingSection } from "../src/components/BillingSection";
import { DevBillingPanel } from "../src/components/DevBillingPanel";
import { ScreenScroll, Section } from "../src/components/ScreenScroll";
import { SectionHeader } from "../src/components/SectionHeader";
import { BackControl } from "../src/components/BackControl";
import { env } from "../src/lib/env";

/**
 * Settings — language, sound, haptics, account, subscription, legal.
 *
 * A grouped list on the paper: every option is a row, every group has a label, and nothing is boxed. Language is
 * here rather than in onboarding because changing it flips the whole app's layout direction, and this is the
 * screen that can honestly report that a restart is needed instead of showing a half-mirrored layout.
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
  const pendingSync = useTrainingLogStore((s) => s.completed).filter(
    (item) => !item.syncedToServer,
  );
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  /**
   * Named after the dog once it is loaded. "Edit profile" does not read as "my dog" to someone looking for their
   * dog; the name is the thing they are actually looking for.
   */
  const dogProfileLabel = dog?.name
    ? t("dogProfile.title", { name: dog.name })
    : t("dogProfile.edit");

  const chevron = (
    <Glyph name="chevron-end" size={20} color={theme.colors.text.secondary} />
  );

  return (
    <ScreenScroll testID="settings-screen" gap={theme.space[8]}>
      <View style={{ gap: theme.space[4] }}>
        <BackControl testID="close-settings" />
        <Text
          variant="headline"
          accessibilityRole="header"
          testID="settings-title"
        >
          {t("settings.title")}
        </Text>
        {pendingDirectionReload ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space[2],
            }}
            accessibilityRole="alert"
            testID="restart-notice"
          >
            <Glyph name="alert" size={16} color={theme.colors.text.completed} />
            <Text variant="secondary" tone="completed" style={{ flex: 1 }}>
              {t("settings.restartRequired")}
            </Text>
          </View>
        ) : null}
      </View>

      {/* The dog first, under its own label, so it never reads as a language option. */}
      {dogId ? (
        <Section>
          <SectionHeader title={t("settings.dogSection")} />
          <Row
            title={dogProfileLabel}
            trailing={chevron}
            separator={false}
            onPress={() => router.push("/dog-profile")}
            accessibilityLabel={dogProfileLabel}
            testID="open-dog-profile"
          />
        </Section>
      ) : null}

      <Section>
        <SectionHeader title={t("settings.accountSection")} />
        <Row
          title={t("account.title")}
          trailing={chevron}
          separator={dogId !== null}
          onPress={() => router.push("/account")}
          accessibilityLabel={t("account.title")}
          testID="open-account"
        />
        {/*
          Sync status, shown plainly. A user who trained offline should be able to see that their sessions are
          safe and not yet uploaded, rather than having to trust that something invisible is working.

          No leading column: no other row in this list has one, and rows in one list share edges
          (phase-10-native-acceptance.md, finding 7). The done mark sits on the trailing edge, where this list
          already puts a check; a pending count carries its own control there instead.
        */}
        {dogId ? (
          <Row
            title={
              pendingSync.length === 0
                ? t("dogProfile.syncedAll")
                : t("dogProfile.syncPending", { count: pendingSync.length })
            }
            meta={syncMessage ?? undefined}
            separator={false}
            {...(pendingSync.length > 0
              ? {
                  onPress: () => {
                    void syncPendingSessions(dogId).then((outcome) => {
                      setSyncMessage(
                        outcome.status === "synced"
                          ? t("dogProfile.syncedAll")
                          : t("dogProfile.syncFailed"),
                      );
                    });
                  },
                  trailing: (
                    <Text variant="body" tone="brand">
                      {t("dogProfile.syncNow")}
                    </Text>
                  ),
                }
              : {
                  trailing: (
                    <Glyph
                      name="check"
                      size={20}
                      color={theme.colors.text.completed}
                    />
                  ),
                })}
            accessibilityLabel={
              pendingSync.length === 0
                ? t("dogProfile.syncedAll")
                : t("dogProfile.syncPending", { count: pendingSync.length })
            }
            accessibilityHint={
              pendingSync.length > 0 ? t("dogProfile.syncNow") : undefined
            }
            testID="sync-status"
          />
        ) : null}
      </Section>

      <BillingSection />

      <Section>
        <SectionHeader title={t("settings.language")} />
        {SUPPORTED_LOCALES.map((locale: SupportedLocale, index) => {
          const selected = locale === language;
          return (
            <Row
              key={locale}
              title={t(`settings.languageOption.${locale}`)}
              trailing={
                selected ? (
                  <Glyph
                    name="check"
                    size={20}
                    color={theme.colors.brand.primary}
                  />
                ) : undefined
              }
              separator={index < SUPPORTED_LOCALES.length - 1}
              onPress={() => void setLanguage(locale)}
              accessibilityLabel={t(`settings.languageOption.${locale}`)}
              accessibilityState={{ selected }}
              testID={`language-${locale}`}
            />
          );
        })}
      </Section>

      <Section>
        <SectionHeader title={t("settings.sound")} />
        <Row
          title={t("clicker.soundEffects")}
          trailingInteractive
          trailing={
            <Switch
              value={soundEnabled}
              onValueChange={(v) => void setSoundEnabled(v)}
              accessibilityLabel={t("clicker.soundEffects")}
              trackColor={{ true: theme.colors.brand.primary }}
              testID="switch-sound"
            />
          }
        />
        <Row
          title={t("settings.haptics")}
          separator={false}
          trailingInteractive
          trailing={
            <Switch
              value={hapticsEnabled}
              onValueChange={(v) => void setHapticsEnabled(v)}
              accessibilityLabel={t("settings.haptics")}
              trackColor={{ true: theme.colors.brand.primary }}
              testID="switch-haptics"
            />
          }
        />
      </Section>

      {/*
        Legal links, shown only when the build carries real URLs. The paywall is where the store requires them
        and where it says "not set up" when they are absent; here they are a convenience.
      */}
      {env.termsUrl || env.privacyUrl ? (
        <Section>
          <SectionHeader title={t("settings.legalSection")} />
          {env.termsUrl ? (
            <Row
              title={t("settings.termsOfUse")}
              trailing={chevron}
              separator={Boolean(env.privacyUrl)}
              onPress={() => void Linking.openURL(env.termsUrl ?? "")}
              accessibilityLabel={t("settings.termsOfUse")}
              testID="open-terms"
            />
          ) : null}
          {env.privacyUrl ? (
            <Row
              title={t("settings.privacyPolicy")}
              trailing={chevron}
              separator={false}
              onPress={() => void Linking.openURL(env.privacyUrl ?? "")}
              accessibilityLabel={t("settings.privacyPolicy")}
              testID="open-privacy"
            />
          ) : null}
        </Section>
      ) : null}

      {/*
        Development-only clicker sound selector, for the QA listening test. Gated on __DEV__ so it cannot reach a
        release build, and deliberately untranslated — it is not a user-facing feature.
      */}
      {__DEV__ ? (
        <Section testID="dev-sound-selector">
          <SectionHeader title="Clicker sound (dev only)" />
          <Text variant="caption" tone="secondary">
            QA listening test. Not user-facing. Select, then return to the
            clicker and test there — that is the production playback path.
          </Text>
          {CLICK_SOUNDS.map((sound, index) => {
            const selected = sound.id === clickSoundId;
            return (
              <Row
                key={sound.id}
                title={sound.label}
                meta={sound.description}
                trailing={
                  selected ? (
                    <Glyph
                      name="check"
                      size={20}
                      color={theme.colors.brand.primary}
                    />
                  ) : undefined
                }
                separator={index < CLICK_SOUNDS.length - 1}
                onPress={() => void setClickSoundId(sound.id)}
                accessibilityLabel={sound.label}
                accessibilityState={{ selected }}
                testID={`click-sound-${sound.id}`}
              />
            );
          })}
          <View style={{ paddingTop: theme.space[2] }}>
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
        </Section>
      ) : null}

      {/* Development-only entitlement simulator. Its own `__DEV__` gate lives inside the component. */}
      <DevBillingPanel />

      {__DEV__ ? (
        <Section testID="diagnostics">
          <SectionHeader title={t("settings.diagnostics")} />
          <Row
            title="Plan inspector (dev only)"
            trailing={chevron}
            onPress={() => router.push("/dev-plan")}
            accessibilityLabel="Plan inspector"
            testID="open-dev-plan"
          />
          <Row
            title="UI preview (dev only)"
            trailing={chevron}
            onPress={() => router.push("/dev-preview")}
            accessibilityLabel="UI preview"
            testID="open-dev-preview"
          />
          <View style={{ paddingTop: theme.space[3], gap: 2 }}>
            <Text variant="caption" tone="secondary" testID="diag-session">
              {t("settings.sessionStatus")}: {sessionStatus}
              {userId ? ` (${userId.slice(0, 8)}…)` : ""}
            </Text>
            <Text variant="caption" tone="secondary" testID="diag-direction">
              direction: {direction}, language: {language}
            </Text>
          </View>
        </Section>
      ) : null}
    </ScreenScroll>
  );
}
