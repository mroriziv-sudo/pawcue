import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import {
  defaultSelection,
  isPremiumLesson,
  type ProductId,
  type StoreProduct,
} from "@pawcue/domain";
import { useEntitlementStore } from "../src/state/entitlement-store";
import { useCatalogue } from "../src/lessons/useCatalogue";
import { useDogStore } from "../src/state/dog-store";
import { env } from "../src/lib/env";
import { useAnnounce } from "../src/hooks/useAnnounce";

/**
 * The paywall.
 *
 * Everything a user needs to decide, and nothing designed to decide for them. Concretely, what is *absent* is as
 * deliberate as what is present: no countdown, no crossed-out price, no "most popular" badge, no pre-selected
 * annual plan, no close button hidden behind a delay. Those are the patterns brief §33 and store review both name,
 * and a product that needs them is one that is not worth the money.
 *
 * Two rules shape the rest:
 *
 *  - **Every price comes from the store.** There is no currency literal in this file. An unpriced product is not
 *    offered at all rather than shown with a placeholder.
 *  - **Every claim is a feature that exists.** The value list is two lines long because two is how many premium
 *    benefits the product actually ships. `paywall.feature.*` carries four more keys for features that do not
 *    exist yet; they stay unused until they do.
 */
export default function PaywallScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const dog = useDogStore((s) => s.dog);
  const { catalogue } = useCatalogue();

  const view = useEntitlementStore((s) => s.view);
  const products = useEntitlementStore((s) => s.products);
  const productsLoading = useEntitlementStore((s) => s.productsLoading);
  const productsErrorKey = useEntitlementStore((s) => s.productsErrorKey);
  const purchase = useEntitlementStore((s) => s.purchase);
  const restore = useEntitlementStore((s) => s.restore);
  const loadProducts = useEntitlementStore((s) => s.loadProducts);
  const buy = useEntitlementStore((s) => s.buy);
  const restorePurchases = useEntitlementStore((s) => s.restorePurchases);
  const resetPurchase = useEntitlementStore((s) => s.resetPurchase);

  const [selected, setSelected] = useState<ProductId | null>(null);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // The default is the first configured product — the smallest immediate charge — and it is only applied once, so
  // a reload cannot quietly move the user's choice to something larger.
  useEffect(() => {
    if (!products || selected) return;
    setSelected(defaultSelection(products));
  }, [products, selected]);

  useEffect(() => {
    return () => {
      // Leaving the screen ends the attempt, so returning later does not land mid-flow.
      resetPurchase();
    };
  }, [resetPurchase]);

  /** Real numbers from real content: what premium unlocks, and what the free tier already covers. */
  const lockedLessonCount = useMemo(() => {
    if (!catalogue) return 0;
    return catalogue.lessons.filter(isPremiumLesson).length;
  }, [catalogue]);

  const freeLessonCount = useMemo(() => {
    if (!catalogue) return 0;
    return catalogue.lessons.filter((lesson) => !isPremiumLesson(lesson))
      .length;
  }, [catalogue]);

  const close = () => router.back();

  const busy =
    purchase.phase === "purchasing" || purchase.phase === "verifying";
  const restoring =
    restore.phase === "restoring" || restore.phase === "verifying";

  const message =
    purchase.phase === "verifying"
      ? t("paywall.verifying")
      : purchase.messageKey
        ? t(purchase.messageKey)
        : restore.messageKey
          ? t(restore.messageKey)
          : productsErrorKey
            ? t(productsErrorKey)
            : null;

  // The outcome of a purchase or restore is read out, not just drawn beneath the button.
  useAnnounce(message);
  useAnnounce(
    purchase.phase === "unlocked" ? t("paywall.unlockedTitle") : null,
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background.base }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[3],
        paddingBottom: insets.bottom + theme.space[8],
        paddingHorizontal: theme.screenGutter,
        gap: theme.space[4],
      }}
      testID="paywall-screen"
    >
      {/*
        The close control comes first in reading order and in the layout, is a full-size touch target, and is never
        delayed or disguised. A paywall a user cannot leave is a paywall store review rejects — and, before that,
        one that treats the user as an obstacle.
      */}
      <View style={{ flexDirection: "row" }}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("common.cta.close")}
          hitSlop={theme.space[4]}
          // Sized rather than hit-slopped: a caption-height label plus slop is still under 44pt on its own.
          style={{
            minHeight: theme.minTouchTarget,
            minWidth: theme.minTouchTarget,
            justifyContent: "center",
          }}
          testID="paywall-close"
        >
          <Text variant="body" tone="muted">
            {t("common.cta.close")}
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: theme.space[2] }}>
        <Text variant="h1" testID="paywall-title">
          {dog?.name
            ? t("paywall.title", { dogName: dog.name })
            : t("paywall.titleNoDog")}
        </Text>
        <Text variant="body" tone="muted">
          {t("paywall.intro")}
        </Text>
      </View>

      {view.isPremiumActive ? (
        <Card padding="comfortable" testID="paywall-already-premium">
          <Text variant="body">{t("paywall.alreadyPremium")}</Text>
        </Card>
      ) : null}

      {/*
        What premium adds, stated against what the user already has.

        A benefits list on its own invites the reading that nothing works without paying — which is false here and
        would be a dark pattern if left to stand. The free tier is real and substantial, so it is named.
      */}
      {freeLessonCount > 0 ? (
        <Text variant="small" tone="muted" testID="paywall-free-tier">
          {t("paywall.freeTier", { count: freeLessonCount })}
        </Text>
      ) : null}

      <View style={{ gap: theme.space[2] }} testID="paywall-value">
        <ValueLine
          text={t("paywall.feature.fullCatalog")}
          testID="paywall-value-catalog"
        />
        <ValueLine
          text={t("paywall.feature.fullPlan")}
          testID="paywall-value-plan"
        />
        {lockedLessonCount > 0 ? (
          <ValueLine
            text={t("paywall.unlocksLessons", { count: lockedLessonCount })}
            testID="paywall-value-count"
          />
        ) : null}
      </View>

      {purchase.phase === "unlocked" ? (
        <Card padding="comfortable" testID="paywall-unlocked">
          <View style={{ gap: theme.space[2] }}>
            <Text variant="h3">{t("paywall.unlockedTitle")}</Text>
            <Text variant="body" tone="muted">
              {t("paywall.unlockedBody")}
            </Text>
            <Button
              label={t("common.cta.close")}
              onPress={close}
              testID="paywall-unlocked-close"
            />
          </View>
        </Card>
      ) : productsLoading ? (
        <ActivityIndicator
          color={theme.colors.brand.primary}
          testID="paywall-loading"
        />
      ) : !products || products.empty ? (
        /*
          Nothing to sell. The screen says so and stays usable rather than showing an empty list of choices —
          a store outage or an unconfigured build is not the user's problem to decode.
        */
        <Card padding="comfortable" testID="paywall-unavailable">
          <View style={{ gap: theme.space[2] }}>
            <Text variant="h3">{t("paywall.unavailableTitle")}</Text>
            <Text variant="body" tone="muted">
              {t("paywall.unavailableBody")}
            </Text>
          </View>
        </Card>
      ) : (
        <View style={{ gap: theme.space[3] }} testID="paywall-plans">
          <Text variant="h3">{t("paywall.choosePlan")}</Text>

          {products.products.map((product) => (
            <PlanOption
              key={product.productId}
              product={product}
              selected={product.productId === selected}
              onSelect={() => setSelected(product.productId)}
            />
          ))}

          {/*
            The store-required disclosure, rendered from the selected product's own store data: price, period,
            trial length when the store reports one, and the auto-renewal statement. Never a literal.
          */}
          <View style={{ gap: theme.space[1] }} testID="paywall-disclosure">
            <Disclosure products={products.products} selected={selected} />
            <Text variant="caption" tone="muted">
              {t("paywall.renewalNotice")}
            </Text>
            <Text variant="caption" tone="muted">
              {t("paywall.legalIntro")}
            </Text>
          </View>

          <Button
            label={t("paywall.cta")}
            onPress={() => {
              if (selected) void buy(selected);
            }}
            disabled={!selected}
            loading={busy}
            testID="paywall-cta"
          />
        </View>
      )}

      {message ? (
        <Card padding="compact" testID="paywall-message">
          <Text variant="small">{message}</Text>
        </Card>
      ) : null}

      <View style={{ gap: theme.space[2] }}>
        <Button
          label={
            restoring
              ? t("billing.restoring")
              : t("common.cta.restorePurchases")
          }
          variant="secondary"
          onPress={() => void restorePurchases()}
          loading={restoring}
          testID="paywall-restore"
        />

        {/*
          Terms and Privacy are a store requirement for an auto-renewing subscription, so they are always present.
          When no URL is configured the link says so instead of silently doing nothing — a dead link is worse than
          an honest one, and this is the state that must be fixed before submission.
        */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: theme.space[4],
          }}
        >
          <LegalLink
            label={t("common.cta.terms")}
            url={env.termsUrl}
            unavailableLabel={t("paywall.linkUnavailable")}
            testID="paywall-terms"
          />
          <LegalLink
            label={t("common.cta.privacy")}
            url={env.privacyUrl}
            unavailableLabel={t("paywall.linkUnavailable")}
            testID="paywall-privacy"
          />
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * One line of value.
 *
 * The marker is a bullet rather than a checkmark-shaped image, and the accessible name is the text alone: a
 * decorative glyph read aloud before every line is noise.
 */
