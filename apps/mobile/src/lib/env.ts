/**
 * Typed access to build-time environment variables.
 *
 * **Each value must be read as a literal `process.env.EXPO_PUBLIC_X` member expression.** Metro inlines these by
 * static text substitution at bundle time; a dynamic lookup like `process.env[name]` is not substituted and
 * silently evaluates to `undefined` in a production bundle. That failure is invisible to both the typechecker and
 * the linter — it only shows up at runtime as an unconfigured client — so the repetition below is deliberate.
 *
 * Only `EXPO_PUBLIC_`-prefixed values may be read here: anything else is absent from the client bundle by design,
 * and a server secret must never acquire that prefix (SECURITY.md).
 */

/** Expo types `process.env` entries as `any`; this is the single place that narrowing happens. */
function asOptionalString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export const env = {
  supabaseUrl: asOptionalString(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: asOptionalString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  apiBaseUrl: asOptionalString(process.env.EXPO_PUBLIC_API_BASE_URL) ?? "",
} as const;
