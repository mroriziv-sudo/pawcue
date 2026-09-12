import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  EntitlementUnavailableError,
  fetchEntitlement,
  readCachedEntitlement,
  toSnapshot,
  writeCachedEntitlement,
} from "../src/billing/entitlement-repository";
import { STORAGE_KEYS } from "../src/lib/storage";

/**
 * Reading the server's entitlement, and remembering it.
 *
 * Two things are being defended. The read must never conclude "premium" from anything but a row the server
 * actually returned — a failed request, a shape that does not parse, and a row for someone else all have to be
 * refused. And the cache, which lives in ordinary device storage, must not be able to grant premium to whoever
 * writes to it.
 */

/**
 * A PostgREST query builder, only as far as this repository actually chains it.
 *
 * Each link records what it was called with, so the test can assert that the read names the user it is asking
 * about rather than relying on RLS alone.
 */
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn((_column: string, _value: string) => ({
  maybeSingle: mockMaybeSingle,
}));
const mockSelect = jest.fn((_columns: string) => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect }));

jest.mock("../src/lib/supabase", () => ({
  requireSupabase: () => ({ from: (table: string) => mockFrom(table) }),
  supabase: { from: (table: string) => mockFrom(table) },
  isSupabaseConfigured: true,
}));

const USER = "00000000-0000-4000-a000-00000000fe01";
const OTHER = "00000000-0000-4000-a000-00000000fe02";
const TS = "2026-09-12T09:00:00.000Z";

const ROW = {
  id: "00000000-0000-4000-a000-00000000ee01",
  user_id: USER,
  is_premium_active: true,
  source: "active",
  expires_at: "2026-10-12T00:00:00.000Z",
  created_at: TS,
  updated_at: TS,
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("reading the server's answer", () => {
  it("returns the row the server holds", async () => {
    mockMaybeSingle.mockResolvedValue({ data: ROW, error: null });

    const entitlement = await fetchEntitlement(USER);

    expect(entitlement?.isPremiumActive).toBe(true);
    expect(entitlement?.source).toBe("active");
  });

  it("asks only for this user's row", async () => {
    mockMaybeSingle.mockResolvedValue({ data: ROW, error: null });

    await fetchEntitlement(USER);

    // Redundant beside RLS, and deliberately so: a query that names its subject cannot quietly start reading
    // someone else's if a policy is ever loosened.
    expect(mockFrom).toHaveBeenCalledWith("entitlements");
    expect(mockEq).toHaveBeenCalledWith("user_id", USER);
  });

  it("treats no row as a real answer: this user has never subscribed", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await fetchEntitlement(USER)).toBeNull();
    expect(toSnapshot(null, TS).isPremiumActive).toBe(false);
  });

  it("throws rather than inventing a free answer when the request fails", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "network" },
    });

    // An outage must not be indistinguishable from a cancellation.
    await expect(fetchEntitlement(USER)).rejects.toBeInstanceOf(
      EntitlementUnavailableError,
    );
  });

  it("refuses a row it cannot recognise", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...ROW, source: "something_new" },
      error: null,
    });

    await expect(fetchEntitlement(USER)).rejects.toBeInstanceOf(
      EntitlementUnavailableError,
    );
  });

  it("stamps the moment this device heard it, not when the row last changed", async () => {
    mockMaybeSingle.mockResolvedValue({ data: ROW, error: null });
    const entitlement = await fetchEntitlement(USER);

    // A row untouched for a month was still confirmed a moment ago; that is what the offline policy reasons about.
    expect(toSnapshot(entitlement, TS).verifiedAt).toBe(TS);
  });
});

describe("the cache", () => {
  const snapshot = {
    isPremiumActive: true,
    source: "active" as const,
    expiresAt: "2026-10-12T00:00:00.000Z",
    verifiedAt: TS,
  };

  it("returns what was written for this identity", async () => {
    await writeCachedEntitlement(USER, snapshot);
    expect(await readCachedEntitlement(USER)).toEqual(snapshot);
  });

  it("does not return one identity's answer to another", async () => {
    await writeCachedEntitlement(USER, snapshot);
    expect(await readCachedEntitlement(OTHER)).toBeNull();
  });

  it("ignores a cache entry that does not parse", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.entitlement, "not json");
    expect(await readCachedEntitlement(USER)).toBeNull();
  });

  it("ignores a cache entry claiming a status that is not a real one", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.entitlement,
      JSON.stringify({ ...snapshot, userId: USER, source: "forged" }),
    );
    expect(await readCachedEntitlement(USER)).toBeNull();
  });

  it("ignores a cache entry with no identity attached", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.entitlement,
      JSON.stringify({ ...snapshot }),
    );
    expect(await readCachedEntitlement(USER)).toBeNull();
  });

  it("is empty on a fresh install", async () => {
    expect(await readCachedEntitlement(USER)).toBeNull();
  });
});
