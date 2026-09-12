import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Text,
  Card,
  Button,
  PressableScale,
  ProgressBar,
  useTheme,
} from "@pawcue/ui";
import {
  clicksFor,
  currentStep,
  isStepSatisfied,
  orderedTroubleshooting,
  repetitionsFor,
  requiresProfessionalEscalation,
  sessionProgress,
  type LessonContent,
} from "@pawcue/domain";
import { useLessonContent } from "../../src/lessons/useLessonContent";
import { useSessionStore } from "../../src/state/session-store";
import { useTrainingLogStore } from "../../src/state/training-log-store";
import { useClicker } from "../../src/hooks/useClicker";
import { useHaptics } from "../../src/hooks/useHaptics";
import { useCatalogue } from "../../src/lessons/useCatalogue";
import { usePlanStore } from "../../src/state/plan-store";
import { useEntitlementStore } from "../../src/state/entitlement-store";
import { buildTodayView } from "../../src/plans/plan-lifecycle";
import { ScreenScroll } from "../../src/components/ScreenScroll";

/**
 * The training screen.
 *
 * One rule shapes everything here: the user is holding a dog. So the screen shows the current step and the one or
 * two controls that step actually needs, and nothing else — no step list, no navigation chrome, no decoration.
 * Everything that explains the lesson lives on the overview screen, which is why this one can stay quiet.
 *
 * It renders whatever the content says: the clicker appears because the step declares `requiresClickerPress`, the
 * rep counter because the step declares a `repetitionTarget`. There is no lesson-specific branch anywhere in this
 * file, which is what makes it a renderer rather than a screen for one lesson.
 *
 * All session rules live in the engine (`@pawcue/domain`); this file dispatches and renders.
 */
export default function TrainingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { content, loading, error } = useLessonContent(slug);
  const session = useSessionStore((s) => s.session);
  const resumeOrBegin = useSessionStore((s) => s.resumeOrBegin);
  const recordLogEntry = useTrainingLogStore((s) => s.record);

  /** Transient UI state: which help option is open. Never persisted — reopening a lesson must not reopen a sheet. */
  const [openOptionId, setOpenOptionId] = useState<string | null>(null);
  const [helpVisible, setHelpVisible] = useState(false);

  useEffect(() => {
    if (content) void resumeOrBegin(content);
  }, [content, resumeOrBegin]);

  // A completed session is written to the local training log exactly once; the store itself is idempotent by id.
  useEffect(() => {
    if (session?.status === "completed") void recordLogEntry(session);
  }, [session, recordLogEntry]);

  if (loading || (!content && !error)) {
    return (
      <Centered testID="train-loading">
        <ActivityIndicator color={theme.colors.brand.primary} />
      </Centered>
    );
  }

  if (error || !content) {
    return (
      <Centered testID="train-unavailable">
        <Text variant="h2">{t("session.errors.unavailableTitle")}</Text>
        <Text variant="body" tone="muted" align="center">
          {t("session.errors.unavailableBody")}
        </Text>
        <Button
          label={t("common.cta.close")}
          variant="secondary"
          onPress={() => router.back()}
        />
      </Centered>
    );
  }

  if (!session) {
    return (
      <Centered testID="train-starting">
        <ActivityIndicator color={theme.colors.brand.primary} />
      </Centered>
    );
  }

  if (session.status === "completed") {
    return <CompletionView content={content} />;
  }

  if (helpVisible) {
    return (
      <TroubleshootingView
        content={content}
        openOptionId={openOptionId}
        onOpenOption={setOpenOptionId}
        onClose={() => {
          setOpenOptionId(null);
          setHelpVisible(false);
        }}
      />
    );
  }

  return (
    <ActiveStepView
      content={content}
      insets={insets}
      onOpenHelp={() => setHelpVisible(true)}
    />
  );
}

