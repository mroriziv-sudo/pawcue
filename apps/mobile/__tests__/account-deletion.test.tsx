import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DeleteAccountScreen from "../app/delete-account";
import { i18n } from "../src/i18n";
import { STORAGE_KEYS } from "../src/lib/storage";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useDogStore } from "../src/state/dog-store";
import { useOnboardingStore } from "../src/state/onboarding-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { useSessionStore } from "../src/state/session-store";
import { useEntitlementStore } from "../src/state/entitlement-store";
import { usePlanStore } from "../src/state/plan-store";

/**
 * Account deletion, from the screen down to what is left on the device.
 *
 * The server is faked at the provider boundary — `deleteAccount` resolves or rejects — because the real
 * function is covered by `supabase/tests/account-delete-security.mjs` against the deployed endpoint. What is
 * asserted here is the client's half of the contract: three deliberate steps before anything happens, nothing
 * local touched until the server confirms, everything local gone once it has, and an honest screen either way.
 */

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockDeleteAccount = jest.fn();
const mockSignOut = jest.fn();
jest.mock("../src/providers/SupabaseAuthProvider", () => {
  const actual = jest.requireActual<
    typeof import("../src/providers/SupabaseAuthProvider")
  >("../src/providers/SupabaseAuthProvider");
  return {
    ...actual,
    authProvider: {
      deleteAccount: () => mockDeleteAccount(),
      signOut: () => mockSignOut(),
      ensureAnonymousSession: jest.fn(),
    },
  };
});

const mockResetRevenueCat = jest.fn(() => Promise.resolve());
jest.mock("../src/billing/revenuecat-adapter", () => ({
  resetRevenueCatIdentity: () => mockResetRevenueCat(),
  configureRevenueCat: jest.fn(() => Promise.resolve(false)),
  identifyRevenueCat: jest.fn(() => Promise.resolve()),
}));

jest.mock("../src/dogs/dog-repository", () => ({
  createDog: jest.fn(),
  fetchDog: jest.fn(),
  listOwnDogs: jest.fn(),
  updateDog: jest.fn(),
}));

import { AccountDeletionError } from "../src/providers/SupabaseAuthProvider";

const testMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const DOG_ID = "00000000-0000-4000-a000-0000000000d1";
const USER_ID = "00000000-0000-4000-a000-000000000abc";

async function renderScreen(direction: "ltr" | "rtl" = "ltr") {
  return await render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction={direction}>
          <DeleteAccountScreen />
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>,
  );
}

