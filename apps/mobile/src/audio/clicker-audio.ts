import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { ClickerEngine, type ClickOutcome } from "./clicker-engine";
import {
  clickSoundById,
  DEFAULT_CLICK_SOUND_ID,
  type ClickSoundId,
} from "./click-sounds";

/**
 * Owns the one clicker engine for the app's lifetime.
 *
 * It is a module singleton rather than a hook-owned instance for two reasons:
 *
 *  - **Navigation.** Leaving the clicker screen for Settings and coming back would otherwise tear down and rebuild
 *    the voice pool, so the first press after returning would race the asset load. The pool outliving the screen
 *    is what makes "navigate away, come back, press" behave identically to a press that never left.
 *  - **Preloading.** Building the pool is the preload: creating the players decodes the bundled asset. Doing that
 *    once, at app start, means the very first press is as fast as the hundredth.
 *
 * Everything here is local and bundled — no network, so it behaves identically offline.
 */

let engine: ClickerEngine | null = null;
let loadedSoundId: ClickSoundId | null = null;
let audioModeApplied = false;

function applyAudioMode(): void {
  /**
   * Plays even when the device is on silent: a clicker that is inaudible because the phone is muted is not a
   * clicker. `playsInSilentMode` is the one audio-session setting this product genuinely needs.
   *
   * `shouldPlayInBackground: false` is load-bearing beyond behaviour — it is what keeps the app out of the iOS
   * `audio` background mode and the Android media foreground service.
   */
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  }).catch(() => {
    /* An audio-session failure must never break the screen; the button still works. */
  });
  audioModeApplied = true;
}

/**
 * Ensures the engine is built for `soundId`, rebuilding only when the selection actually changes.
 * Returns true when a usable pool exists.
 */
export function ensureClicker(
  soundId: ClickSoundId = DEFAULT_CLICK_SOUND_ID,
): boolean {
  if (!audioModeApplied) applyAudioMode();

  if (engine && loadedSoundId === soundId) return engine.voiceCountLoaded > 0;

  try {
    const sound = clickSoundById(soundId);
    const next = new ClickerEngine(() =>
      createAudioPlayer(sound.module, {
        // 100ms rather than the 500ms default: `didJustFinish` is the primary signal for returning a voice to
        // position 0, and a 45ms clip finishing shouldn't wait half a second to be observed. The timer backstop
        // in the engine covers the gap either way, so this is an optimisation, not a correctness dependency.
        updateInterval: 100,
      }),
    );
    next.load();
    engine?.dispose();
    engine = next;
    loadedSoundId = soundId;
    return true;
  } catch {
    // A failed preload must never break the screen; presses still register, they are simply silent.
    return false;
  }
}

/** Plays exactly one click. Safe to call before `ensureClicker`, in which case it reports `unavailable`. */
export function playClick(): ClickOutcome {
  if (!engine) return "unavailable";
  try {
    return engine.click();
  } catch {
    return "unavailable";
  }
}

/**
 * Re-asserts the audio session and re-arms idle voices. Call when the app returns to the foreground: iOS may
 * interrupt or deactivate the session while backgrounded, which can leave players parked mid-clip.
 */
export function refreshClicker(): void {
  applyAudioMode();
  engine?.refresh();
}

/** Diagnostics seam, development only. Returns the live engine so a trace can compare belief against reality. */
export function engineForDiagnostics(): ClickerEngine | null {
  return engine;
}

/** Test seam. Not used by the app. */
export function resetClickerForTests(): void {
  engine?.dispose();
  engine = null;
  loadedSoundId = null;
  audioModeApplied = false;
}
