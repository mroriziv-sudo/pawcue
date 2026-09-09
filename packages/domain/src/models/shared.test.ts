import { describe, expect, it } from "vitest";
import {
  ownerRefSchema,
  safetyCategorySchema,
  uuidSchema,
  utcTimestampSchema,
} from "./shared";

const VALID_UUID = "00000000-0000-4000-a000-000000000001";

describe("uuidSchema", () => {
  it("accepts a valid UUID", () => {
    expect(uuidSchema.parse(VALID_UUID)).toBe(VALID_UUID);
  });

  it("rejects a non-UUID string", () => {
    expect(() => uuidSchema.parse("not-a-uuid")).toThrow();
  });
});

describe("utcTimestampSchema", () => {
  it("accepts an offset ISO datetime", () => {
    expect(utcTimestampSchema.parse("2026-09-09T12:00:00Z")).toBe(
      "2026-09-09T12:00:00Z",
    );
  });

  it("rejects a bare date with no time component", () => {
    expect(() => utcTimestampSchema.parse("2026-09-09")).toThrow();
  });
});

describe("ownerRefSchema", () => {
  it("accepts a user owner ref", () => {
    const ref = { kind: "user" as const, userId: VALID_UUID };
    expect(ownerRefSchema.parse(ref)).toEqual(ref);
  });

  it("accepts an anonymous session owner ref", () => {
    const ref = { kind: "anonymousSession" as const, sessionId: VALID_UUID };
    expect(ownerRefSchema.parse(ref)).toEqual(ref);
  });

  it("rejects a ref with neither a userId nor sessionId", () => {
    expect(() => ownerRefSchema.parse({ kind: "user" })).toThrow();
  });
});

describe("safetyCategorySchema", () => {
  it("accepts every documented escalation level", () => {
    for (const value of [
      "NORMAL",
      "PROFESSIONAL_TRAINER_RECOMMENDED",
      "VET_RECOMMENDED",
      "URGENT_SAFETY",
    ]) {
      expect(safetyCategorySchema.parse(value)).toBe(value);
    }
  });

  it("rejects an unrecognized category — a troubleshooting row can never smuggle in an unmodeled escalation level", () => {
    expect(() => safetyCategorySchema.parse("MAYBE_FINE")).toThrow();
  });
});
