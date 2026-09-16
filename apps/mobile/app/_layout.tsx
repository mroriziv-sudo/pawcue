import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ThemeProvider, defaultTheme } from "@pawcue/ui";
import { renderSystemSymbol } from "../src/components/SystemSymbol";
import { i18n } from "../src/i18n";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useSettingsStore } from "../src/state/settings-store";
import { isRtlLocale } from "@pawcue/i18n";
import { installClickerDiagnostics } from "../src/audio/clicker-diagnostics";
import { installSessionDevBridge } from "../src/state/session-store";
import {
  installAccountDevBridge,
  installAppleRevocationHandler,
} from "../src/state/account-lifecycle";

// Development-only. Exposes the clicker trace harness on `globalThis.__clickerDiag`; a no-op in release.
installClickerDiagnostics();
// Development-only. Exposes the session store for simulator acceptance; a no-op in release.
installSessionDevBridge();
// Development-only. Exposes sign-out / deletion for simulator acceptance; a no-op in release.
installAccountDevBridge();
// Apple revoking the app's credential signs this device out. Process-lifetime; nothing to unsubscribe.
installAppleRevocationHandler();

/**
 * The native launch screen is the dog on paper (app.json → expo-splash-screen). It stays up until settings have
 * hydrated and the first real screen can render, so a cold launch never shows a blank frame or a spinner between
 * the icon and the app — the dog is what the user sees for every load. Hidden with a short fade once ready.
 */
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 200, fade: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
  },
});

export default function RootLayout() {
  const status = useBootstrapStore((s) => s.status);
  const bootstrap = useBootstrapStore((s) => s.bootstrap);
  const language = useSettingsStore((s) => s.language);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === "ready") void SplashScreen.hideAsync();
  }, [status]);

  /**
   * Held until settings hydrate, so the app never paints English/LTR and then snaps to Hebrew/RTL a frame later.
   * The native splash covers this wait; the spinner beneath it is only ever seen if the splash was hidden early.
   * This wait is local storage only; nothing here blocks on the network.
   */
  if (status !== "ready") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: defaultTheme.colors.background.base,
        }}
      >
        <ActivityIndicator color={defaultTheme.colors.brand.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        {/* Direction is passed explicitly so the React tree agrees with I18nManager even before a reload lands. */}
        <ThemeProvider
          direction={isRtlLocale(language) ? "rtl" : "ltr"}
          renderGlyph={renderSystemSymbol}
        >
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: defaultTheme.colors.background.base,
                },
              }}
            />
          </QueryClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
