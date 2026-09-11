import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEPS,
  isDraftComplete,
  resumeStepIndex,
  toDogInsert,
  validateField,
  type OnboardingDraft,
} from "./onboarding-flow";
import { dogSchema } from "../models/dog";

const OWNER = "00000000-0000-4000-a000-000000000001";
const TODAY = new Date("2026-09-11T00:00:00Z");

describe("the onboarding field set", () => {
  it("asks only for fields the dog model can actually store", () => {
    // Guards against questionnaire creep: a field with nowhere to go is a question with no purpose.
    const dogFields = new Set(Object.keys(dogSchema.shape));
    for (const step of ONBOARDING_STEPS) {
      expect(dogFields.has(step.id)).toBe(true);
    }
  });

  it("requires only the dog's name", () => {
    const required = ONBOARDING_STEPS.filter((step) => !step.optional);
    expect(required.map((step) => step.id)).toEqual(["name"]);
  });
});

describe("validation", () => {
  it("rejects an empty or whitespace-only name", () => {
    expect(validateField("name", {})).toMatchObject({
      ok: false,
      messageKey: "onboarding.validation.nameRequired",
    });
    expect(validateField("name", { name: "   " })).toMatchObject({ ok: false });
  });

  it("accepts a normal name and trims before measuring length", () => {
    expect(validateField("name", { name: "  Luna  " })).toEqual({ ok: true });
  });

  it("rejects a name longer than the column allows", () => {
    expect(validateField("name", { name: "x".repeat(61) })).toMatchObject({
      ok: false,
      messageKey: "onboarding.validation.nameTooLong",
    });
  });

  it("treats a missing birthdate as valid, because it is optional", () => {
    expect(validateField("birthdate", {})).toEqual({ ok: true });
    expect(validateField("birthdate", { birthdate: "" })).toEqual({ ok: true });
  });

  it.each([
    ["not a date", "yesterday"],
    ["the wrong order", "11-09-2026"],
    ["an impossible month", "2026-13-01"],
  ])("rejects a birthdate that is %s", (_label, value) => {
    expect(
      validateField("birthdate", { birthdate: value }, TODAY),
    ).toMatchObject({ ok: false });
  });

  it("rejects a birthdate in the future", () => {
    expect(
      validateField("birthdate", { birthdate: "2027-01-01" }, TODAY),
    ).toMatchObject({
      ok: false,
      messageKey: "onboarding.validation.dateFuture",
    });
  });

  it("rejects an implausibly old birthdate as a typo", () => {
    expect(
      validateField("birthdate", { birthdate: "1889-01-01" }, TODAY),
    ).toMatchObject({
      ok: false,
      messageKey: "onboarding.validation.dateTooOld",
    });
  });

  it("accepts a plausible birthdate", () => {
    expect(
      validateField("birthdate", { birthdate: "2024-03-15" }, TODAY),
    ).toEqual({ ok: true });
  });

  it("rejects a breed longer than the column allows", () => {
    expect(validateField("breed", { breed: "x".repeat(101) })).toMatchObject({
      ok: false,
    });
    expect(validateField("breed", { breed: "Border Collie" })).toEqual({
      ok: true,
    });
  });
});

describe("completeness", () => {
  it("is complete with only a name, since everything else is skippable", () => {
    expect(isDraftComplete({ name: "Luna" })).toBe(true);
  });

  it("is incomplete without a name", () => {
    expect(isDraftComplete({ breed: "Poodle", sex: "female" })).toBe(false);
  });

  it("is incomplete when an optional field holds an invalid value", () => {
    // Optional does not mean "anything goes" — a badly formed date must still block the dog being created.
    expect(isDraftComplete({ name: "Luna", birthdate: "nonsense" })).toBe(
      false,
    );
  });
});

describe("resuming an interrupted flow", () => {
  it("returns to the step the user had reached", () => {
    expect(resumeStepIndex({ name: "Luna", stepIndex: 3 })).toBe(3);
  });

  it("starts at the beginning for an empty draft", () => {
    expect(resumeStepIndex({})).toBe(0);
  });

  it.each([
    ["negative", -1],
    ["past the end", 99],
  ])("ignores a stored index that is %s", (_label, stepIndex) => {
    // A draft written by an older build could name a step that no longer exists.
    expect(resumeStepIndex({ name: "Luna", stepIndex })).toBe(0);
  });

  it("falls back to the first unanswered required step when no index is stored", () => {
    expect(resumeStepIndex({ breed: "Poodle" })).toBe(0);
  });
});

describe("creating the dog row", () => {
  it("maps a full draft onto the row shape", () => {
    const draft: OnboardingDraft = {
      name: "Luna",
      birthdate: "2024-03-15",
      sex: "female",
      breed: "Border Collie",
      dailyTrainingMinutes: 10,
    };

    expect(toDogInsert(draft, OWNER)).toEqual({
      owner_user_id: OWNER,
      name: "Luna",
      birthdate: "2024-03-15",
      breed: "Border Collie",
      sex: "female",
      daily_training_minutes: 10,
    });
  });

  it("stores unanswered optional fields as null, never as an empty string", () => {
    // "" would round-trip as a stored value and render as an empty field rather than as "not answered".
    expect(
      toDogInsert({ name: "Luna", breed: "  ", birthdate: "" }, OWNER),
    ).toMatchObject({
      breed: null,
      birthdate: null,
      sex: "unspecified",
      daily_training_minutes: null,
    });
  });

  it("trims the name", () => {
    expect(toDogInsert({ name: "  Luna  " }, OWNER).name).toBe("Luna");
  });

  it("refuses to build a row from a draft with no name", () => {
    expect(() => toDogInsert({ breed: "Poodle" }, OWNER)).toThrow(/no name/);
  });

  it("always names the owner explicitly, since the column has no default", () => {
    expect(toDogInsert({ name: "Luna" }, OWNER).owner_user_id).toBe(OWNER);
  });
});
