import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, useTheme } from "@pawcue/ui";
import { NavGlyph, type NavGlyphName } from "../../src/components/NavGlyph";

/**
 * The primary navigation.
 *
 * Four destinations, which is the product's whole surface: what to train today, what else there is to train,
 * what has been trained, and the dog itself. Settings stays reachable from Dog rather than becoming a fifth —
 * it is somewhere you go occasionally, not one of the four things the app is for.
 *
 * The clicker keeps its own route rather than a tab. It is the product's wedge and must stay one tap away, but it
 * is a tool rather than a place, and giving it equal billing with Today would say the opposite.
 *
 * `Tabs` provides the navigator, so switching destinations does not remount them or lose scroll position, while a
 * custom bar keeps the design system in charge of how it looks and how it mirrors.
 */

const DESTINATIONS: Array<{
  name: string;
  route: string;
  glyph: NavGlyphName;
  labelKey: string;
}> = [
  {
    name: "index",
    route: "/",
    glyph: "nav-today",
    labelKey: "common.nav.today",
  },
  {
    name: "train",
    route: "/train",
    glyph: "nav-train",
    labelKey: "common.nav.train",
  },
  {
    name: "progress",
    route: "/progress",
    glyph: "nav-progress",
    labelKey: "common.nav.progress",
  },
  { name: "dog", route: "/dog", glyph: "nav-dog", labelKey: "common.nav.dog" },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={() => <PawCueTabBar />}
    >
      {DESTINATIONS.map((destination) => (
        <Tabs.Screen key={destination.name} name={destination.name} />
      ))}
    </Tabs>
  );
}

function PawCueTabBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: theme.colors.surface.raised,
        borderTopWidth: theme.border.hairline,
        borderTopColor: theme.colors.border.subtle,
        paddingTop: theme.space[2],
        // The home indicator sits under the bar; without this the last row of labels is unreachable.
        paddingBottom: insets.bottom + theme.space[2],
        paddingHorizontal: theme.space[2],
      }}
      accessibilityRole="tablist"
      testID="tab-bar"
    >
      {DESTINATIONS.map((destination) => {
        const selected =
          destination.route === "/"
            ? pathname === "/"
            : pathname.startsWith(destination.route);
        const label = t(destination.labelKey);

        return (
          <Pressable
            key={destination.name}
            onPress={() => {
              // `navigate` rather than `push`: tapping a destination you are already on should do nothing, not
              // stack a second copy of it.
              if (!selected) router.navigate(destination.route);
            }}
            accessibilityRole="tab"
            accessibilityLabel={label}
            /** The selected tab is announced, not merely tinted. */
            accessibilityState={{ selected }}
            testID={`tab-${destination.name}`}
            style={{
              flex: 1,
              alignItems: "center",
              gap: theme.space[1],
              // Keeps the whole tab tappable at the minimum target height regardless of glyph size.
              minHeight: theme.minTouchTarget,
              justifyContent: "center",
            }}
          >
            <NavGlyph name={destination.glyph} active={selected} />
            <Text
              variant="caption"
              tone={selected ? "brand" : "muted"}
              align="center"
              style={selected ? { fontWeight: "600" } : undefined}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
