/**
 * Which icons flip in RTL — an explicit allow-list, per DESIGN_SYSTEM.md.
 *
 * A blanket transform is wrong in both directions: leaving a back arrow pointing left in Hebrew is a navigation
 * bug, and mirroring the clicker glyph or a checkmark is a brand/legibility bug. Making it a per-icon decision
 * means adding an icon forces the question to be answered (`isMirrored` throws on an unregistered name rather than
 * guessing a default).
 *
 * Rule of thumb: mirror icons that encode *direction of travel through the interface*; never mirror logos, marks,
 * universal symbols, or anything representing a physical object whose handedness doesn't change.
 */

export const MIRRORED_IN_RTL = [
  "arrow-back",
  "arrow-forward",
  "chevron-start",
  "chevron-end",
  "progress-arrow",
  "undo",
  "redo",
] as const;

export const NEVER_MIRRORED = [
  // Brand and product marks.
  "clicker-glyph",
  "paw",
  // Universal symbols whose meaning is orientation-independent.
  "check",
  "close",
  "plus",
  "minus",
  "settings",
  "search",
  "bell",
  "heart",
  "star",
  // Media controls are conventionally NOT mirrored: play still points along the timeline, not the reading direction.
  "play",
  "pause",
  // Represents a physical object — a clock face doesn't mirror.
  "clock",
] as const;

export type MirroredIcon = (typeof MIRRORED_IN_RTL)[number];
export type NeverMirroredIcon = (typeof NEVER_MIRRORED)[number];
export type IconName = MirroredIcon | NeverMirroredIcon;

const mirrored = new Set<string>(MIRRORED_IN_RTL);
const neverMirrored = new Set<string>(NEVER_MIRRORED);

/**
 * Throws for an unregistered icon on purpose. A silent `false` default is how a back arrow ends up pointing the
 * wrong way in Hebrew and nobody notices until a user reports it.
 */
export function isMirroredInRtl(icon: string): boolean {
  if (mirrored.has(icon)) return true;
  if (neverMirrored.has(icon)) return false;
  throw new Error(
    `Icon "${icon}" is not registered in icon-mirroring.ts. Decide explicitly whether it mirrors in RTL.`,
  );
}

/** The `scaleX` to apply for a given icon in a given direction. */
export function iconScaleX(icon: string, isRtl: boolean): 1 | -1 {
  return isRtl && isMirroredInRtl(icon) ? -1 : 1;
}
