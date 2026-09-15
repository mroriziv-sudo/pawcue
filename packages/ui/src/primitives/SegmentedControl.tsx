import { Pressable, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * One choice among a few short ones — the daily training goal, a coarse filter.
 *
 * A single track on the white surface with the chosen segment filled in the brand colour: the platform's
 * segmented control, drawn with the design system's radius so it matches the buttons around it. Selection is
 * announced as a checked radio, never shown by colour alone (the fill is also a shape change), and each segment
 * clears the accessible target height.
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{
        flexDirection: "row",
        padding: 3,
        borderRadius: theme.radius.control,
        borderWidth: theme.border.hairline,
        borderColor: theme.colors.border.separator,
        backgroundColor: theme.colors.surface.raised,
        gap: 3,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ checked: selected, selected }}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={({ pressed }) => ({
              flex: 1,
              // The segment is the pressable, so it — not the track — clears the platform minimum.
              minHeight: 44,
              borderRadius: theme.radius.control - 3,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: theme.space[2],
              backgroundColor: selected
                ? theme.colors.brand.primary
                : pressed
                  ? theme.colors.surface.pressed
                  : "transparent",
            })}
          >
            <Text
              variant="buttonCompact"
              tone={selected ? "onBrand" : "primary"}
              align="center"
              tabular
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
