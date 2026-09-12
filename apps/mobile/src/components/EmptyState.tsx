import { View } from "react-native";
import { Text, Card, Button, useTheme } from "@pawcue/ui";

/**
 * The shared empty/unavailable state.
 *
 * One component rather than a bespoke layout per screen: an empty Today, an empty Train and a Progress with no
 * history are the same shape of message, and letting each invent its own is how a product starts looking
 * assembled rather than designed.
 *
 * It lives here rather than in `app/(tabs)/index.tsx`, where it used to. Three route files were importing a
 * component out of a fourth route file, which made Today a de-facto component library and meant a change to the
 * home screen could break the Progress tab. Routes should import from `src/`, never from each other.
 *
 * Both a title and a body are required. A bare title is the state most likely to leave a user stuck: "Nothing to
 * train right now" without a reason reads as a failure rather than as a finished day.
 */
export function EmptyState({
  title,
  body,
  ctaLabel,
  onPress,
  testID,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    // Optional props are spread rather than passed as undefined: with `exactOptionalPropertyTypes`, absent and
    // present-but-undefined are different types.
    <Card padding="comfortable" {...(testID ? { testID } : {})}>
      <View style={{ gap: theme.space[2] }}>
        <Text variant="h3">{title}</Text>
        <Text variant="body" tone="muted">
          {body}
        </Text>
        {ctaLabel && onPress ? (
          <>
            <View style={{ height: theme.space[1] }} />
            <Button
              label={ctaLabel}
              onPress={onPress}
              {...(testID ? { testID: `${testID}-cta` } : {})}
            />
          </>
        ) : null}
      </View>
    </Card>
  );
}
