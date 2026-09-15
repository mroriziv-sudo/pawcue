import { View } from "react-native";
import { Text, Button, useTheme } from "@pawcue/ui";

/**
 * The shared empty and unavailable state.
 *
 * One composition rather than a bespoke layout per screen: an empty Today, an empty Train and a Progress with no
 * history are the same shape of message, and letting each invent its own is how a product starts looking
 * assembled rather than designed.
 *
 * It sits directly on the paper — a headline, a sentence, at most one button — because a message in a card reads
 * as a notice from the system rather than a line from the coach. When the moment carries emotion (a day finished,
 * no dog yet) the screen passes the character as `scene`; an error passes nothing.
 *
 * Both a title and a body are required. A bare title is the state most likely to leave a user stuck: "Nothing to
 * train right now" without a reason reads as a failure rather than as a finished day.
 */
export function EmptyState({
  title,
  body,
  ctaLabel,
  onPress,
  /** A secondary way out — "Just use the clicker" beneath "Add your dog". */
  secondaryLabel,
  onSecondaryPress,
  /** The character, at scene size, above the words. Only where the moment earns it. */
  scene,
  /** The primary control's emphasis. An error's retry is secondary; an invitation is primary. */
  emphasis = "primary",
  testID,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  onPress?: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  scene?: React.ReactNode;
  emphasis?: "primary" | "secondary";
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[5] }} testID={testID}>
      {scene ? (
        <View style={{ alignItems: "center", paddingTop: theme.space[4] }}>
          {scene}
        </View>
      ) : null}
      <View style={{ gap: theme.space[2] }}>
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" tone="secondary">
          {body}
        </Text>
      </View>
      {ctaLabel && onPress ? (
        <View style={{ gap: theme.space[2] }}>
          <Button
            label={ctaLabel}
            variant={emphasis}
            onPress={onPress}
            {...(testID ? { testID: `${testID}-cta` } : {})}
          />
          {secondaryLabel && onSecondaryPress ? (
            <Button
              label={secondaryLabel}
              variant="tertiary"
              onPress={onSecondaryPress}
              {...(testID ? { testID: `${testID}-secondary` } : {})}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
