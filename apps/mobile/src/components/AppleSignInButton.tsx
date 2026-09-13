import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Button, useTheme } from "@pawcue/ui";
import { appleSignInAvailable } from "../providers/apple-sign-in";

/**
 * Apple's own "Continue with Apple" button, where it exists.
 *
 * App Store Guideline 4.8 and the Human Interface Guidelines want Apple's button, not a lookalike: the system
 * control (`ASAuthorizationAppleIDButton`) is the one thing guaranteed to carry the approved title, logo,
 * proportions and — through `CFBundleAllowMixedLocalizations`, set by the module's config plugin — Apple's own
 * Hebrew localisation. So on iOS, when the OS says Sign in with Apple is available, that control is rendered.
 *
 * Everywhere else (Android, a simulator without the capability, the web preview) the design system's button
 * stands in with the same label, so the layout does not jump and the action stays reachable — the provider
 * behind it reports "not available" honestly when pressed.
 *
 * `loading` is honoured by rendering the fallback: the native control has no busy state, and a screen reader
 * must be told the action is in progress (DESIGN_SYSTEM.md). The label is what the design-system button
 * announces; the native button announces Apple's.
 */
export function AppleSignInButton({
  label,
  onPress,
  loading = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const [nativeAvailable, setNativeAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void appleSignInAvailable().then((available) => {
      if (!cancelled) setNativeAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (Platform.OS === "ios" && nativeAvailable && !loading) {
    return (
      <View testID={testID ? `${testID}-native` : undefined}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={theme.radius.buttonLarge}
          onPress={onPress}
          style={{ width: "100%", height: 56 }}
          {...(testID ? { testID } : {})}
        />
      </View>
    );
  }

  return (
    <Button
      label={label}
      onPress={onPress}
      loading={loading}
      {...(testID ? { testID } : {})}
    />
  );
}
