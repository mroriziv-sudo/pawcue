import { render, screen } from "@testing-library/react-native";
import { I18nManager, StyleSheet } from "react-native";
import { Text, ThemeProvider } from "@pawcue/ui";

/**
 * Hebrew text must sit on the reading edge on a real RTL build.
 *
 * React Native flips `left`/`right` text alignment on its own whenever the native hierarchy is laid out
 * right-to-left, so the value the primitive hands it has to be pre-flipped. Found on the Phase 10 development
 * build (docs/architecture/phase-10-native-acceptance.md): with the simulator in Hebrew, every paragraph landed
 * flush-left. The render tests never saw it because Jest, like Expo Go, reports a native LTR layout.
 */

async function renderText(direction: "ltr" | "rtl", nativeRtl: boolean) {
  const before = I18nManager.isRTL;
  I18nManager.isRTL = nativeRtl;
  try {
    await render(
      <ThemeProvider direction={direction}>
        <Text testID="sample">לאמן את הכלב שלכם כמה דקות ביום.</Text>
      </ThemeProvider>,
    );
  } finally {
    I18nManager.isRTL = before;
  }
  return StyleSheet.flatten(screen.getByTestId("sample").props.style);
}

describe("Text alignment on a native RTL layout", () => {
  it("hands React Native the opposite edge, so its own flip lands the text on the right", async () => {
    const style = await renderText("rtl", true);
    expect(style.textAlign).toBe("left");
    expect(style.writingDirection).toBe("rtl");
  });

  it("keeps the physical edge while the native layout still lags the language", async () => {
    // Hebrew chosen in Settings, app not yet relaunched: nothing is flipped natively.
    expect((await renderText("rtl", false)).textAlign).toBe("right");
  });

  it("is unchanged for English on an English layout", async () => {
    expect((await renderText("ltr", false)).textAlign).toBe("left");
  });
});
