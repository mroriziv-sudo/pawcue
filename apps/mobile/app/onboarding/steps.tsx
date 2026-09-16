import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Text,
  Button,
  Glyph,
  Reveal,
  SegmentedControl,
  StepDots,
  TextField,
  useTheme,
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
import { DogAvatar } from "../../src/components/DogAvatar";
import { BirthdatePicker } from "../../src/components/BirthdatePicker";
import { BreedPicker } from "../../src/components/BreedPicker";
import { BackControl } from "../../src/components/BackControl";
import { OptionTile } from "../../src/components/OptionTile";

/**
 * Onboarding — one renderer for every question.
 *
 * There is no screen per field. The flow is `ONBOARDING_STEPS`, and this renders whatever that list contains, so
 * accessibility, RTL, Dynamic Type, keyboard avoidance and validation are solved once rather than per question.
 *
 * Answers live in the store and are persisted on every keystroke, which is what makes Back lossless and an
 * interrupted flow resumable. Nothing here decides what is valid — that is `validateField` in the domain.
 *
 * The dog takes shape as the questions are answered. It sits at the top of every step; once it has a name the
 * questions use it, once it has an age it may become a puppy, and once it has a breed its face changes to match.
 * By the last step the owner is looking at their dog.
 */
export default function OnboardingStepsScreen() {
  const theme = useTheme();
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
  const validationMessage =
    showValidation && !validation.ok ? t(validation.messageKey) : null;

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

  const dogName = draft.name?.trim() ?? "";
  const question = dogName
    ? t(step.titleKey, { name: dogName })
    : t(`${step.titleKey}NoName`, { defaultValue: t(step.titleKey) });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      // The name and breed steps put a text field mid-screen; without this the keyboard covers Continue.
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* The top bar: the way back, the step, the way past an optional question. */}
      <View
        style={{
          paddingTop: insets.top + theme.space[2],
          paddingHorizontal: theme.screenGutter,
          gap: theme.space[2],
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: theme.space[3],
          }}
        >
          <BackControl onPress={goBack} testID="onboarding-back" />
          <Text variant="caption" tone="secondary" testID="onboarding-progress">
            {t("onboarding.progress", { current: stepIndex + 1, total })}
          </Text>
          {step.optional && !isLast ? (
            <Pressable
              onPress={() => {
                setShowValidation(false);
                setField(step.id, undefined);
                goToStep(stepIndex + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("onboarding.skip")}
              hitSlop={theme.space[2]}
              testID="onboarding-skip"
              style={({ pressed }) => ({
                minHeight: theme.minTouchTarget,
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text variant="body" tone="brand">
                {t("onboarding.skip")}
              </Text>
            </Pressable>
          ) : (
            <View style={{ minWidth: theme.minTouchTarget }} />
          )}
        </View>
        <StepDots
          total={total}
          current={stepIndex + 1}
          accessibilityLabel={t("onboarding.progressLabel", {
            current: stepIndex + 1,
            total,
            percent: Math.round((stepIndex / total) * 100),
          })}
          testID="onboarding-progress-bar"
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: theme.space[5],
          paddingBottom: theme.space[4],
          paddingHorizontal: theme.screenGutter,
          gap: theme.space[5],
        }}
        keyboardShouldPersistTaps="handled"
        testID="onboarding-screen"
      >
        {/* The question, with the dog as far as it exists so far beside it. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: theme.space[4],
          }}
        >
          <View style={{ flex: 1, gap: theme.space[2] }}>
            <Text
              variant="headline"
              accessibilityRole="header"
              testID="step-title"
            >
              {question}
            </Text>
            {step.hintKey ? (
              <Text variant="body" tone="secondary" testID="step-hint">
                {t(step.hintKey)}
              </Text>
            ) : null}
          </View>
          <View
            accessibilityRole="image"
            accessibilityLabel={
              dogName
                ? t("onboarding.meet", { name: dogName })
                : t("common.nav.dog")
            }
            testID="onboarding-dog-preview"
          >
            <DogAvatar
              breed={draft.breed ?? null}
              birthdate={draft.birthdate ?? null}
              size={96}
            />
          </View>
        </View>

        <Reveal key={step.id}>
          <StepInput
            step={step}
            dogName={dogName}
            validationMessage={validationMessage}
          />
        </Reveal>

        {createError ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space[2],
            }}
            accessibilityRole="alert"
          >
            <Glyph name="alert" size={16} color={theme.colors.text.error} />
            <Text
              variant="secondary"
              tone="error"
              style={{ flex: 1 }}
              testID="create-error"
            >
              {createError}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Continue, docked, above the keyboard. */}
      <View
        style={{
          paddingHorizontal: theme.screenGutter,
          paddingTop: theme.space[3],
          paddingBottom: insets.bottom + theme.space[4],
          backgroundColor: theme.colors.background.base,
        }}
      >
        {creating ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: theme.space[2],
              minHeight: 52,
            }}
            accessible
            accessibilityState={{ busy: true }}
            accessibilityLabel={t("onboarding.creating")}
            testID="onboarding-creating"
          >
            <ActivityIndicator color={theme.colors.brand.primary} />
            <Text variant="secondary" tone="secondary">
              {t("onboarding.creating")}
            </Text>
          </View>
        ) : (
          <Button
            label={
              isLast
                ? dogName
                  ? t("onboarding.finish", { name: dogName })
                  : t("onboarding.finishNoName")
                : t("onboarding.next")
            }
            onPress={() => void advance()}
            testID="onboarding-next"
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * The input for one step.
 *
 * Each question gets the input shaped for it: a large field for the name, native wheels for the age, two tiles
 * for sex, a search over the breed list, a segmented control for the daily goal. A new question is a new entry
 * in `ONBOARDING_STEPS`, not a new component, unless it genuinely needs an input shape that does not exist.
 */
function StepInput({
  step,
  dogName,
  validationMessage,
}: {
  step: OnboardingStepDef;
  dogName: string;
  validationMessage: string | null;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const draft = useOnboardingStore((s) => s.draft);
  const setField = useOnboardingStore((s) => s.setField);

  const message = validationMessage ? (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space[1],
      }}
      accessibilityRole="alert"
    >
      <Glyph name="alert" size={16} color={theme.colors.text.error} />
      <Text
        variant="secondary"
        tone="error"
        style={{ flex: 1 }}
        testID="validation-message"
      >
        {validationMessage}
      </Text>
    </View>
  ) : null;

  if (step.id === "sex") {
    const selected = String(draft.sex ?? "");
    return (
      <View style={{ gap: theme.space[3] }} testID="choice-sex">
        {message}
        <View style={{ flexDirection: "row", gap: theme.space[3] }}>
          {(["female", "male"] as const).map((value) => (
            <OptionTile
              key={value}
              label={t(`onboarding.sex.${value}`)}
              selected={selected === value}
              onPress={() => setField("sex", value)}
              testID={`choice-sex-${value}`}
            />
          ))}
        </View>
      </View>
    );
  }

  if (step.id === "dailyTrainingMinutes") {
    const selected =
      typeof draft.dailyTrainingMinutes === "number"
        ? draft.dailyTrainingMinutes
        : null;
    return (
      <View
        style={{ gap: theme.space[3] }}
        testID="choice-dailyTrainingMinutes"
      >
        {message}
        <SegmentedControl
          options={(step.choices ?? []).map((choice) => ({
            value: Number(choice.value),
            label: t(choice.labelKey),
          }))}
          value={selected}
          onChange={(value) => setField("dailyTrainingMinutes", value)}
          accessibilityLabel={t(step.titleKey)}
          testID="choice-dailyTrainingMinutes"
        />
        {selected !== null ? (
          <Text variant="body" testID="minutes-sentence">
            {t(`onboarding.minutesSentence.${selected}`)}
          </Text>
        ) : null}
      </View>
    );
  }

  const value = String(draft[step.id] ?? "");

  if (step.kind === "date") {
    return (
      <BirthdatePicker
        value={value}
        onChange={(next) => setField(step.id, next || undefined)}
        inputTestID={`input-${step.id}`}
        // Known only when the user has come back from a later step; otherwise the copy's default form.
        sex={draft.sex}
        {...(validationMessage ? { error: validationMessage } : {})}
        errorTestID="validation-message"
      />
    );
  }

  if (step.id === "breed") {
    return (
      <View style={{ gap: theme.space[2] }}>
        {message}
        <BreedPicker
          value={value}
          onChange={(next) => setField(step.id, next || undefined)}
          inputTestID={`input-${step.id}`}
          dogName={dogName}
        />
      </View>
    );
  }

  return (
    <TextField
      label={t("dogProfile.fields.name")}
      value={value}
      onChangeText={(next) => setField(step.id, next)}
      placeholder={step.placeholderKey ? t(step.placeholderKey) : undefined}
      autoCapitalize="words"
      autoCorrect={false}
      autoFocus={step.id === "name"}
      size="large"
      // The headline above is the question; a second "Name" label would say it twice.
      labelHidden
      {...(validationMessage ? { error: validationMessage } : {})}
      errorTestID="validation-message"
      accessibilityLabel={t(step.titleKey)}
      testID={`input-${step.id}`}
    />
  );
}
