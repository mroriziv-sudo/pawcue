import { describe, expect, it } from "vitest";
import { typography, maxFontSizeMultiplier, fontWeight } from "./typography";
import { space, GRID_UNIT, GRID_BASE } from "./spacing";
import { radius, RADIUS_BOUNDS } from "./radius";
import { shadow, SHADOW_LIMITS, border } from "./elevation";
import {
  duration,
  TRANSITION_BOUNDS,
  pressScale,
  reducedMotionAlternative,
  pressScaleFor,
  spring,
} from "./motion";
import {
  soundDurationBudgetMs,
  ERROR_SOUND,
  CLICK_LATENCY_BUDGET_MS,
} from "./sound";
import { hapticForEvent, hapticPattern } from "./haptics";
import {
  MIN_TOUCH_TARGET,
  PLATFORM_MIN_TOUCH_TARGET,
  hitSlopFor,
} from "./layout";
import {
  isMirroredInRtl,
  iconScaleX,
  MIRRORED_IN_RTL,
  NEVER_MIRRORED,
} from "./icon-mirroring";
import { createTheme, colorSchemes, defaultTheme } from "./theme";

describe("typography", () => {
  it("matches the field-notebook scale exactly (DESIGN_SYSTEM.md §Typography)", () => {
    expect(typography.largeTitle).toMatchObject({
      fontSize: 34,
      lineHeight: 40,
      fontWeight: "700",
    });
    expect(typography.headline).toMatchObject({
      fontSize: 26,
      lineHeight: 32,
      fontWeight: "600",
    });
    expect(typography.title).toMatchObject({
      fontSize: 20,
      lineHeight: 25,
      fontWeight: "600",
    });
    // iOS body is 17, not 16.
    expect(typography.body).toMatchObject({
      fontSize: 17,
      lineHeight: 24,
      fontWeight: "400",
    });
    expect(typography.bodyStrong).toMatchObject({
      fontSize: 17,
      lineHeight: 24,
      fontWeight: "600",
    });
    expect(typography.secondary).toMatchObject({
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "400",
    });
    // A section heading is a signpost, not a headline: the same size as secondary copy, one weight up.
    expect(typography.sectionLabel).toMatchObject({
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "600",
    });
    expect(typography.displayNumeral).toMatchObject({
      fontSize: 56,
      lineHeight: 60,
      fontWeight: "700",
    });
  });

  it("keeps the legacy names on the same scale so unmigrated screens read as the same product", () => {
    expect(typography.h1).toMatchObject({ fontSize: 28, fontWeight: "600" });
    expect(typography.h2).toMatchObject({ fontSize: 24, fontWeight: "600" });
    expect(typography.h3).toEqual(typography.title);
    expect(typography.small).toEqual(typography.secondary);
    expect(typography.display).toEqual(typography.largeTitle);
  });

  it("keeps caption at 13 / 18: small enough to disappear, large enough to read one-handed", () => {
    expect(typography.caption.fontSize).toBe(13);
    expect(typography.caption.lineHeight).toBe(18);
  });

  it("uses the full weight range — two weights is why every screen used to read at one volume", () => {
    const weights = new Set(
      Object.values(typography).map((style) => style.fontWeight),
    );
    expect(weights).toContain("400");
    expect(weights).toContain("600");
    expect(weights).toContain("700");
  });

  it("only tracks the large sizes, and never positively", () => {
    for (const [name, style] of Object.entries(typography)) {
      const tracking = (style as { letterSpacing?: number }).letterSpacing ?? 0;
      expect(tracking, `${name} tracking`).toBeLessThanOrEqual(0);
      if (tracking !== 0) expect(style.fontSize).toBeGreaterThanOrEqual(26);
    }
  });

  it("keeps button text within the documented 16–17 semibold range", () => {
    for (const variant of [typography.button, typography.buttonCompact]) {
      expect(variant.fontSize).toBeGreaterThanOrEqual(16);
      expect(variant.fontSize).toBeLessThanOrEqual(17);
      expect(variant.fontWeight).toBe(fontWeight.semibold);
    }
  });

  it("gives every variant a line height with room to breathe", () => {
    for (const [name, style] of Object.entries(typography)) {
      expect(style.lineHeight, `${name} line height`).toBeGreaterThan(
        style.fontSize,
      );
    }
  });

  it("leaves body-level text uncapped so Dynamic Type is never clamped where it matters most", () => {
    expect(maxFontSizeMultiplier.body).toBeUndefined();
    expect(maxFontSizeMultiplier.bodyStrong).toBeUndefined();
    expect(maxFontSizeMultiplier.secondary).toBeUndefined();
    expect(maxFontSizeMultiplier.sectionLabel).toBeUndefined();
    expect(maxFontSizeMultiplier.small).toBeUndefined();
    expect(maxFontSizeMultiplier.caption).toBeUndefined();
  });

  it("caps the display numeral tightest — it is already the largest thing on its screen", () => {
    expect(maxFontSizeMultiplier.displayNumeral).toBeLessThan(
      maxFontSizeMultiplier.headline,
    );
  });

  it("caps headings generously rather than tightly", () => {
    for (const variant of ["display", "h1", "h2", "h3"] as const) {
      expect(maxFontSizeMultiplier[variant]).toBeGreaterThanOrEqual(1.6);
    }
  });

  it("declares a multiplier entry for every variant", () => {
    expect(Object.keys(maxFontSizeMultiplier).sort()).toEqual(
      Object.keys(typography).sort(),
    );
  });
});

