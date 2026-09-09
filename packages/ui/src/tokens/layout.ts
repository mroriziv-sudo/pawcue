/**
 * Layout constraints that are accessibility requirements rather than styling preferences.
 */

/**
 * Minimum interactive target. iOS HIG asks for 44×44pt and Android Material for 48×48dp; the system uses 48
 * everywhere because it satisfies both, and a single number removes the chance of a component being compliant on
 * one platform only. Asserted for every interactive primitive in the tests.
 */
export const MIN_TOUCH_TARGET = 48;

/** Per-platform minimums, kept for documentation and for asserting that 48 really does clear both. */
export const PLATFORM_MIN_TOUCH_TARGET = { ios: 44, android: 48 } as const;

/**
 * Expands the tappable area of a visually smaller control (e.g. a 24pt icon button) up to MIN_TOUCH_TARGET without
 * changing its layout footprint. Returns the per-edge inset for React Native's `hitSlop`.
 */
export function hitSlopFor(
  visualSize: number,
  minimum: number = MIN_TOUCH_TARGET,
): number {
  return Math.max(0, Math.ceil((minimum - visualSize) / 2));
}
