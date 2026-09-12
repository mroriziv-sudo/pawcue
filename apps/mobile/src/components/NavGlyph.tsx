import { View } from "react-native";
import { Icon, useTheme } from "@pawcue/ui";

export type NavGlyphName =
  "nav-today" | "nav-train" | "nav-progress" | "nav-dog";

/**
 * The four primary-navigation glyphs.
 *
 * Drawn from primitives rather than pulled from an icon library: the design system's `Icon` deliberately renders
 * whatever children it is given, and adding a font or SVG dependency for four shapes would be a large amount of
 * weight for a small amount of art. They are simple on purpose — this is navigation, not decoration.
 *
 * `Icon` wraps each one so RTL mirroring stays a single registered decision per glyph (see icon-mirroring.ts):
 * `nav-progress` mirrors because ascending bars read as growth along the reading direction; the other three are
 * orientation-independent and do not.
 */
export function NavGlyph({
  name,
  active,
  size = 24,
}: {
  name: NavGlyphName;
  active: boolean;
  size?: number;
}) {
  const theme = useTheme();
  // Colour alone never carries the selected state — the tab bar also bolds the label and marks it selected for
  // assistive technology. This is reinforcement, not the signal.
  const tint = active ? theme.colors.brand.primary : theme.colors.text.muted;
  const unit = size / 6;

  return (
    <Icon name={name} size={size}>
      {name === "nav-today" ? (
        // A day: a rounded square with a filled marker, like a date on a calendar.
        <View
          style={{
            width: unit * 5,
            height: unit * 5,
            borderRadius: unit * 1.4,
            borderWidth: 2,
            borderColor: tint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: unit * 1.6,
              height: unit * 1.6,
              borderRadius: unit,
              backgroundColor: tint,
            }}
          />
        </View>
      ) : null}

      {name === "nav-train" ? (
        // A stack of lessons: three stacked bars, the top one emphasised.
        <View style={{ gap: unit * 0.7, alignItems: "center" }}>
          {[0, 1, 2].map((row) => (
            <View
              key={row}
              style={{
                width: unit * 5,
                height: unit * 0.9,
                borderRadius: unit * 0.45,
                backgroundColor: tint,
                opacity: row === 0 ? 1 : 0.45,
              }}
            />
          ))}
        </View>
      ) : null}

      {name === "nav-progress" ? (
        // Ascending bars. Mirrored in RTL so growth follows the reading direction.
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: unit * 0.6,
          }}
        >
          {[2, 3.4, 4.8].map((height, index) => (
            <View
              key={index}
              style={{
                width: unit * 1.1,
                height: unit * height,
                borderRadius: unit * 0.5,
                backgroundColor: tint,
                opacity: index === 2 ? 1 : 0.5,
              }}
            />
          ))}
        </View>
      ) : null}

      {name === "nav-dog" ? (
        // A paw: three toes over a pad.
        <View style={{ alignItems: "center", gap: unit * 0.35 }}>
          <View style={{ flexDirection: "row", gap: unit * 0.45 }}>
            {[0, 1, 2].map((toe) => (
              <View
                key={toe}
                style={{
                  width: unit * 1.15,
                  height: unit * 1.35,
                  borderRadius: unit,
                  backgroundColor: tint,
                  opacity: toe === 1 ? 1 : 0.75,
                }}
              />
            ))}
          </View>
          <View
            style={{
              width: unit * 3.6,
              height: unit * 2.4,
              borderTopStartRadius: unit * 1.8,
              borderTopEndRadius: unit * 1.8,
              borderBottomStartRadius: unit * 1.2,
              borderBottomEndRadius: unit * 1.2,
              backgroundColor: tint,
            }}
          />
        </View>
      ) : null}
    </Icon>
  );
}
