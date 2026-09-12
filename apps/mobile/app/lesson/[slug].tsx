import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import { isPremiumLesson, lessonGate, orderedSteps } from "@pawcue/domain";
import { useLessonContent } from "../../src/lessons/useLessonContent";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import { useEntitlementStore } from "../../src/state/entitlement-store";
import { ScreenScroll, Section } from "../../src/components/ScreenScroll";
import { SectionHeader } from "../../src/components/SectionHeader";

/**
 * Lesson overview — what you are about to teach, before any training starts.
 *
 * This screen exists so the training screen does not have to explain itself. Everything a user needs in order to
 * decide "am I ready to do this right now" (goal, time, equipment, shape of the lesson) belongs here, which is
 * what lets the training screen stay as quiet as it does.
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
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          gap: theme.space[3],
          padding: theme.screenGutter,
          backgroundColor: theme.colors.background.base,
        }}
        testID="lesson-unavailable"
      >
        <Text variant="h2">{t("session.errors.unavailableTitle")}</Text>
        <Text variant="body" tone="muted">
          {t("session.errors.unavailableBody")}
        </Text>
        <Button
          label={t("common.cta.close")}
          variant="secondary"
          onPress={() => router.back()}
          testID="lesson-unavailable-close"
        />
      </View>
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
   * The prerequisite lock, checked here too.
   *
   * Train withholds navigation to a lesson whose prerequisites are unmet, and until Phase 7 that was enough: the
   * only way in was through Train. The paywall changed that. A user who opens a doubly-locked lesson, subscribes,
   * and comes back lands on this screen with the premium lock gone — and nothing here knew about the other one,
   * so "Start training" appeared for a lesson the dog was not ready for.
   *
   * The catalogue statuses may be absent (content served from the offline cache with no catalogue reachable);
   * then this falls back to the premium check alone, which is what the screen did before and is still honest.
   */
  const detail =
    statuses.find((item) => item.lesson.id === content.lesson.id) ?? null;
  const prerequisiteLocked = detail
    ? lessonGate(detail, entitlement).prerequisiteLocked
    : false;

  return (
    <ScreenScroll gap={theme.space[4]} testID="lesson-overview">
      <Text variant="h1" testID="lesson-title">
        {t(content.lesson.titleKey)}
      </Text>

      {source === "cache" ? (
        <Text variant="caption" tone="muted" testID="lesson-offline-notice">
          {t("session.overview.offlineNotice")}
        </Text>
      ) : null}

      <Section>
        <SectionHeader title={t("session.overview.goalLabel")} />
        <Text variant="body" tone="muted" testID="lesson-goal">
          {t(content.lesson.goalKey)}
        </Text>
      </Section>

      <Card padding="compact">
        <View style={{ gap: theme.space[1] }}>
          <Text variant="bodyStrong" testID="lesson-duration">
            {t("session.overview.durationLabel", {
              count: content.lesson.estimatedMinutes,
            })}
          </Text>
          <Text variant="small" tone="muted" testID="lesson-steps-count">
            {t("session.overview.stepsLabel", { count: steps.length })}
          </Text>
        </View>
      </Card>

      <Section>
        <SectionHeader title={t("session.overview.equipmentLabel")} />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.space[2],
          }}
          testID="lesson-equipment"
        >
          {(content.lesson.equipment.length > 0
            ? content.lesson.equipment
            : ["none"]
          ).map((item) => (
            <View
              key={item}
              style={{
                paddingVertical: theme.space[1],
                paddingHorizontal: theme.space[3],
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.brand.secondary,
              }}
            >
              <Text variant="small" testID={`equipment-${item}`}>
                {t(`session.equipment.${item}`)}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      {/*
        A locked lesson still shows everything above: the goal, the time it takes, the equipment. Hiding the
        content behind a lock would make the decision harder, not the product more valuable — what is withheld is
        the training, not the description of it.

        The two locks are separate cards, shown together when both apply, so subscribing is never presented as the
        way past a prerequisite.
      */}
      {prerequisiteLocked ? (
        <Card padding="comfortable" testID="lesson-prerequisite-locked">
          <View style={{ gap: theme.space[2] }}>
            <Text variant="h3">{t("session.overview.prerequisiteTitle")}</Text>
            <Text variant="body" tone="muted">
              {t("train.lockedHint")}
            </Text>
          </View>
        </Card>
      ) : null}

      {premiumLocked ? (
        <Card padding="comfortable" testID="lesson-premium-locked">
          <View style={{ gap: theme.space[2] }}>
            <Text variant="h3">{t("today.activityPremium")}</Text>
            <Text variant="body" tone="muted">
              {t("train.premiumHint")}
            </Text>
            <Button
              label={t("billing.upgrade")}
              onPress={() => router.push("/paywall")}
              testID="lesson-premium-cta"
            />
          </View>
        </Card>
      ) : null}

      {!premiumLocked && !prerequisiteLocked ? (
        <Button
          label={t("common.cta.startTraining")}
          onPress={() => router.push(`/session/${content.lesson.slug}`)}
          testID="start-training"
        />
      ) : null}
    </ScreenScroll>
  );
}