function Centered({
  children,
  testID,
}: {
  children: React.ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space[3],
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[6],
        paddingHorizontal: theme.screenGutter,
        backgroundColor: theme.colors.background.base,
      }}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function ActiveStepView({
  content,
  insets,
  onOpenHelp,
}: {
  content: LessonContent;
  insets: { top: number; bottom: number };
  onOpenHelp: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const session = useSessionStore((s) => s.session);
  const lastFailure = useSessionStore((s) => s.lastFailure);
  const recordClick = useSessionStore((s) => s.click);
  const addRepetition = useSessionStore((s) => s.addRepetition);
  const removeRepetition = useSessionStore((s) => s.removeRepetition);
  const completeStep = useSessionStore((s) => s.completeStep);

  /** The Phase 2 clicker, unchanged: same engine, same preloaded pool, same settings. */
  const { click } = useClicker();

  const step = session ? currentStep(session, content) : null;

  const onClickerPress = useCallback(() => {
    // Audio first, session bookkeeping second: the sound is the time-critical half of this interaction.
    click();
    recordClick(content);
  }, [click, recordClick, content]);

  if (!session || !step) return null;

  const progress = sessionProgress(session, content);
  const reps = repetitionsFor(session, step);
  const clicks = clicksFor(session, step);
  const satisfied = isStepSatisfied(session, step);
  const isFinalStep = progress.stepNumber === progress.totalSteps;
  const hasTroubleshooting = content.troubleshooting.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[6],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[4],
      }}
      testID="training-screen"
    >
      <View style={{ gap: theme.space[2] }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text variant="small" tone="muted" testID="step-counter">
            {t("session.train.stepCounter", {
              current: progress.stepNumber,
              total: progress.totalSteps,
            })}
          </Text>
          {/*
            "Pause", not "Exit".

            Leaving does not discard anything: the session is persisted on every transition and `resumeOrBegin`
            picks it up again, so the honest word is pause. The hint underneath says so outright, because the
            reason people abandon a lesson rather than pausing it is not knowing that pausing is safe.

            A 12pt hit slop on a caption-height label is well under the 44pt minimum, so the target is set
            explicitly rather than inferred from the glyph.
          */}
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t("session.train.pause")}
            accessibilityHint={t("session.train.pauseHint")}
            hitSlop={theme.space[3]}
            style={{
              minHeight: theme.minTouchTarget,
              justifyContent: "center",
              paddingHorizontal: theme.space[2],
            }}
            testID="pause-session"
          >
            <Text variant="small" tone="muted">
              {t("session.train.pause")}
            </Text>
          </Pressable>
        </View>
        <ProgressBar
          ratio={progress.ratio}
          accessibilityLabel={t("session.train.progressLabel", {
            current: progress.stepNumber,
            total: progress.totalSteps,
            percent: Math.round(progress.ratio * 100),
          })}
          testID="session-progress"
        />
      </View>

      <Text variant="h2" testID="step-instruction">
        {t(step.instructionKey)}
      </Text>

      {/*
        Illustration slot. The content model already carries `illustrationAssetKey`; no lesson has artwork yet, so
        the slot reserves the space and the layout rather than rendering an empty box for every step.
      */}
      {step.illustrationAssetKey ? (
        <Card padding="compact" testID="step-illustration">
          <Text variant="caption" tone="muted" align="center">
            {step.illustrationAssetKey}
          </Text>
        </Card>
      ) : null}

      {step.requiresClickerPress ? (
        <View style={{ alignItems: "center", gap: theme.space[3] }}>
          <PressableScale
            scaleToken="clicker"
            onPress={onClickerPress}
            accessibilityRole="button"
            accessibilityLabel={t("clicker.accessibilityLabel")}
            testID="session-clicker"
            style={{
              width: 160,
              height: 160,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.brand.primary,
              alignItems: "center",
              justifyContent: "center",
              ...theme.shadow.card,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: theme.radius.pill,
                borderWidth: 3,
                borderColor: theme.colors.text.onBrand,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.text.onBrand,
                }}
              />
            </View>
          </PressableScale>
          <Text
            variant="caption"
            tone="muted"
            align="center"
            testID="clicker-hint"
          >
            {clicks > 0
              ? t("session.train.clickerHint")
              : t("session.train.clickerRequired")}
          </Text>
        </View>
      ) : null}

      {step.repetitionTarget !== null ? (
        <RepetitionCounter
          count={reps}
          target={step.repetitionTarget}
          onAdd={() => addRepetition(content)}
          onUndo={() => removeRepetition(content)}
        />
      ) : null}

      {lastFailure === "step_requirements_unmet" ? (
        <Text variant="small" tone="error" testID="requirements-warning">
          {t("session.errors.stepRequirementsUnmet")}
        </Text>
      ) : null}

      <View style={{ gap: theme.space[2] }}>
        <Button
          label={
            isFinalStep ? t("session.train.finish") : t("session.train.next")
          }
          onPress={() => completeStep(content, step.id)}
          disabled={!satisfied}
          testID="advance-step"
        />
        {hasTroubleshooting ? (
          <Button
            label={t("common.cta.notWorking")}
            variant="secondary"
            onPress={onOpenHelp}
            testID="open-troubleshooting"
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * The repetition control.
 *
 * A single large target for the common action, because it is pressed while the other hand is busy. Undo is
 * present but deliberately small: mis-taps happen, and the alternative is a user who cannot correct a count and
 * ends up with a step they can never satisfy honestly.
 */
function RepetitionCounter({
  count,
  target,
  onAdd,
  onUndo,
}: {
  count: number;
  target: number;
  onAdd: () => void;
  onUndo: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const complete = count >= target;

  return (
    <Card padding="compact" testID="repetition-counter">
      <View style={{ gap: theme.space[3] }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text variant="bodyStrong">
            {t("session.train.repetitionsLabel")}
          </Text>
          <Text
            variant="bodyStrong"
            tone={complete ? "success" : "primary"}
            testID="repetition-count"
          >
            {t("session.train.repetitionsProgress", { count, target })}
          </Text>
        </View>

        <ProgressBar
          ratio={target === 0 ? 0 : count / target}
          accessibilityLabel={t("session.train.repetitionsProgress", {
            count,
            target,
          })}
          testID="repetition-progress"
        />

        <Button
          label={
            complete
              ? t("session.train.repetitionsComplete")
              : t("session.train.addRepetition")
          }
          onPress={onAdd}
          disabled={complete}
          testID="add-repetition"
        />

        {count > 0 ? (
          <Pressable
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel={t("session.train.undoRepetition")}
            hitSlop={12}
            testID="undo-repetition"
          >
            <Text variant="caption" tone="muted" align="center">
              {t("session.train.undoRepetition")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function TroubleshootingView({
  content,
  openOptionId,
  onOpenOption,
  onClose,
}: {
  content: LessonContent;
  openOptionId: string | null;
  onOpenOption: (id: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const viewTroubleshooting = useSessionStore((s) => s.viewTroubleshooting);
  const closeTroubleshooting = useSessionStore((s) => s.closeTroubleshooting);

  const options = orderedTroubleshooting(content);
  const open = options.find((option) => option.id === openOptionId) ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[6],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[4],
      }}
      testID="troubleshooting-screen"
    >
      <Text variant="h2">{t("session.troubleshooting.title")}</Text>

      {open ? (
        <View style={{ gap: theme.space[3] }} testID="troubleshooting-guidance">
          <Text variant="h3">{t(open.promptKey)}</Text>
          <Text variant="body" testID="guidance-body">
            {t(open.guidanceKey)}
          </Text>

          {/*
            Escalation is a property of the content, not a UI decision: any option that is not NORMAL carries a
            visible hand-off to a professional (brief §10, §34).
          */}
          {requiresProfessionalEscalation(open) ? (
            <Card padding="compact" testID="escalation-notice">
              <Text variant="small" tone="error">
                {t("session.troubleshooting.escalationNotice")}
              </Text>
            </Card>
          ) : null}

          <Button
            label={t("session.troubleshooting.backToTraining")}
            onPress={() => {
              // Resolving is recorded before leaving, so the event log shows help was read rather than dismissed.
              closeTroubleshooting(content, open.id);
              onClose();
            }}
            testID="close-troubleshooting"
          />
        </View>
      ) : (
        <View style={{ gap: theme.space[2] }}>
          <Text variant="body" tone="muted">
            {t("session.troubleshooting.subtitle")}
          </Text>
          {options.map((option) => (
            <Card
              key={option.id}
              padding="compact"
              onPress={() => {
                viewTroubleshooting(content, option.id);
                onOpenOption(option.id);
              }}
              accessibilityLabel={t(option.promptKey)}
              testID={`troubleshooting-${option.slug}`}
            >
              <Text variant="body">{t(option.promptKey)}</Text>
            </Card>
          ))}
          <Button
            label={t("session.troubleshooting.backToTraining")}
            variant="secondary"
            onPress={onClose}
            testID="cancel-troubleshooting"
          />
        </View>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function CompletionView({ content }: { content: LessonContent }) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const session = useSessionStore((s) => s.session);
  const clearSession = useSessionStore((s) => s.clear);
  const haptic = useHaptics();

  const plan = usePlanStore((s) => s.plan);
  const { catalogue } = useCatalogue();
  const completed = useTrainingLogStore((s) => s.completed);
  const isPremium = useEntitlementStore((s) => s.view.isPremiumActive);

  /**
   * One success haptic, on arrival.
   *
   * `hapticForEvent.lessonComplete` has existed since Phase 1 and nothing ever fired it — the design system
   * described a vocabulary the app never spoke. Finishing a lesson is the one moment in the product that earns a
   * notification-weight haptic, and it is paired with the visual change, never a substitute for it.
   */
  useEffect(() => {
    haptic("lessonComplete");
  }, [haptic]);

  /**
   * What is next, from the real plan.
   *
   * The session that just finished is already in the training log by the time this renders — the effect in
   * `TrainingScreen` records it — so `buildTodayView` ticks it off and the first remaining activity is genuinely
   * the next thing to do. When there is none, the day's plan is finished and the screen says exactly that.
   *
   * Nothing is fabricated here: no points, no badge, no streak. "What happens next" is the reward.
   */
  const today = new Date().toISOString().slice(0, 10);
  const next = useMemo(() => {
    if (!plan || !catalogue) return null;
    const view = buildTodayView(
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
    return (
      view.activities.find(
        (activity) =>
          !activity.done &&
          activity.lessonId !== content.lesson.id &&
          !(activity.premium && !isPremium),
      ) ?? null
    );
  }, [plan, catalogue, completed, today, content.lesson.id, isPremium]);

  if (!session) return null;

  const repetitions = session.events.filter(
    (event) => event.type === "repetition_logged",
  ).length;
  const clicks = session.events.filter(
    (event) => event.type === "clicker_pressed",
  ).length;

  const finish = (destination?: string) => {
    void clearSession().then(() => {
      router.replace(destination ?? "/");
    });
  };

  /**
   * Rewarding without being noisy. The brief rules out fake gamification, and a streak cannot honestly be shown:
   * streaks are server-computed from the event log, and a guest session has not reached the server. What is shown
   * is what actually happened, and what to do next.
   */
  return (
    <ScreenScroll center gap={theme.space[4]} testID="session-complete">
      <View style={{ alignItems: "center", gap: theme.space[3] }}>
        <CompletionMark />
        <Text variant="h1" align="center" testID="completion-title">
          {t("session.complete.title")}
        </Text>
        <Text
          variant="body"
          tone="muted"
          align="center"
          testID="completion-body"
        >
          {t("session.complete.body", { lesson: t(content.lesson.titleKey) })}
        </Text>
      </View>

      {/* What they actually did, counted from the session's own event log. */}
      <Card padding="comfortable">
        <View style={{ gap: theme.space[1] }}>
          <Text variant="bodyStrong" align="center" testID="completion-reps">
            {t("session.complete.repsSummary", { count: repetitions })}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {t("session.complete.clicksSummary", { count: clicks })}
          </Text>
        </View>
      </Card>

      {/* What happens next — the real next activity in today's plan, or the honest "that's the day". */}
      {next ? (
        <Card
          padding="comfortable"
          onPress={() => finish(`/lesson/${next.lessonSlug}`)}
          accessibilityLabel={`${t("session.complete.nextTitle")}. ${t(next.titleKey)}`}
          testID="completion-next"
        >
          <View style={{ gap: theme.space[1] }}>
            <Text variant="caption" tone="muted">
              {t("session.complete.nextTitle")}
            </Text>
            <Text variant="bodyStrong">{t(next.titleKey)}</Text>
            <Text variant="caption" tone="muted">
              {t("today.totalTime", { count: next.estimatedMinutes })}
            </Text>
          </View>
        </Card>
      ) : (
        <Text
          variant="small"
          tone="success"
          align="center"
          testID="completion-all-done"
        >
          {t("session.complete.nextAllDone")}
        </Text>
      )}

      <View style={{ gap: theme.space[2] }}>
        <Button
          label={t("session.complete.backToToday")}
          onPress={() => finish()}
          testID="completion-done"
        />
        <Button
          label={t("session.complete.trainAgain")}
          variant="secondary"
          onPress={() => finish(`/session/${content.lesson.slug}`)}
          testID="completion-train-again"
        />
      </View>
    </ScreenScroll>
  );
}

/**
 * The completion mark.
 *
 * A filled disc with a tick — shape and colour together, which is DESIGN_SYSTEM.md's rule for completion states.
 * Static rather than animated: the design system's "checkmark path draw" wants a vector library this app does not
 * carry, and a half-hearted scale-in would be decoration rather than comprehension. The haptic is what marks the
 * moment.
 */
function CompletionMark() {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 64,
        height: 64,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.brand.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="h2" style={{ color: theme.colors.text.onBrand }}>
        ✓
      </Text>
    </View>
  );
}
