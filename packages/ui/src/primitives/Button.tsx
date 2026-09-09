import { ActivityIndicator, View, type AccessibilityProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import {
  resolveButtonStyle,
  type ButtonSize,
  type ButtonVariant,
} from "./styles/button-styles";

export interface ButtonProps extends Pick<
  AccessibilityProps,
  "accessibilityHint"
> {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Rendered before the label in reading order — which flips automatically in RTL via `flexDirection: "row"`. */
  icon?: React.ReactNode;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  disabled = false,
  loading = false,
  fullWidth = true,
  icon,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  /** A loading button is not interactive, so it is disabled for both styling and assistive technology. */
  const isInactive = disabled || loading;
  const resolved = resolveButtonStyle({
    variant,
    size,
    disabled: isInactive,
    fullWidth,
    theme,
  });

  return (
    <PressableScale
      scaleToken="button"
      onPress={onPress}
      disabled={isInactive}
      style={resolved.container}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      /**
       * State is announced, not merely drawn. `busy` tells a screen-reader user that a spinner is showing, which
       * they cannot see — the brief's rule that meaning never depends on a visual signal alone.
       */
      accessibilityState={{ disabled: isInactive, busy: loading }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "primary"
              ? theme.colors.text.onBrand
              : theme.colors.brand.primary
          }
          /** The label already announces the action; the spinner is decorative to assistive tech. */
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : (
        <>
          {icon != null && <View accessibilityElementsHidden>{icon}</View>}
          <Text
            variant={resolved.labelVariant}
            tone={resolved.labelTone}
            align="center"
            style={resolved.label}
          >
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}
