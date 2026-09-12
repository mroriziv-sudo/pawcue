import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import SettingsScreen from "../app/settings";
import { i18n } from "../src/i18n";
import { useDogStore } from "../src/state/dog-store";

/**
 * The dog profile has to be findable.
 *
 * Manual acceptance reported the profile as unreachable even though the route existed and worked. The cause was
 * placement: the profile and account cards were rendered after the language options with no heading of their own,
 * and a section heading governs everything until the next one — so they read as two more language choices.
 *
 * These assert the things that made it invisible, not the fact that a route exists.
 */

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/dogs/dog-repository", () => ({
  createDog: jest.fn(),
  fetchDog: jest.fn(),
  listOwnDogs: jest.fn(),
  updateDog: jest.fn(),
}));

const testMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const DOG = {
  id: "00000000-0000-4000-a000-0000000000d1",
  owner: {
    kind: "user" as const,
    userId: "00000000-0000-4000-a000-000000000abc",
  },
  name: "Libi",
  birthdate: "2024-03-15",
  breed: "Golden Retriever",
  sex: "female" as const,
  photoUrl: null,
  dailyTrainingMinutes: 20 as const,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

async function renderSettings(direction: "ltr" | "rtl" = "ltr") {
  return await render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction={direction}>
          <SettingsScreen />
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage("en-US");
  useDogStore.setState({
    dog: DOG,
    dogId: DOG.id,
    hydrated: true,
    error: null,
  });
});

describe("finding the dog profile", () => {
  it("offers a route to it", async () => {
    await renderSettings();

    await fireEvent.press(screen.getByTestId("open-dog-profile"));

    // /dog is the primary destination now; the editor lives at /dog-profile.
    expect(mockPush).toHaveBeenCalledWith("/dog-profile");
  });

  it("names the row after the dog rather than calling it 'Edit profile'", async () => {
    await renderSettings();

    // The name is what someone looking for their dog actually scans for.
    expect(screen.getByTestId("open-dog-profile")).toHaveTextContent(/Libi/);
  });

  it("gives the dog its own section heading", async () => {
    const view = await renderSettings();

    // Without this the row sits under "Language" and reads as a language option.
    expect(view.getByText("Your dog")).toBeTruthy();
    expect(view.getByText("Account")).toBeTruthy();
  });

  it("puts the dog above the language options, not buried after them", async () => {
    const view = await renderSettings();

    const rendered = JSON.stringify(view.toJSON());
    const dogAt = rendered.indexOf("Your dog");
    const languageAt = rendered.indexOf("Language");
    expect(dogAt).toBeGreaterThan(-1);
    expect(languageAt).toBeGreaterThan(-1);
    expect(dogAt).toBeLessThan(languageAt);
  });

  it("hides the dog section entirely when there is no dog yet", async () => {
    // A guest who skipped onboarding has nothing to show, and an empty row that opens an empty screen is worse
    // than no row.
    useDogStore.setState({ dog: null, dogId: null });
    await renderSettings();

    expect(screen.queryByTestId("open-dog-profile")).toBeNull();
    expect(screen.getByTestId("open-account")).toBeTruthy();
  });

  it("still shows the row before the dog record has loaded", async () => {
    // Offline, or before the first refresh: the id is enough to route, so the row stays.
    useDogStore.setState({ dog: null, dogId: DOG.id });
    await renderSettings();

    expect(screen.getByTestId("open-dog-profile")).toBeTruthy();
  });
});

describe("Hebrew", () => {
  it("labels the section and the dog row in Hebrew", async () => {
    await i18n.changeLanguage("he-IL");
    const view = await renderSettings("rtl");

    expect(view.getByText("הכלב שלכם")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("open-dog-profile")).toHaveTextContent(/Libi/),
    );
  });
});
