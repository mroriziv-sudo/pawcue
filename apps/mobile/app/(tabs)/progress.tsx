import { useMemo } from "react";
import { ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Row, Text, TrailMark, useTheme } from "@pawcue/ui";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import {
  useTrainingLogStore,
  type TrainingSessionRecord,
} from "../../src/state/training-log-store";
import { useDogStore } from "../../src/state/dog-store";
import { EmptyState } from "../../src/components/EmptyState";
import { ScreenScroll, Section } from "../../src/components/ScreenScroll";
import { SectionHeader } from "../../src/components/SectionHeader";

/**
 * Progress — an honest record of what has been trained.
 *
 * Deliberately a history surface rather than an analytics dashboard: the totals are one sentence, and the
 * history is rows grouped by the day they happened. Every number here is counted from sessions that actually
 * happened, and there is **no streak**: `Streak` is server-derived by its own contract precisely so a client
 * cannot invent one, and nothing populates it yet.
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
  const dog = useDogStore((s) => s.dog);

  /** Date-only maths: a session at 23:50 and one at 00:10 the next morning are different days. */
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
   * Recent training, grouped by the day it happened. People train in bursts, so the day is the unit this
   * history is actually shaped like. Capped at the most recent fourteen records so the tab stays a summary.
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
    <ScreenScroll testID="progress-screen" gap={theme.space[8]}>
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
          {/* The totals, as the coach would say them: one sentence, the numbers inside it. */}
          <Text
            variant="headline"
            accessibilityRole="header"
            testID="progress-summary"
          >
            <Text variant="headline" testID="progress-sessions">
              {t("progress.sessionsCompleted", {
                count: summary?.sessionsCompleted ?? 0,
              })}
            </Text>
            {", "}
            <Text variant="headline" testID="progress-lessons">
              {t("progress.lessonsLearned", {
                count: summary?.lessonsCompleted ?? 0,
              })}
            </Text>
            {dog?.name ? ` ${t("progress.withName", { name: dog.name })}` : "."}
          </Text>

          <Text variant="body" tone="secondary">
            <Text variant="body" tone="secondary" testID="progress-minutes">
              {t("progress.minutesTrained", {
                count: summary?.estimatedMinutesTrained ?? 0,
              })}
            </Text>{" "}
            {t("progress.minutesNote")}
            {(summary?.unfinishedLessons ?? 0) > 0 ? (
              <Text
                variant="body"
                tone="secondary"
                testID="progress-unfinished"
              >
                {" "}
                {t("progress.unfinished", {
                  count: summary?.unfinishedLessons ?? 0,
                })}
              </Text>
            ) : null}
          </Text>

          {groups.map(([day, entries]) => (
            <Section key={day}>
              <SectionHeader
                title={dayLabel(day)}
                trailing={t("progress.sessionsThatDay", {
                  count: entries.length,
                })}
                testID={`progress-day-${day}`}
              />
              {entries.map((record, index) => {
                const done = record.status === "completed";
                const stateLabel = done
                  ? t("progress.entryCompleted")
                  : t("progress.entryUnfinished");
                return (
                  <Row
                    key={record.sessionId}
                    leading={<TrailMark state={done ? "done" : "paused"} />}
                    title={titleFor(record.lessonId)}
                    meta={stateLabel}
                    metaTone={done ? "completed" : "secondary"}
                    separator={index < entries.length - 1}
                    // Completed and unfinished are distinguished in the accessible name, not by the mark alone.
                    accessibilityLabel={`${titleFor(record.lessonId)}. ${stateLabel}`}
                    testID={`progress-entry-${record.sessionId}`}
                  />
                );
              })}
            </Section>
          ))}
        </>
      )}
    </ScreenScroll>
  );
}
