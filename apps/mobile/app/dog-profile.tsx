import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme, useDirection } from "@pawcue/ui";
import { validateField, type OnboardingDraft } from "@pawcue/domain";
import { useDogStore } from "../src/state/dog-store";
import type { DogUpdate } from "../src/dogs/dog-repository";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { syncPendingSessions } from "../src/sync/session-sync";

/**
 * The dog's profile — view and edit.
 *
 * Scope is deliberately exactly the fields onboarding collects. A profile screen is a natural place for settings,
 * sharing, photos and everything else to accumulate; none of that belongs to this phase, and a photo in
 * particular would mean a camera or photo-library permission the brief rules out.
 *
 * Validation is the same `validateField` onboarding uses, so a name that was refused during setup is refused
 * here too rather than by a second, slightly different rule.
 */
export default function DogProfileScreen() {
  const theme = useTheme();
  const direction = useDirection();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const dog = useDogStore((s) => s.dog);
  const dogId = useDogStore((s) => s.dogId);
  const refresh = useDogStore((s) => s.refresh);
  const update = useDogStore((s) => s.update);
  const pendingSync = useTrainingLogStore((s) => s.completed).filter(
    (item) => !item.syncedToServer,
  );

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OnboardingDraft>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginEdit = () => {
    setForm({
      name: dog?.name ?? "",
      birthdate: dog?.birthdate ?? "",
      breed: dog?.breed ?? "",
      sex: dog?.sex,
      dailyTrainingMinutes: dog?.dailyTrainingMinutes ?? undefined,
    });
    setError(null);
    setEditing(true);
  };

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
      // never edited.
      const patch: DogUpdate = {
        // Cleared optional fields become null, not "", so "not set" stays distinguishable from "set to empty".
        birthdate: form.birthdate?.trim() ? form.birthdate.trim() : null,
        breed: form.breed?.trim() ? form.breed.trim() : null,
      };
      const name = form.name?.trim();
      if (name) patch.name = name;
      if (form.sex) patch.sex = form.sex;

      await update(patch);
      setEditing(false);
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

  const inputStyle = {
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface.raised,
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[3],
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text.primary,
    textAlign: direction === "rtl" ? ("right" as const) : ("left" as const),
    writingDirection: direction,
    minHeight: theme.minTouchTarget,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[4],
      }}
      testID="dog-profile"
    >
      <Text variant="h1" testID="dog-profile-title">
        {t("dogProfile.title", { name: dog?.name ?? "" })}
      </Text>

      {editing ? (
        <View style={{ gap: theme.space[3] }} testID="dog-profile-editor">
          <Field label={t("dogProfile.fields.name")}>
            <TextInput
              value={form.name ?? ""}
              onChangeText={(value) => setForm((f) => ({ ...f, name: value }))}
              accessibilityLabel={t("dogProfile.fields.name")}
              testID="edit-name"
              maxFontSizeMultiplier={1.6}
              style={inputStyle}
            />
          </Field>
          <Field label={t("dogProfile.fields.birthdate")}>
            <TextInput
              value={form.birthdate ?? ""}
              onChangeText={(value) =>
                setForm((f) => ({ ...f, birthdate: value }))
              }
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.text.disabled}
              accessibilityLabel={t("dogProfile.fields.birthdate")}
              testID="edit-birthdate"
              maxFontSizeMultiplier={1.6}
              style={inputStyle}
            />
          </Field>
          <Field label={t("dogProfile.fields.breed")}>
            <TextInput
              value={form.breed ?? ""}
              onChangeText={(value) => setForm((f) => ({ ...f, breed: value }))}
              accessibilityLabel={t("dogProfile.fields.breed")}
              testID="edit-breed"
              maxFontSizeMultiplier={1.6}
              style={inputStyle}
            />
          </Field>

          {error ? (
            <Text variant="small" tone="error" testID="edit-error">
              {error}
            </Text>
          ) : null}

          <Button
            label={t("dogProfile.save")}
            onPress={() => void save()}
            loading={saving}
            testID="save-profile"
          />
          <Button
            label={t("dogProfile.cancel")}
            variant="secondary"
            onPress={() => setEditing(false)}
            testID="cancel-edit"
          />
        </View>
      ) : (
        <View style={{ gap: theme.space[2] }} testID="dog-profile-summary">
          <ReadOnly
            label={t("dogProfile.fields.name")}
            value={dog?.name}
            testID="value-name"
          />
          <ReadOnly
            label={t("dogProfile.fields.birthdate")}
            value={dog?.birthdate}
            testID="value-birthdate"
          />
          <ReadOnly
            label={t("dogProfile.fields.sex")}
            value={dog ? t(`onboarding.sex.${dog.sex}`) : null}
            testID="value-sex"
          />
          <ReadOnly
            label={t("dogProfile.fields.breed")}
            value={dog?.breed}
            testID="value-breed"
          />
          <ReadOnly
            label={t("dogProfile.fields.minutes")}
            value={
              dog?.dailyTrainingMinutes
                ? t(`onboarding.minutes.${dog.dailyTrainingMinutes}`)
                : null
            }
            testID="value-minutes"
          />

          <Button
            label={t("dogProfile.edit")}
            onPress={beginEdit}
            testID="edit-profile"
          />
        </View>
      )}

      {/*
        Sync status, shown plainly rather than hidden.

        A user who trained offline should be able to see that their sessions are safe and not yet uploaded, rather
        than having to trust that something invisible is working.
      */}
      <Card padding="compact" testID="sync-status">
        <View style={{ gap: theme.space[2] }}>
          <Text variant="small" tone="muted" testID="sync-summary">
            {pendingSync.length === 0
              ? t("dogProfile.syncedAll")
              : t("dogProfile.syncPending", { count: pendingSync.length })}
          </Text>
          {pendingSync.length > 0 ? (
            <Button
              label={t("dogProfile.syncNow")}
              variant="secondary"
              onPress={() => {
                void syncPendingSessions(dogId).then((outcome) => {
                  setSyncMessage(
                    outcome.status === "synced"
                      ? t("dogProfile.syncedAll")
                      : t("dogProfile.syncFailed"),
                  );
                });
              }}
              testID="sync-now"
            />
          ) : null}
          {syncMessage ? (
            <Text variant="caption" tone="muted" testID="sync-message">
              {syncMessage}
            </Text>
          ) : null}
        </View>
      </Card>

      <Button
        label={t("common.cta.close")}
        variant="secondary"
        onPress={() => router.back()}
        testID="close-profile"
      />
    </ScrollView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

function ReadOnly({
  label,
  value,
  testID,
}: {
  label: string;
  value: string | null | undefined;
  testID: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Card padding="compact">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.space[2],
        }}
      >
        <Text variant="small" tone="muted">
          {label}
        </Text>
        <Text variant="body" testID={testID}>
          {value || t("dogProfile.notSet")}
        </Text>
      </View>
    </Card>
  );
}
