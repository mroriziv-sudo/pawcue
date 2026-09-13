import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import AccountScreen from "../app/account";
import { i18n } from "../src/i18n";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useDogStore } from "../src/state/dog-store";

/**
 * The account screen's states and its handling of what Sign in with Apple can return.
 *
 * The provider is faked; the real Apple handshake and the real merge are covered elsewhere (provider tests with a
 * faked SDK; `pnpm test:merge` against the deployed endpoint) or pending external validation. What is asserted
 * here: a signed-in user is never offered sign-in again, cancellation says nothing, each failure says the right
 * thing, and sign-out forgets the identity and restarts the app.
 */

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: () => Promise.resolve(false),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: () => null,
}));

const mockSignInWithApple = jest.fn();
const mockEnsureAnonymous = jest.fn();
const mockMerge = jest.fn();
const mockResume = jest.fn((_session: unknown) => Promise.resolve());
const mockSignOut = jest.fn(() => Promise.resolve());
jest.mock("../src/providers/SupabaseAuthProvider", () => {
  const actual = jest.requireActual<
    typeof import("../src/providers/SupabaseAuthProvider")
  >("../src/providers/SupabaseAuthProvider");
  return {
    ...actual,
    authProvider: {
      ensureAnonymousSession: () => mockEnsureAnonymous(),
      signInWithApple: () => mockSignInWithApple(),
      signInWithGoogle: () =>
        Promise.reject(new actual.ProviderNotConfiguredError("google")),
      mergeGuestSession: (id: string, token?: string) => mockMerge(id, token),
      resumeSession: (session: unknown) => mockResume(session),
      refreshSession: jest.fn(() => Promise.reject(new Error("offline"))),
      signOut: () => mockSignOut(),
      deleteAccount: jest.fn(),
    },
  };
});

jest.mock("../src/billing/revenuecat-adapter", () => ({
  resetRevenueCatIdentity: jest.fn(() => Promise.resolve()),
  configureRevenueCat: jest.fn(() => Promise.resolve(false)),
  identifyRevenueCat: jest.fn(() => Promise.resolve()),
}));

jest.mock("../src/dogs/dog-repository", () => ({
  createDog: jest.fn(),
  fetchDog: jest.fn(),
  listOwnDogs: jest.fn(() => Promise.resolve([])),
  updateDog: jest.fn(),
}));

jest.mock("../src/sync/session-sync", () => ({
  syncPendingSessions: jest.fn(() => Promise.resolve()),
}));

import {
  AppleSignInCancelledError,
  ProviderNotConfiguredError,
  SignInFailedError,
} from "../src/providers/SupabaseAuthProvider";

const testMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const GUEST = {
  userId: "00000000-0000-4000-a000-00000000aaaa",
  identityKind: "anonymous" as const,
  accessToken: "guest-jwt",
  refreshToken: "r",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

async function renderScreen(direction: "ltr" | "rtl" = "ltr") {
  return await render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction={direction}>
          <AccountScreen />
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage("en-US");
  mockEnsureAnonymous.mockResolvedValue(GUEST);
  useDogStore.setState({ dogId: null, dog: null, hydrated: true, error: null });
  useBootstrapStore.setState({
    status: "ready",
    sessionStatus: "anonymous",
    userId: GUEST.userId,
    sessionError: null,
  });
});

