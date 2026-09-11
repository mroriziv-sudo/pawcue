import { z } from "zod";
import { dogSexSchema } from "../models/dog";

/**
 * Onboarding, defined as data.
 *
 * The flow is a list of field definitions rather than a sequence of screens, for the same reason lessons are:
 * a screen per question is a screen per question to maintain, translate, make accessible and mirror for RTL.
 * One renderer driven by this list gets all of that once.
 *
 * **Every field here already exists on `dogSchema`.** Nothing is collected that the product cannot act on — no
 * questionnaire padding to make onboarding feel substantial. `name` is the only required answer, because it is
 * the only one the app genuinely cannot work without; brief §4 makes breed and sex explicitly skippable, and
 * `dailyTrainingMinutes` is asked because the plan engine consumes it.
 */

export type OnboardingFieldId =
  "name" | "birthdate" | "sex" | "breed" | "dailyTrainingMinutes";

export interface OnboardingChoice {
  value: string;
  labelKey: string;
}

export interface OnboardingStepDef {
  id: OnboardingFieldId;
  kind: "text" | "date" | "choice";
  titleKey: string;
  hintKey?: string;
  placeholderKey?: string;
  /** A skippable step still appears; it simply does not block progress. */
  optional: boolean;
  choices?: readonly OnboardingChoice[];
}

export const ONBOARDING_STEPS: readonly OnboardingStepDef[] = [
  {
    id: "name",
    kind: "text",
    titleKey: "onboarding.step.name.title",
    hintKey: "onboarding.step.name.hint",
    placeholderKey: "onboarding.step.name.placeholder",
    optional: false,
  },
  {
    id: "birthdate",
    kind: "date",
    titleKey: "onboarding.step.birthdate.title",
    hintKey: "onboarding.step.birthdate.hint",
    placeholderKey: "onboarding.step.birthdate.placeholder",
    optional: true,
  },
  {
    id: "sex",
    kind: "choice",
    titleKey: "onboarding.step.sex.title",
    optional: true,
    choices: [
      { value: "female", labelKey: "onboarding.sex.female" },
      { value: "male", labelKey: "onboarding.sex.male" },
      { value: "unspecified", labelKey: "onboarding.sex.unspecified" },
    ],
  },
  {
    id: "breed",
    kind: "text",
    titleKey: "onboarding.step.breed.title",
    hintKey: "onboarding.step.breed.hint",
    placeholderKey: "onboarding.step.breed.placeholder",
    optional: true,
  },
  {
    id: "dailyTrainingMinutes",
    kind: "choice",
    titleKey: "onboarding.step.minutes.title",
    hintKey: "onboarding.step.minutes.hint",
    optional: true,
    choices: [
      { value: "5", labelKey: "onboarding.minutes.5" },
      { value: "10", labelKey: "onboarding.minutes.10" },
      { value: "15", labelKey: "onboarding.minutes.15" },
      { value: "20", labelKey: "onboarding.minutes.20" },
    ],
  },
];

/**
 * The in-progress answers.
 *
 * Every field is optional here even though `name` is required to finish: a draft is a partially answered form,
 * and modelling it as "already valid" would mean it could not represent the state it exists to represent.
 */
