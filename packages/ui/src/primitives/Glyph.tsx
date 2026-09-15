import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useGlyphRenderer, useTheme } from "../theme/ThemeProvider";
import { Icon } from "./Icon";
import type { IconName } from "../tokens/icon-mirroring";

/**
 * The product's marks.
 *
 * Two kinds share one name space. **Standard** marks (check, chevron, lock, search…) are the ones every platform
 * already draws well; on iOS the app injects a renderer that returns the matching SF Symbol (see `ThemeProvider`
 * and the mobile app's `renderSystemSymbol`), and the vector paths below are what Android and the test renderer
 * draw. **Training** marks (the clicker, the treat, a target behaviour) exist in no library and are always drawn
 * from the paths here.
 *
 * Every path is authored on a 24-unit grid at SF Symbols' medium optical weight — a 1.8-unit round-capped stroke —
 * so the two sources sit beside each other without a visible seam.
 */
export type GlyphName =
  // Standard.
  | "check"
  | "chevron-end"
  | "chevron-start"
  | "clock"
  | "lock"
  | "unlock"
  | "play"
  | "pause"
  | "repeat"
  | "alert"
  | "plus"
  | "minus"
  | "close"
  | "search"
  | "undo"
  | "photo"
  // Training and product.
  | "clicker-glyph"
  | "treat"
  | "target";

/** Marks a platform symbol set may substitute. The rest are the product's own and always come from the paths here. */
export const STANDARD_GLYPHS: ReadonlySet<GlyphName> = new Set<GlyphName>([
  "check",
  "chevron-end",
  "chevron-start",
  "clock",
  "lock",
  "unlock",
  "play",
  "pause",
  "repeat",
  "alert",
  "plus",
  "minus",
  "close",
  "search",
  "undo",
  "photo",
]);

export interface GlyphProps {
  name: GlyphName;
  size?: number;
  color?: string;
  testID?: string;
}

export function Glyph({ name, size = 20, color, testID }: GlyphProps) {
  const theme = useTheme();
  const renderGlyph = useGlyphRenderer();
  const tint = color ?? theme.colors.text.primary;

  const injected = renderGlyph?.({ name, size, color: tint });

  return (
    <Icon
      name={name satisfies IconName}
      size={size}
      {...(testID ? { testID } : {})}
    >
      {injected ?? <VectorGlyph name={name} size={size} color={tint} />}
    </Icon>
  );
}

/** The drawn set. Exported for the dev preview, which shows every mark from both sources side by side. */
export function VectorGlyph({
  name,
  size,
  color,
}: {
  name: GlyphName;
  size: number;
  color: string;
}) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {draw(name, color, stroke)}
    </Svg>
  );
}

type Stroke = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: "round";
  strokeLinejoin: "round";
  fill: string;
};

function draw(name: GlyphName, fill: string, s: Stroke) {
  switch (name) {
    case "check":
      return <Path d="M5 12.5l4.5 4.5L19 7.5" {...s} />;
    case "chevron-end":
      return <Path d="M9 5l7 7-7 7" {...s} />;
    case "chevron-start":
      return <Path d="M15 5l-7 7 7 7" {...s} />;
    case "clock":
      return (
        <>
          <Circle cx={12} cy={12} r={8.6} {...s} />
          <Path d="M12 7.2V12l3.2 2" {...s} />
        </>
      );
    case "lock":
      return (
        <>
          <Path d="M8 10V7.2a4 4 0 0 1 8 0V10" {...s} />
          <Rect x={5} y={10} width={14} height={10} rx={2.6} {...s} />
          <Circle cx={12} cy={15} r={1.3} fill={fill} />
        </>
      );
    case "unlock":
      return (
        <>
          <Path d="M16 10V7.2a4 4 0 0 0-7.6-1.7" {...s} />
          <Rect x={5} y={10} width={14} height={10} rx={2.6} {...s} />
          <Circle cx={12} cy={15} r={1.3} fill={fill} />
        </>
      );
    case "play":
      return (
        <Path
          d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"
          fill={fill}
        />
      );
    case "pause":
      return (
        <>
          <Rect x={6.2} y={5} width={3.8} height={14} rx={1.4} fill={fill} />
          <Rect x={14} y={5} width={3.8} height={14} rx={1.4} fill={fill} />
        </>
      );
    case "repeat":
      return (
        <>
          <Path d="M19.5 12A7.5 7.5 0 1 0 15.75 5.5" {...s} />
          <Path d="M12.6 4.4l3.3 1.1-1.1 3.3" {...s} />
        </>
      );
    case "alert":
      return (
        <>
          <Circle cx={12} cy={12} r={8.6} {...s} />
          <Path d="M12 7.6v5.2" {...s} />
          <Circle cx={12} cy={16.4} r={1.15} fill={fill} />
        </>
      );
    case "plus":
      return <Path d="M12 5v14M5 12h14" {...s} />;
    case "minus":
      return <Path d="M5 12h14" {...s} />;
    case "close":
      return <Path d="M6 6l12 12M18 6L6 18" {...s} />;
    case "search":
      return (
        <>
          <Circle cx={10.5} cy={10.5} r={6.4} {...s} />
          <Path d="M15.4 15.4L20 20" {...s} />
        </>
      );
    case "undo":
      return (
        <>
          <Path d="M9 14L4 9l5-5" {...s} />
          <Path d="M4 9h9.5a5.5 5.5 0 0 1 0 11H11" {...s} />
        </>
      );
    case "photo":
      return (
        <>
          <Rect x={3.5} y={4.5} width={17} height={15} rx={2.6} {...s} />
          <Path d="M4.5 16.6l4.6-5.1 3.6 4 2.4-2.8 4.4 3.9" {...s} />
          <Circle cx={16} cy={8.8} r={1.5} fill={fill} />
        </>
      );
    case "clicker-glyph":
      // A box clicker seen from above: the body, and the raised button offset to one end. A physical object, so
      // it is registered never-mirrored.
      return (
        <>
          <Rect x={3} y={7} width={18} height={10} rx={3.2} {...s} />
          <Circle cx={15.8} cy={12} r={2.5} fill={fill} />
        </>
      );
    case "treat":
      // A round training treat with one bite taken out of it. Filled: it is the reward mark.
      return (
        <Path
          d="M14.77 5.53A7.5 7.5 0 1 0 19.21 10.39A3.4 3.4 0 0 1 14.77 5.53z"
          fill={fill}
        />
      );
    case "target":
      return (
        <>
          <Circle cx={12} cy={12} r={8.6} {...s} />
          <Circle cx={12} cy={12} r={4.4} {...s} />
          <Circle cx={12} cy={12} r={1.3} fill={fill} />
        </>
      );
  }
}
