import { View } from "react-native";
import { useIsRtl } from "../theme/ThemeProvider";
import { iconScaleX, type IconName } from "../tokens/icon-mirroring";
import { hitSlopFor, MIN_TOUCH_TARGET } from "../tokens/layout";

export interface IconProps {
  /** Must be registered in icon-mirroring.ts — an unregistered name throws rather than guessing a direction. */
  name: IconName;
  size?: number;
  children: React.ReactNode;
  /**
   * Icons are decorative by default and hidden from assistive tech, because the surrounding control almost always
   * carries the accessible name. Pass a label only for a genuinely standalone icon.
   */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Applies RTL mirroring per the allow-list. Wrapping every glyph in this is what makes mirroring a decision made
 * once per icon rather than a judgement call at each call site — a back arrow that fails to flip in Hebrew is a
 * navigation bug, and a mirrored clicker glyph is a brand bug.
 *
 * Glyph artwork is Phase 1-agnostic: this renders whatever `children` it is given, so the real icon set can land
 * later without touching the mirroring logic.
 */
export function Icon({
  name,
  size = 24,
  children,
  accessibilityLabel,
  testID,
}: IconProps) {
  const isRtl = useIsRtl();
  const scaleX = iconScaleX(name, isRtl);
  const decorative = accessibilityLabel === undefined;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scaleX }],
      }}
      /** Keeps an icon-only control tappable at 48pt even when the glyph itself is smaller. */
      hitSlop={hitSlopFor(size, MIN_TOUCH_TARGET)}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no-hide-descendants" : "yes"}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={decorative ? undefined : "image"}
      testID={testID}
    >
      {children}
    </View>
  );
}
