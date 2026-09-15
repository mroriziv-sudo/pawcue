import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Button,
  Glyph,
  Row,
  Sheet,
  Text,
  TrailMark,
  useTheme,
  type TrailState,
} from "@pawcue/ui";
import type { LessonStatusDetail } from "@pawcue/domain";
import { useDogStore } from "../../src/state/dog-store";
import { useBootstrapStore } from "../../src/state/bootstrap-store";
import { useDogPhotoStore } from "../../src/state/dog-photo-store";
import { useSessionStore } from "../../src/state/session-store";
import { useTrainingLogStore } from "../../src/state/training-log-store";
import { useLessonStatuses } from "../../src/lessons/useCatalogue";
import { EmptyState } from "../../src/components/EmptyState";
import { ScreenScroll, Section } from "../../src/components/ScreenScroll";
import { SectionHeader } from "../../src/components/SectionHeader";
import { JourneySkeleton, SkeletonGroup } from "../../src/components/Skeleton";
import { DogAvatar } from "../../src/components/DogAvatar";
import { breedDisplayName } from "../../src/dogs/breed-lookup";
import { ageLabel, monthsSince } from "../../src/components/BirthdatePicker";

/**
 * Dog — this dog's page.
 *
 * Not Settings and not a record: the character, the name and one identity line at the top; then the training
 * journey — what the dog knows, what it is working on, what comes next — as rows on the paper; the daily goal;
 * the profile facts, small; and, last and quiet, the ways out to Account and Settings. Everything a user opens
 * this tab to check about their dog is above everything they occasionally need to change.
 *
 * Every number here is counted from sessions that actually happened. There is no streak: `Streak` is
 * server-derived by its own contract and nothing populates it yet.
 */
