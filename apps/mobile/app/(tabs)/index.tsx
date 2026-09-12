import { useEffect, useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import type { PlanSelectionReason } from "@pawcue/domain";
import { useCatalogue } from "../../src/lessons/useCatalogue";
import {
  buildTodayView,
  type TodayActivityView,
} from "../../src/plans/plan-lifecycle";
import { usePlanStore } from "../../src/state/plan-store";
import { useDogStore } from "../../src/state/dog-store";
import { useOnboardingStore } from "../../src/state/onboarding-store";
import { useBootstrapStore } from "../../src/state/bootstrap-store";
import { useSessionStore } from "../../src/state/session-store";
import { useTrainingLogStore } from "../../src/state/training-log-store";
import { useEntitlementStore } from "../../src/state/entitlement-store";
import { resolveStartupRoute } from "../../src/state/startup-route";
import { ScreenScroll, Section } from "../../src/components/ScreenScroll";
import { SectionHeader } from "../../src/components/SectionHeader";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";

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
  const router = useRouter();
  const { t } = useTranslation();

  const bootstrapStatus = useBootstrapStore((s) => s.status);
  const sessionStatus = useBootstrapStore((s) => s.sessionStatus);
  const dog = useDogStore((s) => s.dog);
  const dogId = useDogStore((s) => s.dogId);
  const dogError = useDogStore((s) => s.error);
  const refreshDog = useDogStore((s) => s.refresh);
  const onboardingSkipped = useOnboardingStore((s) => s.skipped);
  const draft = useOnboardingStore((s) => s.draft);

  const { catalogue, loading, error } = useCatalogue();
  const completed = useTrainingLogStore((s) => s.completed);
  const activeSession = useSessionStore((s) => s.session);

  /**
   * The one premium question this screen asks.
   *
   * Read from the entitlement store, never computed here. The plan itself is unaffected by it — activities are
   * chosen by the engine and then *presented* as locked or not, so a subscription changes what can be opened, not
   * what was recommended.
   */
  const isPremium = useEntitlementStore((s) => s.view.isPremiumActive);

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

  /**
   * A lesson started and left unfinished, and still resumable.
   *
   * Real state, not a nag: `session-store` holds exactly one in-progress session, and it is the same one the
   * training screen would resume. Surfacing it here is the honest half of retention — the user is reminded of
   * something they actually began, by the app they already opened.
   */
  const resumable =
    activeSession?.status === "in_progress" ? activeSession : null;

  if (startup.kind === "onboarding") return <Redirect href="/onboarding" />;
  if (startup.kind === "onboarding_resume") {
    return <Redirect href="/onboarding/steps" />;
  }

  const activities = todayView?.activities ?? [];
  const remainingMinutes = todayView?.remainingMinutes ?? 0;
  const allDone = todayView?.allDone ?? false;
  const planPending = planStatus === "idle" || planStatus === "loading";

  /**
   * The dog is known but its row could not be read.
   *
   * The plan effect gates on `dog`, so with the id cached and the row unreachable nothing ever moved `planStatus`
   * off `idle` — and `idle` reads as "still loading", which put a spinner on screen for as long as the server
   * stayed away. Phase 6 fixed the same shape of bug for a missing catalogue; this is its sibling. Two signals
   * mean "stop waiting": the dog store recorded a failed read, or bootstrap could not establish a session at all
   * and therefore never tried.
   */
  const dogUnavailable =
    dogId !== null &&
    dog === null &&
    (dogError !== null || sessionStatus === "unavailable");

  /**
   * What "Start training" does.
   *
   * The first thing that is neither finished nor locked — so the button keeps meaning what it says partway
   * through a day, and never opens a lesson the user cannot train. When everything left is premium, the button
   * changes to say so rather than silently doing nothing.
   */
  const nextStartable = activities.find(
    (activity) => !activity.done && !(activity.premium && !isPremium),
  );
  const nextLocked = activities.find(
    (activity) => !activity.done && activity.premium && !isPremium,
  );

  return (
    <ScreenScroll testID="today-screen">
      <View style={{ gap: theme.space[1] }}>
        <Text variant="h1" testID="today-greeting">
          {dog
            ? t("today.greeting", { name: dog.name })
            : t("today.greetingNoDog")}
        </Text>
        {/*
          One subtitle line, not two.

          Sessions done today when there are any — the fact worth leading with — and otherwise the dog's own daily
          commitment, which is what makes the plan's length make sense. Both are real fields.
        */}
        {sessionsToday > 0 ? (
          <Text variant="small" tone="success" testID="today-done-count">
            {t("today.doneToday", { count: sessionsToday })}
          </Text>
        ) : dog?.dailyTrainingMinutes ? (
          <Text variant="small" tone="muted" testID="today-daily-goal">
            {t("today.dailyGoal", { count: dog.dailyTrainingMinutes })}
          </Text>
        ) : null}
      </View>

      {/*
        Unfinished work, above the plan.

        It comes first because it is the one thing on this screen the user already committed to, and because a
        half-finished lesson buried under a fresh plan is how it stays half-finished.
      */}
      {resumable ? (
        <Card
          padding="comfortable"
          onPress={() => router.push(`/session/${resumable.lessonSlug}`)}
          accessibilityLabel={t("today.resumeCta")}
          testID="today-resume"
        >
          <View style={{ gap: theme.space[1] }}>
            <Text variant="small" tone="brand">
              {t("today.resumeTitle")}
            </Text>
            <Text variant="bodyStrong">{t("today.resumeCta")}</Text>
          </View>
        </Card>
      ) : null}

      {!dogId ? (
        <EmptyState
          title={t("today.noDogTitle")}
          body={t("today.noDogBody")}
          ctaLabel={t("today.noDogCta")}
          onPress={() => router.push("/onboarding")}
          testID="today-no-dog"
        />
      ) : dogUnavailable ? (
        <EmptyState
          title={t("today.dogUnavailableTitle")}
          body={t("today.dogUnavailableBody")}
          ctaLabel={t("common.cta.tryAgain")}
          onPress={() => void refreshDog()}
          testID="today-dog-unavailable"
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
        <Section gap={theme.space[3]}>
          {/*
            The remaining time sits on the heading's trailing edge rather than beneath it. It used to be a second
            line under "Your training plan", which put the same duration on screen twice when the plan held a
            single activity — the heading's subtitle and the card's own badge.
          */}
          <SectionHeader
            title={t("today.planTitle")}
            trailing={t("today.totalTime", { count: remainingMinutes })}
            testID="today-total-time"
          />

          <View style={{ gap: theme.space[3] }} testID="today-plan">
            {activities.map((activity, index) => (
              <ActivityCard
                key={activity.lessonId}
                activity={activity}
                locked={activity.premium && !isPremium}
                emphasised={index === 0}
                onPress={() =>
                  router.push(
                    activity.premium && !isPremium
                      ? "/paywall"
                      : `/lesson/${activity.lessonSlug}`,
                  )
                }
              />
            ))}
          </View>

          {/*
            One primary action, and it always does something honest: train the next thing that can be trained, or
            — when everything left needs a subscription — say that plainly and lead to the paywall.
          */}
          {nextStartable ? (
            <Button
              label={t("today.start")}
              onPress={() => router.push(`/lesson/${nextStartable.lessonSlug}`)}
              testID="today-start"
            />
          ) : nextLocked ? (
            <Button
              label={t("today.premiumCta")}
              onPress={() => router.push("/paywall")}
              testID="today-start-premium"
            />
          ) : null}
        </Section>
      )}

      {/*
        The clicker stays one tap from home without taking a place in the primary navigation.

        Now a card rather than a bare line of centred text. As a text link it read as a caption someone forgot to
        attach to anything — no edge, no press affordance, and a touch target defined only by the glyph height.
      */}
      <Card
        padding="compact"
        onPress={() => router.push("/clicker")}
        accessibilityLabel={t("today.clickerCta")}
        testID="today-clicker"
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: theme.space[3],
          }}
        >
          <View style={{ flex: 1, gap: theme.space[1] }}>
            <Text variant="bodyStrong">{t("today.clickerCta")}</Text>
            <Text variant="caption" tone="muted">
              {t("today.clickerHint")}
            </Text>
          </View>
          <ClickerGlyph />
        </View>
      </Card>
    </ScreenScroll>
  );
}