describe("as a guest", () => {
  it("offers Apple, a way out, and the path to deletion — and no dead Google button", async () => {
    await renderScreen();
    expect(screen.getByTestId("sign-in-apple")).toBeTruthy();
    // Google is behind `googleSignInEnabled`, off until its provider exists: a button that can only say "not
    // available" is a non-functional control and a review rejection.
    expect(screen.queryByTestId("sign-in-google")).toBeNull();
    expect(screen.getByTestId("account-later")).toBeTruthy();
    expect(screen.getByTestId("open-delete-account")).toBeTruthy();
    expect(screen.queryByTestId("sign-out")).toBeNull();
  });

  it("routes to the deletion screen", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId("open-delete-account"));
    expect(mockPush).toHaveBeenCalledWith("/delete-account");
  });

  it("captures the guest token before signing in and merges with it", async () => {
    mockSignInWithApple.mockResolvedValue({
      ...GUEST,
      userId: "00000000-0000-4000-a000-00000000bbbb",
      identityKind: "apple",
    });
    mockMerge.mockResolvedValue({ merged: true });
    await renderScreen();

    await fireEvent.press(screen.getByTestId("sign-in-apple"));

    await waitFor(() =>
      expect(screen.getByTestId("account-merged")).toBeTruthy(),
    );
    expect(mockMerge).toHaveBeenCalledWith(GUEST.userId, GUEST.accessToken);
    // The order is the contract: the guest token is read before the provider replaces the session.
    expect(mockEnsureAnonymous.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignInWithApple.mock.invocationCallOrder[0] ?? Infinity,
    );
    // The identity changed for good, even though the entitlement re-read (refreshSession) failed offline.
    expect(useBootstrapStore.getState().sessionStatus).toBe("authenticated");
    expect(useBootstrapStore.getState().userId).toBe(
      "00000000-0000-4000-a000-00000000bbbb",
    );
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("puts the guest session back when the account already has a dog", async () => {
    mockSignInWithApple.mockResolvedValue({
      ...GUEST,
      userId: "00000000-0000-4000-a000-00000000bbbb",
      identityKind: "apple",
    });
    mockMerge.mockResolvedValue({
      code: "GUEST_MERGE_CONFLICT",
      guestSummary: { dogCount: 1, sessionsCompleted: 3 },
      accountSummary: { dogCount: 1, sessionsCompleted: 8 },
    });
    await renderScreen();

    await fireEvent.press(screen.getByTestId("sign-in-apple"));

    await waitFor(() =>
      expect(screen.getByTestId("account-message")).toBeTruthy(),
    );
    // The message promises nothing changed; the device is the guest again, with the guest's own tokens.
    expect(mockResume).toHaveBeenCalledWith(GUEST);
    expect(useBootstrapStore.getState().sessionStatus).toBe("anonymous");
    expect(useBootstrapStore.getState().userId).toBe(GUEST.userId);
    expect(screen.queryByTestId("account-merged")).toBeNull();
  });

  it("puts the guest session back when the merge itself fails", async () => {
    mockSignInWithApple.mockResolvedValue({ ...GUEST, identityKind: "apple" });
    mockMerge.mockRejectedValue(new Error("Guest merge failed (500)."));
    await renderScreen();

    await fireEvent.press(screen.getByTestId("sign-in-apple"));

    await waitFor(() =>
      expect(screen.getByTestId("account-message").props.children).toBe(
        i18n.t("account.failed"),
      ),
    );
    expect(mockResume).toHaveBeenCalledWith(GUEST);
    expect(useBootstrapStore.getState().sessionStatus).toBe("anonymous");
  });

  it("says nothing when the user closes Apple's sheet", async () => {
    mockSignInWithApple.mockRejectedValue(new AppleSignInCancelledError());
    await renderScreen();

    await fireEvent.press(screen.getByTestId("sign-in-apple"));

    await waitFor(() =>
      expect(
        screen.getByTestId("sign-in-apple").props.accessibilityState.busy,
      ).toBe(false),
    );
    expect(screen.queryByTestId("account-message")).toBeNull();
    expect(mockMerge).not.toHaveBeenCalled();
  });

  it("reports an unconfigured provider as unavailable in this build", async () => {
    mockSignInWithApple.mockRejectedValue(
      new ProviderNotConfiguredError("apple"),
    );
    await renderScreen();
    await fireEvent.press(screen.getByTestId("sign-in-apple"));
    await waitFor(() =>
      expect(screen.getByTestId("account-message").props.children).toBe(
        i18n.t("account.notConfigured"),
      ),
    );
  });

  it("reports a failed handshake as a sign-in failure, with the training unchanged", async () => {
    mockSignInWithApple.mockRejectedValue(
      new SignInFailedError("apple", "Invalid nonce"),
    );
    await renderScreen();
    await fireEvent.press(screen.getByTestId("sign-in-apple"));
    await waitFor(() =>
      expect(screen.getByTestId("account-message").props.children).toBe(
        i18n.t("account.signInFailed"),
      ),
    );
    expect(mockMerge).not.toHaveBeenCalled();
  });

  it("reports a failed merge without pretending the account is set up", async () => {
    mockSignInWithApple.mockResolvedValue({ ...GUEST, identityKind: "apple" });
    mockMerge.mockRejectedValue(new Error("Guest merge failed (500)."));
    await renderScreen();
    await fireEvent.press(screen.getByTestId("sign-in-apple"));
    await waitFor(() =>
      expect(screen.getByTestId("account-message").props.children).toBe(
        i18n.t("account.failed"),
      ),
    );
    expect(screen.queryByTestId("account-merged")).toBeNull();
  });
});

describe("signed in", () => {
  beforeEach(() => {
    useBootstrapStore.setState({
      sessionStatus: "authenticated",
      userId: "00000000-0000-4000-a000-00000000bbbb",
    });
  });

  it("is not offered sign-in again", async () => {
    await renderScreen();
    expect(screen.getByTestId("account-signed-in")).toBeTruthy();
    expect(screen.queryByTestId("sign-in-apple")).toBeNull();
    expect(screen.queryByTestId("sign-in-google")).toBeNull();
    expect(screen.getByTestId("sign-out")).toBeTruthy();
    expect(screen.getByTestId("open-delete-account")).toBeTruthy();
  });

  it("signs out of this device, forgets the identity and restarts as a guest", async () => {
    const bootstrap = jest.fn(() => Promise.resolve());
    useBootstrapStore.setState({ bootstrap });
    await renderScreen();

    await fireEvent.press(screen.getByTestId("sign-out"));

    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(useBootstrapStore.getState().sessionStatus).toBe("unknown");
  });

  it("renders in Hebrew, RTL", async () => {
    await i18n.changeLanguage("he-IL");
    await renderScreen("rtl");
    expect(screen.getByTestId("account-title").props.children).toBe("מחוברים");
    expect(screen.getByTestId("sign-out").props.accessibilityLabel).toBe(
      "התנתקות",
    );
  });
});