export default function DogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const dog = useDogStore((s) => s.dog);
  const dogId = useDogStore((s) => s.dogId);
  const dogError = useDogStore((s) => s.error);
  const refresh = useDogStore((s) => s.refresh);
  const sessionStatus = useBootstrapStore((s) => s.sessionStatus);
  const userId = useBootstrapStore((s) => s.userId);
  const photoUri = useDogPhotoStore((s) => s.photoFor(dogId));
  const choosePhoto = useDogPhotoStore((s) => s.choose);
  const removePhoto = useDogPhotoStore((s) => s.remove);
  const activeSession = useSessionStore((s) => s.session);
  const records = useTrainingLogStore((s) => s.completed);
  const { statuses, summary, loading } = useLessonStatuses();

  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  useEffect(() => {
    // Cheap, and keeps the screen honest if the dog was edited on another device.
    void refresh();
  }, [refresh]);

  const name = dog?.name ?? "";

  /** How many of the last fourteen days had a finished session. Local data, said as a sentence; not a streak. */
  const trainedDays = useMemo(() => {
    const days = new Set(
      records
        .filter((record) => record.status === "completed")
        .map((record) => record.endedAt.slice(0, 10)),
    );
    let count = 0;
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date(Date.now() - offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
      if (days.has(date)) count += 1;
    }
    return count;
  }, [records]);

  if (!dogId) {
    return (
      <ScreenScroll testID="dog-screen">
        <EmptyState
          scene={<DogAvatar breed={null} size={160} pose="scene" />}
          title={t("dogTab.noDogTitle")}
          body={t("dogTab.noDogBody")}
          ctaLabel={t("today.noDogCta")}
          onPress={() => router.push("/onboarding")}
          testID="dog-empty"
        />
      </ScreenScroll>
    );
  }

  /**
   * The row could not be read.
   *
   * Rendering the profile with every field reading "Not set" would tell the user they never filled it in, which
   * is a different fact from "we could not reach it".
   */
  if (!dog && (dogError !== null || sessionStatus === "unavailable")) {
    return (
      <ScreenScroll testID="dog-screen">
        <EmptyState
          title={t("dogTab.unavailableTitle")}
          body={t("dogTab.unavailableBody")}
          ctaLabel={t("common.cta.tryAgain")}
          emphasis="secondary"
          onPress={() => void refresh()}
          testID="dog-unavailable"
        />
      </ScreenScroll>
    );
  }

  const breed = breedDisplayName(dog?.breed, i18n.language);
  const months = dog?.birthdate ? monthsSince(dog.birthdate) : null;
  const age = months !== null ? ageLabel(months, t) : null;
  const sex =
    dog?.sex === "female" || dog?.sex === "male"
      ? t(`onboarding.sex.${dog.sex}`)
      : null;

  const knows = statuses.filter((item) => item.status === "completed");
  const working = statuses.filter(
    (item) => item.status === "unfinished" || item.status === "not_started",
  );
  const comingUp = statuses.filter((item) => item.status === "locked");
  const since = dog?.createdAt
    ? monthLabel(dog.createdAt, i18n.language)
    : null;

  return (
    <ScreenScroll testID="dog-screen" gap={theme.space[8]}>
      {/* The dog. */}
      <View style={{ gap: theme.space[4] }}>
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => router.push("/dog-profile")}
            accessibilityRole="button"
            accessibilityLabel={t("dogTab.editProfile")}
            hitSlop={theme.space[2]}
            testID="dog-edit"
            style={({ pressed }) => ({
              minHeight: theme.minTouchTarget,
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text variant="body" tone="brand">
              {t("dogTab.edit")}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            setPhotoMessage(null);
            setPhotoSheet(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            photoUri ? t("dogTab.changePhoto") : t("dogTab.choosePhoto")
          }
          testID="dog-avatar"
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View>
            {photoUri ? (
              <DogAvatar
                breed={dog?.breed ?? null}
                birthdate={dog?.birthdate ?? null}
                photoUri={photoUri}
                size={140}
              />
            ) : (
              <DogAvatar
                breed={dog?.breed ?? null}
                birthdate={dog?.birthdate ?? null}
                size={150}
                pose="scene"
              />
            )}
          </View>
        </Pressable>

        <View style={{ gap: theme.space[1] }}>
          <Text
            variant="largeTitle"
            accessibilityRole="header"
            testID="dog-name"
          >
            {name || t("common.nav.dog")}
          </Text>
          {breed || age || sex ? (
            <Text variant="body" tone="secondary">
              {breed ? (
                <Text variant="body" tone="secondary" testID="dog-breed">
                  {breed}
                </Text>
              ) : null}
              {[age, sex]
                .filter((part): part is string => Boolean(part))
                .map(
                  (part, index) => `${breed || index > 0 ? ", " : ""}${part}`,
                )
                .join("")}
            </Text>
          ) : (
            <Text variant="body" tone="secondary">
              {t("dogTab.identityUnknown")}
            </Text>
          )}
          <View
            style={{ alignItems: "flex-start", paddingTop: theme.space[1] }}
          >
            <Button
              label={
                photoUri ? t("dogTab.changePhoto") : t("dogTab.choosePhoto")
              }
              variant="tertiary"
              size="md"
              fullWidth={false}
              icon={
                <Glyph
                  name="photo"
                  size={18}
                  color={theme.colors.brand.primary}
                />
              }
              onPress={() => {
                setPhotoMessage(null);
                setPhotoSheet(true);
              }}
              testID="dog-photo"
            />
          </View>
        </View>
      </View>

      {/* Training together: one sentence, and the last fourteen days. */}
      <Section gap={theme.space[3]}>
        <SectionHeader
          title={t("dogTab.trainingTitle")}
          {...(dog?.dailyTrainingMinutes
            ? {
                trailing: t("dogTab.dailyGoal", {
                  count: dog.dailyTrainingMinutes,
                }),
              }
            : {})}
          testID="dog-daily-goal"
        />
        <Text variant="body" testID="dog-training-summary">
          {since ? `${t("dogTab.since", { month: since })} ` : ""}
          {summary && summary.sessionsCompleted > 0 ? (
            <>
              <Text variant="body" testID="dog-sessions">
                {t("dogTab.summarySessions", {
                  count: summary.sessionsCompleted,
                })}
              </Text>
              {", "}
              <Text variant="body" testID="dog-lessons">
                {t("dogTab.summarySkills", { count: summary.lessonsCompleted })}
              </Text>
              {"."}
            </>
          ) : (
            <Text variant="body" tone="secondary" testID="dog-sessions">
              {t("dogTab.nothingYet")}
            </Text>
          )}
        </Text>
        {summary && summary.sessionsCompleted > 0 ? (
          <Text variant="secondary" tone="secondary" testID="dog-recent-days">
            {t("dogTab.recentStrip", { count: trainedDays })}
          </Text>
        ) : null}
      </Section>

      {/* The journey. */}
      {loading && statuses.length === 0 ? (
        <SkeletonGroup
          accessibilityLabel={t("dogTab.trainingTitle")}
          testID="dog-journey-loading"
        >
          <JourneySkeleton />
        </SkeletonGroup>
      ) : (
        <>
          {knows.length > 0 ? (
            <Section>
              <SectionHeader title={t("dogTab.knows", { name })} />
              {knows.map((item, index) => (
                <LessonRow
                  key={item.lesson.id}
                  item={item}
                  state="done"
                  meta={`${item.lastTrainedAt ? t("dogTab.learned", { date: dateLabel(item.lastTrainedAt, i18n.language) }) : ""} ${t("train.completedCount", { count: item.completions })}`.trim()}
                  last={index === knows.length - 1}
                  onPress={() => router.push(`/lesson/${item.lesson.slug}`)}
                />
              ))}
            </Section>
          ) : null}

          {working.length > 0 ? (
            <Section>
              <SectionHeader title={t("dogTab.workingOn")} />
              {working.map((item, index) => {
                const paused =
                  activeSession?.status === "in_progress" &&
                  activeSession.lessonSlug === item.lesson.slug;
                return (
                  <LessonRow
                    key={item.lesson.id}
                    item={item}
                    state={
                      paused
                        ? "paused"
                        : item.status === "unfinished"
                          ? "paused"
                          : "later"
                    }
                    meta={
                      paused || item.status === "unfinished"
                        ? t("today.rowPaused")
                        : t("dogTab.readyToStart")
                    }
                    last={index === working.length - 1}
                    onPress={() =>
                      router.push(
                        paused
                          ? `/session/${item.lesson.slug}`
                          : `/lesson/${item.lesson.slug}`,
                      )
                    }
                  />
                );
              })}
            </Section>
          ) : null}

          {comingUp.length > 0 ? (
            <Section>
              <SectionHeader title={t("dogTab.comingUp")} />
              {comingUp.slice(0, 3).map((item, index, list) => (
                <LessonRow
                  key={item.lesson.id}
                  item={item}
                  state="locked"
                  meta={t("dogTab.afterPrerequisite")}
                  last={index === list.length - 1 && comingUp.length <= 3}
                />
              ))}
              {comingUp.length > 3 ? (
                <Row
                  title={t("dogTab.allLessons")}
                  trailing={
                    <Glyph
                      name="chevron-end"
                      size={20}
                      color={theme.colors.text.secondary}
                    />
                  }
                  separator={false}
                  onPress={() => router.navigate("/train")}
                  accessibilityLabel={t("dogTab.allLessons")}
                  testID="dog-all-lessons"
                />
              ) : null}
            </Section>
          ) : null}
        </>
      )}

      {/* The goal, and the facts. Secondary by size and position; each opens the editor. */}
      <Section>
        <SectionHeader title={t("dogTab.goals")} />
        <FactRow
          label={t("dogTab.goalRow")}
          value={
            dog?.dailyTrainingMinutes
              ? t("dogTab.dailyGoal", { count: dog.dailyTrainingMinutes })
              : t("dogTab.goalNotSet")
          }
          last
          onPress={() => router.push("/dog-profile")}
          testID="dog-minutes"
        />
      </Section>

      <Section>
        <SectionHeader title={t("dogTab.about", { name })} />
        <FactRow
          label={t("dogProfile.fields.birthdate")}
          value={
            dog?.birthdate
              ? dateLabel(dog.birthdate, i18n.language)
              : t("dogProfile.notSet")
          }
          onPress={() => router.push("/dog-profile")}
          testID="dog-birthdate"
        />
        <FactRow
          label={t("dogProfile.fields.sex")}
          value={dog ? t(`onboarding.sex.${dog.sex}`) : t("dogProfile.notSet")}
          onPress={() => router.push("/dog-profile")}
          testID="dog-sex"
        />
        <FactRow
          label={t("dogProfile.fields.breed")}
          value={breed ?? t("dogProfile.notSet")}
          last
          onPress={() => router.push("/dog-profile")}
          testID="dog-breed-row"
        />
      </Section>

      {/* The ways out. Last, and quiet. */}
      <Section>
        <Row
          title={t("dogTab.account")}
          meta={userId ? undefined : t("dogTab.accountMeta")}
          trailing={
            <Glyph
              name="chevron-end"
              size={20}
              color={theme.colors.text.secondary}
            />
          }
          onPress={() => router.push("/account")}
          accessibilityLabel={t("dogTab.account")}
          testID="dog-account"
        />
        <Row
          title={t("dogTab.settings")}
          trailing={
            <Glyph
              name="chevron-end"
              size={20}
              color={theme.colors.text.secondary}
            />
          }
          separator={false}
          onPress={() => router.push("/settings")}
          accessibilityLabel={t("dogTab.settings")}
          testID="dog-settings"
        />
      </Section>

      <Sheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title={t("dogTab.photoTitle", { name })}
        closeLabel={t("common.cta.close")}
        leading={<DogAvatar breed={dog?.breed ?? null} size={44} />}
        testID="dog-photo-sheet"
      >
        <Text
          variant="body"
          tone="secondary"
          style={{ paddingBottom: theme.space[3] }}
        >
          {t("dogTab.photoNote", { name })}
        </Text>
        <Row
          leading={
            <Glyph name="photo" size={22} color={theme.colors.brand.primary} />
          }
          title={photoUri ? t("dogTab.changePhoto") : t("dogTab.choosePhoto")}
          separator={Boolean(photoUri)}
          onPress={() => {
            void choosePhoto(dogId).then((result) => {
              if (result.status === "picked") setPhotoSheet(false);
              else if (result.status === "denied")
                setPhotoMessage(t("dogTab.photoDenied"));
              else if (result.status === "failed")
                setPhotoMessage(t("dogTab.photoFailed"));
            });
          }}
          accessibilityLabel={
            photoUri ? t("dogTab.changePhoto") : t("dogTab.choosePhoto")
          }
          testID="dog-photo-choose"
        />
        {photoUri ? (
          <Row
            leading={
              <Glyph name="close" size={22} color={theme.colors.text.error} />
            }
            title={t("dogTab.removePhoto")}
            titleTone="error"
            separator={false}
            onPress={() => {
              void removePhoto(dogId).then(() => setPhotoSheet(false));
            }}
            accessibilityLabel={t("dogTab.removePhoto")}
            testID="dog-photo-remove"
          />
        ) : null}
        {photoMessage ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space[2],
              paddingTop: theme.space[4],
            }}
            accessibilityRole="alert"
          >
            <Glyph name="alert" size={16} color={theme.colors.text.error} />
            <Text
              variant="secondary"
              tone="error"
              style={{ flex: 1 }}
              testID="dog-photo-message"
            >
              {photoMessage}
            </Text>
          </View>
        ) : null}
      </Sheet>
    </ScreenScroll>
  );
}

