import { Pressable } from "react-native";
import { Glyph, Text, useTheme } from "@pawcue/ui";

/**
 * One of two or three short options, side by side: the one card type, a standalone tappable object.
 *
 * Selection is the brand edge plus a check — a shape change, never colour alone — and is announced as a radio.
 * The border thickens on selection and the margin gives the difference back, so choosing an option moves
 * nothing. Used for a dog's sex in onboarding and in the editor; the same tile in both places is the point.
 */
export function OptionTile({
  label,
  selected,
  onPress,
  minHeight = 88,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  minHeight?: number;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      testID={testID}
      style={({ pressed }) => ({
        flex: 1,
        minHeight,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: theme.space[2],
        padding: theme.space[4],
        borderRadius: theme.radius.object,
        borderWidth: selected ? theme.border.focus : theme.border.hairline,
        borderColor: selected
          ? theme.colors.brand.primary
          : theme.colors.border.separator,
        backgroundColor: pressed
          ? theme.colors.surface.pressed
          : theme.colors.surface.raised,
        margin: selected ? 0 : theme.border.focus - theme.border.hairline,
      })}
    >
      {selected ? (
        <Glyph name="check" size={18} color={theme.colors.brand.primary} />
      ) : null}
      <Text variant="bodyStrong" align="center">
        {label}
      </Text>
    </Pressable>
  );
}
