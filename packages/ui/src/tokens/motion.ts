/**
 * Motion — "calm, responsive, premium, playful, not childish" (DESIGN_SYSTEM.md).
 *
 * Plain data only: durations, easing control points and scale factors. Nothing here imports Reanimated, so the
 * values are testable and the animation library stays an implementation detail of the components.
 *
 * Every value that moves or scales has a Reduce Motion counterpart — see `reducedMotionAlternative`. That mapping
 * lives in the token layer rather than in each component so "respect Reduce Motion" is a property of the system,
 * not a thing each screen has to remember (brief §21).
 */

/** DESIGN_SYSTEM.md: "Typical transitions: 160–280 ms." Press feedback is faster than a transition on purpose. */
export const duration = {
  /** Press-in: the surface has to move before the finger has finished landing. */
  pressIn: 100,
  /** Press-out: a little slower than in, so the release reads as a settle rather than a snap. */
  pressOut: 180,
  /** A mark filling, a segment completing, a button morphing — a change of state in place. */
  state: 220,
  /** Content leaving. Always shorter than content arriving. */
  exit: 200,
  /** Content arriving: a sheet, the next instruction, a screen's content. */
  enter: 280,
  /** Legacy default press duration. */
  fast: 160,
  /** Legacy default transition. */
  base: 220,
  /** Legacy: larger surfaces entering/leaving. */
  slow: 280,
  /**
   * Plan generation holds a minimum visible state so a fast server response doesn't flash — capped tightly because
   * the brief forbids a deceptive fake delay (§4 Screen 7).
   */
  planGenerationMin: 600,
  planGenerationMax: 900,
} as const;

export type DurationToken = keyof typeof duration;

/** Documented bound for ordinary transitions, asserted in motion.test.ts. */
export const TRANSITION_BOUNDS = { min: 160, max: 280 } as const;

/** Cubic-bézier control points, framework-agnostic. */
export const easing = {
  /** Default: quick to respond, gentle to settle. */
  standard: [0.2, 0, 0, 1],
  /** Entering the screen. */
  decelerate: [0, 0, 0, 1],
  /** Leaving the screen. */
  accelerate: [0.3, 0, 1, 1],
} as const;

/** Press-state scale factors, exactly as specified in DESIGN_SYSTEM.md. */
export const pressScale = {
  /** Clicker: 1.00 → 0.96 → 1.00. The signature interaction. */
  clicker: 0.96,
  /** Card press: "very subtle scale". */
  card: 0.985,
  /** Buttons sit between the two. */
  button: 0.97,
} as const;

export type PressScaleToken = keyof typeof pressScale;

/**
 * Two springs, and only two. `responsive` is for controls and marks: it settles in about 250ms with no visible
 * overshoot. `soft` is for content and the character arriving: one small overshoot, settled in about 400ms.
 * Nothing in the product bounces — bounce reads as a toy. `gentle` is the legacy completion spring.
 */
export const spring = {
  responsive: { damping: 26, stiffness: 320, mass: 1 },
  soft: { damping: 20, stiffness: 180, mass: 1 },
  gentle: { damping: 18, stiffness: 180, mass: 1 },
} as const;

export type SpringToken = keyof typeof spring;

export type MotionEffect = "scale" | "translate" | "spring" | "fade" | "none";

/**
 * What an effect becomes when Reduce Motion is on. DESIGN_SYSTEM.md: "replace large movement/scaling with fades or
 * simple state changes" — note this returns `fade`, never `none`, for scale/translate/spring: the user still needs
 * feedback that something happened, just not motion. Removing the feedback entirely would be an accessibility
 * regression dressed up as an accessibility feature.
 */
export function reducedMotionAlternative(effect: MotionEffect): MotionEffect {
  switch (effect) {
    case "scale":
    case "translate":
    case "spring":
      return "fade";
    case "fade":
    case "none":
      return effect;
  }
}

/** Scale factor to apply for a press, accounting for Reduce Motion (where the element must not scale at all). */
export function pressScaleFor(
  token: PressScaleToken,
  reduceMotion: boolean,
): number {
  return reduceMotion ? 1 : pressScale[token];
}
