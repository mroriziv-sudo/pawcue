import { Glyph, useTheme } from "@pawcue/ui";

/**
 * The clicker's mark, small: the box clicker seen from above, drawn in evergreen ink with no fill.
 *
 * Used where the clicker is a place to go rather than a thing to press — the toolbar control on Today. It used to
 * be a filled squircle, which made two dark objects on Today beside the primary button
 * (phase-10-native-acceptance.md, finding 3); the glyph alone is the control, in the ink every other top-bar
 * control uses. Deliberately not mirrored in RTL: it is a physical object (see icon-mirroring.ts). Decorative;
 * the control around it carries the name.
 */
export function ClickerMark({ size = 28 }: { size?: number }) {
  const theme = useTheme();
  return (
    <Glyph
      name="clicker-glyph"
      size={size}
      color={theme.colors.brand.primary}
    />
  );
}
