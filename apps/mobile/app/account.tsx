import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import {
  authProvider,
  ProviderNotConfiguredError,
} from "../src/providers/SupabaseAuthProvider";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useDogStore } from "../src/state/dog-store";
import { syncPendingSessions } from "../src/sync/session-sync";

/**
 * Account transition — guest to a permanent account.
 *
 * The screen exists at all only because the guest experience comes first: nothing here is required to use the
 * product, and the copy says so. The value offered is honest — an account is where the training history stops
 * being tied to one device.
 *
 * ## What happens on success, in order
 *
 *  1. The **guest access token is captured before sign-in**, because signing in replaces the stored session and
 *     the merge needs the guest's own token as proof of ownership. Capturing it afterwards is impossible.
 *  2. The provider signs in, producing the permanent identity.
 *  3. `mergeGuestSession` posts both tokens; the server derives both sides from the verified tokens and never
 *     from anything this client says.
 *  4. The dog is re-read under the new identity and any queued training is flushed.
 *
 * Apple and Google are wired to the provider and deliberately **not stubbed to succeed**. Without an Apple
 * Developer account and configured OAuth clients they raise `ProviderNotConfiguredError`, which this screen
 * reports plainly. A fake success here would make the merge look exercised when it never ran.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const sessionStatus = useBootstrapStore((s) => s.sessionStatus);
  const adoptOwnedDog = useDogStore((s) => s.adoptOwnedDog);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);

  const isGuest = sessionStatus === "anonymous";

  const signIn = async (provider: "apple" | "google") => {
    setBusy(true);
    setMessage(null);
    try {
      // Step 1 — capture the guest's identity and token while they are still the current session.
      const guest = await authProvider.ensureAnonymousSession();
      const guestToken = guest.accessToken;
      const guestUserId = guest.userId;

      // Step 2 — the provider. Throws if it is not configured for this build.
      if (provider === "apple") await authProvider.signInWithApple();
      else await authProvider.signInWithGoogle();

      // Step 3 — the merge. Both sides come from verified tokens, server-side.
      const result = await authProvider.mergeGuestSession(
        guestUserId,
        guestToken,
      );

      if ("code" in result && result.code === "GUEST_MERGE_CONFLICT") {
        setMessage(
          t("account.conflictBody", {
            guestDogs: result.guestSummary.dogCount,
            guestSessions: result.guestSummary.sessionsCompleted,
            accountDogs: result.accountSummary.dogCount,
            accountSessions: result.accountSummary.sessionsCompleted,
          }),
        );
        return;
      }

      // Step 4 — adopt whatever this identity now owns, then flush anything queued.
      const dog = await adoptOwnedDog();
      await syncPendingSessions(dog?.id ?? null);
      setMerged(true);
    } catch (error) {
      setMessage(
        error instanceof ProviderNotConfiguredError
          ? t("account.notConfigured")
          : t("account.conflictTitle"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[6],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[4],
      }}
      testID="account-screen"
    >
      {merged ? (
        <View style={{ gap: theme.space[3] }} testID="account-merged">
          <Text variant="h1">{t("account.mergedTitle")}</Text>
          <Text variant="body" tone="muted">
            {t("account.mergedBody")}
          </Text>
          <Button
            label={t("common.cta.close")}
            onPress={() => router.back()}
            testID="account-done"
          />
        </View>
      ) : (
        <>
          <Text variant="h1" testID="account-title">
            {t("account.title")}
          </Text>
          <Text variant="body" tone="muted" testID="account-body">
            {t("account.body")}
          </Text>

          {isGuest ? (
            <Card padding="compact" testID="guest-notice">
              <Text variant="small" tone="muted">
                {t("account.guestNotice")}
              </Text>
            </Card>
          ) : null}

          <View style={{ gap: theme.space[2] }}>
            <Button
              label={t("account.apple")}
              onPress={() => void signIn("apple")}
              loading={busy}
              testID="sign-in-apple"
            />
            <Button
              label={t("account.google")}
              variant="secondary"
              onPress={() => void signIn("google")}
              loading={busy}
              testID="sign-in-google"
            />
          </View>

          {message ? (
            <Text variant="small" tone="error" testID="account-message">
              {message}
            </Text>
          ) : null}

          <Button
            label={t("account.later")}
            variant="secondary"
            onPress={() => router.back()}
            testID="account-later"
          />
        </>
      )}
    </ScrollView>
  );
}
