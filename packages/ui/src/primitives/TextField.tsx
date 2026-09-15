import { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { useTheme, useDirection } from "../theme/ThemeProvider";
import { Text } from "./Text";
import { Glyph } from "./Glyph";

export interface TextFieldProps extends Pick<
  TextInputProps,
  | "value"
  | "onChangeText"
  | "placeholder"
  | "keyboardType"
  | "autoCapitalize"
  | "autoCorrect"
  | "autoFocus"
  | "maxLength"
  | "returnKeyType"
  | "onSubmitEditing"
  | "inputMode"
> {
  /** Always visible — never a placeholder standing in for a label. */
  label: string;
  /** Read below the field while there is no error. */
  hint?: string;
  /** Replaces the hint, and marks the field. Paired with an icon, never colour alone. */
  error?: string;
  /** A mark on the leading edge — a magnifier for a search field. Decorative. */
  leading?: React.ReactNode;
  /** A control on the trailing edge — a clear button. */
  trailing?: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  /** Lands on the error message, so a flow can assert the message it expects without reaching into the field. */
  errorTestID?: string;
  /** `large` is the one-question field — a name, on its own screen — set a size up so the answer reads as the answer. */
  size?: "default" | "large";
  /** The screen's headline is the label: keep it for assistive technology, draw nothing above the field. */
  labelHidden?: boolean;
}

/**
 * A labelled text input.
 *
 * One component rather than a style object copied between screens: the label sits above the field (a
 * placeholder is not a label — it disappears on the first keystroke), the field grows with Dynamic Type, text
 * aligns to the reading edge in either direction, focus is shown with the brand edge, and an error is shown with
 * the error edge *and* an alert mark *and* a message beneath — three signals, so none has to carry it alone.
 */
export function TextField({
  label,
  hint,
  error,
  leading,
  trailing,
  accessibilityLabel,
  testID,
  errorTestID,
  size = "default",
  labelHidden = false,
  ...input
}: TextFieldProps) {
  const theme = useTheme();
  const direction = useDirection();
  const [focused, setFocused] = useState(false);

  const edge = error
    ? theme.colors.status.error
    : focused
      ? theme.colors.brand.primary
      : theme.colors.border.subtle;

  return (
    <View style={{ gap: theme.space[1] }}>
      {labelHidden ? null : (
        <Text variant="secondary" tone="secondary">
          {label}
        </Text>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space[2],
          minHeight: size === "large" ? 60 : theme.minTouchTarget + 4,
          paddingHorizontal: size === "large" ? theme.space[4] : theme.space[3],
          borderRadius: theme.radius.field,
          borderWidth:
            focused || error ? theme.border.focus : theme.border.hairline,
          // Keeps the layout still when the border thickens on focus.
          margin:
            focused || error ? 0 : theme.border.focus - theme.border.hairline,
          borderColor: edge,
          backgroundColor: theme.colors.surface.raised,
        }}
      >
        {leading ? (
          <View accessibilityElementsHidden importantForAccessibility="no">
            {leading}
          </View>
        ) : null}
        <TextInput
          {...input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={theme.colors.text.disabled}
          accessibilityLabel={accessibilityLabel ?? label}
          testID={testID}
          maxFontSizeMultiplier={1.6}
          style={{
            flex: 1,
            paddingVertical: theme.space[3],
            fontSize:
              size === "large"
                ? theme.typography.title.fontSize + 2
                : theme.typography.body.fontSize,
            fontWeight: size === "large" ? "600" : "400",
            color: theme.colors.text.primary,
            // Logical alignment, so Hebrew input starts on the correct edge.
            textAlign: direction === "rtl" ? "right" : "left",
            writingDirection: direction,
          }}
        />
        {trailing}
      </View>
      {error ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space[1],
          }}
        >
          <Glyph name="alert" size={16} color={theme.colors.text.error} />
          <Text
            variant="secondary"
            tone="error"
            style={{ flex: 1 }}
            {...(errorTestID ? { testID: errorTestID } : {})}
          >
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
