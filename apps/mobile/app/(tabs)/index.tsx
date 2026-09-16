import { useEffect, useMemo } from "react";
import { Pressable, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Text,
  Button,
  Row,
  TrailMark,
  Reveal,
  useTheme,
  type TrailState,
} from "@pawcue/ui";
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
import {
  resumableSession,
  useSessionStore,
} from "../../src/state/session-store";
import { useTrainingLogStore } from "../../src/state/training-log-store";
import { useEntitlementStore } from "../../src/state/entitlement-store";
import { useDogPhotoStore } from "../../src/state/dog-photo-store";
import { resolveStartupRoute } from "../../src/state/startup-route";
import { ScreenScroll } from "../../src/components/ScreenScroll";
import { SectionHeader } from "../../src/components/SectionHeader";
import { EmptyState } from "../../src/components/EmptyState";
import { SkeletonGroup, TodaySkeleton } from "../../src/components/Skeleton";
import { DogAvatar } from "../../src/components/DogAvatar";
import { ClickerMark } from "../../src/components/ClickerMark";
import { joinNames } from "../../src/lib/list-format";

/**
 * Today — the product's home screen.
 *
 * It answers one question: what should I do with my dog right now? The answer is a sentence and a button, above
 * the fold, in the coach's voice: "Something new for Luna: Sit." and "Start Sit". Beneath them, the day's plan as
 * a trail — rows joined by a line, each with its place on the route — and nothing else. There is no hero panel,
 * no ring, no second way to start the same lesson, and no card: the page is the container.
 *
 * The plan comes from the Phase 5 engine, consumed rather than reimplemented. Engine vocabulary never reaches the
 * screen: `spaced_review` becomes "Worth practising again", because a reason is only useful if it tells the user
 * something they can act on.
 */
