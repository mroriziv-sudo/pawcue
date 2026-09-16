import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Button, Glyph, useTheme } from "@pawcue/ui";
import { isPremiumLesson, lessonGate, orderedSteps } from "@pawcue/domain";
import { useLessonContent } from "../../src/lessons/useLessonContent";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import { useEntitlementStore } from "../../src/state/entitlement-store";
import {
  resumableSession,
  useSessionStore,
} from "../../src/state/session-store";
import { ScreenScroll, Section } from "../../src/components/ScreenScroll";
import { SectionHeader } from "../../src/components/SectionHeader";
import { BackControl } from "../../src/components/BackControl";

/**
 * Lesson overview — what you are about to teach, before any training starts.
 *
 * This screen exists so the training screen does not have to explain itself. Everything a user needs in order to
 * decide "am I ready to do this right now" (goal, time, equipment, shape of the lesson) belongs here, in
 * sentences on the paper, which is what lets the training screen stay as quiet as it does.
 *
 * Nothing about the layout is lesson-specific: it renders whatever the content aggregate contains.
 */
export default function LessonOverviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { content, source, loading, error } = useLessonContent(slug);
  const entitlement = useEntitlementStore((s) => s.view);
  const isPremium = entitlement.isPremiumActive;
  const { statuses } = useLessonStatuses();
  const resumable = useSessionStore((s) => resumableSession(s.session));

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background.base,
        }}
        testID="lesson-loading"
      >
        <ActivityIndicator color={theme.colors.brand.primary} />
      </View>
    );
  }

  if (error || !content) {
    return (
      <ScreenScroll center gap={theme.space[3]} testID="lesson-unavailable">
        <Text variant="headline" accessibilityRole="header">
          {t("session.errors.unavailableTitle")}
        </Text>
        <Text variant="body" tone="secondary">
          {t("session.errors.unavailableBody")}
        </Text>
        <View style={{ height: theme.space[2] }} />
        <Button
          label={t("common.cta.close")}
          variant="secondary"
          onPress={() => router.back()}
          testID="lesson-unavailable-close"
        />
      </ScreenScroll>
    );
  }

  const steps = orderedSteps(content);

  /**
   * The gate, evaluated here — before the session exists.
   *
   * Both Today and Train already route a locked lesson to the paywall, so this is the second line rather than the
   * first: a deep link (`pawcue://lesson/down`) reaches this screen directly, and a lesson that is only protected
   * by the screens that link to it is not protected.
   *
   * Checking here and nowhere later is also what keeps a refreshed entitlement from interrupting training. The
   * session screen never asks this question, so an answer that arrives mid-lesson cannot close one.
   */
  const premiumLocked = isPremiumLesson(content.lesson) && !isPremium;

  /**
   * The prerequisite lock, checked here too. The catalogue statuses may be absent (content served from the
   * offline cache with no catalogue reachable); then this falls back to the premium check alone.
   */
  const detail =
    statuses.find((item) => item.lesson.id === content.lesson.id) ?? null;
  const prerequisiteLocked = detail
    ? lessonGate(detail, entitlement).prerequisiteLocked
    : false;

  const equipment =
    content.lesson.equipment.length > 0
      ? content.lesson.equipment.filter((item) => item !== "none")
      : [];
  const lesson = t(content.lesson.titleKey);
  /** This lesson is the one paused on this device: the button continues it, in Today's words. */
  const paused = resumable?.lessonSlug === content.lesson.slug;

  return (
    <ScreenScroll gap={theme.space[8]} testID="lesson-overview">
      <BackControl testID="lesson-back" />

      {/* The lesson, and how big a commitment it is, in one glance. */}
      <View style={{ gap: theme.space[2] }}>
        <Text
          variant="headline"
          accessibilityRole="header"
          testID="lesson-title"
        >
          {lesson}
        </Text>
        <Text variant="secondary" tone="secondary">
          <Text variant="secondary" tone="secondary" testID="lesson-duration">
            {t("session.overview.durationLabel", {
              count: content.lesson.estimatedMinutes,
            })}
          </Text>
          {", "}
          <Text
            variant="secondary"
            tone="secondary"
            testID="lesson-steps-count"
          >
            {t("session.overview.stepsLabel", { count: steps.length })}
          </Text>
          {"."}
        </Text>
        {source === "cache" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space[2],
              paddingTop: theme.space[1],
            }}
          >
            <Glyph name="alert" size={16} color={theme.colors.text.secondary} />
            <Text
              variant="caption"
              tone="secondary"
              testID="lesson-offline-notice"
            >
              {t("session.overview.offlineNotice")}
            </Text>
          </View>
        ) : null}
      </View>

      <Section>
        <SectionHeader title={t("session.overview.goalLabel")} />
        <Text variant="body" testID="lesson-goal">
          {t(content.lesson.goalKey)}
        </Text>
      </Section>

      <Section>
        <SectionHeader title={t("session.overview.equipmentLabel")} />
        <Text variant="body" testID="lesson-equipment">
          {equipment.length === 0
            ? t("session.overview.needNothing")
            : equipment.map((item, index) => (
                <Text variant="body" key={item}>
                  {index > 0
                    ? index === equipment.length - 1
                      ? t("common.list.and")
                      : t("common.list.comma")
                    : ""}
                  <Text variant="body" testID={`equipment-${item}`}>
                    {t(`session.equipment.${item}`)}
                  </Text>
                  {index === equipment.length - 1 ? "." : ""}
                </Text>
              ))}
        </Text>
      </Section>

      {/*
        A locked lesson still shows everything above: the goal, the time it takes, the equipment. Hiding the
        content behind a lock would make the decision harder, not the product more valuable — what is withheld is
        the training, not the description of it.

        The two locks are stated separately, together when both apply, so subscribing is never presented as the
        way past a prerequisite.
      */}
      {prerequisiteLocked ? (
        <Section>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space[2],
            }}
          >
            <Glyph name="lock" size={18} color={theme.colors.text.primary} />
            <Text
              variant="bodyStrong"
              style={{ flex: 1 }}
              testID="lesson-prerequisite-locked"
            >
              {t("session.overview.prerequisiteTitle")}
            </Text>
          </View>
          <Text variant="body" tone="secondary">
            {t("train.lockedHint")}
          </Text>
        </Section>
      ) : null}

      {premiumLocked ? (
        <Section gap={theme.space[3]}>
          <View style={{ gap: theme.space[2] }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.space[2],
              }}
            >
              <Glyph name="lock" size={18} color={theme.colors.text.primary} />
              <Text
                variant="bodyStrong"
                style={{ flex: 1 }}
                testID="lesson-premium-locked"
              >
                {t("session.overview.premiumTitle")}
              </Text>
            </View>
            <Text variant="body" tone="secondary">
              {t("train.premiumHint")}
            </Text>
          </View>
          <Button
            label={t("billing.upgrade")}
            onPress={() => router.push("/paywall")}
            testID="lesson-premium-cta"
          />
        </Section>
      ) : null}

      {!premiumLocked && !prerequisiteLocked ? (
        <Button
          label={
            paused
              ? t("today.continueLesson", { lesson })
              : t("today.startLesson", { lesson })
          }
          onPress={() => router.push(`/session/${content.lesson.slug}`)}
          testID="start-training"
        />
      ) : null}
    </ScreenScroll>
  );
}
