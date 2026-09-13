import { installClickerDiagnostics } from "../src/audio/clicker-diagnostics";
import {
  devEntitlementOverride,
  installDevStoreAdapter,
  setDevEntitlementState,
} from "../src/billing/dev-billing";
import { isStoreBillingConfigured } from "../src/billing/store-billing-provider";
import { installAccountDevBridge } from "../src/state/account-lifecycle";

/**
 * The developer surfaces, checked against a release build's `__DEV__`.
 *
 * Each of these has its own test file for behaviour in development. This one asks the single release question of
 * all of them together: with `__DEV__` false, does anything a developer can reach still do anything? The screens
 * are covered by `dev-only-ui.test.tsx` and `billing-dev-guard.test.tsx`; these are the non-UI hooks — a global
 * diagnostic harness and an environment flag that would otherwise be one bundle-time substitution away from
 * running in production.
 */

const globalRef = globalThis as typeof globalThis & {
  __DEV__: boolean;
  __clickerDiag?: unknown;
  __accountDev?: unknown;
};
const originalDev = globalRef.__DEV__;

afterEach(() => {
  globalRef.__DEV__ = originalDev;
  delete globalRef.__clickerDiag;
  delete globalRef.__accountDev;
  delete process.env["EXPO_PUBLIC_CLICKER_DIAG"];
});

describe("in a release build", () => {
  beforeEach(() => {
    globalRef.__DEV__ = false;
  });

  it("does not install the clicker diagnostic harness, even with the env flag set", () => {
    process.env["EXPO_PUBLIC_CLICKER_DIAG"] = "1";
    installClickerDiagnostics();
    expect(globalRef.__clickerDiag).toBeUndefined();
  });

  it("ignores a forced entitlement state", () => {
    setDevEntitlementState("premium");
    expect(devEntitlementOverride()).toBeNull();
  });

  it("refuses to install the simulated store", () => {
    installDevStoreAdapter(true);
    expect(isStoreBillingConfigured()).toBe(false);
  });

  it("does not expose sign-out or account deletion on the global scope", () => {
    installAccountDevBridge();
    expect(globalRef.__accountDev).toBeUndefined();
  });
});

describe("in a development build", () => {
  beforeEach(() => {
    globalRef.__DEV__ = true;
  });

  it("installs the diagnostic harness so the guard above is not passing vacuously", () => {
    installClickerDiagnostics();
    expect(globalRef.__clickerDiag).toBeDefined();
  });

  it("installs the account bridge, for the same reason", () => {
    installAccountDevBridge();
    expect(globalRef.__accountDev).toBeDefined();
  });
});