export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const bootstrapStatus = useBootstrapStore((s) => s.status);
  const sessionStatus = useBootstrapStore((s) => s.sessionStatus);
  const dog = useDogStore((s) => s.dog);
  const dogId = useDogStore((s) => s.dogId);
  const dogError = useDogStore((s) => s.error);
  const refreshDog = useDogStore((s) => s.refresh);
  const onboardingSkipped = useOnboardingStore((s) => s.skipped);
  const draft = useOnboardingStore((s) => s.draft);
  const photoUri = useDogPhotoStore((s) => s.photoFor(dogId));

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

  const completedToday = useMemo(
    () =>
      completed.filter(
        (record) =>
          record.status === "completed" &&
          record.endedAt.slice(0, 10) === today,
      ),
    [completed, today],
  );

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

  /**
   * A lesson started and left unfinished, and still resumable.
   *
   * Real state, not a nag: `resumableSession` is the one in-progress session, the same one the training screen
   * would resume and the same answer the Dog tab, Train and the lesson overview read. Surfacing it here is the
   * honest half of retention — the user is reminded of something they actually began, by the app they already
   * opened.
   */
  const resumable = resumableSession(activeSession);

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
   * stayed away. Two signals mean "stop waiting": the dog store recorded a failed read, or bootstrap could not
   * establish a session at all and therefore never tried.
   */
  const dogUnavailable =
    dogId !== null &&
    dog === null &&
    (dogError !== null || sessionStatus === "unavailable");

  /**
   * What the button does.
   *
   * A paused session outranks the plan: it is the one thing on this screen the user already committed to.
   * Otherwise the first thing that is neither finished nor locked — so the button keeps meaning what it says
   * partway through a day, and never opens a lesson the user cannot train. When everything left is premium, the
   * button changes to say so rather than silently doing nothing.
   */
  const nextStartable = activities.find(
    (activity) => !activity.done && !(activity.premium && !isPremium),
  );
  const nextLocked = activities.find(
    (activity) => !activity.done && activity.premium && !isPremium,
  );
  const resumeActivity = resumable
    ? (activities.find((a) => a.lessonSlug === resumable.lessonSlug) ?? null)
    : null;
  /**
   * The paused lesson's name, whether or not today's plan still lists it. A session paused yesterday on a lesson
   * the planner has since rotated out is still the user's own unfinished work, and still resumable.
   */
  const resumeTitleKey =
    resumeActivity?.titleKey ??
    (resumable
      ? (catalogue?.lessons.find((l) => l.slug === resumable.lessonSlug)
          ?.titleKey ?? null)
      : null);

  const doneCount = activities.filter((activity) => activity.done).length;
  const remainingCount = activities.length - doneCount;

  const dateLine = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <ScreenScroll testID="today-screen" gap={theme.space[8]}>
      {/* The top bar: the date on the reading edge, the clicker one tap away on the trailing edge. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.space[3],
          minHeight: theme.minTouchTarget,
        }}
      >
        <Text variant="secondary" tone="secondary" style={{ flex: 1 }}>
          {dateLine}
        </Text>
        <Pressable
          onPress={() => router.push("/clicker")}
          accessibilityRole="button"
          accessibilityLabel={t("today.clickerCta")}
          accessibilityHint={t("today.clickerHint")}
          hitSlop={theme.space[2]}
          testID="today-clicker"
          style={({ pressed }) => ({
            minWidth: theme.minTouchTarget,
            minHeight: theme.minTouchTarget,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <ClickerMark size={40} />
        </Pressable>
      </View>

      {!dogId ? (
        <EmptyState
          scene={<DogAvatar breed={null} size={160} pose="sit" />}
          title={t("today.noDogTitle")}
          body={t("today.noDogBody")}
          ctaLabel={t("today.noDogCta")}
          onPress={() => router.push("/onboarding")}
          secondaryLabel={t("today.noDogClicker")}
          onSecondaryPress={() => router.push("/clicker")}
          testID="today-no-dog"
        />
      ) : dogUnavailable ? (
        <EmptyState
          title={t("today.dogUnavailableTitle")}
          body={t("today.dogUnavailableBody")}
          ctaLabel={t("common.cta.tryAgain")}
          emphasis="secondary"
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
        /*
          The page's shape, before its content. The dog is local and renders for real; the bones hold the coach
          line, the button and the first rows until the plan lands.
        */
        <View style={{ gap: theme.space[8] }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: theme.space[4],
            }}
          >
            <View style={{ flex: 1 }}>
              <SkeletonGroup
                accessibilityLabel={t("today.planTitle")}
                testID="today-loading"
              >
                <TodaySkeleton />
              </SkeletonGroup>
            </View>
            {dog ? (
              <DogAvatar
                breed={dog.breed}
                birthdate={dog.birthdate}
                photoUri={photoUri}
                size={96}
                pose={photoUri ? "bust" : "sit"}
              />
            ) : null}
          </View>
        </View>
      ) : allDone ? (
        <AllDone
          name={dog?.name ?? ""}
          breed={dog?.breed ?? null}
          activities={activities}
          onPractise={() => router.navigate("/train")}
        />
      ) : activities.length === 0 ? (
        <EmptyState
          scene={
            <DogAvatar
              breed={dog?.breed ?? null}
              size={160}
              pose="rest"
              expression="resting"
            />
          }
          title={t("today.emptyTitle")}
          body={
            dog
              ? t("today.emptyBody", { name: dog.name })
              : t("today.emptyBodyGeneric")
          }
          testID="today-empty"
        />
      ) : (
        <>
          {/* The coach line, the dog beside it, and the one button. */}
          <View style={{ gap: theme.space[6] }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: theme.space[4],
              }}
            >
              <View style={{ flex: 1, gap: theme.space[2] }}>
                <Text
                  variant="headline"
                  accessibilityRole="header"
                  testID="today-greeting"
                >
                  {coachLine({
                    t,
                    name: dog?.name ?? "",
                    resumeTitleKey,
                    next: nextStartable ?? null,
                    locked: nextLocked ?? null,
                  })}
                </Text>
                <Text variant="secondary" tone="secondary">
                  <Text
                    variant="secondary"
                    tone="secondary"
                    testID="today-total-time"
                  >
                    {doneCount > 0
                      ? t("today.planLeft", {
                          count: remainingCount,
                          minutes: remainingMinutes,
                        })
                      : t("today.planSize", {
                          count: activities.length,
                          minutes: remainingMinutes,
                        })}
                  </Text>
                  {/*
                    One more fact, not two: what was done today once something has been, otherwise the dog's own
                    daily commitment, which is what makes the plan's length make sense.
                  */}
                  {completedToday.length > 0 ? (
                    <Text
                      variant="secondary"
                      tone="secondary"
                      testID="today-done-count"
                    >
                      {" "}
                      {t("today.doneToday", { count: completedToday.length })}
                    </Text>
                  ) : dog?.dailyTrainingMinutes ? (
                    <Text
                      variant="secondary"
                      tone="secondary"
                      testID="today-daily-goal"
                    >
                      {" "}
                      {t("today.goalSentence", {
                        count: dog.dailyTrainingMinutes,
                      })}
                    </Text>
                  ) : null}
                </Text>
              </View>
              {/*
                The dog, present on the home screen — the one thing that makes this unmistakably their app. With a
                lesson waiting it sits, attentive (phase-11-the-dog-at-work.md); an owner's photo is the identity
                and keeps the bust, because a photo cannot pose.
              */}
              {dog ? (
                <DogAvatar
                  breed={dog.breed}
                  birthdate={dog.birthdate}
                  photoUri={photoUri}
                  size={96}
                  pose={photoUri ? "bust" : "sit"}
                  testID="today-dog-avatar"
                />
              ) : null}
            </View>

            {resumable ? (
              <Button
                label={
                  resumeTitleKey
                    ? t("today.continueLesson", { lesson: t(resumeTitleKey) })
                    : t("today.resumeCta")
                }
                onPress={() => router.push(`/session/${resumable.lessonSlug}`)}
                testID="today-resume"
              />
            ) : nextStartable ? (
              <Button
                label={t("today.startLesson", {
                  lesson: t(nextStartable.titleKey),
                })}
                onPress={() =>
                  router.push(`/lesson/${nextStartable.lessonSlug}`)
                }
                testID="today-start"
              />
            ) : nextLocked ? (
              <Button
                label={t("today.premiumCta")}
                onPress={() => router.push("/paywall")}
                testID="today-start-premium"
              />
            ) : null}
          </View>

          {/* The trail: every activity on the day's route, joined by a line. */}
          <View testID="today-plan">
            <SectionHeader title={t("today.sectionPlan")} />
            {activities.map((activity, index) => (
              <ActivityRow
                key={activity.lessonId}
                activity={activity}
                position={index + 1}
                first={index === 0}
                last={index === activities.length - 1}
                locked={activity.premium && !isPremium}
                paused={resumable?.lessonSlug === activity.lessonSlug}
                isNext={nextStartable?.lessonId === activity.lessonId}
                doneAt={
                  completedToday.find((r) => r.lessonId === activity.lessonId)
                    ?.endedAt ?? null
                }
                locale={i18n.language}
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
        </>
      )}
    </ScreenScroll>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** The sentence at the top of the screen: the coach's answer to "what now". */
function coachLine({
  t,
  name,
  resumeTitleKey,
  next,
  locked,
}: {
  t: TFunction;
  name: string;
  resumeTitleKey: string | null;
  next: TodayActivityView | null;
  locked: TodayActivityView | null;
}): string {
  if (resumeTitleKey)
    return t("today.coach.resume", { lesson: t(resumeTitleKey) });
  if (next) {
    const reason = next.selectionReason as PlanSelectionReason;
    const key = `today.coach.${reason}`;
    const line = t(key, { name, lesson: t(next.titleKey) });
    // An unknown reason falls back to the new-skill line rather than leaking a key.
    return line === key
      ? t("today.coach.new_skill", { name, lesson: t(next.titleKey) })
      : line;
  }
  if (locked)
    return t("today.coach.premiumFirst", { lesson: t(locked.titleKey) });
  return t("today.greeting", { name });
}

/**
 * One activity on the trail.
 *
 * A row, not a card: a mark in the leading column says where the activity is on the route (next, later, done,
 * locked, paused), the title says what it is, and the meta sentence says how long and why. The state is also in
 * the accessible name and in the words, never in colour alone — and a done row keeps its full ink, because it
 * changed state, not visibility.
 */
function ActivityRow({
  activity,
  position,
  first,
  last,
  locked,
  paused,
  isNext,
  doneAt,
  locale,
  onPress,
}: {
  activity: TodayActivityView;
  position: number;
  first: boolean;
  last: boolean;
  locked: boolean;
  paused: boolean;
  isNext: boolean;
  doneAt: string | null;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  const state: TrailState = activity.done
    ? "done"
    : locked
      ? "locked"
      : paused
        ? "paused"
        : isNext
          ? "next"
          : "later";

  const stateLabel = activity.done
    ? doneAt
      ? t("today.rowDoneAt", { time: formatTime(doneAt, locale) })
      : t("today.activityDone")
    : locked
      ? t("today.activityPremium")
      : paused
        ? t("today.rowPaused")
        : t(`today.reason.${activity.selectionReason as PlanSelectionReason}`);
  const minutes = t("today.rowMinutes", { count: activity.estimatedMinutes });

  return (
    <Row
      leading={<TrailMark state={state} label={String(position)} />}
      connector={{ above: !first, below: !last }}
      separator={!last}
      /**
       * A locked row opens the paywall, not the lesson.
       *
       * The destination is what makes the lock understandable rather than merely obstructive: pressing it leads to
       * the one thing that resolves it. Nothing routes to the lesson while it is locked, so a premium lesson
       * cannot be started by a stray tap.
       */
      onPress={onPress}
      // Both the lock and the done state are part of the accessible name, never conveyed by the mark alone.
      accessibilityLabel={`${t(activity.titleKey)}. ${activity.done ? t("today.activityDone") : stateLabel} ${minutes}`}
      testID={`today-activity-${activity.lessonSlug}`}
    >
      <Text variant="bodyStrong">{t(activity.titleKey)}</Text>
      <Text variant="secondary" tone="secondary">
        {activity.done ? null : (
          <Text variant="secondary" tone="secondary">{`${minutes} `}</Text>
        )}
        <Text
          variant="secondary"
          tone={activity.done ? "completed" : "secondary"}
          testID={`today-activity-state-${activity.lessonSlug}`}
        >
          {stateLabel}
        </Text>
      </Text>
    </Row>
  );
}

/**
 * The day, finished.
 *
 * The dog becomes the centre of the screen, resting; the coach line says so in facts — which lessons, and that
 * tomorrow is the same time; the trail beneath shows every mark filled. No confetti, no motes, no burst: the
 * change of state is the celebration.
 */
function AllDone({
  name,
  breed,
  activities,
  onPractise,
}: {
  name: string;
  breed: string | null;
  activities: TodayActivityView[];
  onPractise: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const lessons = joinNames(
    activities.map((a) => t(a.titleKey)),
    t,
  );

  return (
    <Reveal style={{ gap: theme.space[6] }} testID="today-all-done">
      <View style={{ alignItems: "center", paddingTop: theme.space[2] }}>
        <DogAvatar
          breed={breed}
          size={160}
          pose="rest"
          expression="resting"
          testID="today-all-done-dog"
        />
      </View>
      <View style={{ gap: theme.space[2] }}>
        <Text
          variant="headline"
          accessibilityRole="header"
          testID="today-greeting"
        >
          {t("today.allDoneTitle")}
        </Text>
        <Text variant="body" tone="secondary" testID="today-done-count">
          {t("today.allDoneWith", { name, lessons })}
        </Text>
      </View>
      <Button
        label={t("today.practiseElse")}
        variant="secondary"
        onPress={onPractise}
        testID="today-practise-else"
      />
      <View testID="today-plan">
        <SectionHeader title={t("today.sectionPlan")} />
        {activities.map((activity, index) => (
          <Row
            key={activity.lessonId}
            leading={<TrailMark state="done" />}
            connector={{
              above: index > 0,
              below: index < activities.length - 1,
            }}
            separator={index < activities.length - 1}
            title={t(activity.titleKey)}
            meta={t("today.activityDone")}
            metaTone="completed"
            accessibilityLabel={`${t(activity.titleKey)}. ${t("today.activityDone")}`}
            testID={`today-activity-${activity.lessonSlug}`}
          />
        ))}
      </View>
    </Reveal>
  );
}

function formatTime(iso: string, locale: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  try {
    return new Date(parsed).toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
