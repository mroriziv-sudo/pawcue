import { useState } from "react";
import { View } from "react-native";
import { Text, Card, Button, useTheme } from "@pawcue/ui";
import {
  DEV_ENTITLEMENT_STATES,
  devEntitlementStateOrNull,
  installDevStoreAdapter,
  setDevEntitlementState,
  type DevEntitlementState,
} from "../billing/dev-billing";
import { useEntitlementStore } from "../state/entitlement-store";
import { storeBillingLabel } from "../billing/store-billing-provider";

/**
 * Developer-only entitlement simulator.
 *
 * Every premium state the app can be in — including the ones a real account cannot easily be put into, like a
 * cache honoured offline or a store that will not answer — can be forced here so the locks, the paywall and the
 * billing section can be built and reviewed. Without it, none of those screens could be seen at all: real
 * entitlement needs App Store Connect / Play Console configuration and a sandbox account.
 *
 * ## Why this cannot ship
 *
 * It returns `null` in a release build, and so does every function it calls — the `__DEV__` check lives inside
 * `dev-billing.ts` as well as here, so neither this component being rendered nor a stale value being left set can
 * produce premium in anything shipped. `__tests__/billing-dev-guard.test.tsx` flips `__DEV__` and asserts both.
 *
 * It also cannot fake a *purchase*: the simulated store adapter never returns "purchased", and even if it did,
 * entitlement comes from a server row that nothing here can write.
 */
export function DevBillingPanel() {
  const theme = useTheme();
  const applyDevOverride = useEntitlementStore((s) => s.applyDevOverride);
  const loadProducts = useEntitlementStore((s) => s.loadProducts);
  const [simulatedStore, setSimulatedStore] = useState(false);

  if (!__DEV__) return null;

  const active = devEntitlementStateOrNull();

  const choose = (state: DevEntitlementState | null) => {
    setDevEntitlementState(state);
    // Re-resolves the view through the override so the change is visible immediately, everywhere.
    applyDevOverride();
  };

  return (
    <View style={{ gap: theme.space[2] }} testID="dev-billing-panel">
      <Text variant="h3">Billing (dev only)</Text>
      <Text variant="caption" tone="muted">
        SIMULATED entitlement. Not user-facing, never in a release build, and it
        cannot make a purchase — the server still decides real access.
      </Text>

      {[null, ...DEV_ENTITLEMENT_STATES].map((state) => {
        const selected = active === state;
        const label = state ?? "off (use the real answer)";
        return (
          <Card
            key={label}
            padding="compact"
            onPress={() => choose(state)}
            accessibilityLabel={label}
            testID={`dev-entitlement-${state ?? "off"}`}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: theme.space[2],
              }}
            >
              <Text variant="body" style={{ flex: 1 }}>
                {label}
              </Text>
              <Text variant="body" tone={selected ? "success" : "muted"}>
                {selected ? "✓" : ""}
              </Text>
            </View>
          </Card>
        );
      })}

      {/*
        A simulated store, so the paywall's product rows and disclosure can be laid out. Its prices are visibly
        not real, and its label says so — a screenshot of a paywall with plausible prices is exactly the artefact
        that ends up somewhere it should not.
      */}
      <Button
        label={
          simulatedStore
            ? "Remove simulated store"
            : "Install simulated store products"
        }
        variant="secondary"
        onPress={() => {
          const next = !simulatedStore;
          installDevStoreAdapter(next);
          setSimulatedStore(next);
          void loadProducts();
        }}
        testID="dev-store-adapter"
      />
      <Text variant="caption" tone="muted" testID="dev-store-label">
        store: {storeBillingLabel() ?? "none configured"}
      </Text>
    </View>
  );
}
