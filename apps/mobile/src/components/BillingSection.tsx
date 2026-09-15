import { ActivityIndicator, Linking, Platform, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAnnounce } from "../hooks/useAnnounce";
import { Text, Button, useTheme } from "@pawcue/ui";
import type { EntitlementStatus } from "@pawcue/domain";
import { useEntitlementStore } from "../state/entitlement-store";

/**
 * The subscription section in Settings.
 *
 * Four things belong here and nothing else (brief §12): what the user is on now, how to get premium or manage it,
 * how to restore a purchase, and what to do when we could not check. Account functionality unrelated to billing
 * stays where it already is.
 *
 * The status shown is the resolved entitlement view, so this screen and every lock in the app are reading the same
 * answer. There is no separate "subscription status" the settings screen computes for display.
 */

/**
 * Where a subscription is actually managed.
 *
 * Both stores require cancellation to happen in the user's own store account, and both publish a stable URL for
 * it — Play policy additionally requires it to be reachable in ≤2 taps (RELEASE_CHECKLIST.md §B). Linking out is
 * the supported mechanism; a custom in-app cancellation flow is not permitted and is not built.
 */
const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: null,
});

/** Which status each piece of copy belongs to, so the mapping is one table rather than nested ternaries. */
const PLAN_KEY: Record<EntitlementStatus, string> = {
  unknown: "billing.plan.unknown",
  free: "billing.plan.free",
  premium: "billing.plan.premium",
  expired: "billing.plan.expired",
  offline_cached: "billing.plan.offline",
  billing_unavailable: "billing.plan.unavailable",
};

const BODY_KEY: Record<EntitlementStatus, string | null> = {
  unknown: null,
  free: "billing.freeBody",
  premium: "billing.premiumBody",
  expired: "billing.expiredBody",
  offline_cached: "billing.offlineBody",
  billing_unavailable: "billing.unavailableBody",
};

export function BillingSection() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const view = useEntitlementStore((s) => s.view);
  const refreshing = useEntitlementStore((s) => s.refreshing);
  const restore = useEntitlementStore((s) => s.restore);
  useAnnounce(restore.messageKey ? t(restore.messageKey) : null);
  const refresh = useEntitlementStore((s) => s.refresh);
  const restorePurchases = useEntitlementStore((s) => s.restorePurchases);

  const restoring =
    restore.phase === "restoring" || restore.phase === "verifying";
  const bodyKey = BODY_KEY[view.status];

  /**
   * The date line.
   *
   * Says "renews" only while the subscription is active. For an ended one it says when access stopped, and for one
   * that is running out it says when it will — three different facts that a single "expires" label would blur.
   */
  const dateLine = view.expiresAt
    ? view.status === "premium" || view.status === "offline_cached"
      ? t(view.source === "cancelled" ? "billing.endsOn" : "billing.renewsOn", {
          date: formatDate(view.expiresAt, i18n.language),
        })
      : view.status === "expired"
        ? t("billing.endedOn", {
            date: formatDate(view.expiresAt, i18n.language),
          })
        : null
    : null;

  return (
    <View style={{ gap: theme.space[3] }} testID="billing-section">
      <Text variant="sectionLabel" accessibilityRole="header">
        {t("settings.billingSection")}
      </Text>

      {/* The state, as sentences on the paper: what the plan is, what that means, and until when. */}
      <View style={{ gap: theme.space[1] }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space[2],
          }}
        >
          <Text
            variant="bodyStrong"
            style={{ flex: 1 }}
            testID="billing-status"
          >
            {t(PLAN_KEY[view.status])}
          </Text>
          {refreshing ? (
            <ActivityIndicator
              color={theme.colors.brand.primary}
              testID="billing-refreshing"
            />
          ) : null}
        </View>

        {bodyKey ? (
          <Text variant="secondary" tone="secondary" testID="billing-body">
            {t(bodyKey)}
          </Text>
        ) : null}

        {dateLine ? (
          <Text variant="caption" tone="secondary" testID="billing-date">
            {dateLine}
          </Text>
        ) : null}
      </View>

      {/*
        One primary action, chosen by state. An entitled user is never shown an upgrade button, and a free user is
        never shown a "manage" link to a subscription they do not have.
      */}
      {view.isPremiumActive ? (
        <View style={{ gap: theme.space[1] }}>
          <Button
            label={t("billing.manage")}
            variant="secondary"
            onPress={() => {
              if (MANAGE_SUBSCRIPTION_URL) {
                void Linking.openURL(MANAGE_SUBSCRIPTION_URL);
              }
            }}
            testID="billing-manage"
          />
          <Text variant="caption" tone="secondary">
            {MANAGE_SUBSCRIPTION_URL
              ? t("billing.manageHint")
              : t("billing.manageUnavailable")}
          </Text>
        </View>
      ) : view.status === "billing_unavailable" || view.status === "unknown" ? (
        <Button
          label={refreshing ? t("billing.checking") : t("billing.retry")}
          variant="secondary"
          onPress={() => void refresh()}
          loading={refreshing}
          testID="billing-retry"
        />
      ) : (
        <Button
          label={t("billing.upgrade")}
          onPress={() => router.push("/paywall")}
          testID="billing-upgrade"
        />
      )}

      {/*
        Restore is always reachable, in every state. A user whose subscription looks missing is exactly the one who
        needs it, and hiding it behind "free" would hide it from them.
      */}
      <Button
        label={
          restoring ? t("billing.restoring") : t("settings.restorePurchases")
        }
        variant="secondary"
        onPress={() => void restorePurchases()}
        loading={restoring}
        testID="billing-restore"
      />

      {restore.messageKey ? (
        <Text
          variant="secondary"
          tone="secondary"
          testID="billing-restore-message"
        >
          {t(restore.messageKey)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A date in the user's locale.
 *
 * Falls back to the raw ISO string rather than throwing or rendering "Invalid Date": a malformed timestamp from
 * the server is a bug worth seeing, not one worth crashing Settings over.
 */
function formatDate(iso: string, locale: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  try {
    return new Date(parsed).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
