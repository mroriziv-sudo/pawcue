import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { secureStorage, STORAGE_KEYS } from "./storage";
import { env } from "./env";

/**
 * Supabase client foundation.
 *
 * Config comes from `EXPO_PUBLIC_*` env vars, which are inlined into the bundle at build time — correct for the URL
 * and the anon key, which are publishable by design and protected by RLS. The service-role key is never referenced
 * here and must never be given an `EXPO_PUBLIC_` name (SECURITY.md).
 */

const { supabaseUrl, supabaseAnonKey } = env;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Session tokens live in the secure tier. `@supabase/supabase-js` expects a synchronous-looking storage adapter
 * with async methods, which `KeyValueStore` already matches.
 */
const sessionStorageAdapter = {
  getItem: (key: string) => secureStorage.getItem(key),
  setItem: (key: string, value: string) => secureStorage.setItem(key, value),
  removeItem: (key: string) => secureStorage.removeItem(key),
};

/**
 * Returns `null` rather than throwing when unconfigured. A missing key must not stop the app from booting: the
 * clicker and the first lesson are required to work with no network and no account at all (brief §1), so the
 * Supabase client is an enhancement to boot, never a precondition of it.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: sessionStorageAdapter,
          storageKey: STORAGE_KEYS.authSession,
          autoRefreshToken: true,
          persistSession: true,
          /** No URL-based session detection: this is a native app, not a web redirect flow. */
          detectSessionInUrl: false,
        },
      })
    : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  return supabase;
}
