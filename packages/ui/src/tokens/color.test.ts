import { describe, expect, it } from "vitest";
import { palette, lightTheme } from "./color";
import { contrastRatio, AA_NORMAL_TEXT, AA_LARGE_TEXT } from "../a11y/contrast";

const IVORY = lightTheme.background.base;
const CARD = lightTheme.surface.raised;
const BRAND = lightTheme.brand.primary;

describe("palette", () => {
  it("contains exactly the ten specified brand colours", () => {
    expect(Object.keys(palette)).toHaveLength(10);
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
    });
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
