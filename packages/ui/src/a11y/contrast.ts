/**
 * WCAG 2.1 contrast maths (§1.4.3 / §1.4.11).
 *
 * Contrast is treated as a testable constraint rather than a design opinion: the token tests assert real ratios for
 * every text/background pair the design system ships, so a palette change that breaks legibility fails CI instead
 * of shipping.
 */

/** WCAG 2.1 AA minimum for body text. */
export const AA_NORMAL_TEXT = 4.5;
/** WCAG 2.1 AA minimum for large text (>=18pt regular, or >=14pt bold). */
export const AA_LARGE_TEXT = 3;
/** WCAG 2.1 AA minimum for UI components and graphical objects (§1.4.11). */
export const AA_NON_TEXT = 3;

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb(...)` and `rgba(...)`. Throws on anything else — silent NaN would defeat the point. */
export function parseColor(input: string): Rgb {
  const value = input.trim();

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex?.[1]) {
    const digits = hex[1];
    const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits[0]!),
        g: expand(digits[1]!),
        b: expand(digits[2]!),
        a: digits.length === 4 ? expand(digits[3]!) / 255 : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16),
        a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgb?.[1]) {
    const parts = rgb[1].split(",").map((p) => Number(p.trim()));
    const [r, g, b] = parts;
    const a = parts.length > 3 ? parts[3] : 1;
    if (
      r !== undefined &&
      g !== undefined &&
      b !== undefined &&
      a !== undefined &&
      [r, g, b, a].every(Number.isFinite)
    ) {
      return { r, g, b, a };
    }
  }

  throw new Error(`Unsupported color format: ${input}`);
}

/**
 * Flattens a translucent foreground over an opaque background. Required for correctness: a muted text token defined
 * as `rgba(charcoal, 0.64)` has a very different effective contrast from charcoal itself.
 */
export function flatten(foreground: Rgb, background: Rgb): Rgb {
  const a = foreground.a;
  return {
    r: foreground.r * a + background.r * (1 - a),
    g: foreground.g * a + background.g * (1 - a),
    b: foreground.b * a + background.b * (1 - a),
    a: 1,
  };
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between a (possibly translucent) foreground and an opaque background. Range 1–21. */
export function contrastRatio(foreground: string, background: string): number {
  const bg = parseColor(background);
  if (bg.a !== 1) {
    throw new Error(
      `Background must be opaque to compute contrast, got: ${background}`,
    );
  }
  const fg = flatten(parseColor(foreground), bg);
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsContrast(
  foreground: string,
  background: string,
  minimum: number,
): boolean {
  return contrastRatio(foreground, background) >= minimum;
}
