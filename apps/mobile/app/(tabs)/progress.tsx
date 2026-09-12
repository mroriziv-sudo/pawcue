import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, useTheme } from "@pawcue/ui";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import { useTrainingLogStore } from "../../src/state/training-log-store";
import { EmptyState } from "./index";

/**
 * Progress — an honest record of what has been trained.
 *
 * Deliberately a history surface rather than an analytics dashboard. Every number here is counted from sessions
 * that actually happened, and there is **no streak**: `Streak` is server-derived by its own contract precisely so
 * a client cannot invent one, and nothing populates it yet. A streak the server has never agreed to is exactly
 * the fake gamification the brief rules out.
 *
 * Minutes are labelled as estimated because they are — they come from each lesson's authored length, not from
 * measuring how long anyone actually trained, which nothing records.
 */
export default function ProgressScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const { summary, catalogue, loading } = useLessonStatuses();
  const records = useTrainingLogStore((s) => s.completed);

  const recent = [...records]
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, 10);

  /**
   * "today" / "yesterday" / "N days ago".
   *
   * Date-only maths: a session at 23:50 and one at 00:10 next morning are different days, and comparing
   * timestamps would call them an hour apart.
   */
  const relativeDay = (iso: string): string => {
    const then = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
    const now = Date.parse(
      `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
    );
    if (Number.isNaN(then)) return "";

    const days = Math.round((now - then) / 86_400_000);
    if (days <= 0) return t("progress.today");
    if (days === 1) return t("progress.yesterday");
    return t("progress.daysAgo", { count: days });
  };

  const titleFor = (lessonId: string) => {
    const lesson = catalogue?.lessons.find((item) => item.id === lessonId);
    return lesson ? t(lesson.titleKey) : lessonId;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[5],
        paddingBottom: theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[5],
      }}
      testID="progress-screen"
    >
      <Text variant="h1">{t("progress.title")}</Text>

      {loading && records.length === 0 ? (
        <ActivityIndicator
          color={theme.colors.brand.primary}
          testID="progress-loading"
        />
      ) : records.length === 0 ? (
        <EmptyState
          title={t("progress.emptyTitle")}
          body={t("progress.emptyBody")}
          ctaLabel={t("progress.emptyCta")}
          onPress={() => router.navigate("/")}
          testID="progress-empty"
        />
      ) : (
        <>
          <Card padding="comfortable" testID="progress-summary">
            <View style={{ gap: theme.space[2] }}>
              <Text variant="h3" testID="progress-sessions">
                {t("progress.sessionsCompleted", {
                  count: summary?.sessionsCompleted ?? 0,
                })}
              </Text>
              <Text variant="body" tone="muted" testID="progress-lessons">
                {t("progress.lessonsLearned", {
                  count: summary?.lessonsCompleted ?? 0,
                })}
              </Text>
              <Text variant="body" tone="muted" testID="progress-minutes">
                {t("progress.minutesTrained", {
                  count: summary?.estimatedMinutesTrained ?? 0,
                })}
              </Text>
              <Text variant="caption" tone="muted">
                {t("progress.minutesNote")}
              </Text>

              {(summary?.unfinishedLessons ?? 0) > 0 ? (
                <Text variant="small" tone="brand" testID="progress-unfinished">
                  {t("progress.unfinished", {
                    count: summary?.unfinishedLessons ?? 0,
                  })}
                </Text>
              ) : null}
            </View>
          </Card>

          <View style={{ gap: theme.space[2] }}>
            <Text variant="h3">{t("progress.recentTitle")}</Text>
            {recent.map((record) => (
              <Card
                key={record.sessionId}
                padding="compact"
                // Completed and unfinished are distinguished in the accessible name, not by colour alone.
                accessibilityLabel={`${titleFor(record.lessonId)}. ${
                  record.status === "completed"
                    ? t("progress.entryCompleted")
                    : t("progress.entryUnfinished")
                }`}
                testID={`progress-entry-${record.sessionId}`}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: theme.space[2],
                  }}
                >
                  <View style={{ flex: 1, gap: theme.space[1] }}>
                    <Text variant="body">{titleFor(record.lessonId)}</Text>
                    <Text variant="caption" tone="muted">
                      {relativeDay(record.endedAt)}
                    </Text>
                  </View>
                  <Text
                    variant="caption"
                    tone={record.status === "completed" ? "success" : "brand"}
                  >
                    {record.status === "completed"
                      ? t("progress.entryCompleted")
                      : t("progress.entryUnfinished")}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}
