import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, useTheme, useDirection } from "@pawcue/ui";
import { useDogStore } from "../../src/state/dog-store";
import { useBootstrapStore } from "../../src/state/bootstrap-store";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import { EmptyState } from "../../src/components/EmptyState";
import { ScreenScroll, Section } from "../../src/components/ScreenScroll";
import { SectionHeader } from "../../src/components/SectionHeader";

/**
 * Dog — managing this dog's PawCue training, not a settings page.
 *
 * The training summary leads, because that is what the user is here to see about their dog. The profile it was
 * built from sits underneath, and the routes out — edit, account, settings — are grouped separately under their
 * own heading.
 *
 * That separation is the Phase 4 lesson applied again: a section heading governs everything until the next one,
 * so three navigation cards sitting under "Profile" read as three more profile fields. They are not; they are
 * ways to leave this screen, and they now say so.
 *
 * Scope is exactly what Phase 4 collects. No weight, no vet records, no photos — a photo alone would mean a
 * camera or library permission, and none of it is represented in any contract.
 */
export default function DogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const dog = useDogStore((s) => s.dog);
  const dogId = useDogStore((s) => s.dogId);
  const dogError = useDogStore((s) => s.error);
  const refresh = useDogStore((s) => s.refresh);
  const sessionStatus = useBootstrapStore((s) => s.sessionStatus);
  const { summary } = useLessonStatuses();

  useEffect(() => {
    // Cheap, and keeps the screen honest if the dog was edited on another device.
    void refresh();
  }, [refresh]);

  /** Age in whole years or months, or an honest "not set". Derived from a real field, never guessed. */
  const describeAge = (birthdate: string | null): string => {
    if (!birthdate) return t("dogTab.ageUnknown");
    const born = Date.parse(`${birthdate}T00:00:00Z`);
    if (Number.isNaN(born)) return t("dogTab.ageUnknown");

    const months = Math.floor((Date.now() - born) / (30.44 * 86_400_000));
    if (months < 24)
      return t("dogTab.ageMonths", { count: Math.max(months, 0) });
    return t("dogTab.ageYears", { count: Math.floor(months / 12) });
  };

  if (!dogId) {
    return (
      <ScreenScroll testID="dog-screen">
        <Text variant="h1">{t("common.nav.dog")}</Text>
        <EmptyState
          title={t("dogTab.noDogTitle")}
          body={t("dogTab.noDogBody")}
          ctaLabel={t("today.noDogCta")}
          onPress={() => router.push("/onboarding")}
          testID="dog-empty"
        />
      </ScreenScroll>
    );
  }

  /**
   * The row could not be read.
   *
   * Rendering the profile with every field reading "Not set" would tell the user they never filled it in, which
   * is a different fact from "we could not reach it". Saying which one it is costs one card.
   */
  if (!dog && (dogError !== null || sessionStatus === "unavailable")) {
    return (
      <ScreenScroll testID="dog-screen">
        <Text variant="h1">{t("common.nav.dog")}</Text>
        <EmptyState
          title={t("dogTab.unavailableTitle")}
          body={t("dogTab.unavailableBody")}
          ctaLabel={t("common.cta.tryAgain")}
          onPress={() => void refresh()}
          testID="dog-unavailable"
        />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll testID="dog-screen">
      <View style={{ gap: theme.space[1] }}>
        <Text variant="h1" testID="dog-name">
          {dog ? t("dogTab.title", { name: dog.name }) : t("common.nav.dog")}
        </Text>
        <Text variant="small" tone="muted" testID="dog-age">
          {describeAge(dog?.birthdate ?? null)}
        </Text>
      </View>

      <Section>
        <SectionHeader
          title={t("dogTab.trainingTitle")}
          {...(dog?.dailyTrainingMinutes
            ? {
                trailing: t("dogTab.dailyGoal", {
                  count: dog.dailyTrainingMinutes,
                }),
              }
            : {})}
          testID="dog-daily-goal"
        />
        <Card padding="comfortable" testID="dog-training-summary">
          <View style={{ gap: theme.space[2] }}>
            <Text variant="h3" testID="dog-sessions">
              {t("progress.sessionsCompleted", {
                count: summary?.sessionsCompleted ?? 0,
              })}
            </Text>
            <Text variant="body" tone="muted">
              {t("progress.lessonsLearned", {
                count: summary?.lessonsCompleted ?? 0,
              })}
            </Text>
          </View>
        </Card>
      </Section>

      <Section>
        <SectionHeader title={t("dogTab.profileTitle")} />
        <Row
          label={t("dogProfile.fields.breed")}
          value={dog?.breed ?? t("dogProfile.notSet")}
          testID="dog-breed"
        />
        <Row
          label={t("dogProfile.fields.sex")}
          value={dog ? t(`onboarding.sex.${dog.sex}`) : t("dogProfile.notSet")}
          testID="dog-sex"
        />
      </Section>

      {/*
        Navigation, under its own heading.

        These three used to sit directly beneath the profile fields with no boundary between them, which made
        "Edit profile" look like another read-only row and buried Account and Settings entirely.
      */}
      <Section>
        <SectionHeader title={t("dogTab.manageTitle")} />
        <NavRow
          label={t("dogTab.editProfile")}
          onPress={() => router.push("/dog-profile")}
          testID="dog-edit"
        />
        <NavRow
          label={t("dogTab.account")}
          onPress={() => router.push("/account")}
          testID="dog-account"
        />
        <NavRow
          label={t("dogTab.settings")}
          onPress={() => router.push("/settings")}
          testID="dog-settings"
        />
      </Section>
    </ScreenScroll>
  );
}

/** A read-only profile fact: label on the leading edge, value on the trailing one. */
function Row({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Card padding="compact">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.space[3],
        }}
      >
        <Text variant="small" tone="muted">
          {label}
        </Text>
        <Text variant="body" style={{ flex: 1 }} align="end" testID={testID}>
          {value}
        </Text>
      </View>
    </Card>
  );
}

/**
 * A row that goes somewhere.
 *
 * The chevron is what distinguishes it from the read-only rows above at a glance. It is chosen by direction
 * rather than mirrored by the layout: a glyph is a character, and no amount of `flexDirection` turns `›` around.
 * "Forward" has to follow the reading direction or it points back the way the user came.
 *
 * Hidden from assistive technology, which already hears the button role from the card.
 */
function NavRow({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const forward = useDirection() === "rtl" ? "‹" : "›";
  return (
    <Card
      padding="compact"
      onPress={onPress}
      accessibilityLabel={label}
      testID={testID}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.space[3],
        }}
      >
        <Text variant="body" style={{ flex: 1 }}>
          {label}
        </Text>
        <Text
          variant="body"
          tone="muted"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {forward}
        </Text>
      </View>
    </Card>
  );
}
