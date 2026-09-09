import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  parseColor,
  flatten,
  meetsContrast,
  AA_NORMAL_TEXT,
} from "./contrast";
import {
  directionForLocale,
  isRtl,
  textAlignFor,
  physicalEdge,
  horizontalOffset,
} from "./direction";

describe("contrast maths", () => {
  it("returns 21:1 for black on white and 1:1 for identical colours", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1F2523", "#FAF8F4")).toBeCloseTo(
      contrastRatio("#FAF8F4", "#1F2523"),
      10,
    );
  });

  it("parses shorthand, full hex, and rgb/rgba", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#1F2523")).toEqual({ r: 31, g: 37, b: 35, a: 1 });
    expect(parseColor("rgba(31, 37, 35, 0.5)")).toEqual({
      r: 31,
      g: 37,
      b: 35,
      a: 0.5,
    });
  });

  it("throws on an unparseable colour rather than silently producing NaN", () => {
    expect(() => parseColor("evergreen")).toThrow(/Unsupported color format/);
  });

  it("flattens translucent foregrounds before measuring", () => {
    // 50% black over white is mid grey.
    expect(
      flatten(parseColor("rgba(0,0,0,0.5)"), parseColor("#FFFFFF")).r,
    ).toBeCloseTo(127.5, 1);
  });

  it("accounts for alpha — a translucent foreground contrasts less than its opaque form", () => {
    const opaque = contrastRatio("#1F2523", "#FAF8F4");
    const translucent = contrastRatio("rgba(31, 37, 35, 0.5)", "#FAF8F4");
    expect(translucent).toBeLessThan(opaque);
  });

  it("refuses a translucent background, which has no defined contrast", () => {
    expect(() => contrastRatio("#000000", "rgba(255,255,255,0.5)")).toThrow(
      /must be opaque/,
    );
  });

  it("meetsContrast agrees with the raw ratio", () => {
    expect(meetsContrast("#1F2523", "#FAF8F4", AA_NORMAL_TEXT)).toBe(true);
    expect(meetsContrast("#E7E6E1", "#FAF8F4", AA_NORMAL_TEXT)).toBe(false);
  });
});

describe("writing direction", () => {
  it("treats Hebrew as RTL — a launch language, not a later pass", () => {
    expect(directionForLocale("he-IL")).toBe("rtl");
    expect(directionForLocale("he")).toBe("rtl");
  });

  it("treats English as LTR", () => {
    expect(directionForLocale("en-US")).toBe("ltr");
  });

  it("already handles Arabic, which the architecture must support later", () => {
    expect(directionForLocale("ar")).toBe("rtl");
    expect(directionForLocale("ar-EG")).toBe("rtl");
  });

  it("is case-insensitive about the language subtag", () => {
    expect(directionForLocale("HE-il")).toBe("rtl");
  });

  it("falls back to LTR for an unknown locale rather than throwing", () => {
    expect(directionForLocale("xx-YY")).toBe("ltr");
    expect(directionForLocale("")).toBe("ltr");
  });

  it("resolves logical edges to physical ones per direction", () => {
    expect(physicalEdge("start", "ltr")).toBe("left");
    expect(physicalEdge("start", "rtl")).toBe("right");
    expect(physicalEdge("end", "ltr")).toBe("right");
    expect(physicalEdge("end", "rtl")).toBe("left");
  });

  it("aligns text to the reading edge", () => {
    expect(textAlignFor("ltr")).toBe("left");
    expect(textAlignFor("rtl")).toBe("right");
  });

  it("flips horizontal offsets in RTL so transforms and absolute offsets follow the layout", () => {
    expect(horizontalOffset(16, "ltr")).toBe(16);
    expect(horizontalOffset(16, "rtl")).toBe(-16);
    expect(horizontalOffset(0, "rtl")).toBe(-0);
  });

  it("isRtl agrees with directionForLocale", () => {
    expect(isRtl(directionForLocale("he-IL"))).toBe(true);
    expect(isRtl(directionForLocale("en-US"))).toBe(false);
  });
});
