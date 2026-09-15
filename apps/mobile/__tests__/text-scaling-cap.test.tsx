import { render, screen } from "@testing-library/react-native";
import { Text, ThemeProvider, defaultTheme } from "@pawcue/ui";

/**
 * A caller's Dynamic Type ceiling reaches React Native.
 *
 * The tab bar caps its labels at 1.3× — a quarter of the width and 48pt of height is all a label has, and above
 * that the platform's large-content viewer is the accessible route. The primitive used to set the variant's own
 * default after spreading the caller's props, which silently discarded that cap; on the Phase 10 development
 * build at the largest accessibility size the Hebrew Progress label broke in the middle of the word
 * (docs/architecture/phase-10-native-acceptance.md). The decision this encodes is the one already written beside
 * the tab bar: a label the caller has bounded stays bounded.
 */

async function multiplierFor(node: React.ReactElement) {
  await render(<ThemeProvider direction="ltr">{node}</ThemeProvider>);
  return screen.getByTestId("t").props.maxFontSizeMultiplier as
    number | undefined;
}

describe("Text and maxFontSizeMultiplier", () => {
  it("keeps a ceiling the caller sets", async () => {
    expect(
      await multiplierFor(
        <Text variant="caption" maxFontSizeMultiplier={1.3} testID="t">
          התקדמות
        </Text>,
      ),
    ).toBe(1.3);
  });

  it("otherwise uses the variant's own ceiling — capped headings, uncapped body", async () => {
    expect(
      await multiplierFor(
        <Text variant="headline" testID="t">
          Sit
        </Text>,
      ),
    ).toBe(defaultTheme.maxFontSizeMultiplier.headline);
    expect(
      await multiplierFor(
        <Text variant="body" testID="t">
          Teach your dog to sit on cue.
        </Text>,
      ),
    ).toBeUndefined();
  });
});
