import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Text,
  Button,
  Clicker,
  Glyph,
  RepMarks,
  Reveal,
  Row,
  Sheet,
  StepDots,
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
  type LessonStep,
} from "@pawcue/domain";
import { useLessonContent } from "../../src/lessons/useLessonContent";
import { useSessionStore } from "../../src/state/session-store";
import { useTrainingLogStore } from "../../src/state/training-log-store";
import { useDogStore } from "../../src/state/dog-store";
import { useDogPhotoStore } from "../../src/state/dog-photo-store";
import { useClicker } from "../../src/hooks/useClicker";
import { useHaptics } from "../../src/hooks/useHaptics";
import { useAnnounce } from "../../src/hooks/useAnnounce";
import { useCatalogue } from "../../src/lessons/useCatalogue";
import { usePlanStore } from "../../src/state/plan-store";
import { useEntitlementStore } from "../../src/state/entitlement-store";
import { buildTodayView } from "../../src/plans/plan-lifecycle";
import { ScreenScroll } from "../../src/components/ScreenScroll";
import { DogAvatar } from "../../src/components/DogAvatar";
import { Crossfade } from "../../src/components/Crossfade";

/**
 * The training screen — a coaching surface, not a stack of cards.
 *
 * One rule shapes everything here: the user is holding a dog. So the composition is fixed: where we are, at the
 * top; the instruction, large, in the middle; and a practice dock at the bottom holding only the controls this
 * step actually needs. Nothing scrolls except a long instruction inside its own region, and nothing on the
 * screen is boxed — the page is the container.
 *
 * It renders whatever the content says: the clicker appears because the step declares `requiresClickerPress`, the
 * rep marks because the step declares a `repetitionTarget`. The two are tracked independently, exactly as the
 * engine records them — a click is a marker, a counted rep is a judgement — and the dock integrates them
 * without merging them. There is no lesson-specific branch anywhere in this file.
 *
 * All session rules live in the engine (`@pawcue/domain`); this file dispatches and renders.
 */
