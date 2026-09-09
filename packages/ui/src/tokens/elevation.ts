/**
 * Elevation. DESIGN_SYSTEM.md is explicit: "very soft" shadows, "avoid large generic drop shadows", and a single
 * `shadow.card` token. That constraint is the point — this file deliberately offers no `shadow.lg`.
 *
 * Values are plain data (no React Native import) so the token layer stays framework-agnostic; the Card primitive
 * spreads them into a style. iOS reads the shadow* fields, Android reads `elevation`, so both are provided.
 */

export interface ShadowToken {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android. Kept low — Android's elevation also darkens and enlarges the shadow faster than iOS's. */
  elevation: number;
}

export const shadow = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** The only elevated surface in the system: a card lifted just enough to separate it from the ivory canvas. */
  card: {
    shadowColor: "#1F2523",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const satisfies Record<string, ShadowToken>;

export type ShadowTokenName = keyof typeof shadow;

/** Asserted in elevation.test.ts: "very soft" is a measurable constraint, not a vibe. */
export const SHADOW_LIMITS = {
  maxOpacity: 0.12,
  maxRadius: 12,
  maxElevation: 3,
} as const;

export const border = {
  /** DESIGN_SYSTEM.md: "Subtle 1px borders." */
  hairline: 1,
  /** Focus ring — thicker so focus is legible without relying on colour. */
  focus: 2,
} as const;
