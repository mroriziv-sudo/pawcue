import { ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Glyph,
  Row,
  Text,
  TrailMark,
  useTheme,
  type TrailState,
} from "@pawcue/ui";
import {
  lessonGate,
  type LessonGate,
  type LessonStatusDetail,
} from "@pawcue/domain";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import { useDogStore } from "../../src/state/dog-store";
import { useEntitlementStore } from "../../src/state/entitlement-store";
import {
  resumableSession,
  useSessionStore,
} from "../../src/state/session-store";
import { EmptyState } from "../../src/components/EmptyState";
import { ScreenScroll, Section } from "../../src/components/ScreenScroll";
import { SectionHeader } from "../../src/components/SectionHeader";

/**
 * Train — the lesson catalogue.
 *
 * Phase 0 defines no courses or categories, so this does not invent them. The honest structure the data does
 * support is by state: what was left unfinished, what can be trained now, what has been learned, what is locked
 * behind a prerequisite — and, separately, what a subscription would unlock. Each group is rows on the paper
 * with a trail mark that says the state in shape, and a meta line that says it in words.
 *
 * Every state is derived from real history by `deriveLessonStatuses`; nothing here is stored or counted twice.
 * The one exception is the lesson paused on this device: the server learns of it only once it is abandoned, so
 * the local session is consulted the way Today and the Dog tab consult it, and a paused lesson is unfinished here
 * too.
 */
export default function TrainScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const dog = useDogStore((s) => s.dog);
  const { statuses, loading, error } = useLessonStatuses();
  const entitlement = useEntitlementStore((s) => s.view);
  const resumable = useSessionStore((s) => resumableSession(s.session));

  /** Each lesson's two locks, resolved once. `lessonGate` keeps them separate: different causes, different ways out. */
  const gated = statuses
    .map((detail) =>
      detail.status === "not_started" &&
      resumable?.lessonSlug === detail.lesson.slug
        ? { ...detail, status: "unfinished" as const }
        : detail,
    )
    .map((detail) => ({
      detail,
      gate: lessonGate(detail, entitlement),
    }));

  const sections = [
    {
      key: "unfinished",
      titleKey: "train.sectionUnfinished",
      items: gated.filter(
        (item) => item.gate.canStart && item.detail.status === "unfinished",
      ),
    },
    {
      key: "ready",
      titleKey: "train.sectionReady",
      items: gated.filter(
        (item) => item.gate.canStart && item.detail.status === "not_started",
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
    <ScreenScroll testID="train-screen" gap={theme.space[8]}>
      <Text variant="headline" accessibilityRole="header">
        {dog
          ? t("train.subtitle", { name: dog.name })
          : t("train.subtitleGeneric")}
      </Text>

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
          <Section key={section.key}>
            {/* The count rides the label rather than being repeated on every row. */}
            <SectionHeader
              title={t(section.titleKey)}
              trailing={String(section.items.length)}
              testID={`train-section-${section.key}`}
            />
            {section.items.map(({ detail, gate }, index) => (
              <LessonRow
                key={detail.lesson.id}
                detail={detail}
                gate={gate}
                last={index === section.items.length - 1}
                /**
                 * The handler exists only when the lesson can actually be started, and the two locks route
                 * differently: a premium lock leads to the paywall, because that is the way out of it, while a
                 * prerequisite lock leads nowhere — there is nothing to buy and nothing to open. Deciding here
                 * means a locked lesson has no navigation attached at any level.
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
          </Section>
        ))
      )}
    </ScreenScroll>
  );
}

/**
 * One lesson in the catalogue.
 *
 * A lesson that cannot be started is not pressable *into the lesson*, rather than pressable-and-then-refused:
 * withholding `onPress` also removes the button role, so assistive technology is told the same thing the mark
 * says. Both locks are stated, in that order, whenever both apply.
 */
function LessonRow({
  detail,
  gate,
  last,
  onPress,
}: {
  detail: LessonStatusDetail;
  gate: LessonGate;
  last: boolean;
  /** Absent when there is nowhere useful to go. Its absence is what makes the row inert. */
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const state: TrailState = gate.premiumLocked
    ? "locked"
    : detail.status === "completed"
      ? "done"
      : detail.status === "unfinished"
        ? "paused"
        : detail.status === "locked"
          ? "locked"
          : "later";

  // What the state line says: the premium lock is the headline when it applies, since it has a way out.
  const stateLabel = gate.premiumLocked
    ? t("train.premiumLocked")
    : t(`train.status.${detail.status}`);

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
    <Row
      leading={<TrailMark state={state} />}
      trailing={
        onPress ? (
          <Glyph
            name="chevron-end"
            size={20}
            color={theme.colors.text.secondary}
          />
        ) : undefined
      }
      separator={!last}
      {...(onPress ? { onPress } : {})}
      // Every lock is part of the accessible name, never conveyed by the mark alone.
      accessibilityLabel={`${t(detail.lesson.titleKey)}. ${accessibleState}`}
      testID={`lesson-card-${detail.lesson.slug}`}
    >
      <Text variant="bodyStrong">{t(detail.lesson.titleKey)}</Text>
      <Text variant="secondary" tone="secondary">
        <Text
          variant="secondary"
          tone={state === "done" ? "completed" : "secondary"}
          testID={`lesson-status-${detail.lesson.slug}`}
        >
          {stateLabel}
        </Text>
        {"."}{" "}
        <Text variant="secondary" tone="secondary">
          {t("session.overview.durationLabel", {
            count: detail.lesson.estimatedMinutes,
          })}
          {"."}
        </Text>
        {/* Completion acknowledged in the catalogue, counted from real session records. */}
        {detail.status === "completed" && detail.completions > 0 ? (
          <Text
            variant="secondary"
            tone="secondary"
            testID={`lesson-completions-${detail.lesson.slug}`}
          >
            {" "}
            {t("train.completedCount", { count: detail.completions })}
            {"."}
          </Text>
        ) : null}
      </Text>
      {/* Each lock explains itself in its own words. Shown together when both apply. */}
      {gate.premiumLocked ? (
        <Text
          variant="caption"
          tone="secondary"
          testID={`lesson-premium-${detail.lesson.slug}`}
        >
          {t("train.premiumHint")}
        </Text>
      ) : null}
      {gate.prerequisiteLocked ? (
        <Text
          variant="caption"
          tone="secondary"
          testID={`lesson-locked-${detail.lesson.slug}`}
        >
          {t("train.lockedHint")}
        </Text>
      ) : null}
    </Row>
  );
}