function ValueLine({ text, testID }: { text: string; testID: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: theme.space[2],
        alignItems: "flex-start",
      }}
      accessibilityRole="text"
      accessibilityLabel={text}
      testID={testID}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          marginTop: 8,
          backgroundColor: theme.colors.brand.primary,
        }}
      />
      <Text variant="body" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * A single plan.
 *
 * Both options are presented identically — same size, same weight, same emphasis. The only difference between
 * them is the store's own price and period, which is the only difference that is real.
 */
function PlanOption({
  product,
  selected,
  onSelect,
}: {
  product: StoreProduct;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const period = t(`paywall.period.${product.period}`);

  return (
    <Card
      padding="comfortable"
      onPress={onSelect}
      elevated={selected}
      // Selection is part of the accessible name, not conveyed by the border alone.
      accessibilityLabel={`${product.localizedPricePerPeriod}. ${
        selected ? t("paywall.selected") : ""
      }`.trim()}
      testID={`paywall-plan-${product.productId}`}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.space[2],
        }}
      >
        <View style={{ flex: 1, gap: theme.space[1] }}>
          <Text
            variant="bodyStrong"
            testID={`paywall-price-${product.productId}`}
          >
            {product.localizedPricePerPeriod}
          </Text>
          <Text variant="caption" tone="muted">
            {period}
          </Text>
        </View>
        <Text variant="body" tone={selected ? "success" : "muted"}>
          {selected ? "✓" : ""}
        </Text>
      </View>
    </Card>
  );
}

