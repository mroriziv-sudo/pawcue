import { describe, expect, it } from "vitest";
import { palette, lightTheme } from "./color";
import {
  contrastRatio,
  flatten,
  parseColor,
  AA_NORMAL_TEXT,
  AA_LARGE_TEXT,
  AA_NON_TEXT,
} from "../a11y/contrast";

const IVORY = lightTheme.background.base;
const CARD = lightTheme.surface.raised;
const BRAND = lightTheme.brand.primary;

describe("palette", () => {
  it("contains the ten original brand colours plus Amber, and nothing else", () => {
    expect(Object.keys(palette)).toHaveLength(11);
  });

  it("matches DESIGN_SYSTEM.md hex values exactly", () => {
    expect(palette).toEqual({
      warmIvory: "#FAF8F4",
      deepEvergreen: "#23473C",
      softSage: "#82B79A",
      warmApricot: "#F2B27B",
      mutedLavender: "#A79ACD",
      charcoal: "#1F2523",
      white: "#FFFFFF",
      softBorder: "#E7E6E1",
      error: "#C75A55",
      success: "#4E8E68",
      amber: "#BF7A1E",
    });
  });
});

/**
 * The field-notebook roles. Secondary ink is a solid so it measures the same on paper and on white; amber has to
 * work as a filled mark (3:1) and, darkened, as text (4.5:1); the "completed" mark is the success green rather
 * than Soft Sage, which is recorded here as the reason.
 */
