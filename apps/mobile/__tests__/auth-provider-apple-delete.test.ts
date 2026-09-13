/**
 * The auth provider's two new conversations: Sign in with Apple and account deletion.
 *
 * Both are tested at the boundary where the app's rules live — what is sent, what is believed — with the native
 * module and the network faked. What cannot be tested here, and is not claimed: Apple's real sheet, Supabase's
 * real verification of Apple's signature, and a real deletion. Those are PENDING EXTERNAL VALIDATION.
 */

const mockSignInAsync = jest.fn();
const mockIsAvailable = jest.fn();
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: () => mockIsAvailable(),
  signInAsync: (options: unknown) => mockSignInAsync(options),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: () => null,
}));

jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: jest.fn((n: number) =>
    Promise.resolve(Uint8Array.from({ length: n }, (_, i) => (i * 7) % 256)),
  ),
  digestStringAsync: jest.fn((_alg: string, data: string) =>
    Promise.resolve(`sha256(${data})`),
  ),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

const mockSignInWithIdToken = jest.fn();
const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockSignOut = jest.fn();
const mockSignInAnonymously = jest.fn();
const mockSetSession = jest.fn();
jest.mock("../src/lib/supabase", () => {
  const client = {
    auth: {
      signInWithIdToken: (args: unknown) => mockSignInWithIdToken(args),
      getSession: () => mockGetSession(),
      getUser: (token: string) => mockGetUser(token),
      signOut: (opts: unknown) => mockSignOut(opts),
      signInAnonymously: () => mockSignInAnonymously(),
      setSession: (args: unknown) => mockSetSession(args),
    },
  };
  return {
    supabase: client,
    requireSupabase: () => client,
    isSupabaseConfigured: true,
  };
});

jest.mock("../src/lib/env", () => ({
  env: {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    apiBaseUrl: "",
  },
}));

import {
  AppleSignInCancelledError,
  AppleSignInUnavailableError,
  requestAppleIdentity,
} from "../src/providers/apple-sign-in";
import {
  AccountDeletionError,
  ProviderNotConfiguredError,
  SignInFailedError,
  SupabaseAuthProvider,
} from "../src/providers/SupabaseAuthProvider";

const SESSION = {
  access_token: "caller-jwt",
  refresh_token: "r",
  expires_at: 4102444800,
  user: { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", is_anonymous: false },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAvailable.mockResolvedValue(true);
  mockGetSession.mockResolvedValue({ data: { session: SESSION } });
});

describe("requestAppleIdentity", () => {
  it("binds the request to a nonce: Apple gets the hash, the caller gets the raw value", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "apple-jwt" });

    const identity = await requestAppleIdentity();

    const options = mockSignInAsync.mock.calls[0]?.[0] as {
      nonce: string;
      requestedScopes: number[];
    };
    expect(identity.rawNonce).toMatch(/^[0-9a-f]{64}$/);
    expect(options.nonce).toBe(`sha256(${identity.rawNonce})`);
    expect(identity.identityToken).toBe("apple-jwt");
  });

  it("asks for the email scope only — nothing displays a name", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "apple-jwt" });
    await requestAppleIdentity();
    const options = mockSignInAsync.mock.calls[0]?.[0] as {
      requestedScopes: number[];
    };
    expect(options.requestedScopes).toEqual([1]);
  });

  it("uses a fresh nonce for every request", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "apple-jwt" });
    const crypto = jest.requireMock("expo-crypto") as {
      getRandomBytesAsync: jest.Mock;
    };
    crypto.getRandomBytesAsync
      .mockResolvedValueOnce(new Uint8Array(32).fill(1))
      .mockResolvedValueOnce(new Uint8Array(32).fill(2));
    const first = await requestAppleIdentity();
    const second = await requestAppleIdentity();
    expect(first.rawNonce).not.toBe(second.rawNonce);
  });

  it("reports cancellation as its own error, not a failure", async () => {
    mockSignInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    await expect(requestAppleIdentity()).rejects.toBeInstanceOf(
      AppleSignInCancelledError,
    );
  });

  it("refuses where the OS says Sign in with Apple is unavailable", async () => {
    mockIsAvailable.mockResolvedValue(false);
    await expect(requestAppleIdentity()).rejects.toBeInstanceOf(
      AppleSignInUnavailableError,
    );
    expect(mockSignInAsync).not.toHaveBeenCalled();
  });

  it("does not accept a credential without an identity token", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: null });
    await expect(requestAppleIdentity()).rejects.toThrow(/no identity token/);
  });
});

