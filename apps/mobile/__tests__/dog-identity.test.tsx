import { render, screen, fireEvent } from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { ThemeProvider } from "@pawcue/ui";
import { i18n } from "../src/i18n";
import { BREEDS, MIXED_BREED_ID } from "../src/dogs/breeds";
import {
  breedDisplayName,
  findBreed,
  lookFor,
  searchBreeds,
} from "../src/dogs/breed-lookup";
import {
  dateMonthsAgo,
  monthsSince,
  BirthdatePicker,
} from "../src/components/BirthdatePicker";
import { BreedPicker } from "../src/components/BreedPicker";
import { DogAvatar } from "../src/components/DogAvatar";

/**
 * The dog's identity layer: the breed list, the lookup hierarchy behind the avatar, and the two structured
 * inputs. Presentation logic, but logic — and the parts of it a wrong answer would embarrass: a breed that
 * cannot be found in Hebrew, an age chip that lands on the wrong date, a typed breed that is silently lost.
 */

async function wrap(node: React.ReactNode, direction: "ltr" | "rtl" = "ltr") {
  return await render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider direction={direction}>{node}</ThemeProvider>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("breed list", () => {
  it("has unique, stable ids and a name in both languages for every entry", () => {
    const ids = new Set(BREEDS.map((breed) => breed.id));
    expect(ids.size).toBe(BREEDS.length);
    for (const breed of BREEDS) {
      expect(breed.en.trim()).not.toBe("");
      expect(breed.he.trim()).not.toBe("");
      expect(breed.he).toMatch(/[֐-׿]/);
    }
  });

  it("includes a mixed-breed entry, marked popular so it is always in reach", () => {
    const mixed = findBreed(MIXED_BREED_ID);
    expect(mixed?.popular).toBe(true);
  });
});

describe("finding and naming a breed", () => {
  it("resolves the stored English name, the id, or the Hebrew name", () => {
    expect(findBreed("Border Collie")?.id).toBe("border_collie");
    expect(findBreed("border_collie")?.id).toBe("border_collie");
    expect(findBreed("בורדר קולי")?.id).toBe("border_collie");
    expect(findBreed("  border collie ")?.id).toBe("border_collie");
  });

  it("displays a known breed in the user's language and an unknown one as typed", () => {
    expect(breedDisplayName("Border Collie", "he-IL")).toBe("בורדר קולי");
    expect(breedDisplayName("Border Collie", "en-US")).toBe("Border Collie");
    expect(breedDisplayName("Some rare breed", "he-IL")).toBe(
      "Some rare breed",
    );
    expect(breedDisplayName(null, "en-US")).toBeNull();
  });
});

describe("searching", () => {
  it("leads with popular breeds when nothing has been typed", () => {
    const first = searchBreeds("", 5);
    expect(first.every((breed) => breed.popular)).toBe(true);
  });

  it("matches partial words in either language", () => {
    expect(searchBreeds("gold").map((b) => b.id)).toContain("golden_retriever");
    expect(searchBreeds("רועה").map((b) => b.id)).toContain("german_shepherd");
    expect(searchBreeds("retriev").map((b) => b.id)).toEqual(
      expect.arrayContaining(["labrador_retriever", "golden_retriever"]),
    );
  });

  it("ranks a name that starts with the query above one that merely contains it", () => {
    const ids = searchBreeds("poodle").map((b) => b.id);
    expect(ids[0]).toBe("poodle");
    expect(ids).toContain("toy_poodle");
  });
});

describe("the avatar's fallback hierarchy", () => {
  it("uses the exact breed when it is known", () => {
    expect(lookFor("Siberian Husky")).toMatchObject({
      group: "spitz",
      ears: "pointed",
      resolvedFrom: "breed",
    });
  });

  it("falls back to the breed family for a free-typed value", () => {
    expect(lookFor("lab mix")).toMatchObject({
      group: "sporting",
      ears: "floppy",
      resolvedFrom: "family",
    });
    expect(lookFor("some kind of terrier")).toMatchObject({
      group: "terrier",
      resolvedFrom: "family",
    });
    expect(lookFor("רועה מעורב")).toMatchObject({
      group: "herding",
      resolvedFrom: "family",
    });
  });

  it("always has a face — generic when nothing is known", () => {
    expect(lookFor(null)).toMatchObject({
      group: "mixed",
      resolvedFrom: "generic",
    });
    expect(lookFor("")).toMatchObject({ resolvedFrom: "generic" });
    expect(lookFor("xyzzy")).toMatchObject({ resolvedFrom: "generic" });
  });

  it("renders for every ear shape and group without a breed string", async () => {
    await wrap(
      <>
        <DogAvatar breed="Golden Retriever" testID="avatar-floppy" />
        <DogAvatar breed="Corgi" testID="avatar-family" />
        <DogAvatar breed={null} testID="avatar-generic" />
      </>,
    );
    // The avatar is decorative and hidden from assistive technology, so the query has to opt in to hidden nodes.
    const hidden = { includeHiddenElements: true };
    expect(screen.getByTestId("avatar-floppy", hidden)).toBeTruthy();
    expect(screen.getByTestId("avatar-family", hidden)).toBeTruthy();
    expect(screen.getByTestId("avatar-generic", hidden)).toBeTruthy();
  });
});

describe("birthdate helpers", () => {
  const today = new Date("2026-09-15T12:00:00Z");

  it("round-trips an age chip through a date and back", () => {
    for (const months of [2, 6, 12, 18, 24, 60, 120]) {
      expect(monthsSince(dateMonthsAgo(months, today), today)).toBe(months);
    }
  });

  it("clamps to the last day of a shorter month rather than rolling forward", () => {
    // 31 March minus one month is the end of February, not 3 March.
    expect(dateMonthsAgo(1, new Date("2026-03-31T12:00:00Z"))).toBe(
      "2026-02-28",
    );
  });

  it("reports no age for a value that is not a date", () => {
    expect(monthsSince("soon", today)).toBeNull();
    expect(monthsSince("2030-01-01", today)).toBeNull();
  });
});

describe("BirthdatePicker", () => {
  it("writes a date when an age is chosen on the wheels", async () => {
    const onChange = jest.fn();
    await wrap(
      <BirthdatePicker
        value=""
        onChange={onChange}
        inputTestID="input-birthdate"
      />,
    );

    // The wheels start at one year; choosing three months on the months wheel keeps the year.
    await fireEvent(screen.getByTestId("input-birthdate-months"), "change", {
      nativeEvent: { newValue: 3, newIndex: 3 },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const written = onChange.mock.calls[0]?.[0] as string;
    expect(written).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(monthsSince(written)).toBe(15);
  });

  it("reads a stored date back onto the wheels and into a sentence", async () => {
    const onChange = jest.fn();
    await wrap(
      <BirthdatePicker
        value={dateMonthsAgo(27)}
        onChange={onChange}
        inputTestID="input-birthdate"
      />,
    );

    expect(
      screen.getByTestId("input-birthdate-years").props.selectedIndex,
    ).toBe(2);
    expect(
      screen.getByTestId("input-birthdate-months").props.selectedIndex,
    ).toBe(3);
    expect(screen.getByTestId("input-birthdate-summary")).toHaveTextContent(
      /2 years/,
    );
  });

  it("offers the platform's date spinner for an exact date, and writes what it reports", async () => {
    const onChange = jest.fn();
    await wrap(
      <BirthdatePicker
        value=""
        onChange={onChange}
        inputTestID="input-birthdate"
      />,
    );

    await fireEvent.press(screen.getByTestId("input-birthdate-exact-toggle"));
    const spinner = screen.getByTestId("input-birthdate-exact");
    const chosen = new Date(2023, 4, 14, 12, 0, 0);
    await fireEvent(spinner, "change", {
      nativeEvent: { timestamp: chosen.getTime(), utcOffset: 0 },
    });

    expect(onChange).toHaveBeenLastCalledWith("2023-05-14");
  });
});

describe("BreedPicker", () => {
  it("offers common breeds before typing and writes the English name on selection", async () => {
    const onChange = jest.fn();
    await wrap(
      <BreedPicker value="" onChange={onChange} inputTestID="input-breed" />,
    );

    await fireEvent.press(
      screen.getByTestId("input-breed-option-labrador_retriever"),
    );

    expect(onChange).toHaveBeenCalledWith("Labrador Retriever");
  });

  it("finds a breed typed in Hebrew and shows it in Hebrew", async () => {
    await i18n.changeLanguage("he-IL");
    const onChange = jest.fn();
    await wrap(
      <BreedPicker value="" onChange={onChange} inputTestID="input-breed" />,
      "rtl",
    );

    await fireEvent.changeText(screen.getByTestId("input-breed"), "האסקי");

    const option = screen.getByTestId("input-breed-option-siberian_husky");
    expect(option.props.accessibilityLabel).toBe("האסקי סיבירי");
    await fireEvent.press(option);
    expect(onChange).toHaveBeenCalledWith("Siberian Husky");
  });

  it("keeps a breed that is not in the list, exactly as typed", async () => {
    const onChange = jest.fn();
    await wrap(
      <BreedPicker value="" onChange={onChange} inputTestID="input-breed" />,
    );

    await fireEvent.changeText(screen.getByTestId("input-breed"), "Kangal");
    await fireEvent.press(screen.getByTestId("input-breed-use-typed"));

    expect(onChange).toHaveBeenCalledWith("Kangal");
  });

  it("shows the current answer above the list and lets it be cleared", async () => {
    const onChange = jest.fn();
    await wrap(
      <BreedPicker
        value="Beagle"
        onChange={onChange}
        inputTestID="input-breed"
      />,
    );

    const selected = screen.getByTestId("input-breed-selected");
    expect(selected.props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(selected);
    expect(onChange).toHaveBeenCalledWith("");
  });
});
