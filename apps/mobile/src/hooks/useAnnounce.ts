import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Announces a status message to VoiceOver / TalkBack when it appears or changes.
 *
 * A purchase that failed, a restore that found nothing, a sign-in that did not complete: each shows a message
 * below the control the user just pressed, and a sighted user sees it at once. A screen-reader user is still
 * focused on the button and hears nothing unless the app says it. `announceForAccessibility` is the one call
 * that works the same on both platforms without restructuring the screen around live regions.
 *
 * Announces only real messages (null/empty are ignored) and only on change, so a re-render does not repeat it.
 */
export function useAnnounce(message: string | null | undefined): void {
  useEffect(() => {
    if (!message) return;
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}
