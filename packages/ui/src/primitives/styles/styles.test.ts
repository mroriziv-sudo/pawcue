import { describe, expect, it } from "vitest";
import { createTheme } from "../../tokens/theme";
import { resolveTextStyle } from "./text-styles";
import { resolveButtonStyle } from "./button-styles";
import { resolveCardStyle } from "./card-styles";
import {
  contrastRatio,
  AA_NORMAL_TEXT,
  AA_NON_TEXT,
} from "../../a11y/contrast";

const theme = createTheme();

describe("text styles", () => {
  it("applies the type scale for the requested variant", () => {
    const { style } = resolveTextStyle({
      variant: "h1",
      direction: "ltr",
      theme,
    });
    expect(style.fontSize).toBe(28);
    expect(style.lineHeight).toBe(34);
    expect(style.fontWeight).toBe("600");
  });

  it("aligns logical `start` to the reading edge in each direction", () => {
    expect(
      resolveTextStyle({ variant: "body", direction: "ltr", theme }).style
        .textAlign,
    ).toBe("left");
    expect(
      resolveTextStyle({ variant: "body", direction: "rtl", theme }).style
        .textAlign,
    ).toBe("right");
  });

  it("aligns logical `end` opposite the reading edge", () => {
    const ltr = resolveTextStyle({
      variant: "body",
      align: "end",
      direction: "ltr",
      theme,
    });
    const rtl = resolveTextStyle({
      variant: "body",
      align: "end",
      direction: "rtl",
      theme,
    });
    expect(ltr.style.textAlign).toBe("right");
    expect(rtl.style.textAlign).toBe("left");
  });

  it("leaves centre alignment direction-independent", () => {
    for (const direction of ["ltr", "rtl"] as const) {
      expect(
        resolveTextStyle({ variant: "body", align: "center", direction, theme })
          .style.textAlign,
      ).toBe("center");
    }
  });

  it("sets writingDirection so mixed Hebrew/Latin runs order correctly", () => {
    expect(
      resolveTextStyle({ variant: "body", direction: "rtl", theme }).style
        .writingDirection,
    ).toBe("rtl");
  });

  it("gives Hebrew more line height and drops Latin tracking", () => {
    const latin = resolveTextStyle({
      variant: "headline",
      direction: "ltr",
      theme,
    }).style;
    const hebrew = resolveTextStyle({
      variant: "headline",
      direction: "rtl",
      theme,
    }).style;
    expect(latin.letterSpacing).toBeLessThan(0);
    expect(hebrew.letterSpacing).toBeUndefined();
    expect(hebrew.lineHeight).toBe((latin.lineHeight as number) + 2);
  });

  it("sets tabular figures on request, and always for the display numeral", () => {
    expect(
      resolveTextStyle({ variant: "body", direction: "ltr", theme }).style
        .fontVariant,
    ).toBeUndefined();
    expect(
      resolveTextStyle({
        variant: "body",
        tabular: true,
        direction: "ltr",
        theme,
      }).style.fontVariant,
    ).toEqual(["tabular-nums"]);
    expect(
      resolveTextStyle({ variant: "displayNumeral", direction: "ltr", theme })
        .style.fontVariant,
    ).toEqual(["tabular-nums"]);
  });

  it("leaves body text uncapped and caps headings for Dynamic Type", () => {
    expect(
      resolveTextStyle({ variant: "body", direction: "ltr", theme })
        .maxFontSizeMultiplier,
    ).toBeUndefined();
    expect(
      resolveTextStyle({ variant: "display", direction: "ltr", theme })
        .maxFontSizeMultiplier,
    ).toBe(1.6);
  });

  it("maps every tone to a real colour", () => {
    const tones = [
      "primary",
      "muted",
      "disabled",
      "onBrand",
      "onBrandMuted",
      "mutedOnTint",
      "error",
      "success",
      "brand",
    ] as const;
    for (const tone of tones) {
      const { style } = resolveTextStyle({
        variant: "body",
        tone,
        direction: "ltr",
        theme,
      });
      expect(style.color, tone).toMatch(/^(#|rgba?\()/);
    }
  });
});

describe("button styles", () => {
  it("never renders below the accessible touch-target minimum", () => {
    for (const size of ["md", "lg"] as const) {
      const { container } = resolveButtonStyle({
        variant: "primary",
        size,
        theme,
      });
      expect(container.minHeight, size).toBeGreaterThanOrEqual(
        theme.minTouchTarget,
      );
    }
  });

  it("keeps the primary label readable on the brand surface", () => {
    const { container, labelTone } = resolveButtonStyle({
      variant: "primary",
      theme,
    });
    expect(labelTone).toBe("onBrand");
    const { style } = resolveTextStyle({
      variant: "button",
      tone: labelTone,
      direction: "ltr",
      theme,
    });
    expect(
      contrastRatio(style.color as string, container.backgroundColor as string),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("keeps the secondary label readable on its own surface", () => {
    const { container, labelTone } = resolveButtonStyle({
      variant: "secondary",
      theme,
    });
    const { style } = resolveTextStyle({
      variant: "button",
      tone: labelTone,
      direction: "ltr",
      theme,
    });
    expect(
      contrastRatio(style.color as string, container.backgroundColor as string),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("keeps the inverted label readable on its own surface, and that surface visible on the brand card", () => {
    const { container, labelTone } = resolveButtonStyle({
      variant: "inverted",
      theme,
    });
    const { style } = resolveTextStyle({
      variant: "button",
      tone: labelTone,
      direction: "ltr",
      theme,
    });
    expect(
      contrastRatio(style.color as string, container.backgroundColor as string),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    // The button has to read as a control against the hero it sits on, not only as text on its own fill.
    expect(
      contrastRatio(
        container.backgroundColor as string,
        theme.colors.surface.brand,
      ),
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("uses the control radius at every size — a button is a button, never a pill", () => {
    for (const size of ["md", "lg", "xl"] as const) {
      const { container } = resolveButtonStyle({
        variant: "primary",
        size,
        theme,
      });
      expect(container.borderRadius).toBe(theme.radius.control);
    }
  });

  it("sizes the standard button at 52 and the session's control at 56", () => {
    expect(
      resolveButtonStyle({ variant: "primary", size: "lg", theme }).container
        .minHeight,
    ).toBe(52);
    expect(
      resolveButtonStyle({ variant: "primary", size: "xl", theme }).container
        .minHeight,
    ).toBe(56);
  });

  it("signals disabled with more than colour — opacity plus tone change", () => {
    const enabled = resolveButtonStyle({ variant: "secondary", theme });
    const disabled = resolveButtonStyle({
      variant: "secondary",
      disabled: true,
      theme,
    });
    expect(disabled.container.opacity).toBeLessThan(1);
    expect(enabled.container.opacity ?? 1).toBe(1);
    expect(disabled.labelTone).not.toBe(enabled.labelTone);
  });

  it("does not stack a pressed dim on top of a disabled one", () => {
    const both = resolveButtonStyle({
      variant: "primary",
      disabled: true,
      pressed: true,
      theme,
    });
    const disabledOnly = resolveButtonStyle({
      variant: "primary",
      disabled: true,
      theme,
    });
    expect(both.container.opacity).toBe(disabledOnly.container.opacity);
  });

  it("stretches by default and hugs content when asked", () => {
    expect(
      resolveButtonStyle({ variant: "primary", theme }).container.alignSelf,
    ).toBe("stretch");
    expect(
      resolveButtonStyle({ variant: "primary", fullWidth: false, theme })
        .container.alignSelf,
    ).toBe("flex-start");
  });

  it("uses only logical layout values — no physical left/right", () => {
    const { container } = resolveButtonStyle({ variant: "primary", theme });
    for (const key of Object.keys(container)) {
      expect(key, `${key} is a physical direction property`).not.toMatch(
        /(^|[a-z])(Left|Right)$/,
      );
    }
  });
});

describe("card styles", () => {
  it("is flat by default and elevated only on request", () => {
    expect(resolveCardStyle({ theme }).shadowOpacity).toBeUndefined();
    expect(resolveCardStyle({ elevated: true, theme }).shadowOpacity).toBe(
      theme.shadow.card.shadowOpacity,
    );
  });

  it("draws one card radius whatever emphasis a legacy caller passes", () => {
    for (const emphasis of ["default", "feature"] as const) {
      const radius = resolveCardStyle({ emphasis, theme })
        .borderRadius as number;
      expect(radius).toBe(theme.radius.object);
    }
  });

  it("keeps padding on the spacing grid", () => {
    for (const padding of [
      "none",
      "compact",
      "comfortable",
      "spacious",
    ] as const) {
      expect((resolveCardStyle({ padding, theme }).padding as number) % 4).toBe(
        0,
      );
    }
  });

  it("carries a 1px hairline border", () => {
    expect(resolveCardStyle({ theme }).borderWidth).toBe(1);
  });

  it("draws tinted and brand surfaces edge-to-fill, keeping the border width so content never shifts", () => {
    const raised = resolveCardStyle({ theme });
    for (const surface of [
      "brand",
      "tintSage",
      "tintWarm",
      "tintCool",
    ] as const) {
      const style = resolveCardStyle({ surface, theme });
      expect(style.borderWidth, surface).toBe(raised.borderWidth);
      expect(style.borderColor, surface).toBe(style.backgroundColor);
      expect(style.padding, surface).toBe(raised.padding);
    }
    expect(raised.borderColor).toBe(theme.colors.border.subtle);
  });

  it("resolves each surface to its own colour role", () => {
    expect(resolveCardStyle({ surface: "brand", theme }).backgroundColor).toBe(
      theme.colors.surface.brand,
    );
    expect(
      resolveCardStyle({ surface: "tintSage", theme }).backgroundColor,
    ).toBe(theme.colors.surface.tintSage);
  });

  it("changes surface on press", () => {
    expect(resolveCardStyle({ pressed: true, theme }).backgroundColor).toBe(
      theme.colors.surface.pressed,
    );
  });

  it("uses only logical layout values — no physical left/right", () => {
    const style = resolveCardStyle({ theme });
    for (const key of Object.keys(style)) {
      expect(key, `${key} is a physical direction property`).not.toMatch(
        /(^|[a-z])(Left|Right)$/,
      );
    }
  });
});