/**
 * One activity in today's plan.
 *
 * The reason leads, because "why is this here" is the question a generated plan has to answer before the user
 * will trust it. Done and locked are pills rather than coloured words, so the three states differ in shape and
 * not only in hue.
 */
function ActivityCard({
  activity,
  locked,
  emphasised,
  onPress,
}: {
  activity: TodayActivityView;
  locked: boolean;
  emphasised: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const stateLabel = locked
    ? t("today.activityPremium")
    : activity.done
      ? t("today.activityDone")
      : t(`today.reason.${activity.selectionReason as PlanSelectionReason}`);

  return (
    <Card
      padding="comfortable"
      elevated={emphasised && !activity.done && !locked}
      /**
       * A locked row opens the paywall, not the lesson.
       *
       * The destination is what makes the lock understandable rather than merely obstructive: pressing it leads to
       * the one thing that resolves it. Nothing routes to the lesson while it is locked, so a premium lesson
       * cannot be started by a stray tap.
       */
      onPress={onPress}
      // Both the lock and the done state are part of the accessible name, never conveyed by dimming alone.
      accessibilityLabel={`${t(activity.titleKey)}. ${stateLabel}`}
      testID={`today-activity-${activity.lessonSlug}`}
      {...(activity.done || locked ? { style: { opacity: 0.62 } } : {})}
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
          {activity.done && !locked ? (
            <StatusPill
              label={stateLabel}
              tone="success"
              glyph="✓"
              testID={`today-activity-state-${activity.lessonSlug}`}
            />
          ) : locked ? (
            <StatusPill
              label={stateLabel}
              tone="brand"
              testID={`today-activity-state-${activity.lessonSlug}`}
            />
          ) : (
            <Text
              variant="small"
              tone="brand"
              style={{ flex: 1 }}
              testID={`today-activity-state-${activity.lessonSlug}`}
            >
              {stateLabel}
            </Text>
          )}
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
  );
}

/** The clicker's mark, small. Drawn from primitives for the same reason the nav glyphs are. */
function ClickerGlyph() {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 40,
        height: 40,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.brand.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: theme.radius.pill,
          borderWidth: 2,
          borderColor: theme.colors.text.onBrand,
        }}
      />
    </View>
  );
}
