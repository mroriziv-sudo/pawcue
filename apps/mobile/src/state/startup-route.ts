import { resumeStepIndex, type OnboardingDraft } from "@pawcue/domain";

/**
 * Where the app should open.
 *
 * A pure function of already-hydrated local state, for one reason: **routing must not wait on the network.** If
 * the decision depended on a server read, a returning user with a dog would see onboarding flash before the
 * request resolved — and that flash is exactly the bug the phase asks to avoid. Everything this reads is local
 * (AsyncStorage), so the answer is available before the first paint.
 *
 * Being a pure function also makes every routing state assertable in a test without mounting a navigator.
 */

export interface StartupInputs {
  /** False until settings, dog and onboarding stores have all read from storage. */
  hydrated: boolean;
  /** The cached dog id. Its presence, not its validity, is what routes — validity is a server concern. */
  dogId: string | null;
  /** True once the user has chosen the clicker over creating a profile. */
  onboardingSkipped: boolean;
  draft: OnboardingDraft;
}

export type StartupRoute =
  /** Nothing decided yet; render the splash rather than guessing. */
  | { kind: "loading" }
  /** No dog and onboarding not yet declined — the welcome screen. */
  | { kind: "onboarding" }
  /** Onboarding was started and interrupted; resume on the step they reached. */
  | { kind: "onboarding_resume"; stepIndex: number }
  /** A dog exists, or the user declined onboarding. The app proper. */
  | { kind: "app" };

/** True when the draft holds any answer at all, which is what distinguishes "interrupted" from "never started". */
function draftHasAnswers(draft: OnboardingDraft): boolean {
  return (
    Boolean(draft.name?.trim()) ||
    Boolean(draft.birthdate?.trim()) ||
    Boolean(draft.breed?.trim()) ||
    draft.sex !== undefined ||
    draft.dailyTrainingMinutes !== undefined
  );
}

export function resolveStartupRoute(inputs: StartupInputs): StartupRoute {
  if (!inputs.hydrated) return { kind: "loading" };

  // A dog is the strongest signal there is: it means onboarding finished, whoever owns it now. After a merge the
  // same cached id is still correct, because the merge re-parents the dog rather than replacing it.
  if (inputs.dogId) return { kind: "app" };

  if (inputs.onboardingSkipped) return { kind: "app" };

  if (draftHasAnswers(inputs.draft)) {
    return {
      kind: "onboarding_resume",
      stepIndex: resumeStepIndex(inputs.draft),
    };
  }

  return { kind: "onboarding" };
}
