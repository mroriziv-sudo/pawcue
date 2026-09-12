import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import {
  RulesBasedTrainingPlanGenerator,
  type GeneratedPlanWithDiagnostics,
  type PlanningCatalogue,
} from "@pawcue/domain";
import { loadPlanningCatalogue } from "../src/plans/plan-repository";
import { buildPlanInput } from "../src/plans/plan-inputs";
import { useDogStore } from "../src/state/dog-store";
import { useSessionStore } from "../src/state/session-store";
import { useTrainingLogStore } from "../src/state/training-log-store";

/**
 * Developer-only plan inspector.
 *
 * Phase 5 is a domain phase; the engine is covered by tests that need no device. This exists only so a generated
 * plan can be eyeballed against a real dog and real history during acceptance, and it shows the engine's
 * reasoning rather than a product surface — reasons, exclusions and the engine version are exactly the things a
 * user screen should never display.
 *
 * It cannot ship: the screen renders nothing outside `__DEV__`, and the only route to it is the Settings
 * developer block, which is gated the same way.
 */
export default function DevPlanScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const dog = useDogStore((s) => s.dog);
  const completed = useTrainingLogStore((s) => s.completed);
  const activeSession = useSessionStore((s) => s.session);

  const [result, setResult] = useState<GeneratedPlanWithDiagnostics | null>(
    null,
  );
  const [catalogue, setCatalogue] = useState<PlanningCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!__DEV__) return;
    let active = true;

    loadPlanningCatalogue()
      .then((loaded) => {
        if (!active) return;
        setCatalogue(loaded);
        if (!dog) {
          setError("No dog yet — complete onboarding first.");
          setLoading(false);
          return;
        }

        const generator = new RulesBasedTrainingPlanGenerator(loaded);
        setResult(
          generator.generateWithDiagnostics(
            buildPlanInput({
              dog,
              completed,
              catalogue: loaded,
              activeSession,
              today: new Date(),
            }),
          ),
        );
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unknown error");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dog, completed, activeSession]);

  if (!__DEV__) return null;

  const slugFor = (lessonId: string) =>
    catalogue?.lessons.find((lesson) => lesson.id === lessonId)?.slug ??
    lessonId;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[3],
      }}
      testID="dev-plan-screen"
    >
      <Text variant="h2">Plan inspector (dev only)</Text>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand.primary} />
      ) : null}

      {error ? (
        <Text variant="small" tone="error" testID="dev-plan-error">
          {error}
        </Text>
      ) : null}

      {result ? (
        <>
          <Card padding="compact">
            <Text variant="caption" tone="muted" testID="dev-plan-version">
              engine {result.diagnostics.engineVersion} ·{" "}
              {result.generated.days.length} day(s) ·{" "}
              {result.generated.plan.dailyMinutes} min/day
            </Text>
          </Card>

          {result.diagnostics.contentGraphProblems.length > 0 ? (
            <Card padding="compact" testID="dev-plan-graph-problems">
              <Text variant="small" tone="error">
                Content graph problems:{" "}
                {result.diagnostics.contentGraphProblems.length}
              </Text>
              {result.diagnostics.contentGraphProblems.map((problem, index) => (
                <Text key={index} variant="caption" tone="muted">
                  {JSON.stringify(problem)}
                </Text>
              ))}
            </Card>
          ) : null}

          {result.generated.days.map((entry) => (
            <Card key={entry.day.dayIndex} padding="compact">
              <View style={{ gap: theme.space[1] }}>
                <Text variant="bodyStrong">
                  Day {entry.day.dayIndex + 1} · {entry.day.date} ·{" "}
                  {entry.day.totalMinutes} min
                </Text>
                {entry.activities.map((activity) => (
                  <Text key={activity.sortOrder} variant="small" tone="muted">
                    {activity.sortOrder + 1}. {slugFor(activity.lessonId)} —{" "}
                    {activity.selectionReason} ({activity.estimatedMinutes} min)
                  </Text>
                ))}
              </View>
            </Card>
          ))}

          {result.diagnostics.emptyDays.length > 0 ? (
            <Card padding="compact">
              <Text variant="caption" tone="muted" testID="dev-plan-empty-days">
                {result.diagnostics.emptyDays.length} day(s) with nothing
                eligible
              </Text>
            </Card>
          ) : null}

          <Card padding="compact">
            <Text variant="caption" tone="muted" testID="dev-plan-exclusions">
              {result.diagnostics.exclusions.length} exclusion(s) recorded
            </Text>
          </Card>
        </>
      ) : null}

      <Button
        label="Close"
        variant="secondary"
        onPress={() => router.back()}
        testID="dev-plan-close"
      />
    </ScrollView>
  );
}
