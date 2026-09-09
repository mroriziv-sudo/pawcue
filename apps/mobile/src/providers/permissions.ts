/**
 * Permission architecture (brief §18).
 *
 * The rule this file exists to enforce: **no OS permission prompt may be triggered by app launch, navigation, or
 * any screen simply rendering.** A prompt is only ever the direct result of the user tapping something that
 * explains what they are about to grant.
 *
 * The mechanism is a closed catalogue. A permission not listed here has no request function to call, so requesting
 * it is not an oversight away — it requires editing this file, which is where the justification lives.
 */

export type PermissionKind = "notifications" | "photoLibrary";

export interface PermissionSpec {
  kind: PermissionKind;
  /** The user action that may trigger the prompt. Anything else requesting it is a bug. */
  triggeredBy: string;
  /** i18n key for the in-app explanation shown BEFORE the OS prompt. */
  rationaleKey: string;
  phase: string;
}

/**
 * v1 requests exactly two permissions, both contextually. Everything the brief forbids — location, microphone,
 * contacts, Bluetooth, motion, health, and App Tracking Transparency — is absent by construction, not by
 * remembering not to ask.
 */
export const PERMISSION_CATALOGUE: Record<PermissionKind, PermissionSpec> = {
  notifications: {
    kind: "notifications",
    triggeredBy: 'User taps "Set reminder" and confirms the explanation',
    rationaleKey: "permissions.notifications.rationale",
    phase: "Phase 9",
  },
  photoLibrary: {
    kind: "photoLibrary",
    triggeredBy: 'User taps "Add dog photo"',
    rationaleKey: "permissions.photoLibrary.rationale",
    phase: "Phase 6",
  },
};

/** Permissions that must never be requested in v1. Asserted in tests so a stray import can't reintroduce one. */
export const FORBIDDEN_PERMISSIONS = [
  "location",
  "microphone",
  "contacts",
  "bluetooth",
  "motion",
  "health",
  "appTrackingTransparency",
  "camera",
] as const;

/**
 * There is intentionally no `requestPermission()` implementation in Phase 2. The app boots, runs the clicker and
 * renders its screens without asking for anything, and the actual request functions arrive with the features that
 * justify them (Phase 6 and Phase 9). Adding a generic requester now would make it trivially easy for a later
 * screen to prompt on mount.
 */
export function permissionRationaleKey(kind: PermissionKind): string {
  return PERMISSION_CATALOGUE[kind].rationaleKey;
}
