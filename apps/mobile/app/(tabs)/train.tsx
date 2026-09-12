import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, useTheme } from "@pawcue/ui";
import {
  lessonGate,
  type LessonGate,
  type LessonStatusDetail,
} from "@pawcue/domain";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import { useDogStore } from "../../src/state/dog-store";
import { useEntitlementStore } from "../../src/state/entitlement-store";
import { EmptyState } from "./index";

/**
 * Train — the lesson catalogue.
 *
 * Phase 0 defines no courses or categories, so this does not invent them. The honest structure the data does
 * support is by state: what can be trained now, what has been learned, and what is still locked. That ordering is
 * also the useful one — the first section is the only one most people need.
 *
 * Every state is derived from real history by `deriveLessonStatuses`; nothing here is stored or counted twice.
 */
export default function TrainScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const dog = useDogStore((s) => s.dog);
  const { statuses, loading, error } = useLessonStatuses();
  const entitlement = useEntitlementStore((s) => s.view);

  /**
   * Each lesson's two locks, resolved once.
   *
   * `lessonGate` keeps them separate: a prerequisite lock and a premium lock have different causes and different
   * ways out, and a lesson can carry both. Nothing below collapses them into a single "locked".
   */
  const gated = statuses.map((detail) => ({
    detail,
    gate: lessonGate(detail, entitlement),
  }));

  /**
   * Premium content gets its own section rather than being mixed into "Coming up".
   *
   * Sorting by state is Phase 6's structure and it still holds — but "you have not trained the prerequisite yet"
   * and "this is part of the subscription" are not the same state, and a user who reads them as one will try to
   * train their way to content that training cannot reach.
   */
  const sections = [
    {
      key: "ready",
      titleKey: "train.sectionReady",
      items: gated.filter(
        (item) =>
          item.gate.canStart &&
          (item.detail.status === "unfinished" ||
            item.detail.status === "not_started"),
      ),
    },
    {
      key: "completed",
      titleKey: "train.sectionCompleted",
      items: gated.filter(
        (item) =>
          item.detail.status === "completed" && !item.gate.premiumLocked,
      ),
    },
    {
      key: "locked",
      titleKey: "train.sectionLocked",
      items: gated.filter(
        (item) => item.gate.prerequisiteLocked && !item.gate.premiumLocked,
      ),
    },
    {
      key: "premium",
      titleKey: "train.sectionPremium",
      items: gated.filter((item) => item.gate.premiumLocked),
    },
  ].filter((section) => section.items.length > 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[5],
        paddingBottom: theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[5],
      }}
      testID="train-screen"
    >
      <View style={{ gap: theme.space[1] }}>
        <Text variant="h1">{t("train.title")}</Text>
        <Text variant="small" tone="muted">
          {dog
            ? t("train.subtitle", { name: dog.name })
            : t("train.subtitleGeneric")}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator
          color={theme.colors.brand.primary}
          testID="train-loading"
        />
      ) : error || statuses.length === 0 ? (
        <EmptyState
          title={t("train.emptyTitle")}
          body={t("train.emptyBody")}
          testID="train-empty"
        />
      ) : (
        sections.map((section) => (
          <View key={section.key} style={{ gap: theme.space[2] }}>
            <Text variant="h3" testID={`train-section-${section.key}`}>
              {t(section.titleKey)}
            </Text>
            {section.items.map(({ detail, gate }) => (
              <LessonCard
                key={detail.lesson.id}
                detail={detail}
                gate={gate}
                /**
                 * The handler exists only when the lesson can actually be started, and the two locks route
                 * differently: a premium lock leads to the paywall, because that is the way out of it, while a
                 * prerequisite lock leads nowhere — there is nothing to buy and nothing to open.
                 *
                 * Deciding here rather than inside the card means a locked lesson has no navigation to the lesson
                 * attached at any level, so there is nothing for a stray press to find.
                 */
                {...(gate.canStart
                  ? {
                      onPress: () =>
                        router.push(`/lesson/${detail.lesson.slug}`),
                    }
                  : gate.premiumLocked && !gate.prerequisiteLocked
                    ? { onPress: () => router.push("/paywall") }
                    : {})}
              />
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

/**
 * One lesson in the catalogue.
 *
 * A lesson that cannot be started is not pressable *into the lesson*, rather than pressable-and-then-refused:
 * withholding `onPress` also removes the button role, so assistive technology is told the same thing the visual
 * treatment says. A premium-locked lesson is pressable, but it opens the paywall — the thing that actually
 * resolves its lock.
 *
 * Both locks are stated, in that order, whenever both apply. "Premium" alone would tell a user to pay for
 * something they still could not train.
 */
function LessonCard({
  detail,
  gate,
  onPress,
}: {
  detail: LessonStatusDetail;
  gate: LessonGate;
  /** Absent when there is nowhere useful to go. Its absence is what makes the card inert. */
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const statusTone =
    detail.status === "completed"
      ? "success"
      : detail.status === "unfinished"
        ? "brand"
        : "muted";

  // What the badge says: the premium lock is the headline when it applies, since it is the one with a way out.
  const badgeKey = gate.premiumLocked
    ? "train.premiumLocked"
    : `train.status.${detail.status}`;

  const accessibleState = [
    gate.premiumLocked ? t("train.premiumLocked") : null,
    gate.prerequisiteLocked
      ? t("train.status.locked")
      : gate.premiumLocked
        ? null
        : t(`train.status.${detail.status}`),
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Card
      padding="compact"
      {...(onPress ? { onPress } : {})}
      // Every lock is part of the accessible name, never conveyed by colour or dimming alone.
      accessibilityLabel={`${t(detail.lesson.titleKey)}. ${accessibleState}`}
      testID={`lesson-card-${detail.lesson.slug}`}
      {...(gate.canStart ? {} : { style: { opacity: 0.6 } })}
    >
      <View style={{ gap: theme.space[1] }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: theme.space[2],
          }}
        >
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {t(detail.lesson.titleKey)}
          </Text>
          <Text
            variant="caption"
            tone={gate.premiumLocked ? "brand" : statusTone}
            testID={`lesson-status-${detail.lesson.slug}`}
          >
            {t(badgeKey)}
          </Text>
        </View>

        <Text variant="small" tone="muted" numberOfLines={2}>
          {t(detail.lesson.goalKey)}
        </Text>

        <Text variant="caption" tone="muted">
          {t("session.overview.durationLabel", {
            count: detail.lesson.estimatedMinutes,
          })}
        </Text>

        {detail.status === "completed" && detail.completions > 0 ? (
          <Text
            variant="caption"
            tone="muted"
            testID={`lesson-completions-${detail.lesson.slug}`}
          >
            {t("train.completedCount", { count: detail.completions })}
          </Text>
        ) : null}

        {/*
          Each lock explains itself in its own words. Shown together when both apply, so the user learns that
          subscribing alone will not make this lesson startable.
        */}
        {gate.premiumLocked ? (
          <Text
            variant="caption"
            tone="muted"
            testID={`lesson-premium-${detail.lesson.slug}`}
          >
            {t("train.premiumHint")}
          </Text>
        ) : null}

        {gate.prerequisiteLocked ? (
          <Text
            variant="caption"
            tone="muted"
            testID={`lesson-locked-${detail.lesson.slug}`}
          >
            {t("train.lockedHint")}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
