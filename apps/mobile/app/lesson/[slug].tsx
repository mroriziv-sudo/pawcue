import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import { isPremiumLesson, orderedSteps } from "@pawcue/domain";
import { useLessonContent } from "../../src/lessons/useLessonContent";
import { useEntitlementStore } from "../../src/state/entitlement-store";

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { content, source, loading, error } = useLessonContent(slug);
  const isPremium = useEntitlementStore((s) => s.view.isPremiumActive);

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[4],
      }}
      testID="lesson-overview"
    >
      <Text variant="h1" testID="lesson-title">
        {t(content.lesson.titleKey)}
      </Text>

      {source === "cache" ? (
        <Text variant="caption" tone="muted" testID="lesson-offline-notice">
          {t("session.overview.offlineNotice")}
        </Text>
      ) : null}

      <View style={{ gap: theme.space[2] }}>
        <Text variant="h3">{t("session.overview.goalLabel")}</Text>
        <Text variant="body" tone="muted" testID="lesson-goal">
          {t(content.lesson.goalKey)}
        </Text>
      </View>

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

      <View style={{ gap: theme.space[2] }}>
        <Text variant="h3">{t("session.overview.equipmentLabel")}</Text>
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
      </View>

      {/*
        A locked lesson still shows everything above: the goal, the time it takes, the equipment. Hiding the
        content behind the paywall would make the decision harder, not the product more valuable — what is
        withheld is the training, not the description of it.
      */}
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
      ) : (
        <Button
          label={t("common.cta.startTraining")}
          onPress={() => router.push(`/session/${content.lesson.slug}`)}
          testID="start-training"
        />
      )}
    </ScrollView>
  );
}
