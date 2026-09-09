import type { AppEventName, AppEvent } from "../models/analytics";

/**
 * Concrete implementation: first-party sink → Supabase `app_events` via an Edge Function (brief §29 — no
 * advertising analytics SDK in v1). `properties` is constrained to the same primitive-only shape as `AppEvent`.
 */
export interface AnalyticsProvider {
  track(name: AppEventName, properties?: AppEvent["properties"]): void;
}
