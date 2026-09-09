import { describe, expect, it } from "vitest";
import { lessonTroubleshootingSchema } from "./lesson";

const VALID_UUID = "00000000-0000-4000-a000-000000000001";

describe("lessonTroubleshootingSchema", () => {
  const base = {
    id: VALID_UUID,
    lessonId: VALID_UUID,
    slug: "dog_walks_away",
    promptKey: "troubleshoot.dogWalksAway.prompt",
    guidanceKey: "troubleshoot.dogWalksAway.guidance",
    safetyCategory: "NORMAL" as const,
    sortOrder: 1,
    createdAt: "2026-09-09T00:00:00Z",
    updatedAt: "2026-09-09T00:00:00Z",
  };

  it("accepts one of the brief's common slugs", () => {
    expect(lessonTroubleshootingSchema.parse(base).slug).toBe("dog_walks_away");
  });

  it("also accepts a lesson-specific escalation slug beyond the common set (e.g. biting_causes_injury)", () => {
    const escalation = {
      ...base,
      slug: "biting_causes_injury",
      safetyCategory: "PROFESSIONAL_TRAINER_RECOMMENDED" as const,
    };
    expect(lessonTroubleshootingSchema.parse(escalation).safetyCategory).toBe(
      "PROFESSIONAL_TRAINER_RECOMMENDED",
    );
  });

  it("rejects a row missing a safety category — every troubleshooting option must declare one", () => {
    const { safetyCategory: _omit, ...withoutSafetyCategory } = base;
    expect(() =>
      lessonTroubleshootingSchema.parse(withoutSafetyCategory),
    ).toThrow();
  });
});
