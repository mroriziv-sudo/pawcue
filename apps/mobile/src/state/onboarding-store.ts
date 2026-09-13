import { create } from "zustand";
import {
  onboardingDraftSchema,
  resumeStepIndex,
  type OnboardingDraft,
  type OnboardingFieldId,
} from "@pawcue/domain";
import { appStorage, STORAGE_KEYS } from "../lib/storage";

/**
 * The partially answered onboarding form.
 *
 * Persisted on every change rather than on completion. Onboarding is exactly the moment a new user is most likely
 * to be interrupted — a phone call, a dog that needs attention — and losing four answered questions to a
 * backgrounded app is the kind of thing that ends a first session for good.
 *
 * Back navigation keeps answers for the same reason: the draft is the single source of what has been answered, so
 * moving between steps is only ever a change of index.
 */

interface OnboardingState {
  draft: OnboardingDraft;
  stepIndex: number;
  hydrated: boolean;
  /**
   * True once the user has chosen to use the clicker without a profile.
   *
   * The product's first non-negotiable is that the app works immediately with no account, so onboarding has to be
   * escapable — and the escape has to stick, or every relaunch would drop them back into a flow they declined.
   */
  skipped: boolean;

  hydrate: () => Promise<void>;
  skip: () => Promise<void>;
  setField: (id: OnboardingFieldId, value: string | number | undefined) => void;
  goToStep: (index: number) => void;
  reset: () => Promise<void>;
  /** Forgets the draft *and* the "skipped" choice. For a new identity on this device, nothing is pre-answered. */
  forget: () => Promise<void>;
}

async function persist(draft: OnboardingDraft): Promise<void> {
  try {
    await appStorage.setItem(
      STORAGE_KEYS.onboardingDraft,
      JSON.stringify(draft),
    );
  } catch {
    /* Losing the write costs resume, never the answers already on screen. */
  }
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  draft: {},
  stepIndex: 0,
  hydrated: false,
  skipped: false,

  skip: async () => {
    set({ skipped: true });
    await appStorage.setItem(STORAGE_KEYS.onboardingSkipped, "true");
  },

  hydrate: async () => {
    try {
      const skipped =
        (await appStorage.getItem(STORAGE_KEYS.onboardingSkipped)) === "true";
      set({ skipped });
      const raw = await appStorage.getItem(STORAGE_KEYS.onboardingDraft);
      const parsed = raw
        ? onboardingDraftSchema.safeParse(JSON.parse(raw))
        : null;
      // A draft written by an older build is discarded rather than half-read: restarting five questions is a
      // smaller harm than resuming into answers that no longer mean what they say.
      const draft = parsed?.success ? parsed.data : {};
      set({ draft, stepIndex: resumeStepIndex(draft), hydrated: true });
    } catch {
      set({ draft: {}, stepIndex: 0, hydrated: true });
    }
  },

  setField: (id, value) => {
    const next: OnboardingDraft = { ...get().draft, [id]: value };
    set({ draft: next });
    void persist(next);
  },

  goToStep: (index) => {
    // The index lives in the draft too, so a relaunch resumes on the step the user was looking at.
    const next: OnboardingDraft = { ...get().draft, stepIndex: index };
    set({ draft: next, stepIndex: index });
    void persist(next);
  },

  reset: async () => {
    set({ draft: {}, stepIndex: 0 });
    await appStorage.removeItem(STORAGE_KEYS.onboardingDraft);
  },

  forget: async () => {
    set({ draft: {}, stepIndex: 0, skipped: false });
    await Promise.all([
      appStorage.removeItem(STORAGE_KEYS.onboardingDraft),
      appStorage.removeItem(STORAGE_KEYS.onboardingSkipped),
    ]);
  },
}));
