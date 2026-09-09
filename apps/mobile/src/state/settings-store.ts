import { create } from "zustand";
import type { SupportedLocale } from "@pawcue/i18n";
import { appStorage, STORAGE_KEYS } from "../lib/storage";
import { applyLocale, resolveInitialLocale } from "../i18n";

/**
 * User-controlled settings that must survive a restart.
 *
 * Persistence is written explicitly on each change rather than through a middleware, because `language` has a side
 * effect beyond storage — it flips the native layout direction — and that ordering (i18next, then storage, then
 * `I18nManager`) matters enough to be visible rather than hidden in a serializer.
 */

interface SettingsState {
  language: SupportedLocale;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  /** True once a language change has requested a native direction flip that needs an app reload. */
  pendingDirectionReload: boolean;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setLanguage: (locale: SupportedLocale) => Promise<void>;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
}

async function readBoolean(key: string, fallback: boolean): Promise<boolean> {
  const raw = await appStorage.getItem(key);
  return raw === null ? fallback : raw === "true";
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: "en-US",
  soundEnabled: true,
  hapticsEnabled: true,
  pendingDirectionReload: false,
  hydrated: false,

  hydrate: async () => {
    const [language, soundEnabled, hapticsEnabled] = await Promise.all([
      resolveInitialLocale(),
      readBoolean(STORAGE_KEYS.soundEnabled, true),
      readBoolean(STORAGE_KEYS.hapticsEnabled, true),
    ]);

    // Applies the stored/device language on boot so a returning Hebrew user opens straight into Hebrew.
    const { requiresReload } = await applyLocale(language);

    set({
      language,
      soundEnabled,
      hapticsEnabled,
      pendingDirectionReload: requiresReload,
      hydrated: true,
    });
  },

  setLanguage: async (locale) => {
    const { requiresReload } = await applyLocale(locale);
    set({ language: locale, pendingDirectionReload: requiresReload });
  },

  setSoundEnabled: async (enabled) => {
    await appStorage.setItem(STORAGE_KEYS.soundEnabled, String(enabled));
    set({ soundEnabled: enabled });
  },

  setHapticsEnabled: async (enabled) => {
    await appStorage.setItem(STORAGE_KEYS.hapticsEnabled, String(enabled));
    set({ hapticsEnabled: enabled });
  },
}));
