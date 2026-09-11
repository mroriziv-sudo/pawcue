import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ThemeProvider, defaultTheme } from "@pawcue/ui";
import { i18n } from "../src/i18n";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useSettingsStore } from "../src/state/settings-store";
import { isRtlLocale } from "@pawcue/i18n";
import { installClickerDiagnostics } from "../src/audio/clicker-diagnostics";

// Development-only. Exposes the clicker trace harness on `globalThis.__clickerDiag`; a no-op in release.
installClickerDiagnostics();

/**
 * `retry: false` and no refetch-on-focus: the product must behave predictably offline (brief §28), and silent
 * background refetching would fight the offline-first cache rather than complement it. Retry policy belongs with
 * the sync queue introduced later, not as a global default.
 */
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

  /**
   * Held until settings hydrate — a single spinner is better than painting English/LTR and then snapping to
   * Hebrew/RTL a frame later. This wait is local storage only; nothing here blocks on the network.
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
        <ThemeProvider direction={isRtlLocale(language) ? "rtl" : "ltr"}>
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
