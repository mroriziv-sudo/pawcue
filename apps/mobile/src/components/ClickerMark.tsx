import { View } from "react-native";
import { CLICKER_CORNER_RATIO, Glyph, useTheme } from "@pawcue/ui";

/**
 * The clicker's mark, small: the squircle the clicker is built on, flat ink, at control size.
 *
 * Used where the clicker is a place to go rather than a thing to press — the toolbar control on Today, the
 * equipment line on a lesson. Deliberately not mirrored in RTL: it is a physical object (see icon-mirroring.ts).
 * Decorative; the control around it carries the name.
 */
export function ClickerMark({ size = 40 }: { size?: number }) {
  const theme = useTheme();
  const radius = Math.round(size * CLICKER_CORNER_RATIO);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: theme.colors.brand.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Glyph
        name="clicker-glyph"
        size={Math.round(size * 0.55)}
        color={theme.colors.text.onBrand}
      />
    </View>
  );
}
