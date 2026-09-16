import { useEffect } from "react";
import { Text, View } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "@pawcue/ui";
import { Crossfade } from "../src/components/Crossfade";

/**
 * A change of state in place keeps the outgoing content's instance. The motion pass found that a freshly mounted
 * `Svg` draws nothing on its first frame, so a cross-fade that re-mounted the old content as its fading copy
 * blanked the dog for a frame at every expression change. The old layer must be the same mounted content, moved.
 */

const mounted = jest.fn();

function Face({ name }: { name: string }) {
  useEffect(() => {
    mounted(name);
  }, [name]);
  return (
    <View testID={`face-${name}`}>
      <Text>{name}</Text>
    </View>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mounted.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Crossfade", () => {
  it("moves the outgoing content to the fading layer without mounting it again, then lets it go", async () => {
    const view = await render(
      <ThemeProvider direction="ltr">
        <Crossfade stateKey="focused" testID="fade">
          <Face name="focused" />
        </Crossfade>
      </ThemeProvider>,
    );
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("fade").children).toHaveLength(1);

    await view.rerender(
      <ThemeProvider direction="ltr">
        <Crossfade stateKey="happy" testID="fade">
          <Face name="happy" />
        </Crossfade>
      </ThemeProvider>,
    );
    // Both faces on screen: the old one leaving, the new one arriving — and the old one was never re-created.
    expect(
      screen.getByTestId("face-focused", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByTestId("face-happy")).toBeTruthy();
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(mounted).toHaveBeenNthCalledWith(2, "happy");
    const layers = screen.getByTestId("fade").children;
    expect(layers).toHaveLength(2);
    const outgoing = layers[0] as { props: Record<string, unknown> };
    expect(outgoing.props["pointerEvents"]).toBe("none");
    expect(outgoing.props["accessibilityElementsHidden"]).toBe(true);

    // The outgoing layer is gone once any spring has settled.
    await act(() => {
      jest.advanceTimersByTime(450);
    });
    expect(
      screen.queryByTestId("face-focused", { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.getByTestId("fade").children).toHaveLength(1);
    expect(mounted).toHaveBeenCalledTimes(2);
  });

  it("does nothing while the key is unchanged", async () => {
    const view = await render(
      <ThemeProvider direction="ltr">
        <Crossfade stateKey="focused" testID="fade">
          <Face name="focused" />
        </Crossfade>
      </ThemeProvider>,
    );
    await view.rerender(
      <ThemeProvider direction="ltr">
        <Crossfade stateKey="focused" testID="fade">
          <Face name="focused" />
        </Crossfade>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("fade").children).toHaveLength(1);
    expect(mounted).toHaveBeenCalledTimes(1);
  });
});
