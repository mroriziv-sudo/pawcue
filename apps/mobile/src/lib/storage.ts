import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Two storage tiers, deliberately separated by sensitivity (SECURITY.md):
 *
 *   `secureStorage`  — auth tokens only. Backed by the iOS Keychain / Android Keystore.
 *   `appStorage`     — ordinary preferences (language, sound, haptics). AsyncStorage.
 *
 * Keeping them apart is what stops a token from drifting into plain storage later just because a helper was
 * convenient. Nothing here decides *what* is sensitive; callers pick the tier, and the token store is the only
 * caller of the secure one.
 */

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * expo-secure-store has no web implementation. Rather than let the app crash in a browser, web falls back to
 * localStorage — which is NOT equivalent security, and is why web is a development/preview target only. Shipping a
 * web build with real auth would need this revisited.
 */
const webFallbackStore: KeyValueStore = {
  // localStorage is synchronous; these return resolved promises to satisfy the async interface without
  // pretending to await anything.
  getItem(key) {
    try {
      return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
    } catch {
      return Promise.resolve(null);
    }
  },
  setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* private browsing or storage disabled — treated as a cache miss, never fatal */
    }
    return Promise.resolve();
  },
  removeItem(key) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* as above */
    }
    return Promise.resolve();
  },
};

const nativeSecureStore: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const secureStorage: KeyValueStore =
  Platform.OS === "web" ? webFallbackStore : nativeSecureStore;

export const appStorage: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/** Every persisted key in one place, so nothing is stored under an ad-hoc string. */
export const STORAGE_KEYS = {
  /** Supabase session tokens. Secure tier only. */
  authSession: "pawcue.auth.session",
  /** User's explicit language choice; absent means "follow the device". */
  language: "pawcue.settings.language",
  soundEnabled: "pawcue.settings.sound",
  hapticsEnabled: "pawcue.settings.haptics",
  /**
   * Developer-only clicker sound selection, used for QA listening tests. Persisted so a comparison survives the
   * app restarts a listening test involves. No user-facing UI writes this key.
   */
  clickSound: "pawcue.dev.clickSound",
  /** Set once the RTL direction has been applied and the app reloaded, to avoid a reload loop. */
  appliedDirection: "pawcue.settings.appliedDirection",
  /**
   * The training session currently in progress. One at a time: a user trains one dog on one lesson at a time, and
   * a list would invite resuming the wrong one.
   */
  activeSession: "pawcue.session.active",
  /** Locally completed sessions awaiting a server flush once a dog profile exists. */
  completedSessions: "pawcue.session.completed",
  /** Partially answered onboarding, so an interrupted flow resumes instead of restarting. */
  onboardingDraft: "pawcue.onboarding.draft",
  /** The dog the app is training. Cached locally so startup routing never waits on the network. */
  activeDogId: "pawcue.dog.activeId",
  /** Set when the user chooses the clicker over creating a profile, so the choice survives a relaunch. */
  onboardingSkipped: "pawcue.onboarding.skipped",
  /** Last lesson/skill catalogue seen, so Today and Train remain usable offline. */
  catalogueCache: "pawcue.content.catalogue",
  /**
   * The last server-verified entitlement, with the identity it was verified for and when.
   *
   * Ordinary tier, not secure: it grants nothing on its own. The app re-reads and re-verifies it against the
   * server, and its age is what bounds how long it may be honoured offline.
   */
  entitlement: "pawcue.billing.entitlement",
} as const;
