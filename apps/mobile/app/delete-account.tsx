import { useState } from "react";
import { Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import { AccountDeletionError } from "../src/providers/SupabaseAuthProvider";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import {
  deleteAccountAndForget,
  restartAsGuest,
} from "../src/state/account-lifecycle";
import { ScreenScroll, Section } from "../src/components/ScreenScroll";
import { SectionHeader } from "../src/components/SectionHeader";

/**
 * Account deletion — the product's one irreversible action, so the one screen that slows the user down.
 *
 * Three deliberate steps stand between "Delete account" in Settings and a deleted account: opening this screen,
 * switching the acknowledgement on, and pressing a button that is disabled until then. No native alert: the
 * consequences are laid out in full in the user's language, readable by a screen reader in order, mirrored in
 * RTL — none of which an `Alert` guarantees.
 *
 * ## Truthfulness
 *
 * The screen renders the deleted state only after `deleteAccountAndForget` resolves, and that resolves only after
 * the server confirmed the profile is gone. Every failure keeps the user here, with the acknowledgement still on
 * and a message that says nothing was removed — which is true, because nothing local is touched until the server
 * has answered.
 *
 * ## Guests
 *
 * A guest owns a dog and a training history too. The body copy says what "account" means for them; the
 * mechanics are identical, and afterwards the app starts again as a new guest — the same fresh start a deleted
 * account gets.
 */
export default function DeleteAccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const sessionStatus = useBootstrapStore((s) => s.sessionStatus);
  const isGuest = sessionStatus !== "authenticated";

  const [acknowledged, setAcknowledged] = useState(false);
  const [phase, setPhase] = useState<"idle" | "deleting" | "deleted">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const confirmDeletion = async () => {
    if (!acknowledged || phase !== "idle") return;
    setPhase("deleting");
    setMessage(null);
    try {
      await deleteAccountAndForget();
      setPhase("deleted");
    } catch (error) {
      setPhase("idle");
      setMessage(
        error instanceof AccountDeletionError &&
          error.reason === "provider_unavailable"
          ? t("account.delete.providerUnavailable")
          : t("account.delete.failed"),
      );
    }
  };

  if (phase === "deleted") {
    return (
      <ScreenScroll testID="delete-account-done">
        <Text variant="h1" testID="delete-account-done-title">
          {t("account.delete.doneTitle")}
        </Text>
        <Text variant="body" tone="muted">
          {t("account.delete.doneBody")}
        </Text>
        <Button
          label={t("account.delete.doneCta")}
          onPress={() => void restartAsGuest()}
          testID="delete-account-restart"
        />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll testID="delete-account-screen">
      <Text variant="h1" testID="delete-account-title">
        {t("account.delete.title")}
      </Text>
      <Text variant="body" tone="muted" testID="delete-account-body">
        {isGuest
          ? t("account.delete.guestBody")
          : t("account.delete.accountBody")}
      </Text>

      <Section>
        <SectionHeader title={t("account.delete.consequencesTitle")} />
        <Card padding="compact">
          <View style={{ gap: theme.space[2] }}>
            <Text variant="body">• {t("account.delete.consequenceDog")}</Text>
            <Text variant="body">
              • {t("account.delete.consequenceHistory")}
            </Text>
            {isGuest ? null : (
              <Text variant="body" testID="delete-account-consequence-account">
                • {t("account.delete.consequenceAccount")}
              </Text>
            )}
          </View>
        </Card>
        <Card padding="compact">
          <Text
            variant="small"
            tone="muted"
            testID="delete-account-subscription"
          >
            {t("account.delete.subscriptionNote")}
          </Text>
        </Card>
      </Section>

      <Card padding="compact">
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: theme.space[3],
          }}
        >
          <Text variant="body" style={{ flex: 1 }}>
            {t("account.delete.acknowledge")}
          </Text>
          <Switch
            value={acknowledged}
            onValueChange={setAcknowledged}
            disabled={phase !== "idle"}
            accessibilityLabel={t("account.delete.acknowledge")}
            testID="delete-account-acknowledge"
          />
        </View>
      </Card>

      {message ? (
        <Text variant="small" tone="error" testID="delete-account-message">
          {message}
        </Text>
      ) : null}

      <View style={{ gap: theme.space[2] }}>
        <Button
          label={
            phase === "deleting"
              ? t("account.delete.deleting")
              : t("account.delete.confirm")
          }
          variant="destructive"
          disabled={!acknowledged}
          loading={phase === "deleting"}
          onPress={() => void confirmDeletion()}
          testID="delete-account-confirm"
        />
        <Button
          label={t("account.delete.cancel")}
          variant="secondary"
          disabled={phase === "deleting"}
          onPress={() => router.back()}
          testID="delete-account-cancel"
        />
      </View>
    </ScreenScroll>
  );
}
