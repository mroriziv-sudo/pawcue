import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import { DEFAULT_FEATURE_FLAGS } from "@pawcue/config";
import {
  authProvider,
  AppleSignInCancelledError,
  ProviderNotConfiguredError,
  SignInFailedError,
} from "../src/providers/SupabaseAuthProvider";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useDogStore } from "../src/state/dog-store";
import { useEntitlementStore } from "../src/state/entitlement-store";
import { identifyRevenueCat } from "../src/billing/revenuecat-adapter";
import { syncPendingSessions } from "../src/sync/session-sync";
import { AppleSignInButton } from "../src/components/AppleSignInButton";
import { useAnnounce } from "../src/hooks/useAnnounce";
import {
  restartAsGuest,
  signOutAndForget,
} from "../src/state/account-lifecycle";

/**
 * Account — guest to a permanent account, and what a permanent account can do.
 *
 * The screen exists at all only because the guest experience comes first: nothing here is required to use the
 * product, and the copy says so. The value offered is honest — an account is where the training history stops
 * being tied to one device.
 *
 * ## What happens on sign-in, in order
 *
 *  1. The **guest access token is captured before sign-in**, because signing in replaces the stored session and
 *     the merge needs the guest's own token as proof of ownership. Capturing it afterwards is impossible.
 *  2. The provider signs in, producing the permanent identity. Sign in with Apple is real (native, nonce-bound,
 *     verified by Supabase); cancelling Apple's sheet returns here silently. Google is still not configured and
 *     says so.
 *  3. `mergeGuestSession` posts both tokens; the server derives both sides from the verified tokens and never
 *     from anything this client says.
 *  4. The dog is re-read under the new identity and any queued training is flushed.
 *  5. Store billing and entitlement follow the identity.
 *
 * ## Signed in
 *
 * A signed-in user is not offered sign-in again — the merge endpoint would rightly refuse a permanent account as
 * a source. They can sign out of this device (server data untouched) or go to the deletion screen. Guests can
 * reach deletion too: a guest owns a dog and a history, and "erase my data" is theirs to ask for.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const sessionStatus = useBootstrapStore((s) => s.sessionStatus);
  const adoptOwnedDog = useDogStore((s) => s.adoptOwnedDog);

  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);

  const isGuest = sessionStatus === "anonymous";
  const isSignedIn = sessionStatus === "authenticated";

  useAnnounce(message);
  useAnnounce(merged ? t("account.mergedTitle") : null);

  const signIn = async (provider: "apple" | "google") => {
    setBusy(true);
    setMessage(null);
    try {
      /**
       * Step 1 — capture the guest's identity and token while they are still the current session.
       *
       * Only an anonymous session is a merge source. A device whose stored session could not be restored (a
       * revoked refresh token — bootstrap reported it unavailable) has no guest to merge; signing in is then how
       * the user gets their account's data back, so it proceeds without a merge rather than failing on step 1.
       * A device that already holds an account session has nothing to merge either.
       */
      const guest = await authProvider
        .ensureAnonymousSession()
        .then((session) =>
          session.identityKind === "anonymous" ? session : null,
        )
        .catch(() => null);

      // Step 2 — the provider. Throws if it is not configured for this build, or if the user cancelled.
      const account =
        provider === "apple"
          ? await authProvider.signInWithApple()
          : await authProvider.signInWithGoogle();

      // Step 3 — the merge. Both sides come from verified tokens, server-side.
      let result: Awaited<ReturnType<typeof authProvider.mergeGuestSession>> = {
        merged: true,
      };
      if (guest) {
        try {
          result = await authProvider.mergeGuestSession(
            guest.userId,
            guest.accessToken,
          );
        } catch (error) {
          // Signed in, not merged. The device goes back to being the guest so nothing is half-done.
          await authProvider.resumeSession(guest).catch(() => undefined);
          throw error;
        }
      }

      if (guest && "code" in result && result.code === "GUEST_MERGE_CONFLICT") {
        /**
         * The account already has its own dog, and choosing which history to keep is not built. The message says
         * so and asks for a different account — so the device must actually still be the guest afterwards: the
         * guest session is put back, and the guest's dog, plan and history stay exactly where they were. Leaving
         * the account's session in place would strand a device whose local state belongs to an identity it can no
         * longer read, and route the user into creating a second dog for the account on the next launch.
         */
        await authProvider.resumeSession(guest).catch(() => undefined);
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

      // The identity has changed for good; every screen reads that from here on, whatever the network does next.
      useBootstrapStore.setState({
        sessionStatus: "authenticated",
        userId: account.userId,
        sessionError: null,
      });

      // Step 4 — adopt whatever this identity now owns, then flush anything queued.
      const dog = await adoptOwnedDog();
      await syncPendingSessions(dog?.id ?? null);

      /**
       * Step 5 — entitlement follows the identity, not the device.
       *
       * `merge_guest_session` re-parents `subscriptions` onto the account and recomputes its entitlement, so a
       * subscription bought as a guest is now the account's. The client must ask the server again under the new
       * id rather than keep the guest's cached answer: the cache is scoped by user id and would otherwise simply
       * be ignored, leaving a paying user looking free until the next launch.
       *
       * The store SDK follows first, so the subscription bought as a guest is transferred to the account before
       * the server is asked what the account is entitled to. Order matters: reading entitlement first would
       * answer for an account RevenueCat has not yet attributed the purchase to. Each step is independent — a
       * store SDK that cannot be reached must not stop the entitlement read, and neither failure is reported: the
       * merge succeeded, and both are retried on the next launch.
       */
      await identifyRevenueCat(account.userId).catch(() => undefined);
      await useEntitlementStore
        .getState()
        .initialize(account.userId)
        .catch(() => undefined);

      setMerged(true);
    } catch (error) {
      if (error instanceof AppleSignInCancelledError) {
        // The user closed Apple's sheet. Nothing happened, so nothing is reported.
        return;
      }
      setMessage(
        error instanceof ProviderNotConfiguredError
          ? t("account.notConfigured")
          : error instanceof SignInFailedError
            ? t("account.signInFailed")
            : t("account.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    setMessage(null);
    try {
      await signOutAndForget();
      await restartAsGuest();
    } catch {
      setSigningOut(false);
      setMessage(t("account.failed"));
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
      ) : isSignedIn ? (
        <View style={{ gap: theme.space[3] }} testID="account-signed-in">
          <Text variant="h1" testID="account-title">
            {t("account.signedInAs")}
          </Text>
          <Text variant="body" tone="muted">
            {t("account.signedInBody")}
          </Text>
          <Card padding="compact">
            <Text variant="small" tone="muted">
              {t("account.signOutBody")}
            </Text>
          </Card>
          <Button
            label={signingOut ? t("account.signingOut") : t("account.signOut")}
            variant="secondary"
            loading={signingOut}
            onPress={() => void signOut()}
            testID="sign-out"
          />
          {message ? (
            <Text variant="small" tone="error" testID="account-message">
              {message}
            </Text>
          ) : null}
          <Button
            label={t("account.deleteEntry")}
            variant="tertiary"
            disabled={signingOut}
            onPress={() => router.push("/delete-account")}
            testID="open-delete-account"
          />
          <Button
            label={t("common.cta.close")}
            variant="secondary"
            disabled={signingOut}
            onPress={() => router.back()}
            testID="account-later"
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
            {/* Sign in with Apple is native and iOS-only; on Android the button would only ever say "not available". */}
            {Platform.OS === "ios" ? (
              <AppleSignInButton
                label={t("account.apple")}
                onPress={() => void signIn("apple")}
                loading={busy}
                testID="sign-in-apple"
              />
            ) : null}
            {/*
              Google is behind a flag until its provider exists. A button that can only answer "not available"
              is a non-functional control, and shipping one is a review rejection, not a feature.
            */}
            {DEFAULT_FEATURE_FLAGS.googleSignInEnabled ? (
              <Button
                label={t("account.google")}
                variant="secondary"
                onPress={() => void signIn("google")}
                loading={busy}
                testID="sign-in-google"
              />
            ) : null}
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

          {/*
            Deletion is reachable for a guest too. It sits last, as a text button, after the way out: it must be
            findable (Apple and Google both require it) without ever reading as the next step.
          */}
          <Button
            label={t("account.deleteEntry")}
            variant="tertiary"
            disabled={busy}
            onPress={() => router.push("/delete-account")}
            testID="open-delete-account"
          />
        </>
      )}
    </ScrollView>
  );
}