describe("field-notebook roles", () => {
  it("derives secondary ink from charcoal at 72% over paper, as a solid", () => {
    const expected = flatten(
      { ...parseColor(palette.charcoal), a: 0.72 },
      parseColor(palette.warmIvory),
    );
    const actual = parseColor(lightTheme.text.secondary);
    expect(Math.abs(actual.r - expected.r)).toBeLessThan(1);
    expect(Math.abs(actual.g - expected.g)).toBeLessThan(1);
    expect(Math.abs(actual.b - expected.b)).toBeLessThan(1);
  });

  it.each([
    ["secondary ink on paper", lightTheme.text.secondary, IVORY],
    ["secondary ink on white", lightTheme.text.secondary, CARD],
    ["reward text on paper", lightTheme.text.reward, IVORY],
    ["reward text on white", lightTheme.text.reward, CARD],
    ["completed text on paper", lightTheme.text.completed, IVORY],
  ])("%s clears 4.5:1", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each([
    ["the amber rep mark on paper", lightTheme.accent.reward, IVORY],
    ["the amber rep mark on white", lightTheme.accent.reward, CARD],
    ["the completed mark on paper", lightTheme.status.completed, IVORY],
    ["the completed mark on white", lightTheme.status.completed, CARD],
    [
      "a white treat on the amber mark",
      lightTheme.text.onBrand,
      lightTheme.accent.reward,
    ],
    [
      "a white check on the completed mark",
      lightTheme.text.onBrand,
      lightTheme.status.completed,
    ],
  ])("%s clears 3:1 as a graphic", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("does not use Soft Sage as the completed mark, because it cannot reach 3:1 on paper", () => {
    expect(contrastRatio(palette.softSage, IVORY)).toBeLessThan(AA_NON_TEXT);
    expect(lightTheme.status.completed).not.toBe(palette.softSage);
  });

  it("gives premium no colour role of its own", () => {
    // A premium lesson is a lock glyph and the word. Lavender stays only for screens not yet migrated.
    expect(Object.keys(lightTheme.accent)).not.toContain("premium");
    expect(Object.keys(lightTheme.surface)).not.toContain("premium");
  });
});

describe("text contrast (WCAG 2.1 AA)", () => {
  const bodyTextPairs: Array<[string, string, string]> = [
    ["primary text on canvas", lightTheme.text.primary, IVORY],
    ["primary text on card", lightTheme.text.primary, CARD],
    ["muted text on canvas", lightTheme.text.muted, IVORY],
    ["muted text on card", lightTheme.text.muted, CARD],
    ["text on brand surface", lightTheme.text.onBrand, BRAND],
    ["error text on canvas", lightTheme.text.error, IVORY],
    ["error text on card", lightTheme.text.error, CARD],
    ["success text on canvas", lightTheme.text.success, IVORY],
    ["success text on card", lightTheme.text.success, CARD],
  ];

  it.each(bodyTextPairs)("%s clears 4.5:1", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("brand-coloured headings clear 4.5:1 on the canvas", () => {
    expect(
      contrastRatio(lightTheme.brand.primary, IVORY),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

/**
 * These record *why* the raw brand status colours are not used for body copy. They are not aspirational — if
 * someone "simplifies" `text.error` back to `status.error`, this test is what explains the regression.
 */
describe("status colours: fills vs text", () => {
  it("the raw brand status colours do NOT meet body-text contrast on the canvas", () => {
    expect(contrastRatio(lightTheme.status.error, IVORY)).toBeLessThan(
      AA_NORMAL_TEXT,
    );
    expect(contrastRatio(lightTheme.status.success, IVORY)).toBeLessThan(
      AA_NORMAL_TEXT,
    );
  });

  it("...which is why darker text variants exist, and they do meet it", () => {
    expect(contrastRatio(lightTheme.text.error, IVORY)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
    expect(
      contrastRatio(lightTheme.text.success, IVORY),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("the raw brand status colours are still usable for large text and icons (>=3:1)", () => {
    expect(
      contrastRatio(lightTheme.status.error, IVORY),
    ).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
    expect(
      contrastRatio(lightTheme.status.success, IVORY),
    ).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
});

/**
 * Documented exemptions. WCAG 1.4.3 exempts inactive controls, and a decorative hairline is not the thing that
 * identifies a control. Both are asserted rather than ignored so the exemption stays a decision on the record.
 */
describe("documented contrast exemptions", () => {
  it("disabled text is below AA, which WCAG 1.4.3 explicitly exempts for inactive controls", () => {
    expect(contrastRatio(lightTheme.text.disabled, IVORY)).toBeLessThan(
      AA_NORMAL_TEXT,
    );
  });

  it("the subtle border is decorative only — too low-contrast to be a control's sole affordance", () => {
    // Recorded deliberately: any interactive element must be identifiable by shape, fill or label as well,
    // never by this border alone (DESIGN_SYSTEM.md: "Do not rely on color alone to express states").
    expect(contrastRatio(lightTheme.border.subtle, IVORY)).toBeLessThan(
      AA_LARGE_TEXT,
    );
  });
});

/**
 * The tinted surfaces and the brand surface — introduced for the Today redesign. Every pair a screen actually draws
 * is measured here, and the one that does *not* pass is recorded too, because it is the reason `text.mutedOnTint`
 * exists at all.
 */
describe("tinted and brand surfaces", () => {
  const TINTS: Array<[string, string]> = [
    ["sage", lightTheme.surface.tintSage],
    ["warm", lightTheme.surface.tintWarm],
    ["cool", lightTheme.surface.tintCool],
  ];

  it("derives each tint from its accent at 18% over white — no new hue", () => {
    const white = parseColor(palette.white);
    const expect18 = (hex: string) =>
      flatten({ ...parseColor(hex), a: 0.18 }, white);
    const close = (
      actual: string,
      expected: { r: number; g: number; b: number },
    ) => {
      const a = parseColor(actual);
      // Flattening lands on fractional channels; the token rounds them to a hex byte.
      expect(Math.abs(a.r - expected.r)).toBeLessThan(1);
      expect(Math.abs(a.g - expected.g)).toBeLessThan(1);
      expect(Math.abs(a.b - expected.b)).toBeLessThan(1);
    };
    close(lightTheme.surface.tintSage, expect18(palette.softSage));
    close(lightTheme.surface.tintWarm, expect18(palette.warmApricot));
    close(lightTheme.surface.tintCool, expect18(palette.mutedLavender));
  });

  it.each(TINTS)("primary text on the %s tint clears 4.5:1", (_name, tint) => {
    expect(contrastRatio(lightTheme.text.primary, tint)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it.each(TINTS)(
    "brand-coloured text and icons on the %s tint clear 4.5:1",
    (_name, tint) => {
      expect(
        contrastRatio(lightTheme.brand.primary, tint),
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it("the ordinary muted text is marginal on the tints — under 4.5:1 on lavender, barely over on the others", () => {
    // Recorded as the reason `text.mutedOnTint` exists: 64% charcoal measures ~4.4:1 on the cool tint and only
    // ~4.5–4.6:1 on the other two, which is no margin at all for secondary copy.
    expect(
      contrastRatio(lightTheme.text.muted, lightTheme.surface.tintCool),
    ).toBeLessThan(AA_NORMAL_TEXT);
    for (const [, tint] of TINTS) {
      expect(contrastRatio(lightTheme.text.muted, tint)).toBeLessThan(4.7);
    }
  });

  it.each(TINTS)("mutedOnTint clears 4.5:1 on the %s tint", (_name, tint) => {
    expect(
      contrastRatio(lightTheme.text.mutedOnTint, tint),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("success text and the success icon both work on the sage tint", () => {
    expect(
      contrastRatio(lightTheme.text.success, lightTheme.surface.tintSage),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(
      contrastRatio(lightTheme.status.success, lightTheme.surface.tintSage),
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("the brand surface is the brand colour, and both text roles on it clear 4.5:1", () => {
    expect(lightTheme.surface.brand).toBe(lightTheme.brand.primary);
    expect(
      contrastRatio(lightTheme.text.onBrand, lightTheme.surface.brand),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(
      contrastRatio(lightTheme.text.onBrandMuted, lightTheme.surface.brand),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("the warm accent reads as a graphic on the brand surface (progress ring fill)", () => {
    expect(
      contrastRatio(lightTheme.accent.warm, lightTheme.surface.brand),
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("the ivory canvas reads as a control edge against the brand surface (inverted button)", () => {
    expect(
      contrastRatio(lightTheme.background.base, lightTheme.surface.brand),
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe("theme structure", () => {
  it("exposes semantic roles rather than raw palette names", () => {
    expect(Object.keys(lightTheme).sort()).toEqual([
      "accent",
      "background",
      "border",
      "brand",
      "status",
      "surface",
      "text",
    ]);
  });
});