export default function TrainingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { content, loading, error } = useLessonContent(slug);
  const session = useSessionStore((s) => s.session);
  const resumeOrBegin = useSessionStore((s) => s.resumeOrBegin);
  const recordLogEntry = useTrainingLogStore((s) => s.record);

  /** Transient UI state: whether help is open and which option is expanded. Never persisted. */
  const [helpVisible, setHelpVisible] = useState(false);
  const [openOptionId, setOpenOptionId] = useState<string | null>(null);

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
        <Text variant="title" align="center">
          {t("session.errors.unavailableTitle")}
        </Text>
        <Text variant="body" tone="secondary" align="center">
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

  return (
    <>
      <ActiveStepView
        content={content}
        onOpenHelp={() => setHelpVisible(true)}
      />
      <TroubleshootingSheet
        content={content}
        visible={helpVisible}
        openOptionId={openOptionId}
        onOpenOption={setOpenOptionId}
        onClose={() => {
          setOpenOptionId(null);
          setHelpVisible(false);
        }}
      />
    </>
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
  onOpenHelp,
}: {
  content: LessonContent;
  onOpenHelp: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const session = useSessionStore((s) => s.session);
  const lastFailure = useSessionStore((s) => s.lastFailure);
  const recordClick = useSessionStore((s) => s.click);
  const addRepetition = useSessionStore((s) => s.addRepetition);
  const removeRepetition = useSessionStore((s) => s.removeRepetition);
  const completeStep = useSessionStore((s) => s.completeStep);
  const dog = useDogStore((s) => s.dog);

  /** The Phase 2 clicker, unchanged: same engine, same preloaded pool, same settings. */
  const { click } = useClicker();

  const step = session ? currentStep(session, content) : null;

  const onClickerPress = useCallback(() => {
    // Audio first, session bookkeeping second: the sound is the time-critical half of this interaction.
    click();
    recordClick(content);
  }, [click, recordClick, content]);

  const reps = session && step ? repetitionsFor(session, step) : 0;
  const target = step?.repetitionTarget ?? null;
  /** Rep count changes are announced through a live region, so a screen-reader user hears "3 of 5" as it happens. */
  useAnnounce(
    target !== null && reps > 0
      ? t("session.train.repetitionsProgress", { count: reps, target })
      : null,
  );

  if (!session || !step) return null;

  const progress = sessionProgress(session, content);
  const clicks = clicksFor(session, step);
  const satisfied = isStepSatisfied(session, step);
  const isFinalStep = progress.stepNumber === progress.totalSteps;
  const hasTroubleshooting = content.troubleshooting.length > 0;

  return (
    <View
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      testID="training-screen"
    >
      {/* Where we are: the step trail, the lesson and step beneath it, and the way out. */}
      <View
        style={{
          paddingTop: insets.top + theme.space[3],
          paddingHorizontal: theme.screenGutter,
          gap: theme.space[2],
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space[4],
          }}
        >
          <View style={{ flex: 1, gap: theme.space[2] }}>
            <StepDots
              total={progress.totalSteps}
              current={progress.stepNumber}
              accessibilityLabel={t("session.train.progressLabel", {
                current: progress.stepNumber,
                total: progress.totalSteps,
                percent: Math.round(progress.ratio * 100),
              })}
              testID="session-progress"
            />
            <Text variant="secondary" tone="secondary">
              <Text variant="secondary" tone="secondary">
                {t(content.lesson.titleKey)}
                {", "}
              </Text>
              <Text variant="secondary" tone="secondary" testID="step-counter">
                {t("session.train.stepCounter", {
                  current: progress.stepNumber,
                  total: progress.totalSteps,
                })}
              </Text>
            </Text>
          </View>
          {/*
            "Pause", not "Exit".

            Leaving discards nothing: the session is persisted on every transition and `resumeOrBegin` picks it
            up again, so the honest word is pause, and the hint says the progress is saved.
          */}
          <Button
            label={t("session.train.pause")}
            variant="tertiary"
            size="md"
            fullWidth={false}
            icon={
              <Glyph
                name="pause"
                size={18}
                color={theme.colors.brand.primary}
              />
            }
            onPress={() => router.back()}
            accessibilityHint={t("session.train.pauseHint")}
            testID="pause-session"
          />
        </View>
      </View>

      {/* The instruction, large, introduced rather than swapped in when the step changes. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.screenGutter,
          paddingTop: theme.space[6],
          paddingBottom: theme.space[6],
          gap: theme.space[4],
        }}
      >
        <Reveal key={step.id} style={{ gap: theme.space[4] }}>
          <Text
            variant="headline"
            accessibilityRole="header"
            testID="step-instruction"
          >
            {t(step.instructionKey)}
          </Text>
          {coachingLine(step, t) ? (
            <Text variant="body" tone="secondary">
              {coachingLine(step, t)}
            </Text>
          ) : null}
        </Reveal>

        {hasTroubleshooting ? (
          <View style={{ alignItems: "flex-start" }}>
            <Button
              label={
                dog?.name
                  ? t("session.train.notGettingIt", { name: dog.name })
                  : t("common.cta.notWorking")
              }
              variant="tertiary"
              size="md"
              fullWidth={false}
              onPress={onOpenHelp}
              testID="open-troubleshooting"
            />
          </View>
        ) : null}

        {lastFailure === "step_requirements_unmet" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space[2],
            }}
            accessibilityRole="alert"
          >
            <Glyph name="alert" size={18} color={theme.colors.text.error} />
            <Text
              variant="secondary"
              tone="error"
              style={{ flex: 1 }}
              testID="requirements-warning"
            >
              {t("session.errors.stepRequirementsUnmet")}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* The practice dock: only what this step needs, sized for a hand that is also holding a leash. */}
      <View
        style={{
          paddingHorizontal: theme.screenGutter,
          paddingTop: theme.space[4],
          paddingBottom: insets.bottom + theme.space[4],
          gap: theme.space[4],
          borderTopWidth: theme.border.hairline,
          borderTopColor: theme.colors.border.separator,
          backgroundColor: theme.colors.background.base,
        }}
        testID="practice-dock"
      >
        {target !== null ? (
          <RepLine
            count={reps}
            target={target}
            onUndo={() => removeRepetition(content)}
          />
        ) : null}

        {step.requiresClickerPress ? (
          <View style={{ alignItems: "center", gap: theme.space[2] }}>
            <Clicker
              size={target !== null ? (satisfied ? 96 : 120) : 132}
              onPress={onClickerPress}
              /** Spelled out for screen readers: the sound is the whole point, so it must be announced. */
              accessibilityLabel={t("clicker.accessibilityLabel")}
              testID="session-clicker"
            />
            {target === null ? (
              <Text
                variant="secondary"
                tone="secondary"
                align="center"
                testID="clicker-hint"
              >
                {clicks > 0
                  ? t("session.train.clickerHint")
                  : t("session.train.clickerRequired")}
              </Text>
            ) : null}
          </View>
        ) : null}

        {target !== null ? (
          <Button
            label={
              reps >= target
                ? t("session.train.repetitionsComplete")
                : t("session.train.countIt")
            }
            icon={
              <Glyph
                name={reps >= target ? "check" : "plus"}
                size={20}
                color={
                  step.requiresClickerPress
                    ? theme.colors.brand.primary
                    : theme.colors.text.onBrand
                }
              />
            }
            /**
             * One dark object at a time. With a clicker on the dock, the clicker is it and the count control is a
             * white button; without one, counting is the primary act and takes the brand colour.
             */
            variant={step.requiresClickerPress ? "secondary" : "primary"}
            size="xl"
            onPress={() => addRepetition(content)}
            disabled={reps >= target}
            accessibilityHint={t("session.train.repHint")}
            testID="add-repetition"
          />
        ) : null}

        {/*
          The advance control morphs. Until the step is satisfied it is quiet and its label is the remaining work;
          it stays pressable, and a press explains (the engine refuses the step and the alert above says why).
          Once satisfied it becomes the primary action and names what comes next.
        */}
        <Crossfade stateKey={satisfied ? "ready" : "waiting"}>
          <Button
            label={
              satisfied
                ? isFinalStep
                  ? t("session.train.finish")
                  : t("session.train.next")
                : target !== null && reps < target
                  ? t("session.train.repetitionsRemaining", {
                      count: target - reps,
                    })
                  : t("session.train.clickToContinue")
            }
            icon={
              satisfied ? (
                <Glyph
                  name={isFinalStep ? "check" : "chevron-end"}
                  size={20}
                  color={theme.colors.text.onBrand}
                />
              ) : undefined
            }
            variant={satisfied ? "primary" : "secondary"}
            size={
              satisfied && !step.requiresClickerPress && target === null
                ? "xl"
                : "lg"
            }
            onPress={() => completeStep(content, step.id)}
            accessibilityHint={
              satisfied ? undefined : t("session.errors.stepRequirementsUnmet")
            }
            testID="advance-step"
          />
        </Crossfade>
      </View>
    </View>
  );
}

