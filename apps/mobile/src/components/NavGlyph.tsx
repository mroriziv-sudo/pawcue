import Svg, { Circle, Path } from "react-native-svg";
import { Icon, useTheme } from "@pawcue/ui";

export type NavGlyphName =
  "nav-today" | "nav-train" | "nav-progress" | "nav-dog";

/**
 * The four primary-navigation marks.
 *
 * Drawn on the same 24-unit grid and at the same stroke weight as the product's other marks, so the tab bar
 * belongs to the same hand as the rest of the interface. Each says what its destination *is* — a day, an open
 * notebook of lessons, a route with three stops, a dog — rather than borrowing an abstract shape from a kit.
 *
 * `Icon` wraps each one so RTL mirroring stays a single registered decision per glyph (see icon-mirroring.ts):
 * `nav-progress` mirrors because a route reads along the reading direction; the other three are
 * orientation-independent and do not.
 *
 * The active state is a fill, not only a tint: the tab bar also bolds the label and marks the tab selected for
 * assistive technology.
 */
export function NavGlyph({
  name,
  active,
  size = 28,
}: {
  name: NavGlyphName;
  active: boolean;
  size?: number;
}) {
  const theme = useTheme();
  const tint = active
    ? theme.colors.brand.primary
    : theme.colors.text.secondary;
  const stroke = {
    stroke: tint,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  return (
    <Icon name={name} size={size}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === "nav-today" ? (
          // A day: the sun over a low horizon.
          <>
            <Path d="M4 18.5h16" {...stroke} />
            <Path
              d="M7 18.5a5 5 0 0 1 10 0"
              {...stroke}
              fill={active ? tint : "none"}
            />
            <Path
              d="M12 6.5v2.2M6.3 9.3l1.6 1.6M17.7 9.3l-1.6 1.6"
              {...stroke}
            />
          </>
        ) : null}

        {name === "nav-train" ? (
          // An open notebook: the lessons.
          <>
            <Path
              d="M12 7.2c-2.2-1.4-4.8-1.6-8-.9v11.5c3.2-.7 5.8-.5 8 .9"
              {...stroke}
              fill={active ? tint : "none"}
            />
            <Path
              d="M12 7.2c2.2-1.4 4.8-1.6 8-.9v11.5c-3.2-.7-5.8-.5-8 .9"
              {...stroke}
              fill={active ? tint : "none"}
            />
            <Path d="M12 7.2v11.5" {...stroke} />
          </>
        ) : null}

        {name === "nav-progress" ? (
          // A route with three stops, reading along the line.
          <>
            <Path d="M6.6 15.6l3.9-4.2M13.6 9.4l3.6-2" {...stroke} />
            <Circle cx={5} cy={17.5} r={2.2} fill={tint} />
            <Circle
              cx={12}
              cy={10}
              r={2.2}
              {...stroke}
              fill={active ? tint : "none"}
            />
            <Circle
              cx={19}
              cy={6.2}
              r={2.2}
              {...stroke}
              fill={active ? tint : "none"}
            />
          </>
        ) : null}

        {name === "nav-dog" ? (
          // A dog, head on: two ears, a muzzle.
          <>
            <Path
              d="M7.2 6.6C6.4 5 4.6 4.6 3.6 5.2c-.7.4-.6 2.6.2 4.6.4 1 .3 1.6.1 2.4-.6 2.5.7 5.7 4.2 7.1 1.2.5 2.6.7 3.9.7s2.7-.2 3.9-.7c3.5-1.4 4.8-4.6 4.2-7.1-.2-.8-.3-1.4.1-2.4.8-2 .9-4.2.2-4.6-1-.6-2.8-.2-3.6 1.4-1.4-.6-3.2-.8-4.8-.8s-3.4.2-4.8.8z"
              {...stroke}
              fill={active ? tint : "none"}
            />
            <Circle
              cx={12}
              cy={15.2}
              r={1.5}
              fill={active ? theme.colors.background.base : tint}
            />
          </>
        ) : null}
      </Svg>
    </Icon>
  );
}
