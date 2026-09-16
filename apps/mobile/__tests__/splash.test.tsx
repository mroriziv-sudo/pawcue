import { act, render } from "@testing-library/react-native";
import * as SplashScreen from "expo-splash-screen";
import RootLayout from "../app/_layout";
import { useBootstrapStore } from "../src/state/bootstrap-store";

/**
 * The native launch screen is the dog on paper. It must stay up until settings have hydrated — the moment the
 * first real screen can render — and go away exactly once after that. A cold launch therefore never shows a
 * blank frame or a spinner between the icon and the app.
 */
jest.mock("expo-router", () => ({ Stack: () => null }));

describe("the launch screen", () => {
  it("is asked to stay up before anything renders, and to fade out", () => {
    // Module-level calls in app/_layout.tsx, made when the file is imported above.
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
    expect(SplashScreen.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ fade: true }),
    );
  });

  it("stays up while settings hydrate and hides once, when the app is ready", async () => {
    (SplashScreen.hideAsync as jest.Mock).mockClear();
    useBootstrapStore.setState({
      status: "hydrating",
      // Held open by hand so the test controls the moment of readiness.
      bootstrap: async () => {},
    });

    await act(async () => {
      render(<RootLayout />);
    });
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

    await act(async () => {
      useBootstrapStore.setState({ status: "ready" });
    });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
});
