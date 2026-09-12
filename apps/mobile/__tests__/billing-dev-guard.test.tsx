import { render } from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import SettingsScreen from "../app/settings";
import { i18n } from "../src/i18n";
import {
  devEntitlementOverride,
  devEntitlementStateOrNull,
  installDevStoreAdapter,
  setDevEntitlementState,
} from "../src/billing/dev-billing";
import {
  isStoreBillingConfigured,
  registerStoreBillingAdapter,
} from "../src/billing/store-billing-provider";
import { useEntitlementStore } from "../src/state/entitlement-store";

/**
 * The simulated-entitlement tooling cannot ship.
 *
 * A `__DEV__` check is invisible in every test run that never flips it, which is exactly how a development-only
 * affordance reaches a release build. These flip it. The guard matters more here than it did for the clicker
 * sound selector: that one could only play the wrong noise, while this one decides who has paid.
 *
 * Both halves are asserted — the UI is gone, *and* the functions behind it refuse — because either alone would
 * leave a way in. A stale value left set by a developer, a component rendered by mistake, a call from somewhere
 * unexpected: none of them may produce premium.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderSettings() {
  return await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction="ltr">
          <SettingsScreen />
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>,
  );
}

/** React Native declares `__DEV__` as a global const, so it is reached through a typed view of `globalThis`. */
const globalRef = globalThis as typeof globalThis & { __DEV__: boolean };
const originalDev = globalRef.__DEV__;

beforeEach(async () => {
  globalRef.__DEV__ = true;
  setDevEntitlementState(null);
  registerStoreBillingAdapter(null);
  await i18n.changeLanguage("en-US");
});

afterEach(() => {
  globalRef.__DEV__ = true;
  setDevEntitlementState(null);
  registerStoreBillingAdapter(null);
  globalRef.__DEV__ = originalDev;
});

describe("in a development build", () => {
  it("can force every entitlement state", () => {
    setDevEntitlementState("premium");
    expect(devEntitlementOverride()?.isPremiumActive).toBe(true);

    setDevEntitlementState("expired");
    expect(devEntitlementOverride()?.status).toBe("expired");

    setDevEntitlementState("billing_unavailable");
    expect(devEntitlementOverride()?.isPremiumActive).toBe(false);
  });

  it("offers the simulator in Settings", async () => {
    const view = await renderSettings();
    expect(view.getByTestId("dev-billing-panel")).toBeTruthy();
  });

  it("labels the simulated store as simulated", () => {
    installDevStoreAdapter(true);
    expect(isStoreBillingConfigured()).toBe(true);
  });

  it("cannot simulate a successful purchase even so", async () => {
    installDevStoreAdapter(true);
    const { devStoreBillingAdapter } = require("../src/billing/dev-billing");
    const outcome = await devStoreBillingAdapter.purchase("premium_monthly");

    // "pending" is the honest outcome for a store that does not exist. Never "purchased".
    expect(outcome.outcome).toBe("pending");
  });
});

describe("in a release build", () => {
  it("ignores an override a developer left set", () => {
    setDevEntitlementState("premium");
    expect(devEntitlementOverride()?.isPremiumActive).toBe(true);

    globalRef.__DEV__ = false;

    expect(devEntitlementOverride()).toBeNull();
    expect(devEntitlementStateOrNull()).toBeNull();
  });

  it("refuses to set one at all", () => {
    globalRef.__DEV__ = false;
    setDevEntitlementState("premium");

    globalRef.__DEV__ = true;
    // Nothing was stored while the gate was closed, so re-opening it reveals nothing.
    expect(devEntitlementStateOrNull()).toBeNull();
  });

  it("refuses to install the simulated store", () => {
    globalRef.__DEV__ = false;
    installDevStoreAdapter(true);

    expect(isStoreBillingConfigured()).toBe(false);
  });

  it("renders no simulator in Settings", async () => {
    globalRef.__DEV__ = false;
    const view = await renderSettings();

    expect(view.queryByTestId("dev-billing-panel")).toBeNull();
    expect(view.queryByTestId("dev-entitlement-premium")).toBeNull();
    expect(view.queryByTestId("dev-store-adapter")).toBeNull();
  });

  it("still renders the real billing section", async () => {
    globalRef.__DEV__ = false;
    const view = await renderSettings();

    // The guard removes the simulator, not the product.
    expect(view.getByTestId("billing-section")).toBeTruthy();
    expect(view.getByTestId("billing-restore")).toBeTruthy();
  });

  it("projects the real entitlement, not a forced one", () => {
    setDevEntitlementState("premium");
    globalRef.__DEV__ = false;

    useEntitlementStore.getState().applyDevOverride();

    expect(useEntitlementStore.getState().view.isPremiumActive).toBe(false);
  });
});
