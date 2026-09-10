import { useCallback, useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Haptics from "expo-haptics";
import { hapticForEvent } from "@pawcue/ui";
import { useSettingsStore } from "../state/settings-store";
import {
  ensureClicker,
  playClick,
  refreshClicker,
} from "../audio/clicker-audio";

/**
 * The clicker's behaviour, kept out of the screen so playback handling lives in one place.
 *
 * Two rules from DESIGN_SYSTEM.md drive the shape of this:
 *
 *  1. **Audio is preloaded before interaction.** The voice pool is built on mount and outlives the screen, so no
 *     press ever waits on a decode. See `audio/clicker-audio.ts`.
 *  2. **Sound fires before anything else.** Playback is issued first; haptics and the press counter follow.
 *     Perceived latency is the budget that matters most (50ms, see CLICK_LATENCY_BUDGET_MS).
 *
 * Playback itself lives in `audio/clicker-engine.ts`, which documents the every-other-press-is-silent defect this
 * replaced. There is no debounce here: one press is always one playback request.
 *
 * The clicker is also required to work with no network and no account, so nothing here touches either.
 */
export function useClicker() {
  const [pressCount, setPressCount] = useState(0);
  const [ready, setReady] = useState(false);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const clickSoundId = useSettingsStore((s) => s.clickSoundId);

  // Rebuilds only when the selected sound changes, which outside the developer-only selector is never.
  useEffect(() => {
    setReady(ensureClicker(clickSoundId));
  }, [clickSoundId]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        // Returning from the background is the one moment the audio session may have been taken away underneath
        // us, so the session is re-asserted and idle voices are returned to position 0 before the next press.
        if (state === "active") refreshClicker();
      },
    );
    return () => subscription.remove();
  }, []);

  const click = useCallback(() => {
    if (soundEnabled) playClick();

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
    /** True once the voice pool is built. The button is usable regardless. */
    ready,
    hapticPattern: hapticForEvent.clickerPress,
  };
}
