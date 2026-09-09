import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { hapticForEvent } from "@pawcue/ui";
import { useSettingsStore } from "../state/settings-store";

/**
 * The clicker's behaviour, kept out of the screen so latency handling lives in one place.
 *
 * Two rules from DESIGN_SYSTEM.md drive the shape of this:
 *
 *  1. **Audio is preloaded at mount.** A player created on first press would have to decode before it could
 *     sound, which is exactly the delay the spec forbids.
 *  2. **Sound fires before anything else.** `seekTo(0)` + `play()` happen first; haptics and the press counter
 *     follow. Perceived latency is the budget that matters most (50ms, see CLICK_LATENCY_BUDGET_MS).
 *
 * The clicker is also required to work with no network and no account, so nothing here touches either.
 */
export function useClicker() {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [pressCount, setPressCount] = useState(0);
  const [ready, setReady] = useState(false);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  useEffect(() => {
    let player: AudioPlayer | null = null;
    try {
      /**
       * Plays even when the device is on silent: a clicker that is inaudible because the phone is muted is not a
       * clicker. `playsInSilentMode` is the one audio-session setting this product genuinely needs.
       */
      void setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      /**
       * Metro resolves this `require` to an asset module at bundle time, so it cannot be a static `import`.
       * It is typed as `number` (Metro's asset registry id), which is what `createAudioPlayer` accepts.
       */
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const clickAsset = require("../../assets/audio/click.wav") as number;
      player = createAudioPlayer(clickAsset);
      playerRef.current = player;
      setReady(true);
    } catch {
      // A failed preload must never break the screen; the button still works, just silently.
      setReady(false);
    }

    return () => {
      player?.remove();
      playerRef.current = null;
    };
  }, []);

  const click = useCallback(() => {
    const player = playerRef.current;
    if (soundEnabled && player) {
      try {
        // Rewind first so rapid repeated presses each produce a click instead of being swallowed by
        // an already-playing instance.
        // Both are fire-and-forget: the press must not wait on audio to finish before returning.
        void player.seekTo(0);
        player.play();
      } catch {
        /* audio failure is never fatal to the interaction */
      }
    }

    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        /* unsupported hardware — haptics are always an enhancement (see hapticForEvent) */
      });
    }

    setPressCount((n) => n + 1);
  }, [soundEnabled, hapticsEnabled]);

  return {
    click,
    pressCount,
    /** True once audio is preloaded. The button is usable regardless. */
    ready,
    hapticPattern: hapticForEvent.clickerPress,
  };
}
