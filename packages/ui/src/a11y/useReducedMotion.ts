import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Tracks the OS "Reduce Motion" setting.
 *
 * Subscribing to changes matters as much as the initial read: the setting can be toggled while the app is
 * backgrounded, and a session that only checked at mount would keep animating for a user who just asked it not to.
 *
 * Defaults to `false` (motion allowed) if the platform query fails, because the alternative — assuming reduced
 * motion — would silently strip the intended feel for everyone on a transient error.
 */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {
        if (active) setReduceMotion(false);
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        setReduceMotion(enabled);
      },
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
