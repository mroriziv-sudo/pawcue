import {
  entitlementSchema,
  type Entitlement,
  type EntitlementSnapshot,
} from "@pawcue/domain";
import { z } from "zod";
import { requireSupabase } from "../lib/supabase";
import { appStorage, STORAGE_KEYS } from "../lib/storage";

/**
 * Reading the server's entitlement, and remembering the last answer.
 *
 * `entitlements` is server-authoritative: the Phase 0 migration grants the client a `select` policy on its own row
 * and nothing else — no insert, no update, no delete. There is therefore no write path in this file, and that is
 * not an omission. A client that could write its own entitlement is the `isPremium: true` body field BILLING.md
 * forbids, in table form.
 */

const cacheSchema = z.object({
  userId: z.string().min(1),
  isPremiumActive: z.boolean(),
  source: entitlementSchema.shape.source,
  expiresAt: z.string().nullable(),
  verifiedAt: z.string(),
});

interface EntitlementRow {
  id: string;
  user_id: string;
  is_premium_active: boolean;
  source: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export class EntitlementUnavailableError extends Error {
  constructor(cause: string) {
    super(`Could not verify entitlement: ${cause}`);
    this.name = "EntitlementUnavailableError";
  }
}

/**
 * Asks the server what this user is entitled to.
 *
 * **No row means free**, and that is a real answer rather than a missing one: nothing creates an `entitlements`
 * row until a purchase is verified, so its absence is the server stating that this user has never had a
 * subscription. `null` is returned for that case, and `toSnapshot` turns it into a settled free answer.
 *
 * A failed request throws. The caller decides whether to fall back to the cache; inventing a free answer here
 * would make an outage indistinguishable from a cancellation.
 */
export async function fetchEntitlement(
  userId: string,
): Promise<Entitlement | null> {
  const client = requireSupabase();

  const result = await client
    .from("entitlements")
    .select(
      "id, user_id, is_premium_active, source, expires_at, created_at, updated_at",
    )
    // Redundant beside RLS, which already restricts this to the caller's own row — but a query that names the
    // user it is asking about cannot silently start reading someone else's if a policy is ever loosened.
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    throw new EntitlementUnavailableError(result.error.message);
  }
  if (!result.data) return null;

  /**
   * Narrowed through `unknown`, the same way `plan-repository` reads its rows.
   *
   * Asserting straight from the client's loosely-typed result is not a narrowing the type-checker recognises, so
   * it buys no safety and only silences the reader. The shape is validated a line later anyway — this cast is
   * about reading the columns, not about trusting them.
   */
  const data: unknown = result.data;
  const row = data as EntitlementRow;

  const parsed = entitlementSchema.safeParse({
    id: row.id,
    userId: row.user_id,
    isPremiumActive: row.is_premium_active,
    source: row.source,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  if (!parsed.success) {
    // A shape we do not recognise is not something to guess at when the guess would be about paid access.
    throw new EntitlementUnavailableError("unexpected entitlement row shape");
  }
  return parsed.data;
}

/**
 * Turns the server's answer into the snapshot the policy reasons about.
 *
 * `verifiedAt` is stamped by the client at read time, not taken from `updated_at`: the question the offline policy
 * asks is "when did *this device* last hear the truth", and a row that has not changed in a month was still
 * confirmed a moment ago.
 */
export function toSnapshot(
  entitlement: Entitlement | null,
  now: string = new Date().toISOString(),
): EntitlementSnapshot {
  if (!entitlement) {
    return {
      isPremiumActive: false,
      source: null,
      expiresAt: null,
      verifiedAt: now,
    };
  }
  return {
    isPremiumActive: entitlement.isPremiumActive,
    source: entitlement.source,
    expiresAt: entitlement.expiresAt,
    verifiedAt: now,
  };
}

/**
 * The last verified answer, scoped to the identity it was verified for.
 *
 * The user id is stored *inside* the cache and checked on read. Without that, signing out and into a different
 * account on the same device would inherit the previous account's premium — the cache is keyed by device, and the
 * entitlement is not.
 */
export async function readCachedEntitlement(
  userId: string,
): Promise<EntitlementSnapshot | null> {
  try {
    const raw = await appStorage.getItem(STORAGE_KEYS.entitlement);
    if (!raw) return null;

    const parsed = cacheSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (parsed.data.userId !== userId) return null;

    return {
      isPremiumActive: parsed.data.isPremiumActive,
      source: parsed.data.source,
      expiresAt: parsed.data.expiresAt,
      verifiedAt: parsed.data.verifiedAt,
    };
  } catch {
    return null;
  }
}

export async function writeCachedEntitlement(
  userId: string,
  snapshot: EntitlementSnapshot,
): Promise<void> {
  try {
    await appStorage.setItem(
      STORAGE_KEYS.entitlement,
      JSON.stringify({ userId, ...snapshot }),
    );
  } catch {
    /* A cache write failure must never fail a read that just succeeded. */
  }
}

/** Drops the cached answer. Used on sign-out, so the next identity starts from nothing. */
export async function clearCachedEntitlement(): Promise<void> {
  try {
    await appStorage.removeItem(STORAGE_KEYS.entitlement);
  } catch {
    /* Nothing to do: the user-id check on read is what actually protects against a stale answer. */
  }
}