/** The one coaching line a step earns, derived from what it asks for. Nothing is invented to fill space. */
function coachingLine(step: LessonStep, t: TFunction): string | null {
  if (step.requiresClickerPress) return t("session.train.coachClick");
  if (step.repetitionTarget !== null)
    return t("session.train.coachReps", { count: step.repetitionTarget });
  return null;
}

/**
 * The rep line: the count as a display numeral, the marks filling beside it, and Undo once there is something
 * to undo. Mis-taps happen, and the alternative is a user who cannot correct a count and ends up with a step they
 * can never satisfy honestly.
 */
function RepLine({
  count,
  target,
  onUndo,
}: {
  count: number;
  target: number;
  onUndo: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const complete = count >= target;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space[4],
      }}
      testID="repetition-counter"
    >
      {/* The numeral rolls up as a rep is counted; the "of 5" beside it stays put. */}
      <Crossfade stateKey={String(count)} rise={8}>
        <Text
          variant="displayNumeral"
          tone={complete ? "reward" : "primary"}
          accessibilityRole="text"
          accessibilityLabel={t("session.train.repetitionsProgress", {
            count,
            target,
          })}
          testID="repetition-count"
        >
          {String(count)}
          <Text variant="title" tone="secondary">
            {" "}
            {t("session.train.ofTarget", { target })}
          </Text>
        </Text>
      </Crossfade>
      <View style={{ flex: 1, gap: theme.space[2] }}>
        <RepMarks
          count={count}
          target={target}
          accessibilityLabel={t("session.train.repetitionsProgress", {
            count,
            target,
          })}
          testID="repetition-progress"
        />
        {count > 0 ? (
          <View style={{ alignItems: "flex-start" }}>
            <Button
              label={t("session.train.undo")}
              variant="tertiary"
              size="md"
              fullWidth={false}
              icon={
                <Glyph
                  name="undo"
                  size={16}
                  color={theme.colors.brand.primary}
                />
              }
              onPress={onUndo}
              accessibilityLabel={t("session.train.undoRepetition")}
              testID="undo-repetition"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * Help, as a sheet over the session rather than a screen that replaces it.
 *
 * Six plain rows, no icons. Tapping one expands its guidance in place and records that it was read; the
 * escalation is a property of the content, not a UI decision: any option that is not NORMAL carries a visible
 * hand-off to a professional, in the destructive colour with the alert mark and the words — never colour alone.
 */
function TroubleshootingSheet({
  content,
  visible,
  openOptionId,
  onOpenOption,
  onClose,
}: {
  content: LessonContent;
  visible: boolean;
  openOptionId: string | null;
  onOpenOption: (id: string | null) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const dog = useDogStore((s) => s.dog);
  const photoUri = useDogPhotoStore((s) => s.photoFor(dog?.id));

  const viewTroubleshooting = useSessionStore((s) => s.viewTroubleshooting);
  const closeTroubleshooting = useSessionStore((s) => s.closeTroubleshooting);

  const options = orderedTroubleshooting(content);
  const open = options.find((option) => option.id === openOptionId) ?? null;

  const finish = () => {
    // Resolving is recorded before leaving, so the event log shows help was read rather than dismissed.
    if (open) closeTroubleshooting(content, open.id);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={finish}
      title={
        dog?.name
          ? t("session.troubleshooting.whatIsDoing", { name: dog.name })
          : t("session.troubleshooting.title")
      }
      closeLabel={t("common.cta.close")}
      leading={
        <DogAvatar
          breed={dog?.breed ?? null}
          birthdate={dog?.birthdate ?? null}
          photoUri={photoUri}
          size={44}
          expression="puzzled"
        />
      }
      footer={
        <Button
          label={t("session.troubleshooting.backToTraining")}
          onPress={finish}
          testID="close-troubleshooting"
        />
      }
      testID="troubleshooting-screen"
    >
      <Text
        variant="body"
        tone="secondary"
        style={{ paddingBottom: theme.space[2] }}
      >
        {t("session.troubleshooting.subtitle")}
      </Text>
      {options.map((option, index) => {
        const expanded = open?.id === option.id;
        return (
          <View key={option.id}>
            <Row
              title={t(option.promptKey)}
              trailing={
                <Glyph
                  name={expanded ? "minus" : "chevron-end"}
                  size={20}
                  color={theme.colors.text.secondary}
                />
              }
              separator={!expanded && index < options.length - 1}
              onPress={() => {
                if (expanded) {
                  closeTroubleshooting(content, option.id);
                  onOpenOption(null);
                  return;
                }
                viewTroubleshooting(content, option.id);
                onOpenOption(option.id);
              }}
              accessibilityLabel={t(option.promptKey)}
              accessibilityState={{ expanded }}
              testID={`troubleshooting-${option.slug}`}
            />
            {expanded ? (
              <Reveal
                style={{
                  gap: theme.space[3],
                  paddingBottom: theme.space[5],
                  borderBottomWidth:
                    index < options.length - 1 ? theme.border.hairline : 0,
                  borderBottomColor: theme.colors.border.separator,
                }}
                testID="troubleshooting-guidance"
              >
                <Text variant="body" testID="guidance-body">
                  {t(option.guidanceKey)}
                </Text>
                {requiresProfessionalEscalation(option) ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: theme.space[3],
                      paddingVertical: theme.space[3],
                      paddingHorizontal: theme.space[4],
                      borderRadius: theme.radius.object,
                      borderWidth: theme.border.focus,
                      borderColor: theme.colors.status.error,
                    }}
                    accessible
                    accessibilityRole="alert"
                    accessibilityLabel={t(
                      "session.troubleshooting.escalationNotice",
                    )}
                    testID="escalation-notice"
                  >
                    <Glyph
                      name="alert"
                      size={22}
                      color={theme.colors.status.error}
                    />
                    <Text variant="body" tone="error" style={{ flex: 1 }}>
                      {t("session.troubleshooting.findTrainer")}
                    </Text>
                  </View>
                ) : null}
              </Reveal>
            ) : null}
          </View>
        );
      })}
    </Sheet>
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
  const dog = useDogStore((s) => s.dog);

  const plan = usePlanStore((s) => s.plan);
  const { catalogue } = useCatalogue();
  const completed = useTrainingLogStore((s) => s.completed);
  const isPremium = useEntitlementStore((s) => s.view.isPremiumActive);

  /**
   * One success haptic, on arrival, paired with the visual change — never a substitute for it. Finishing a lesson
   * is the one moment in the product that earns a notification-weight haptic.
   */
  useEffect(() => {
    haptic("lessonComplete");
  }, [haptic]);

  /**
   * What is next, from the real plan.
   *
   * The session that just finished is already in the training log by the time this renders, so `buildTodayView`
   * ticks it off and the first remaining activity is genuinely the next thing to do. When there is none, the
   * day's plan is finished and the screen says exactly that. Nothing is fabricated: no points, no badge, no streak.
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

  const lesson = t(content.lesson.titleKey);
  const factParts = {
    reps: t("session.complete.factReps", { count: repetitions }),
    clicks: t("session.complete.factClicks", { count: clicks }),
    minutes: t("session.complete.factMinutes", {
      count: content.lesson.estimatedMinutes,
    }),
  };

  return (
    <ScreenScroll gap={theme.space[8]} testID="session-complete">
      {/* The dog, happy, is the celebration. The words are facts about what happened. */}
      <View style={{ alignItems: "center", paddingTop: theme.space[4] }}>
        <DogAvatar
          breed={dog?.breed ?? null}
          birthdate={dog?.birthdate ?? null}
          size={200}
          pose="scene"
          expression="happy"
        />
      </View>

      <Reveal style={{ gap: theme.space[2] }}>
        <Text
          variant="headline"
          accessibilityRole="header"
          testID="completion-title"
        >
          {t("session.complete.title")}{" "}
          {t("session.complete.lessonDone", { lesson })}
        </Text>
        <Text variant="body" tone="secondary" testID="completion-body">
          <Text variant="body" tone="secondary" testID="completion-reps">
            {factParts.reps}
          </Text>
          {clicks > 0
            ? `, ${factParts.clicks}, ${factParts.minutes}.`
            : `, ${factParts.minutes}.`}
        </Text>
      </Reveal>

      {/* What happens next — the real next activity in today's plan, or the honest "that's the day". */}
      <Reveal delay={120}>
        {next ? (
          <Text variant="body" testID="completion-next-line">
            {t("session.complete.nextLine", {
              lesson: t(next.titleKey),
              minutes: next.estimatedMinutes,
              count: next.estimatedMinutes,
            })}
          </Text>
        ) : (
          <Text variant="body" testID="completion-all-done">
            {t("session.complete.nextAllDone")}
          </Text>
        )}
      </Reveal>

      <View style={{ gap: theme.space[2] }}>
        {next ? (
          <>
            <Button
              label={t("today.startLesson", { lesson: t(next.titleKey) })}
              onPress={() => finish(`/lesson/${next.lessonSlug}`)}
              accessibilityLabel={`${t("session.complete.nextTitle")}. ${t("today.startLesson", { lesson: t(next.titleKey) })}`}
              testID="completion-next"
            />
            <Button
              label={t("session.complete.backToToday")}
              variant="secondary"
              onPress={() => finish()}
              testID="completion-done"
            />
          </>
        ) : (
          <Button
            label={t("session.complete.backToToday")}
            onPress={() => finish()}
            testID="completion-done"
          />
        )}
        <Button
          label={t("session.complete.trainAgain")}
          variant="tertiary"
          onPress={() => finish(`/session/${content.lesson.slug}`)}
          testID="completion-train-again"
        />
      </View>
    </ScreenScroll>
  );
}
