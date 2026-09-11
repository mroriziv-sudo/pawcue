/**
 * RFC 4122 version 4 identifiers.
 *
 * These are not cosmetic: a session event's id is the idempotency key that makes offline replay safe
 * (ARCHITECTURE.md §8), so a duplicate would double-count a repetition after a reconnect.
 *
 * `crypto.randomUUID` is not guaranteed across every JS engine this app runs on — Hermes, the Jest environment and
 * a browser preview build do not agree — so the source of randomness is resolved at call time rather than assumed.
 * No dependency is added for this: the two web-crypto entry points cover every runtime we ship on, and the last
 * branch exists only so a missing crypto implementation degrades to a working app rather than a crash.
 */
export function uuidV4(): string {
  const cryptoRef = globalThis.crypto as
    (Crypto & { randomUUID?: () => string }) | undefined;

  if (typeof cryptoRef?.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoRef?.getRandomValues === "function") {
    cryptoRef.getRandomValues(bytes);
  } else {
    // Last resort. Documented rather than silent: `Math.random` is not cryptographically strong, but these ids
    // only need to be unique, and the alternative on a runtime without crypto is no session at all.
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Version 4 and the RFC 4122 variant bits, which strict UUID validation (including Zod's) checks for.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