export const onboardingDraftSchema = z.object({
  name: z.string().optional(),
  birthdate: z.string().optional(),
  sex: dogSexSchema.optional(),
  breed: z.string().optional(),
  dailyTrainingMinutes: z.number().optional(),
  /** Index the user had reached, so an interrupted flow resumes where it stopped rather than at the start. */
  stepIndex: z.number().int().min(0).optional(),
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

export type FieldValidation = { ok: true } | { ok: false; messageKey: string };

const NAME_MAX = 60;
const BREED_MAX = 100;

/** Dates far enough out to be a typo rather than a dog. */
const EARLIEST_PLAUSIBLE_BIRTHDATE = "1990-01-01";

/**
 * Validates one field's current value.
 *
 * Returns a translation key rather than a message: validation text is user-facing copy and must be localised like
 * everything else.
 */
export function validateField(
  id: OnboardingFieldId,
  draft: OnboardingDraft,
  today: Date = new Date(),
): FieldValidation {
  switch (id) {
    case "name": {
      const name = draft.name?.trim() ?? "";
      if (name.length === 0) {
        return { ok: false, messageKey: "onboarding.validation.nameRequired" };
      }
      if (name.length > NAME_MAX) {
        return { ok: false, messageKey: "onboarding.validation.nameTooLong" };
      }
      return { ok: true };
    }

    case "birthdate": {
      const value = draft.birthdate?.trim();
      if (!value) return { ok: true };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { ok: false, messageKey: "onboarding.validation.dateFormat" };
      }
      const parsed = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, messageKey: "onboarding.validation.dateFormat" };
      }
      // A birthdate in the future is always a mistake, and one before 1990 is a typo rather than a dog.
      if (parsed.getTime() > today.getTime()) {
        return { ok: false, messageKey: "onboarding.validation.dateFuture" };
      }
      if (value < EARLIEST_PLAUSIBLE_BIRTHDATE) {
        return { ok: false, messageKey: "onboarding.validation.dateTooOld" };
      }
      return { ok: true };
    }

    case "breed": {
      const breed = draft.breed?.trim() ?? "";
      if (breed.length > BREED_MAX) {
        return { ok: false, messageKey: "onboarding.validation.breedTooLong" };
      }
      return { ok: true };
    }

    case "sex":
    case "dailyTrainingMinutes":
      // Choice fields cannot hold an invalid value: the UI only offers values from `choices`.
      return { ok: true };
  }
}

/**
 * True when the draft holds everything needed to create a dog.
 *
 * Every field is validated, optional ones included. "Optional" means the answer may be *empty*, not that it may
 * be *invalid* — `validateField` already passes an empty optional value, so skipping optional fields here would
 * let a malformed birthdate through to the database and fail at the least helpful possible moment.
 */
export function isDraftComplete(draft: OnboardingDraft): boolean {
  return ONBOARDING_STEPS.every((step) => validateField(step.id, draft).ok);
}

/**
 * Where an interrupted flow should resume.
 *
 * Prefers the step the user had actually reached. Falls back to the first unanswered required field, so a draft
 * written by an older build — or one whose stored index no longer exists — still lands somewhere sensible
 * instead of on a step the user has already completed.
 */
export function resumeStepIndex(draft: OnboardingDraft): number {
  const stored = draft.stepIndex;
  if (
    typeof stored === "number" &&
    stored >= 0 &&
    stored < ONBOARDING_STEPS.length
  ) {
    return stored;
  }
  const firstInvalid = ONBOARDING_STEPS.findIndex(
    (step) => !validateField(step.id, draft).ok,
  );
  return firstInvalid < 0 ? 0 : firstInvalid;
}

export interface DogInsert {
  owner_user_id: string;
  name: string;
  birthdate: string | null;
  breed: string | null;
  sex: z.infer<typeof dogSexSchema>;
  daily_training_minutes: number | null;
}

/**
 * Projects a completed draft onto the `dogs` row shape.
 *
 * `owner_user_id` is passed explicitly because the column has no default. That is safe: the table's RLS
 * `WITH CHECK` is `auth.uid() = owner_user_id`, so a caller can only ever name itself, and an attempt to insert
 * on someone else's behalf is rejected by the database rather than by client-side trust.
 *
 * Empty optional answers become `null`, never `""` — a blank string would be a stored value that renders as an
 * empty field rather than as "not answered".
 */
export function toDogInsert(
  draft: OnboardingDraft,
  ownerUserId: string,
): DogInsert {
  const name = draft.name?.trim() ?? "";
  if (name.length === 0) {
    throw new Error("toDogInsert: draft has no name; validate before calling.");
  }
  const breed = draft.breed?.trim();
  const birthdate = draft.birthdate?.trim();

  return {
    owner_user_id: ownerUserId,
    name,
    birthdate: birthdate ? birthdate : null,
    breed: breed ? breed : null,
    sex: draft.sex ?? "unspecified",
    daily_training_minutes: draft.dailyTrainingMinutes ?? null,
  };
}
