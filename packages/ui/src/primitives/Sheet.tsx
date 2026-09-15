import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type AccessibilityProps,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { useReducedMotion } from "../a11y/useReducedMotion";
import { Text } from "./Text";
import { Glyph } from "./Glyph";

export interface SheetProps extends Pick<
  AccessibilityProps,
  "accessibilityLabel"
> {
  visible: boolean;
  onClose: () => void;
  /** The sheet's heading. Read first by assistive technology. */
  title: string;
  /** The label of the close control. Supplied by the screen so it is translated. */
  closeLabel: string;
  /** Sits beside the title — the dog's bust, for a sheet about the dog. Decorative. */
  leading?: React.ReactNode;
  /** Content under the header, scrolling. */
  children: React.ReactNode;
  /** Content pinned beneath the scroll — the one primary action a sheet may carry. */
  footer?: React.ReactNode;
  testID?: string;
}

/**
 * A sheet: the one overlay the product uses.
 *
 * On iOS it is the platform's page sheet — a real modal presentation with the parent visible behind it and the
 * system's swipe-to-dismiss — so troubleshooting can open *over* a session rather than replacing it. Android gets
 * a full-height modal with the same header. Under Reduce Motion the slide becomes a fade.
 *
 * The header is fixed: a title on the reading edge and a Close control on the trailing edge in both directions.
 */
export function Sheet({
  visible,
  onClose,
  title,
  closeLabel,
  leading,
  children,
  footer,
  accessibilityLabel,
  testID,
}: SheetProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType={reduceMotion ? "fade" : "slide"}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      accessibilityViewIsModal
    >
      <View
        style={{ flex: 1, backgroundColor: theme.colors.background.base }}
        accessibilityLabel={accessibilityLabel ?? title}
        testID={testID}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space[3],
            paddingTop: Platform.OS === "ios" ? theme.space[4] : theme.space[8],
            paddingHorizontal: theme.screenGutter,
            paddingBottom: theme.space[3],
          }}
        >
          {leading ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {leading}
            </View>
          ) : null}
          <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            hitSlop={theme.space[2]}
            testID={testID ? `${testID}-close` : undefined}
            style={({ pressed }) => ({
              width: theme.minTouchTarget - 4,
              height: theme.minTouchTarget - 4,
              borderRadius: (theme.minTouchTarget - 4) / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed
                ? theme.colors.surface.pressed
                : theme.colors.surface.raised,
              borderWidth: theme.border.hairline,
              borderColor: theme.colors.border.separator,
            })}
          >
            <Glyph name="close" size={20} color={theme.colors.text.primary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: theme.screenGutter,
            paddingBottom: theme.space[8],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>

        {footer ? (
          <View
            style={{
              paddingHorizontal: theme.screenGutter,
              paddingTop: theme.space[3],
              paddingBottom: theme.space[8],
              borderTopWidth: theme.border.hairline,
              borderTopColor: theme.colors.border.separator,
              backgroundColor: theme.colors.background.base,
            }}
          >
            {footer}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