describe("spacing", () => {
  it("is built on a 4pt unit with an 8pt base", () => {
    expect(GRID_UNIT).toBe(4);
    expect(GRID_BASE).toBe(8);
  });

  it("has every step land on the 4pt grid", () => {
    for (const [name, value] of Object.entries(space)) {
      expect(value % GRID_UNIT, `space.${name} = ${value}`).toBe(0);
    }
  });

  it("names each step after its multiple of the unit", () => {
    for (const [name, value] of Object.entries(space)) {
      expect(value).toBe(Number(name) * GRID_UNIT);
    }
  });

  it("increases monotonically", () => {
    const values = Object.values(space);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});

describe("radius", () => {
  it("draws exactly three radii plus the sheet, the pill and the clicker ratio", () => {
    const distinct = new Set(
      Object.entries(radius)
        .filter(([name]) => name !== "pill" && name !== "sheet")
        .map(([, value]) => value),
    );
    expect([...distinct].sort((a, b) => a - b)).toEqual([12, 14, 16]);
    expect(radius.field).toBe(12);
    expect(radius.control).toBe(14);
    expect(radius.object).toBe(16);
  });

  it("keeps card radii on the committed object radius", () => {
    for (const value of [radius.card, radius.cardLarge]) {
      expect(value).toBeGreaterThanOrEqual(RADIUS_BOUNDS.card.min);
      expect(value).toBeLessThanOrEqual(RADIUS_BOUNDS.card.max);
    }
  });

  it("keeps button radii on the committed control radius", () => {
    for (const value of [radius.button, radius.buttonLarge]) {
      expect(value).toBeGreaterThanOrEqual(RADIUS_BOUNDS.button.min);
      expect(value).toBeLessThanOrEqual(RADIUS_BOUNDS.button.max);
    }
  });
});

describe("elevation", () => {
  it("ships exactly one elevated surface plus a none token", () => {
    expect(Object.keys(shadow).sort()).toEqual(["card", "none"]);
  });

  it("keeps the card shadow soft — the spec bans large generic drop shadows", () => {
    expect(shadow.card.shadowOpacity).toBeLessThanOrEqual(
      SHADOW_LIMITS.maxOpacity,
    );
    expect(shadow.card.shadowRadius).toBeLessThanOrEqual(
      SHADOW_LIMITS.maxRadius,
    );
    expect(shadow.card.elevation).toBeLessThanOrEqual(
      SHADOW_LIMITS.maxElevation,
    );
  });

  it("uses a 1px hairline border", () => {
    expect(border.hairline).toBe(1);
  });

  it("makes the focus ring thicker than the hairline so focus never depends on colour alone", () => {
    expect(border.focus).toBeGreaterThan(border.hairline);
  });
});

describe("motion", () => {
  it("keeps ordinary transitions within 160–280ms", () => {
    for (const token of [
      "fast",
      "base",
      "slow",
      "state",
      "exit",
      "enter",
    ] as const) {
      expect(duration[token]).toBeGreaterThanOrEqual(TRANSITION_BOUNDS.min);
      expect(duration[token]).toBeLessThanOrEqual(TRANSITION_BOUNDS.max);
    }
  });

  it("makes press feedback faster than any transition, and press-out slower than press-in", () => {
    expect(duration.pressIn).toBeLessThan(TRANSITION_BOUNDS.min);
    expect(duration.pressOut).toBeGreaterThan(duration.pressIn);
  });

  it("leaves faster than it arrives", () => {
    expect(duration.exit).toBeLessThan(duration.enter);
  });

  it("ships two springs for the product and neither of them bounces", () => {
    // Damping ratio ζ = c / (2·sqrt(k·m)); below ~0.7 a spring visibly overshoots more than once.
    const ratio = (s: { damping: number; stiffness: number; mass: number }) =>
      s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
    expect(ratio(spring.responsive)).toBeGreaterThanOrEqual(0.7);
    expect(ratio(spring.soft)).toBeGreaterThanOrEqual(0.7);
  });

  it("holds plan generation to the documented 600–900ms window, not a fake delay", () => {
    expect(duration.planGenerationMin).toBe(600);
    expect(duration.planGenerationMax).toBe(900);
    expect(duration.planGenerationMax).toBeLessThanOrEqual(900);
  });

  it("uses the specified clicker and card press scales", () => {
    expect(pressScale.clicker).toBe(0.96);
    expect(pressScale.card).toBe(0.985);
  });

  it("substitutes a fade for movement under Reduce Motion — never removing feedback entirely", () => {
    expect(reducedMotionAlternative("scale")).toBe("fade");
    expect(reducedMotionAlternative("translate")).toBe("fade");
    expect(reducedMotionAlternative("spring")).toBe("fade");
    expect(reducedMotionAlternative("fade")).toBe("fade");
    expect(reducedMotionAlternative("none")).toBe("none");
  });

  it("cancels press scaling entirely when Reduce Motion is on", () => {
    expect(pressScaleFor("clicker", false)).toBe(0.96);
    expect(pressScaleFor("clicker", true)).toBe(1);
    expect(pressScaleFor("card", true)).toBe(1);
  });
});

describe("sound", () => {
  it("keeps the click in the 30–70ms mechanical window", () => {
    expect(soundDurationBudgetMs.click).toEqual({ min: 30, max: 70 });
  });

  it("keeps the success cue in the 250–400ms window", () => {
    expect(soundDurationBudgetMs.success).toEqual({ min: 250, max: 400 });
  });

  it("ships no error sound — errors are haptic plus visual", () => {
    expect(ERROR_SOUND).toBeNull();
  });

  it("sets a press-to-sound latency budget the clicker can be tested against", () => {
    expect(CLICK_LATENCY_BUDGET_MS).toBeLessThanOrEqual(50);
  });
});

describe("haptics", () => {
  it("maps each allowed event to a pattern", () => {
    expect(hapticForEvent.clickerPress).toBe(hapticPattern.light);
    expect(hapticForEvent.lessonComplete).toBe(hapticPattern.success);
  });

  it("has no entry for plain navigation — the spec forbids vibrating on every navigation action", () => {
    expect(hapticForEvent).not.toHaveProperty("navigate");
    expect(hapticForEvent).not.toHaveProperty("screenChange");
    expect(hapticForEvent).not.toHaveProperty("tabChange");
  });
});

describe("touch targets", () => {
  it("uses a single minimum that satisfies both platforms", () => {
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(
      PLATFORM_MIN_TOUCH_TARGET.ios,
    );
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(
      PLATFORM_MIN_TOUCH_TARGET.android,
    );
  });

  it("expands a small control up to the minimum via hitSlop", () => {
    expect(hitSlopFor(24)).toBe(12); // 24 + 12*2 = 48
    expect(hitSlopFor(48)).toBe(0);
    expect(hitSlopFor(64)).toBe(0);
  });
});

describe("icon mirroring", () => {
  it("mirrors direction-of-travel icons in RTL", () => {
    expect(isMirroredInRtl("arrow-back")).toBe(true);
    expect(iconScaleX("arrow-back", true)).toBe(-1);
    expect(iconScaleX("arrow-back", false)).toBe(1);
  });

  it("never mirrors brand marks or universal symbols", () => {
    for (const icon of ["clicker-glyph", "paw", "check", "play"]) {
      expect(isMirroredInRtl(icon), icon).toBe(false);
      expect(iconScaleX(icon, true), icon).toBe(1);
    }
  });

  it("throws on an unregistered icon instead of silently guessing", () => {
    expect(() => isMirroredInRtl("some-new-icon")).toThrow(/not registered/);
  });

  it("keeps the two lists disjoint", () => {
    const overlap = MIRRORED_IN_RTL.filter((i) =>
      (NEVER_MIRRORED as readonly string[]).includes(i),
    );
    expect(overlap).toEqual([]);
  });
});

describe("theme", () => {
  it("defaults to the light scheme", () => {
    expect(defaultTheme.colorScheme).toBe("light");
  });

  it("ships light only — dark is readiness work, not an implemented scheme", () => {
    expect(Object.keys(colorSchemes)).toEqual(["light"]);
  });

  it("exposes every token group components need", () => {
    const theme = createTheme();
    for (const key of [
      "colors",
      "typography",
      "space",
      "radius",
      "shadow",
      "border",
      "duration",
      "easing",
      "pressScale",
      "minTouchTarget",
    ] as const) {
      expect(theme[key], key).toBeDefined();
    }
  });
});
