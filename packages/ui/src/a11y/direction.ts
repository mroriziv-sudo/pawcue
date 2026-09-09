/**
 * Writing-direction helpers.
 *
 * DESIGN_SYSTEM.md bans `left`/`right` style props in `packages/ui` in favour of logical `start`/`end`, which React
 * Native resolves per direction automatically. These helpers cover the cases RN's logical properties don't:
 * text alignment defaults, and any value that has to be computed rather than declared.
 *
 * Hebrew is a launch language, so this is load-bearing from day one — not a later "RTL pass" (brief §26).
 */

export type Direction = "ltr" | "rtl";

/** Locales that render right-to-left. Arabic is listed ahead of being a shipping locale, per brief §26. */
const RTL_LANGUAGE_CODES = new Set(["he", "ar", "fa", "ur"]);

/** Accepts a full tag (`he-IL`) or a bare language code (`he`). */
export function directionForLocale(locale: string): Direction {
  const language = locale.split("-")[0]?.toLowerCase() ?? "";
  return RTL_LANGUAGE_CODES.has(language) ? "rtl" : "ltr";
}

export function isRtl(direction: Direction): boolean {
  return direction === "rtl";
}

/**
 * Default text alignment. `start` is what almost everything should use; this exists so a component can resolve an
 * explicit physical value when a platform API demands one.
 */
export function textAlignFor(direction: Direction): "left" | "right" {
  return direction === "rtl" ? "right" : "left";
}

/**
 * Resolves a logical edge to a physical one. Prefer RN's own `marginStart`/`paddingEnd` props over this — reach for
 * it only where a physical value is unavoidable (transforms, absolute positioning, animation targets).
 */
export function physicalEdge(
  edge: "start" | "end",
  direction: Direction,
): "left" | "right" {
  const isRightToLeft = direction === "rtl";
  if (edge === "start") return isRightToLeft ? "right" : "left";
  return isRightToLeft ? "left" : "right";
}

/**
 * Flips the sign of a horizontal offset for RTL. Needed for translations and absolute offsets, which do not respond
 * to logical properties.
 */
export function horizontalOffset(offset: number, direction: Direction): number {
  return direction === "rtl" ? -offset : offset;
}
