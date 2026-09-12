import { useCallback } from "react";
import * as Haptics from "expo-haptics";
import { hapticForEvent, type HapticEvent } from "@pawcue/ui";
import { useSettingsStore } from "../state/settings-store";

/**
 * Fires a haptic for one of the events the design system allows.
 *
 * The argument is a `HapticEvent`, not a pattern, and that is the enforcement mechanism: `hapticForEvent` is a
 * closed map with no entry for navigation, so "vibrate when the user changes tabs" is not something a screen can
 * express here. DESIGN_SYSTEM.md's rule — never a haptic on plain navigation — is held by the type, not by review.
 *
 * Always an enhancement, never information. Every event below is paired with a visible change, the user can turn
 * haptics off entirely, and unsupported hardware is swallowed rather than surfaced.
 *
 * The clicker deliberately does **not** use this. Its press path fires audio first and everything else after,
 * because perceived latency is that component's whole budget — see `useClicker`.
 */
export function useHaptics() {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  return useCallback(
    (event: HapticEvent) => {
      if (!hapticsEnabled) return;

      const pattern = hapticForEvent[event];
      const run =
        pattern === "notificationSuccess"
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          : pattern === "notificationError"
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            : pattern === "impactMedium"
              ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      void run.catch(() => {
        /* Unsupported hardware. Haptics are an enhancement; nothing depends on this succeeding. */
      });
    },
    [hapticsEnabled],
  );
}