/**
 * The store-required subscription disclosure for whichever plan is selected.
 *
 * Price, period and trial length all come from the selected product's own store data — the whole point of the
 * disclosure is that it states what the user will actually be charged.
 */
function Disclosure({
  products,
  selected,
}: {
  products: StoreProduct[];
  selected: ProductId | null;
}) {
  const { t } = useTranslation();
  const product = products.find((p) => p.productId === selected) ?? products[0];
  if (!product) return null;

  const period = t(`paywall.period.${product.period}`);
  // A trial is disclosed only when the store reports one. Nothing here can invent a free period.
  const text = product.trialDurationDays
    ? t("paywall.trialDisclosure", {
        trialDays: product.trialDurationDays,
        price: product.localizedPrice,
        period,
      })
    : t("paywall.noTrialDisclosure", {
        price: product.localizedPrice,
        period,
      });

  return (
    <Text variant="small" testID="paywall-disclosure-text">
      {text}
    </Text>
  );
}

function LegalLink({
  label,
  url,
  unavailableLabel,
  testID,
}: {
  label: string;
  url: string | undefined;
  unavailableLabel: string;
  testID: string;
}) {
  const [note, setNote] = useState<string | null>(null);

  return (
    <View style={{ alignItems: "center" }}>
      <Pressable
        onPress={() => {
          if (!url) {
            // Says what is wrong instead of doing nothing. This state must not survive to submission.
            setNote(unavailableLabel);
            return;
          }
          void Linking.openURL(url);
        }}
        accessibilityRole="link"
        accessibilityLabel={label}
        hitSlop={12}
        testID={testID}
      >
        <Text variant="small" tone="muted">
          {label}
        </Text>
      </Pressable>
      {note ? (
        <Text variant="caption" tone="muted" testID={`${testID}-unavailable`}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
