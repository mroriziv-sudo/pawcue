import { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import type { PlanSelectionReason } from "@pawcue/domain";
import { useCatalogue } from "../../src/lessons/useCatalogue";
import { buildTodayView } from "../../src/plans/plan-lifecycle";
import { usePlanStore } from "../../src/state/plan-store";
import { useDogStore } from "../../src/state/dog-store";
import { useOnboardingStore } from "../../src/state/onboarding-store";
import { useBootstrapStore } from "../../src/state/bootstrap-store";
import { useSessionStore } from "../../src/state/session-store";
import { useTrainingLogStore } from "../../src/state/training-log-store";
import { resolveStartupRoute } from "../../src/state/startup-route";

/**
 * Today — the product's home screen.
 *
 * It answers one question: what should I train with my dog today? Everything on it serves that, and anything that
 * does not belongs on another destination.
 *
 * The plan comes from the Phase 5 engine, consumed rather than reimplemented. Engine vocabulary never reaches the
 * screen: `spaced_review` becomes "Worth practising again", because a reason is only useful if it tells the user
 * something they can act on.
 */
export default function TodayScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const bootstrapStatus = useBootstrapStore((s) => s.status);
  const dog = useDogStore((s) => s.dog);
  const dogId = useDogStore((s) => s.dogId);
  const onboardingSkipped = useOnboardingStore((s) => s.skipped);
  const draft = useOnboardingStore((s) => s.draft);

  const { catalogue, loading, error } = useCatalogue();
  const completed = useTrainingLogStore((s) => s.completed);
  const activeSession = useSessionStore((s) => s.session);

  /**
   * Startup routing stays on the entry screen.
   *
   * A `<Redirect>` returned from a layout replaces the navigator it would otherwise render, which is the infinite
   * loop Phase 4 hit. Redirecting from here keeps the navigator mounted.
   */
  const startup = resolveStartupRoute({
    hydrated: bootstrapStatus === "ready",
    dogId,
    onboardingSkipped,
    draft,
  });

  const today = new Date().toISOString().slice(0, 10);
  const plan = usePlanStore((s) => s.plan);
  const planStatus = usePlanStore((s) => s.status);
  const ensurePlanForToday = usePlanStore((s) => s.ensurePlanForToday);

  /**
   * Asks once per dog per day whether the persisted plan is still good.
   *
   * The store decides; this only asks. The guard inside it means a re-render, a tab switch or two screens
   * mounting together cannot produce a second plan — regeneration is driven by the rules in `plan-lifecycle.ts`,
   * never by component lifecycle.
   */
  useEffect(() => {
    if (!dog || !catalogue) return;
    void ensurePlanForToday({ dog, catalogue, activeSession, today });
  }, [dog, catalogue, activeSession, today, ensurePlanForToday]);

  /**
   * What today looks like: the persisted plan, with anything already finished ticked off.
   *
   * Completing an activity does **not** rebuild the plan — the day's list would shift under the user as they
   * worked through it, and every completion would write a new row. The plan is a commitment; finishing it is
   * progress through it.
   */
  const todayView = useMemo(() => {
    if (!plan || !catalogue) return null;
    return buildTodayView(
      plan,
      catalogue,
      completed
        .filter((record) => record.status === "completed")
        .map((record) => ({
          lessonId: record.lessonId,
          endedAt: record.endedAt,
        })),
      today,
    );
  }, [plan, catalogue, completed, today]);

  const sessionsToday = completed.filter(
    (record) =>
      record.status === "completed" && record.endedAt.slice(0, 10) === today,
  ).length;

  if (startup.kind === "onboarding") return <Redirect href="/onboarding" />;
  if (startup.kind === "onboarding_resume") {
    return <Redirect href="/onboarding/steps" />;
  }

  const activities = todayView?.activities ?? [];
  const remainingMinutes = todayView?.remainingMinutes ?? 0;
  const allDone = todayView?.allDone ?? false;
  const planPending = planStatus === "idle" || planStatus === "loading";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[5],
        paddingBottom: theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[5],
      }}
      testID="today-screen"
    >
      <View style={{ gap: theme.space[1] }}>
        <Text variant="h1" testID="today-greeting">
          {dog
            ? t("today.greeting", { name: dog.name })
            : t("today.greetingNoDog")}
        </Text>
        {sessionsToday > 0 ? (
          <Text variant="small" tone="success" testID="today-done-count">
            {t("today.doneToday", { count: sessionsToday })}
          </Text>
        ) : null}
      </View>

      {!dogId ? (
        <EmptyState
          title={t("today.noDogTitle")}
          body={t("today.noDogBody")}
          ctaLabel={t("today.noDogCta")}
          onPress={() => router.push("/onboarding")}
          testID="today-no-dog"
        />
      ) : error || (!loading && !catalogue) || planStatus === "unavailable" ? (
        /**
         * Checked before the pending case on purpose.
         *
         * With no catalogue the plan effect never runs, so its status stays `idle` — and treating idle as "still
         * loading" would leave a spinner on screen forever instead of saying what went wrong.
         */
        <EmptyState
          title={t("today.unavailableTitle")}
          body={t("today.unavailableBody")}
          testID="today-unavailable"
        />
      ) : loading || planPending ? (
        <ActivityIndicator
          color={theme.colors.brand.primary}
          testID="today-loading"
        />
      ) : allDone ? (
        <EmptyState
          title={t("today.allDoneTitle")}
          body={t("today.allDoneBody")}
          testID="today-all-done"
        />
      ) : activities.length === 0 ? (
        <EmptyState
          title={t("today.emptyTitle")}
          body={
            dog
              ? t("today.emptyBody", { name: dog.name })
              : t("today.emptyBodyGeneric")
          }
          testID="today-empty"
        />
      ) : (
        <View style={{ gap: theme.space[3] }} testID="today-plan">
          <View style={{ gap: theme.space[1] }}>
            <Text variant="h3">{t("today.planTitle")}</Text>
            <Text variant="small" tone="muted" testID="today-total-time">
              {t("today.totalTime", { count: remainingMinutes })}
            </Text>
          </View>

          {activities.map((activity, index) => (
            <Card
              key={activity.lessonId}
              padding="comfortable"
              elevated={index === 0 && !activity.done}
              onPress={() => router.push(`/lesson/${activity.lessonSlug}`)}
              // Done is part of the accessible name, never conveyed by the tick alone.
              accessibilityLabel={`${t(activity.titleKey)}. ${
                activity.done
                  ? t("today.activityDone")
                  : t(
                      `today.reason.${activity.selectionReason as PlanSelectionReason}`,
                    )
              }`}
              testID={`today-activity-${activity.lessonSlug}`}
              {...(activity.done ? { style: { opacity: 0.62 } } : {})}
            >
              <View style={{ gap: theme.space[2] }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: theme.space[2],
                  }}
                >
                  <Text
                    variant="small"
                    tone={activity.done ? "success" : "brand"}
                    testID={`today-activity-state-${activity.lessonSlug}`}
                  >
                    {activity.done
                      ? t("today.activityDone")
                      : t(`today.reason.${activity.selectionReason}`)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t("today.totalTime", { count: activity.estimatedMinutes })}
                  </Text>
                </View>

                <Text variant="h3">{t(activity.titleKey)}</Text>
                <Text variant="small" tone="muted" numberOfLines={2}>
                  {t(activity.goalKey)}
                </Text>
              </View>
            </Card>
          ))}

          <Button
            label={t("today.start")}
            onPress={() => {
              // Resumes at the first thing not yet done, so the button keeps meaning what it says partway through.
              const next = activities.find((activity) => !activity.done);
              if (next) router.push(`/lesson/${next.lessonSlug}`);
            }}
            testID="today-start"
          />
        </View>
      )}

      {/* The clicker stays one tap from home without taking a place in the primary navigation. */}
      <Pressable
        onPress={() => router.push("/clicker")}
        accessibilityRole="button"
        accessibilityLabel={t("today.clickerCta")}
        hitSlop={12}
        testID="today-clicker"
      >
        <Text variant="small" tone="muted" align="center">
          {t("today.clickerCta")}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * The shared empty state.
 *
 * One component rather than a bespoke layout per screen: an empty Today, an empty Train and an empty Progress are
 * the same shape of message, and letting each invent its own is how a product starts looking assembled.
 */
export function EmptyState({
  title,
  body,
  ctaLabel,
  onPress,
  testID,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    // Optional props are spread rather than passed as undefined: with `exactOptionalPropertyTypes`, absent and
    // present-but-undefined are different types.
    <Card padding="comfortable" {...(testID ? { testID } : {})}>
      <View style={{ gap: theme.space[2] }}>
        <Text variant="h3">{title}</Text>
        <Text variant="body" tone="muted">
          {body}
        </Text>
        {ctaLabel && onPress ? (
          <>
            <View style={{ height: theme.space[1] }} />
            <Button
              label={ctaLabel}
              onPress={onPress}
              {...(testID ? { testID: `${testID}-cta` } : {})}
            />
          </>
        ) : null}
      </View>
    </Card>
  );
}
