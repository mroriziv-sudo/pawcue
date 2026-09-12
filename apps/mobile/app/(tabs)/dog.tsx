import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, useTheme } from "@pawcue/ui";
import { useDogStore } from "../../src/state/dog-store";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import { EmptyState } from "./index";

/**
 * Dog — managing this dog's PawCue training, not a settings page.
 *
 * The training summary leads, because that is what the user is here to see about their dog. Profile fields and
 * the routes out to editing, the account and settings sit underneath.
 *
 * Scope is exactly what Phase 4 collects. No weight, no vet records, no photos — a photo alone would mean a
 * camera or library permission, and none of it is represented in any contract.
 */
export default function DogScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const dog = useDogStore((s) => s.dog);
  const dogId = useDogStore((s) => s.dogId);
  const refresh = useDogStore((s) => s.refresh);
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
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background.base }}
        contentContainerStyle={{
          paddingTop: insets.top + theme.space[5],
          paddingHorizontal: theme.screenGutter,
          gap: theme.space[4],
        }}
        testID="dog-screen"
      >
        <Text variant="h1">{t("common.nav.dog")}</Text>
        <EmptyState
          title={t("dogTab.noDogTitle")}
          body={t("dogTab.noDogBody")}
          ctaLabel={t("today.noDogCta")}
          onPress={() => router.push("/onboarding")}
          testID="dog-empty"
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[5],
        paddingBottom: theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[5],
      }}
      testID="dog-screen"
    >
      <View style={{ gap: theme.space[1] }}>
        <Text variant="h1" testID="dog-name">
          {dog ? t("dogTab.title", { name: dog.name }) : t("common.nav.dog")}
        </Text>
        <Text variant="small" tone="muted" testID="dog-age">
          {describeAge(dog?.birthdate ?? null)}
        </Text>
      </View>

      <View style={{ gap: theme.space[2] }}>
        <Text variant="h3">{t("dogTab.trainingTitle")}</Text>
        <Card padding="comfortable" testID="dog-training-summary">
          <View style={{ gap: theme.space[2] }}>
            <Text variant="body" testID="dog-sessions">
              {t("progress.sessionsCompleted", {
                count: summary?.sessionsCompleted ?? 0,
              })}
            </Text>
            <Text variant="body" tone="muted">
              {t("progress.lessonsLearned", {
                count: summary?.lessonsCompleted ?? 0,
              })}
            </Text>
            {dog?.dailyTrainingMinutes ? (
              <Text variant="caption" tone="muted" testID="dog-daily-goal">
                {t("dogTab.dailyGoal", { count: dog.dailyTrainingMinutes })}
              </Text>
            ) : null}
          </View>
        </Card>
      </View>

      <View style={{ gap: theme.space[2] }}>
        <Text variant="h3">{t("dogTab.profileTitle")}</Text>
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

        <Card
          padding="compact"
          onPress={() => router.push("/dog-profile")}
          accessibilityLabel={t("dogTab.editProfile")}
          testID="dog-edit"
        >
          <Text variant="body">{t("dogTab.editProfile")}</Text>
        </Card>
        <Card
          padding="compact"
          onPress={() => router.push("/account")}
          accessibilityLabel={t("dogTab.account")}
          testID="dog-account"
        >
          <Text variant="body">{t("dogTab.account")}</Text>
        </Card>
        <Card
          padding="compact"
          onPress={() => router.push("/settings")}
          accessibilityLabel={t("dogTab.settings")}
          testID="dog-settings"
        >
          <Text variant="body">{t("dogTab.settings")}</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

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
          gap: theme.space[2],
        }}
      >
        <Text variant="small" tone="muted">
          {label}
        </Text>
        <Text variant="body" testID={testID}>
          {value}
        </Text>
      </View>
    </Card>
  );
}
