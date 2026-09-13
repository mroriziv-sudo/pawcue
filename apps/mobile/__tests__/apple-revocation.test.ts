/**
 * Apple revoking the app's credential signs this device out — and only when there is an account to sign out of.
 */

let revokeListener: (() => void) | null = null;
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: () => Promise.resolve(true),
  signInAsync: jest.fn(),
  addRevokeListener: (listener: () => void) => {
    revokeListener = listener;
    return { remove: jest.fn() };
  },
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: () => null,
}));

const mockSignOut = jest.fn(() => Promise.resolve());
jest.mock("../src/providers/SupabaseAuthProvider", () => {
  const actual = jest.requireActual<
    typeof import("../src/providers/SupabaseAuthProvider")
  >("../src/providers/SupabaseAuthProvider");
  return {
    ...actual,
    authProvider: { signOut: () => mockSignOut(), deleteAccount: jest.fn() },
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
  listOwnDogs: jest.fn(),
  updateDog: jest.fn(),
}));

import { installAppleRevocationHandler } from "../src/state/account-lifecycle";
import { useBootstrapStore } from "../src/state/bootstrap-store";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  revokeListener = null;
});

it("signs out and restarts as a guest when an account's credential is revoked", async () => {
  const bootstrap = jest.fn(() => Promise.resolve());
  useBootstrapStore.setState({
    status: "ready",
    sessionStatus: "authenticated",
    userId: "00000000-0000-4000-a000-00000000bbbb",
    bootstrap,
  });

  installAppleRevocationHandler();
  expect(revokeListener).not.toBeNull();
  revokeListener?.();
  await flush();
  await flush();

  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(bootstrap).toHaveBeenCalledTimes(1);
});

it("does nothing for a guest, who has no Apple credential", async () => {
  const bootstrap = jest.fn(() => Promise.resolve());
  useBootstrapStore.setState({
    status: "ready",
    sessionStatus: "anonymous",
    userId: "00000000-0000-4000-a000-00000000aaaa",
    bootstrap,
  });

  installAppleRevocationHandler();
  revokeListener?.();
  await flush();

  expect(mockSignOut).not.toHaveBeenCalled();
  expect(bootstrap).not.toHaveBeenCalled();
});