/** One lesson on the journey, with its mark. */
function LessonRow({
  item,
  state,
  meta,
  last,
  onPress,
}: {
  item: LessonStatusDetail;
  state: TrailState;
  meta: string;
  last: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Row
      leading={<TrailMark state={state} />}
      title={t(item.lesson.titleKey)}
      meta={meta}
      metaTone={state === "done" ? "completed" : "secondary"}
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
      accessibilityLabel={`${t(item.lesson.titleKey)}. ${meta}`}
      testID={`dog-lesson-${item.lesson.slug}`}
    />
  );
}

/** A profile fact: label on the reading edge, value on the trailing one, the whole row opening the editor. */
function FactRow({
  label,
  value,
  last = false,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  last?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Row
      separator={!last}
      onPress={onPress}
      accessibilityLabel={`${label}. ${value}`}
      testID={testID}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space[3],
        }}
      >
        <Text variant="body" tone="secondary">
          {label}
        </Text>
        <Text variant="body" style={{ flex: 1 }} align="end">
          {value}
        </Text>
        <Glyph
          name="chevron-end"
          size={20}
          color={theme.colors.text.secondary}
        />
      </View>
    </Row>
  );
}

function monthLabel(iso: string, locale: string): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  try {
    return new Date(parsed).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function dateLabel(iso: string, locale: string): string {
  const parsed = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(parsed)) return iso;
  try {
    return new Date(parsed).toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      ...(iso.length === 10 ? { year: "numeric", timeZone: "UTC" } : {}),
    });
  } catch {
    return iso;
  }
}
