/**
 * Haptic vocabulary (DESIGN_SYSTEM.md §Haptics, brief §20).
 *
 * String literals rather than `expo-haptics` enums, so the token layer stays free of native imports. The
 * NotificationProvider/haptics adapter maps these to the SDK in Phase 2.
 */

export const hapticPattern = {
  /** Clicker press and other primary confirmations — light and crisp. */
  light: "impactLight",
  /** Medium impact for a meaningful state change. */
  medium: "impactMedium",
  /** Lesson complete. */
  success: "notificationSuccess",
  /** Errors only where the haptic genuinely helps; used sparingly. */
  error: "notificationError",
} as const;

export type HapticPattern = (typeof hapticPattern)[keyof typeof hapticPattern];

/**
 * The semantic events allowed to fire a haptic, and which pattern each uses. A closed map is the enforcement
 * mechanism for the brief's "do not vibrate on every navigation action" — plain navigation simply has no entry
 * here, so there is nothing for a screen to call.
 */
export const hapticForEvent = {
  clickerPress: hapticPattern.light,
  buttonPress: hapticPattern.light,
  lessonComplete: hapticPattern.success,
  streakIncrease: hapticPattern.medium,
  error: hapticPattern.error,
} as const;

export type HapticEvent = keyof typeof hapticForEvent;

/**
 * Haptics are always an enhancement. Nothing in the UI may depend on a haptic to be understandable (brief §27):
 * every haptic event above is paired with a visual change, and the user can disable haptics entirely in settings.
 */
export const HAPTICS_ARE_OPTIONAL = true;
