import { appStorage, secureStorage, STORAGE_KEYS } from "../src/lib/storage";
import * as permissionsModule from "../src/providers/permissions";
import {
  PERMISSION_CATALOGUE,
  FORBIDDEN_PERMISSIONS,
} from "../src/providers/permissions";
import {
  resolveDeviceLocale,
  resolveInitialLocale,
  isSupportedLocale,
} from "../src/i18n";
import { useSettingsStore } from "../src/state/settings-store";
import * as Localization from "expo-localization";

describe("storage tiers", () => {
  it("keeps auth tokens and ordinary preferences in separate stores", async () => {
    await secureStorage.setItem(STORAGE_KEYS.authSession, "token-value");
    await appStorage.setItem(STORAGE_KEYS.language, "he-IL");

    expect(await secureStorage.getItem(STORAGE_KEYS.authSession)).toBe(
      "token-value",
    );
    expect(await appStorage.getItem(STORAGE_KEYS.language)).toBe("he-IL");

    // The tiers must not be the same bucket — a token must never be readable from ordinary storage.
    expect(await appStorage.getItem(STORAGE_KEYS.authSession)).toBeNull();
  });
});

describe("device locale resolution", () => {
  afterEach(() => {
    (Localization.getLocales as jest.Mock).mockReturnValue([
      { languageTag: "en-US", languageCode: "en", textDirection: "ltr" },
    ]);
  });

  it("uses the device locale when it is supported", () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([
      { languageTag: "he-IL", languageCode: "he", textDirection: "rtl" },
    ]);
    expect(resolveDeviceLocale()).toBe("he-IL");
  });

  it("matches on the language subtag, so a device set to plain `he` still gets Hebrew", () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([
      { languageTag: "he", languageCode: "he", textDirection: "rtl" },
    ]);
    expect(resolveDeviceLocale()).toBe("he-IL");
  });

  it("falls back to English for an unsupported locale rather than shipping an untranslated UI", () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([
      { languageTag: "fr-FR", languageCode: "fr", textDirection: "ltr" },
    ]);
    expect(resolveDeviceLocale()).toBe("en-US");
  });

  it("prefers a stored explicit choice over the device setting", async () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([
      { languageTag: "en-US", languageCode: "en", textDirection: "ltr" },
    ]);
    await appStorage.setItem(STORAGE_KEYS.language, "he-IL");
    expect(await resolveInitialLocale()).toBe("he-IL");
    await appStorage.removeItem(STORAGE_KEYS.language);
  });

  it("only accepts the two launch locales", () => {
    expect(isSupportedLocale("en-US")).toBe(true);
    expect(isSupportedLocale("he-IL")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
  });
});

describe("settings persistence", () => {
  it("writes the language choice to storage so it survives a restart", async () => {
    await useSettingsStore.getState().setLanguage("he-IL");
    expect(await appStorage.getItem(STORAGE_KEYS.language)).toBe("he-IL");
    expect(useSettingsStore.getState().language).toBe("he-IL");

    await useSettingsStore.getState().setLanguage("en-US");
    expect(await appStorage.getItem(STORAGE_KEYS.language)).toBe("en-US");
  });

  it("persists sound and haptic toggles", async () => {
    await useSettingsStore.getState().setSoundEnabled(false);
    await useSettingsStore.getState().setHapticsEnabled(false);
    expect(await appStorage.getItem(STORAGE_KEYS.soundEnabled)).toBe("false");
    expect(await appStorage.getItem(STORAGE_KEYS.hapticsEnabled)).toBe("false");

    await useSettingsStore.getState().setSoundEnabled(true);
    await useSettingsStore.getState().setHapticsEnabled(true);
  });

  it("hydrates from storage on boot", async () => {
    await appStorage.setItem(STORAGE_KEYS.language, "he-IL");
    await appStorage.setItem(STORAGE_KEYS.soundEnabled, "false");

    await useSettingsStore.getState().hydrate();

    expect(useSettingsStore.getState().language).toBe("he-IL");
    expect(useSettingsStore.getState().soundEnabled).toBe(false);
    expect(useSettingsStore.getState().hydrated).toBe(true);

    await useSettingsStore.getState().setLanguage("en-US");
    await useSettingsStore.getState().setSoundEnabled(true);
  });
});

describe("permission architecture", () => {
  it("declares only the two contextual permissions v1 is allowed to request", () => {
    expect(Object.keys(PERMISSION_CATALOGUE).sort()).toEqual([
      "notifications",
      "photoLibrary",
    ]);
  });

  it("ties each permission to an explicit user action and an explanation shown first", () => {
    for (const spec of Object.values(PERMISSION_CATALOGUE)) {
      expect(spec.triggeredBy).toBeTruthy();
      expect(spec.rationaleKey).toMatch(/^permissions\./);
    }
  });

  it("never declares a forbidden permission", () => {
    for (const forbidden of FORBIDDEN_PERMISSIONS) {
      expect(PERMISSION_CATALOGUE).not.toHaveProperty(forbidden);
    }
  });

  it("exposes no generic request function, so nothing can prompt on mount", () => {
    const exported = permissionsModule as Record<string, unknown>;
    expect(exported.requestPermission).toBeUndefined();
    expect(exported.requestAllPermissions).toBeUndefined();
    // Only the rationale lookup is exported; there is deliberately nothing here that can trigger an OS prompt.
    expect(Object.keys(exported).filter((k) => /^request/i.test(k))).toEqual(
      [],
    );
  });
});
