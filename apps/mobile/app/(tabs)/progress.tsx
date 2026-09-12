import { useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, useTheme } from "@pawcue/ui";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import {
  useTrainingLogStore,
  type TrainingSessionRecord,
} from "../../src/state/training-log-store";
import { EmptyState } from "../../src/components/EmptyState";
import { ScreenScroll, Section } from "../../src/components/ScreenScroll";
import { SectionHeader } from "../../src/components/SectionHeader";
import { StatusPill } from "../../src/components/StatusPill";

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
  const router = useRouter();
  const { t } = useTranslation();

  const { summary, catalogue, loading } = useLessonStatuses();
  const records = useTrainingLogStore((s) => s.completed);

  /**
   * Date-only maths.
   *
   * A session at 23:50 and one at 00:10 the next morning are different days; comparing timestamps would call them
   * an hour apart and group them together.
   */
  const dayLabel = (iso: string): string => {
    const then = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
    const now = Date.parse(
      `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
    );
    if (Number.isNaN(then)) return "";

    const days = Math.round((now - then) / 86_400_000);
    if (days <= 0) return t("progress.groupToday");
    if (days === 1) return t("progress.groupYesterday");
    return t("progress.daysAgo", { count: days });
  };

  const titleFor = (lessonId: string) => {
    const lesson = catalogue?.lessons.find((item) => item.id === lessonId);
    return lesson ? t(lesson.titleKey) : lessonId;
  };

  /**
   * Recent training, grouped by the day it happened.
   *
   * Four identical "The Name Game — yesterday" rows is what the flat list produced, and it read as a rendering
   * fault rather than as four sessions. People train in bursts, so the day is the unit this history is actually
   * shaped like: one heading, the sessions under it, and a count that makes a heavy day legible at a glance.
   *
   * Capped at the most recent fourteen records so the tab stays a summary rather than an archive.
   */
  const groups = useMemo(() => {
    const byDay = new Map<string, TrainingSessionRecord[]>();
    for (const record of [...records]
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
      .slice(0, 14)) {
      const day = record.endedAt.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), record]);
    }
    return [...byDay.entries()];
  }, [records]);

  return (
    <ScreenScroll testID="progress-screen">
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
          {/*
            The totals, with the headline numbers given the size of headlines.

            This was four sentences of equal weight, which meant the thing a user opens this tab to see — how much
            have we actually done — had to be read for rather than seen.
          */}
          <Card padding="comfortable" testID="progress-summary">
            <View style={{ gap: theme.space[4] }}>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: theme.space[6],
                }}
              >
                <Metric
                  value={String(summary?.sessionsCompleted ?? 0)}
                  label={t("progress.sessionsCompleted", {
                    count: summary?.sessionsCompleted ?? 0,
                  })}
                  testID="progress-sessions"
                />
                <Metric
                  value={String(summary?.lessonsCompleted ?? 0)}
                  label={t("progress.lessonsLearned", {
                    count: summary?.lessonsCompleted ?? 0,
                  })}
                  testID="progress-lessons"
                />
              </View>

              <View style={{ gap: theme.space[1] }}>
                <Text variant="body" tone="muted" testID="progress-minutes">
                  {t("progress.minutesTrained", {
                    count: summary?.estimatedMinutesTrained ?? 0,
                  })}
                </Text>
                <Text variant="caption" tone="muted">
                  {t("progress.minutesNote")}
                </Text>
              </View>

              {(summary?.unfinishedLessons ?? 0) > 0 ? (
                <Text variant="small" tone="brand" testID="progress-unfinished">
                  {t("progress.unfinished", {
                    count: summary?.unfinishedLessons ?? 0,
                  })}
                </Text>
              ) : null}
            </View>
          </Card>

          <Section gap={theme.space[5]}>
            <SectionHeader title={t("progress.recentTitle")} />

            {groups.map(([day, entries]) => (
              <Section key={day}>
                <SectionHeader
                  title={dayLabel(day)}
                  trailing={t("progress.sessionsThatDay", {
                    count: entries.length,
                  })}
                  testID={`progress-day-${day}`}
                />
                {entries.map((record) => (
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
                      <Text variant="body" style={{ flex: 1 }}>
                        {titleFor(record.lessonId)}
                      </Text>
                      {record.status === "completed" ? (
                        <StatusPill
                          label={t("progress.entryCompleted")}
                          tone="success"
                          glyph="✓"
                        />
                      ) : (
                        <StatusPill
                          label={t("progress.entryUnfinished")}
                          tone="brand"
                        />
                      )}
                    </View>
                  </Card>
                ))}
              </Section>
            ))}
          </Section>
        </>
      )}
    </ScreenScroll>
  );
}

/**
 * One headline number.
 *
 * The count is repeated inside the label because the label is the pluralised sentence — "4 sessions completed" —
 * and a screen reader should hear that sentence once rather than "4" followed by it. The large numeral and its
 * caption are therefore hidden from assistive technology, and the group carries the name.
 */
function Metric({
  value,
  label,
  testID,
}: {
  value: string;
  label: string;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{ gap: theme.space[1], minWidth: 96 }}
      accessibilityRole="text"
      accessibilityLabel={label}
      testID={testID}
    >
      <Text
        variant="h1"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {value}
      </Text>
      <Text
        variant="caption"
        tone="muted"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </Text>
    </View>
  );
}
