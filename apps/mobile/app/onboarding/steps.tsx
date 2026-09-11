import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Text,
  Card,
  Button,
  ProgressBar,
  useTheme,
  useDirection,
} from "@pawcue/ui";
import {
  ONBOARDING_STEPS,
  isDraftComplete,
  validateField,
  type OnboardingStepDef,
} from "@pawcue/domain";
import { useOnboardingStore } from "../../src/state/onboarding-store";
import { useDogStore } from "../../src/state/dog-store";
import { useBootstrapStore } from "../../src/state/bootstrap-store";

/**
 * Onboarding — one renderer for every question.
 *
 * There is no screen per field. The flow is `ONBOARDING_STEPS`, and this renders whatever that list contains, so
 * accessibility, RTL, Dynamic Type, keyboard avoidance and validation are solved once rather than per question.
 *
 * Answers live in the store and are persisted on every keystroke, which is what makes Back lossless and an
 * interrupted flow resumable. Nothing here decides what is valid — that is `validateField` in the domain.
 */
export default function OnboardingStepsScreen() {
  const theme = useTheme();
  const direction = useDirection();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const draft = useOnboardingStore((s) => s.draft);
  const stepIndex = useOnboardingStore((s) => s.stepIndex);
  const setField = useOnboardingStore((s) => s.setField);
  const goToStep = useOnboardingStore((s) => s.goToStep);
  const resetDraft = useOnboardingStore((s) => s.reset);

  const createFromDraft = useDogStore((s) => s.createFromDraft);
  const userId = useBootstrapStore((s) => s.userId);

  const [showValidation, setShowValidation] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const step = ONBOARDING_STEPS[stepIndex];
  if (!step) return null;

  const total = ONBOARDING_STEPS.length;
  const isLast = stepIndex === total - 1;
  const validation = validateField(step.id, draft);

  const advance = async () => {
    if (!validation.ok) {
      // Validation messages appear only once the user has tried to move on — telling someone their name is
      // required before they have typed anything is noise, not help.
      setShowValidation(true);
      return;
    }
    setShowValidation(false);

    if (!isLast) {
      goToStep(stepIndex + 1);
      return;
    }

    if (!isDraftComplete(draft)) {
      setShowValidation(true);
      return;
    }
    if (!userId) {
      setCreateError(t("onboarding.error.createFailed"));
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      await createFromDraft(draft, userId);
      // The draft is cleared only after the dog row exists, so a failure leaves every answer intact.
      await resetDraft();
      router.replace("/");
    } catch {
      setCreateError(t("onboarding.error.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const goBack = () => {
    setShowValidation(false);
    if (stepIndex === 0) {
      router.back();
      return;
    }
    goToStep(stepIndex - 1);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      // The name and breed steps put a text field mid-screen; without this the keyboard covers Continue.
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + theme.space[4],
          paddingBottom: insets.bottom + theme.space[6],
          paddingHorizontal: theme.screenGutter,
          gap: theme.space[4],
        }}
        keyboardShouldPersistTaps="handled"
        testID="onboarding-screen"
      >
        <View style={{ gap: theme.space[2] }}>
          <Text variant="small" tone="muted" testID="onboarding-progress">
            {t("onboarding.progress", { current: stepIndex + 1, total })}
          </Text>
          <ProgressBar
            ratio={stepIndex / total}
            accessibilityLabel={t("onboarding.progressLabel", {
              current: stepIndex + 1,
              total,
              percent: Math.round((stepIndex / total) * 100),
            })}
            testID="onboarding-progress-bar"
          />
        </View>

        <Text variant="h1" testID="step-title">
          {t(step.titleKey)}
        </Text>
        {step.hintKey ? (
          <Text variant="body" tone="muted" testID="step-hint">
            {t(step.hintKey)}
          </Text>
        ) : null}

        <StepInput step={step} direction={direction} />

        {showValidation && !validation.ok ? (
          <Text variant="small" tone="error" testID="validation-message">
            {t(validation.messageKey)}
          </Text>
        ) : null}

        {createError ? (
          <Text variant="small" tone="error" testID="create-error">
            {createError}
          </Text>
        ) : null}

        <View style={{ flex: 1 }} />

        <View style={{ gap: theme.space[2] }}>
          {creating ? (
            <View
              style={{ alignItems: "center", gap: theme.space[2] }}
              testID="onboarding-creating"
            >
              <ActivityIndicator color={theme.colors.brand.primary} />
              <Text variant="small" tone="muted">
                {t("onboarding.creating")}
              </Text>
            </View>
          ) : (
            <Button
              label={isLast ? t("onboarding.finish") : t("onboarding.next")}
              onPress={() => void advance()}
              testID="onboarding-next"
            />
          )}

          {step.optional && !isLast ? (
            <Pressable
              onPress={() => {
                setField(step.id, undefined);
                goToStep(stepIndex + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("onboarding.skip")}
              hitSlop={12}
              testID="onboarding-skip"
            >
              <Text variant="small" tone="muted" align="center">
                {t("onboarding.skip")}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={t("onboarding.back")}
            hitSlop={12}
            testID="onboarding-back"
          >
            <Text variant="small" tone="muted" align="center">
              {t("onboarding.back")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * The input for one step.
 *
 * Three kinds cover every question the flow asks. A new question is a new entry in `ONBOARDING_STEPS`, not a new
 * component, unless it genuinely needs an input shape that does not exist yet.
 */
function StepInput({
  step,
  direction,
}: {
  step: OnboardingStepDef;
  direction: "ltr" | "rtl";
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const draft = useOnboardingStore((s) => s.draft);
  const setField = useOnboardingStore((s) => s.setField);

  if (step.kind === "choice") {
    const selected = String(draft[step.id] ?? "");
    return (
      <View style={{ gap: theme.space[2] }} testID={`choice-${step.id}`}>
        {(step.choices ?? []).map((choice) => {
          const isSelected = selected === choice.value;
          return (
            <Card
              key={choice.value}
              padding="compact"
              onPress={() =>
                setField(
                  step.id,
                  // Minutes are numeric in the domain; everything else is a string enum.
                  step.id === "dailyTrainingMinutes"
                    ? Number(choice.value)
                    : choice.value,
                )
              }
              accessibilityLabel={t(choice.labelKey)}
              testID={`choice-${step.id}-${choice.value}`}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text variant="body">{t(choice.labelKey)}</Text>
                {/* A checkmark, not colour alone — the design system forbids colour-only state. */}
                <Text variant="body" tone={isSelected ? "success" : "muted"}>
                  {isSelected ? "✓" : ""}
                </Text>
              </View>
            </Card>
          );
        })}
      </View>
    );
  }

  const value = String(draft[step.id] ?? "");
  return (
    <TextInput
      value={value}
      onChangeText={(next) => setField(step.id, next)}
      placeholder={step.placeholderKey ? t(step.placeholderKey) : undefined}
      placeholderTextColor={theme.colors.text.disabled}
      accessibilityLabel={t(step.titleKey)}
      testID={`input-${step.id}`}
      autoCapitalize={
        step.id === "name" || step.id === "breed" ? "words" : "none"
      }
      autoCorrect={false}
      keyboardType={
        step.kind === "date" ? "numbers-and-punctuation" : "default"
      }
      // Dynamic Type: the field grows with the user's text size instead of clipping.
      maxFontSizeMultiplier={1.6}
      style={{
        borderWidth: theme.border.hairline,
        borderColor: theme.colors.border.subtle,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface.raised,
        paddingHorizontal: theme.space[3],
        paddingVertical: theme.space[3],
        fontSize: theme.typography.body.fontSize,
        color: theme.colors.text.primary,
        // Logical alignment, so Hebrew input starts on the correct edge.
        textAlign: direction === "rtl" ? "right" : "left",
        writingDirection: direction,
        minHeight: theme.minTouchTarget,
      }}
    />
  );
}