describe("SupabaseAuthProvider.signInWithApple", () => {
  const provider = new SupabaseAuthProvider();

  it("exchanges the token with Supabase using the raw nonce", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "apple-jwt" });
    mockSignInWithIdToken.mockResolvedValue({
      data: { session: SESSION },
      error: null,
    });

    const session = await provider.signInWithApple();

    const args = mockSignInWithIdToken.mock.calls[0]?.[0] as {
      provider: string;
      token: string;
      nonce: string;
    };
    expect(args.provider).toBe("apple");
    expect(args.token).toBe("apple-jwt");
    expect(args.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(args.nonce).not.toMatch(/^sha256/);
    expect(session.identityKind).toBe("apple");
    expect(session.userId).toBe(SESSION.user.id);
  });

  it("surfaces a disabled provider as not configured, not as a mysterious failure", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "apple-jwt" });
    mockSignInWithIdToken.mockResolvedValue({
      data: { session: null },
      error: { message: "Unsupported provider: provider is not enabled" },
    });
    await expect(provider.signInWithApple()).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });

  it("reports any other verification failure as a sign-in failure", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "apple-jwt" });
    mockSignInWithIdToken.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid nonce" },
    });
    await expect(provider.signInWithApple()).rejects.toBeInstanceOf(
      SignInFailedError,
    );
  });

  it("lets cancellation through untouched so the screen can stay silent", async () => {
    mockSignInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    await expect(provider.signInWithApple()).rejects.toBeInstanceOf(
      AppleSignInCancelledError,
    );
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("maps an unavailable device to not configured", async () => {
    mockIsAvailable.mockResolvedValue(false);
    await expect(provider.signInWithApple()).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });
});

describe("SupabaseAuthProvider.deleteAccount", () => {
  const provider = new SupabaseAuthProvider();
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  function respond(status: number, body: unknown = {}) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  it("sends the caller's token and a confirmation — and no identity", async () => {
    fetchMock.mockReturnValue(respond(200, { deleted: true }));

    await provider.deleteAccount();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/functions/v1/account-delete");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer caller-jwt",
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ confirm: "delete" });
    for (const key of ["userId", "user_id", "id", "email"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("rejects without a session rather than sending an unauthenticated request", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(provider.deleteAccount()).rejects.toMatchObject({
      name: "AccountDeletionError",
      reason: "no_session",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a 401 for an identity Supabase no longer knows as the deletion having happened", async () => {
    // The retry after a dropped response: the account is gone, so the token's subject is gone.
    fetchMock.mockReturnValue(respond(401, { error: "INVALID_CALLER_TOKEN" }));
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: {
        status: 403,
        message: "User from sub claim in JWT does not exist",
      },
    });
    await expect(provider.deleteAccount()).resolves.toBeUndefined();
    expect(mockGetUser).toHaveBeenCalledWith("caller-jwt");
  });

  it("keeps a 401 for a user who still exists as a failure", async () => {
    fetchMock.mockReturnValue(respond(401, { error: "INVALID_CALLER_TOKEN" }));
    mockGetUser.mockResolvedValue({
      data: { user: SESSION.user },
      error: null,
    });
    await expect(provider.deleteAccount()).rejects.toBeInstanceOf(
      AccountDeletionError,
    );
  });

  it("names a billing-partner outage so the screen can say nothing was deleted", async () => {
    fetchMock.mockReturnValue(respond(502, { error: "PROVIDER_UNAVAILABLE" }));
    await expect(provider.deleteAccount()).rejects.toMatchObject({
      reason: "provider_unavailable",
      status: 502,
    });
  });

  it("reports a server failure as a failure", async () => {
    fetchMock.mockReturnValue(respond(500, { error: "DELETION_FAILED" }));
    await expect(provider.deleteAccount()).rejects.toMatchObject({
      reason: "failed",
      status: 500,
    });
  });

  it("signs out of this device only", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await provider.signOut();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("SupabaseAuthProvider.ensureAnonymousSession", () => {
  const provider = new SupabaseAuthProvider();

  it("resumes a stored session rather than creating a guest", async () => {
    await expect(provider.ensureAnonymousSession()).resolves.toMatchObject({
      userId: SESSION.user.id,
      identityKind: "apple",
    });
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
  });

  it("creates a guest only when there is genuinely no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInAnonymously.mockResolvedValue({
      data: {
        session: { ...SESSION, user: { id: "guest", is_anonymous: true } },
      },
      error: null,
    });
    await expect(provider.ensureAnonymousSession()).resolves.toMatchObject({
      identityKind: "anonymous",
    });
  });

  it("does not replace an identity whose session failed to restore with a new guest", async () => {
    // Revoked refresh token, or offline during refresh: the device's data belongs to the identity that just
    // became unreachable. A silent new guest would start onboarding over the top of it.
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid Refresh Token: Refresh Token Not Found" },
    });
    await expect(provider.ensureAnonymousSession()).rejects.toThrow(
      /could not be restored/,
    );
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
  });
});

describe("SupabaseAuthProvider.resumeSession", () => {
  const provider = new SupabaseAuthProvider();

  it("puts the given tokens back as the current session", async () => {
    mockSetSession.mockResolvedValue({
      data: {
        session: { ...SESSION, user: { id: "guest-1", is_anonymous: true } },
      },
      error: null,
    });
    const resumed = await provider.resumeSession({
      userId: "guest-1",
      identityKind: "anonymous",
      accessToken: "guest-access",
      refreshToken: "guest-refresh",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "guest-access",
      refresh_token: "guest-refresh",
    });
    expect(resumed.identityKind).toBe("anonymous");
  });

  it("fails loudly when the tokens are no longer usable", async () => {
    mockSetSession.mockResolvedValue({
      data: { session: null },
      error: { message: "refresh_token_not_found" },
    });
    await expect(
      provider.resumeSession({
        userId: "guest-1",
        identityKind: "anonymous",
        accessToken: "x",
        refreshToken: "y",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow(/Could not resume/);
  });
});