/** A device that has been used: a dog, a declined onboarding, a training log, a cached entitlement. */
async function seedUsedDevice() {
  await AsyncStorage.setItem(STORAGE_KEYS.activeDogId, DOG_ID);
  await AsyncStorage.setItem(STORAGE_KEYS.onboardingSkipped, "true");
  await AsyncStorage.setItem(
    STORAGE_KEYS.completedSessions,
    JSON.stringify([]),
  );
  await AsyncStorage.setItem(
    STORAGE_KEYS.entitlement,
    JSON.stringify({ userId: USER_ID }),
  );
  useDogStore.setState({
    dogId: DOG_ID,
    dog: null,
    hydrated: true,
    error: null,
  });
  useOnboardingStore.setState({ skipped: true, hydrated: true });
  useTrainingLogStore.setState({ completed: [], hydrated: true });
  useSessionStore.setState({ hydrated: true });
  usePlanStore.setState({ status: "ready" as never });
  useBootstrapStore.setState({
    status: "ready",
    sessionStatus: "authenticated",
    userId: USER_ID,
    sessionError: null,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await i18n.changeLanguage("en-US");
  await seedUsedDevice();
});

describe("three deliberate steps", () => {
  it("keeps the destructive button disabled until the consequences are acknowledged", async () => {
    await renderScreen();

    const confirm = screen.getByTestId("delete-account-confirm");
    expect(confirm.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(confirm);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("enables the button once acknowledged, and only then deletes", async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    await renderScreen();

    await fireEvent(
      screen.getByTestId("delete-account-acknowledge"),
      "valueChange",
      true,
    );
    const confirm = screen.getByTestId("delete-account-confirm");
    expect(confirm.props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(confirm);
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(1));
  });

  it("offers a way out that deletes nothing", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId("delete-account-cancel"));
    expect(mockBack).toHaveBeenCalled();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });
});

describe("after the server confirms", () => {
  it("shows the deleted state and forgets everything identity-scoped on the device", async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    await renderScreen();

    await fireEvent(
      screen.getByTestId("delete-account-acknowledge"),
      "valueChange",
      true,
    );
    await fireEvent.press(screen.getByTestId("delete-account-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("delete-account-done")).toBeTruthy(),
    );

    // Memory.
    expect(useDogStore.getState().dogId).toBeNull();
    expect(useOnboardingStore.getState().skipped).toBe(false);
    expect(useTrainingLogStore.getState().completed).toEqual([]);
    expect(useSessionStore.getState().session).toBeNull();
    expect(useEntitlementStore.getState().view.isPremiumActive).toBe(false);
    expect(usePlanStore.getState().plan).toBeNull();
    expect(useBootstrapStore.getState().sessionStatus).toBe("unknown");
    expect(useBootstrapStore.getState().userId).toBeNull();

    // Disk.
    expect(await AsyncStorage.getItem(STORAGE_KEYS.activeDogId)).toBeNull();
    expect(
      await AsyncStorage.getItem(STORAGE_KEYS.onboardingSkipped),
    ).toBeNull();
    expect(
      await AsyncStorage.getItem(STORAGE_KEYS.completedSessions),
    ).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.entitlement)).toBeNull();

    // Identity: the store SDK forgets who it spoke for, and the token is dropped.
    expect(mockResetRevenueCat).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("keeps device preferences: language is not identity data", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.language, "he-IL");
    mockDeleteAccount.mockResolvedValue(undefined);
    await renderScreen();

    await fireEvent(
      screen.getByTestId("delete-account-acknowledge"),
      "valueChange",
      true,
    );
    await fireEvent.press(screen.getByTestId("delete-account-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("delete-account-done")).toBeTruthy(),
    );

    expect(await AsyncStorage.getItem(STORAGE_KEYS.language)).toBe("he-IL");
  });

  it("starts the app again as a guest from the deleted state", async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    const bootstrap = jest.fn(() => Promise.resolve());
    useBootstrapStore.setState({ bootstrap });
    await renderScreen();

    await fireEvent(
      screen.getByTestId("delete-account-acknowledge"),
      "valueChange",
      true,
    );
    await fireEvent.press(screen.getByTestId("delete-account-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("delete-account-restart")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("delete-account-restart"));
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });
});

describe("when the server does not confirm", () => {
  it("stays on the screen, says nothing was removed, and touches nothing local", async () => {
    mockDeleteAccount.mockRejectedValue(
      new AccountDeletionError("failed", 500),
    );
    await renderScreen();

    await fireEvent(
      screen.getByTestId("delete-account-acknowledge"),
      "valueChange",
      true,
    );
    await fireEvent.press(screen.getByTestId("delete-account-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("delete-account-message")).toBeTruthy(),
    );
    expect(screen.getByTestId("delete-account-message").props.children).toBe(
      i18n.t("account.delete.failed"),
    );
    expect(screen.queryByTestId("delete-account-done")).toBeNull();

    // Nothing local moved.
    expect(useDogStore.getState().dogId).toBe(DOG_ID);
    expect(useOnboardingStore.getState().skipped).toBe(true);
    expect(useBootstrapStore.getState().sessionStatus).toBe("authenticated");
    expect(await AsyncStorage.getItem(STORAGE_KEYS.activeDogId)).toBe(DOG_ID);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.entitlement)).not.toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockResetRevenueCat).not.toHaveBeenCalled();

    // And the user can try again without re-acknowledging.
    expect(
      screen.getByTestId("delete-account-confirm").props.accessibilityState
        .disabled,
    ).toBe(false);
  });

  it("names a billing-partner outage specifically", async () => {
    mockDeleteAccount.mockRejectedValue(
      new AccountDeletionError("provider_unavailable", 502),
    );
    await renderScreen();
    await fireEvent(
      screen.getByTestId("delete-account-acknowledge"),
      "valueChange",
      true,
    );
    await fireEvent.press(screen.getByTestId("delete-account-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("delete-account-message").props.children).toBe(
        i18n.t("account.delete.providerUnavailable"),
      ),
    );
  });
});

describe("copy", () => {
  it("tells a signed-in user their sign-in goes too", async () => {
    await renderScreen();
    expect(screen.getByTestId("delete-account-body").props.children).toBe(
      i18n.t("account.delete.accountBody"),
    );
    expect(
      screen.getByTestId("delete-account-consequence-account"),
    ).toBeTruthy();
  });

  it("tells a guest what deleting guest data means", async () => {
    useBootstrapStore.setState({ sessionStatus: "anonymous" });
    await renderScreen();
    expect(screen.getByTestId("delete-account-body").props.children).toBe(
      i18n.t("account.delete.guestBody"),
    );
    expect(
      screen.queryByTestId("delete-account-consequence-account"),
    ).toBeNull();
  });

  it("says that deleting the account does not cancel a subscription", async () => {
    await renderScreen();
    expect(
      screen.getByTestId("delete-account-subscription").props.children,
    ).toMatch(/does not cancel a subscription/);
  });

  it("renders in Hebrew, RTL", async () => {
    await i18n.changeLanguage("he-IL");
    await renderScreen("rtl");
    expect(screen.getByTestId("delete-account-title").props.children).toBe(
      "מחיקת החשבון והנתונים",
    );
    expect(screen.getByTestId("delete-account-confirm")).toBeTruthy();
    expect(
      screen.getByTestId("delete-account-acknowledge").props.accessibilityLabel,
    ).toBe(i18n.t("account.delete.acknowledge"));
  });
});
