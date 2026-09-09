/**
 * Sound identity (DESIGN_SYSTEM.md §Sound, brief §19).
 *
 * Tokens only — asset keys and duration budgets. The audio engine (expo-audio, preloading, latency work) is Phase 2,
 * where the clicker lives. Keeping the budgets here means the Phase 2 implementation has a spec to test against
 * rather than a subjective "feels fast".
 */

export const soundAsset = {
  /** Mechanical, dry, no reverb. The signature sound. */
  click: "click",
  /** Subtle two-note confirmation. */
  success: "success",
  /** Optional soft cue at session start. */
  sessionStart: "sessionStart",
} as const;

export type SoundAssetKey = keyof typeof soundAsset;

/**
 * Duration budgets in milliseconds, straight from the brief. These are assertable properties of the audio files —
 * a clip outside its window is a bug, not a taste question.
 */
export const soundDurationBudgetMs = {
  click: { min: 30, max: 70 },
  success: { min: 250, max: 400 },
  sessionStart: { min: 150, max: 500 },
} as const satisfies Record<SoundAssetKey, { min: number; max: number }>;

/**
 * Perceived press-to-sound latency budget for the clicker. DESIGN_SYSTEM.md puts latency above decorative
 * animation: audio must be preloaded and playback triggered before any animation work begins.
 */
export const CLICK_LATENCY_BUDGET_MS = 50;

/**
 * There is deliberately no error sound. The brief specifies haptic + visual feedback for errors instead, because an
 * error tone during a training session would fire next to a dog's ears.
 */
export const ERROR_SOUND: null = null;
