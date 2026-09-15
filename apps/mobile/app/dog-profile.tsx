import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Text,
  Button,
  Glyph,
  SegmentedControl,
  TextField,
  useTheme,
} from "@pawcue/ui";
import {
  ONBOARDING_STEPS,
  validateField,
  type OnboardingDraft,
} from "@pawcue/domain";
import { useDogStore } from "../src/state/dog-store";
import type { DogUpdate } from "../src/dogs/dog-repository";
import { DogAvatar } from "../src/components/DogAvatar";
import { BirthdatePicker } from "../src/components/BirthdatePicker";
import { BreedPicker } from "../src/components/BreedPicker";
import { BackControl } from "../src/components/BackControl";
import { SectionHeader } from "../src/components/SectionHeader";
import { Section } from "../src/components/ScreenScroll";
import { OptionTile } from "../src/components/OptionTile";

/**
 * Editing the dog.
 *
 * The Dog tab is the profile; this is only the editor, opened from its Edit control or from any fact row. It
 * uses exactly the inputs onboarding used — the same wheels, the same tiles, the same breed search — so an owner
 * who edits later sees the form they already know, and the same `validateField` rules, so a name that was
 * refused during setup is refused here too. The dog's bust follows the breed being chosen: the avatar is the
 * preview of the change.
 *
 * Scope is the fields the product acts on. A photo is chosen from the Dog tab, not here, because it is a
 * picture rather than a fact.
 */
export default function DogProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const dog = useDogStore((s) => s.dog);
  const dogId = useDogStore((s) => s.dogId);
  const refresh = useDogStore((s) => s.refresh);
  const update = useDogStore((s) => s.update);

  const [form, setForm] = useState<OnboardingDraft>(() => ({
    name: dog?.name ?? "",
    birthdate: dog?.birthdate ?? "",
    breed: dog?.breed ?? "",
    sex: dog?.sex,
    dailyTrainingMinutes: dog?.dailyTrainingMinutes ?? undefined,
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    for (const field of ["name", "birthdate", "breed"] as const) {
      const result = validateField(field, form);
      if (!result.ok) {
        setError(t(result.messageKey));
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      // Built key by key so an untouched field is absent from the patch rather than sent as undefined — with
      // `exactOptionalPropertyTypes` those are different things, and the second would clear a value the user
      // never edited. Cleared optional fields become null, not "", so "not set" stays distinguishable.
      const patch: DogUpdate = {
        birthdate: form.birthdate?.trim() ? form.birthdate.trim() : null,
        breed: form.breed?.trim() ? form.breed.trim() : null,
      };
      const name = form.name?.trim();
      if (name) patch.name = name;
      if (form.sex) patch.sex = form.sex;
      if (typeof form.dailyTrainingMinutes === "number")
        patch.daily_training_minutes = form.dailyTrainingMinutes;

      await update(patch);
      router.back();
    } catch {
      setError(t("dogProfile.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!dogId) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: theme.screenGutter,
          backgroundColor: theme.colors.background.base,
        }}
        testID="dog-profile-empty"
      >
        <Button
          label={t("common.cta.close")}
          variant="secondary"
          onPress={() => router.back()}
        />
      </View>
    );
  }

  const nameError =
    error && !validateField("name", form).ok ? error : undefined;
  const birthdateError =
    error && !validateField("birthdate", form).ok ? error : undefined;
  const minuteChoices =
    ONBOARDING_STEPS.find((step) => step.id === "dailyTrainingMinutes")
      ?.choices ?? [];
  const name = form.name?.trim() || dog?.name || "";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.space[2],
          paddingBottom: theme.space[6],
          paddingHorizontal: theme.screenGutter,
          gap: theme.space[6],
        }}
        keyboardShouldPersistTaps="handled"
        testID="dog-profile"
      >
        <BackControl onPress={() => router.back()} testID="dog-profile-back" />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space[4],
          }}
        >
          <Text
            variant="headline"
            style={{ flex: 1 }}
            accessibilityRole="header"
            testID="dog-profile-title"
          >
            {t("dogProfile.title", { name })}
          </Text>
          {/* The face follows the breed being chosen — the avatar is the preview of the change. */}
          <DogAvatar
            breed={form.breed ?? null}
            birthdate={form.birthdate ?? null}
            size={72}
          />
        </View>

        <View style={{ gap: theme.space[6] }} testID="dog-profile-editor">
          <TextField
            label={t("dogProfile.fields.name")}
            value={form.name ?? ""}
            onChangeText={(value) => setForm((f) => ({ ...f, name: value }))}
            autoCapitalize="words"
            autoCorrect={false}
            {...(nameError ? { error: nameError } : {})}
            testID="edit-name"
          />

          <Section gap={theme.space[3]}>
            <SectionHeader title={t("dogProfile.fields.birthdate")} />
            <BirthdatePicker
              value={form.birthdate ?? ""}
              onChange={(value) => setForm((f) => ({ ...f, birthdate: value }))}
              inputTestID="edit-birthdate"
              {...(birthdateError ? { error: birthdateError } : {})}
            />
          </Section>

          <Section gap={theme.space[3]}>
            <SectionHeader title={t("dogProfile.fields.sex")} />
            <View style={{ flexDirection: "row", gap: theme.space[3] }}>
              {(["female", "male"] as const).map((value) => (
                <OptionTile
                  key={value}
                  label={t(`onboarding.sex.${value}`)}
                  selected={form.sex === value}
                  onPress={() => setForm((f) => ({ ...f, sex: value }))}
                  minHeight={64}
                  testID={`edit-sex-${value}`}
                />
              ))}
            </View>
            <View style={{ alignItems: "flex-start" }}>
              <Button
                label={t("onboarding.sex.unspecified")}
                variant="tertiary"
                size="md"
                fullWidth={false}
                onPress={() => setForm((f) => ({ ...f, sex: "unspecified" }))}
                testID="edit-sex-unspecified"
              />
            </View>
          </Section>

          <Section gap={theme.space[3]}>
            <SectionHeader title={t("dogProfile.fields.breed")} />
            <BreedPicker
              value={form.breed ?? ""}
              onChange={(value) => setForm((f) => ({ ...f, breed: value }))}
              inputTestID="edit-breed"
              dogName={name}
              compact
            />
          </Section>

          <Section gap={theme.space[3]}>
            <SectionHeader title={t("dogProfile.fields.minutes")} />
            <SegmentedControl
              options={minuteChoices.map((choice) => ({
                value: Number(choice.value),
                label: t(choice.labelKey),
              }))}
              value={form.dailyTrainingMinutes ?? null}
              onChange={(value) =>
                setForm((f) => ({ ...f, dailyTrainingMinutes: value }))
              }
              accessibilityLabel={t("dogProfile.fields.minutes")}
              testID="edit-minutes"
            />
          </Section>

          {/* Field errors are shown on their field; anything else — a failed save — is shown here once. */}
          {error && !nameError && !birthdateError ? (
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
                testID="edit-error"
              >
                {error}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: theme.screenGutter,
          paddingTop: theme.space[3],
          paddingBottom: insets.bottom + theme.space[4],
          gap: theme.space[2],
          borderTopWidth: theme.border.hairline,
          borderTopColor: theme.colors.border.separator,
          backgroundColor: theme.colors.background.base,
        }}
      >
        <Button
          label={t("dogProfile.save")}
          onPress={() => void save()}
          loading={saving}
          testID="save-profile"
        />
      </View>
    </KeyboardAvoidingView>
  );
}
