/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * The clicker sound candidates.
 *
 * All three are synthesised by `tools/audio/generate-click-sounds.mjs` — original material, no sampled or
 * third-party source. See `docs/architecture/clicker-sound-design.md` for the measured specs.
 *
 * Three candidates ship in the development build behind a developer-only selector so they can be compared on real
 * hardware. **No final choice has been made** — that decision belongs to the product owner, and until it is made
 * `DEFAULT_CLICK_SOUND_ID` is a placeholder rather than a preference.
 */

export type ClickSoundId = "classic" | "soft" | "crisp";

export interface ClickSound {
  id: ClickSoundId;
  /** Developer-only QA label. Deliberately not translated: this selector must never reach users. */
  label: string;
  description: string;
  /** Metro resolves `require` to an asset registry id at bundle time, which is what `createAudioPlayer` takes. */
  module: number;
}

/** Typed as a non-empty tuple so the fallback in `clickSoundById` is provably safe. */
export const CLICK_SOUNDS: readonly [ClickSound, ...ClickSound[]] = [
  {
    id: "classic",
    label: "A — Classic",
    description: "Closest to a physical clicker. Neutral, dry, realistic.",
    module: require("../../assets/audio/click-classic.wav") as number,
  },
  {
    id: "soft",
    label: "B — Soft Premium",
    description: "Warmer, less fatiguing over a long session.",
    module: require("../../assets/audio/click-soft.wav") as number,
  },
  {
    id: "crisp",
    label: "C — Crisp",
    description: "Sharper, cuts through a noisy park.",
    module: require("../../assets/audio/click-crisp.wav") as number,
  },
];

/**
 * The product owner's current preference from the on-device listening test: C — Crisp.
 *
 * Still provisional. The A/B/C selector stays in place until clicker reliability is confirmed by hand on the
 * device, because a comparison made while presses were being dropped is not a fair one.
 */
export const DEFAULT_CLICK_SOUND_ID: ClickSoundId = "crisp";

export function isClickSoundId(value: string): value is ClickSoundId {
  return CLICK_SOUNDS.some((sound) => sound.id === value);
}

export function clickSoundById(id: ClickSoundId): ClickSound {
  const found = CLICK_SOUNDS.find((sound) => sound.id === id);
  // Falling back rather than throwing: a stale persisted id must never stop the clicker from working.
  return found ?? CLICK_SOUNDS[0];
}
