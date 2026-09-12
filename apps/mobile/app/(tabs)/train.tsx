import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, useTheme } from "@pawcue/ui";
import { canStartLesson, type LessonStatusDetail } from "@pawcue/domain";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import { useDogStore } from "../../src/state/dog-store";
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

  const sections = [
    {
      key: "ready",
      titleKey: "train.sectionReady",
      items: statuses.filter(
        (item) => item.status === "unfinished" || item.status === "not_started",
      ),
    },
    {
      key: "completed",
      titleKey: "train.sectionCompleted",
      items: statuses.filter((item) => item.status === "completed"),
    },
    {
      key: "locked",
      titleKey: "train.sectionLocked",
      items: statuses.filter((item) => item.status === "locked"),
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
            {section.items.map((item) => (
              <LessonCard
                key={item.lesson.id}
                detail={item}
                /**
                 * The handler exists only when the lesson can actually be started.
                 *
                 * Deciding here rather than inside the card means a locked lesson has no navigation attached at
                 * any level — not on the card, not on the component wrapping it — so there is nothing for a stray
                 * press to find.
                 */
                {...(canStartLesson(item)
                  ? {
                      onPress: () => router.push(`/lesson/${item.lesson.slug}`),
                    }
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
 * A locked lesson is not pressable at all, rather than pressable-and-then-refused: `canStartLesson` is the single
 * check, and withholding `onPress` also removes the button role, so assistive technology is told the same thing
 * the visual treatment says.
 */
function LessonCard({
  detail,
  onPress,
}: {
  detail: LessonStatusDetail;
  /** Absent when the lesson is locked. Its absence is what makes the card inert. */
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const startable = onPress !== undefined;

  const statusTone =
    detail.status === "completed"
      ? "success"
      : detail.status === "unfinished"
        ? "brand"
        : "muted";

  return (
    <Card
      padding="compact"
      {...(onPress ? { onPress } : {})}
      // The status is part of the accessible name, never conveyed by colour alone.
      accessibilityLabel={`${t(detail.lesson.titleKey)}. ${t(
        `train.status.${detail.status}`,
      )}`}
      testID={`lesson-card-${detail.lesson.slug}`}
      {...(startable ? {} : { style: { opacity: 0.6 } })}
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
            tone={statusTone}
            testID={`lesson-status-${detail.lesson.slug}`}
          >
            {t(`train.status.${detail.status}`)}
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

        {detail.status === "locked" ? (
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
