import { render, screen, fireEvent } from "@testing-library/react-native";
import { Switch } from "react-native";
import { I18nextProvider } from "react-i18next";
import {
  RepMarks,
  Row,
  SegmentedControl,
  STANDARD_GLYPHS,
  ThemeProvider,
  TrailMark,
  type TrailState,
} from "@pawcue/ui";
import { i18n } from "../src/i18n";
import { joinNames } from "../src/lib/list-format";
import { renderSystemSymbol } from "../src/components/SystemSymbol";

/**
 * The field-notebook primitives, as behaviour: what a row announces, what a segmented control is to a screen
 * reader, what the marks say about state, and that the platform symbol map covers every standard mark.
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

describe("Row", () => {
  it("is one announced element when read-only and labelled", async () => {
    await wrap(
      <Row
        title="Sit"
        meta="Done today."
        accessibilityLabel="Sit. Done today."
        testID="row"
      />,
    );
    const row = screen.getByTestId("row");
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityLabel).toBe("Sit. Done today.");
    expect(row.props.accessibilityRole).toBeUndefined();
  });

  it("is a button when pressable, and presses across its whole width", async () => {
    const onPress = jest.fn();
    await wrap(
      <Row
        title="Sit"
        onPress={onPress}
        accessibilityLabel="Sit"
        testID="row"
      />,
    );
    const row = screen.getByTestId("row");
    expect(row.props.accessibilityRole).toBe("button");
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps an interactive trailing control reachable instead of hiding it with the decoration", async () => {
    const onChange = jest.fn();
    await wrap(
      <Row
        title="Sound"
        trailingInteractive
        trailing={
          <Switch
            value
            onValueChange={onChange}
            accessibilityLabel="Sound"
            testID="switch"
          />
        }
      />,
    );
    // Without `trailingInteractive` the slot is hidden from assistive technology and from this query.
    const control = screen.getByTestId("switch");
    await fireEvent(control, "valueChange", false);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("hides a decorative trailing mark from assistive technology", async () => {
    await wrap(
      <Row
        title="Sit"
        trailing={<Switch value testID="mark" />}
        accessibilityLabel="Sit"
      />,
    );
    expect(screen.queryByTestId("mark")).toBeNull();
    expect(
      screen.getByTestId("mark", { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});

describe("SegmentedControl", () => {
  it("is a radio group whose chosen segment is checked, not only coloured", async () => {
    const onChange = jest.fn();
    await wrap(
      <SegmentedControl
        options={[5, 10, 15].map((v) => ({ value: v, label: `${v}` }))}
        value={10}
        onChange={onChange}
        accessibilityLabel="Daily goal"
        testID="goal"
      />,
    );
    expect(screen.getByTestId("goal").props.accessibilityRole).toBe(
      "radiogroup",
    );
    expect(
      screen.getByTestId("goal-10").props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(screen.getByTestId("goal-5").props.accessibilityState).toMatchObject(
      { checked: false },
    );

    await fireEvent.press(screen.getByTestId("goal-15"));
    expect(onChange).toHaveBeenCalledWith(15);
  });
});

describe("marks", () => {
  it("renders every trail state", async () => {
    const states: TrailState[] = [
      "next",
      "later",
      "current",
      "done",
      "locked",
      "paused",
    ];
    await wrap(
      <>
        {states.map((state) => (
          <TrailMark
            key={state}
            state={state}
            label="1"
            testID={`mark-${state}`}
          />
        ))}
      </>,
    );
    for (const state of states) {
      expect(
        screen.getByTestId(`mark-${state}`, { includeHiddenElements: true }),
      ).toBeTruthy();
    }
  });

  it("reports repetitions as a progress value", async () => {
    await wrap(
      <RepMarks
        count={2}
        target={5}
        accessibilityLabel="2 of 5"
        testID="reps"
      />,
    );
    const marks = screen.getByTestId("reps");
    expect(marks.props.accessibilityRole).toBe("progressbar");
    expect(marks.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 40,
    });
  });
});

describe("the platform symbol map", () => {
  it("covers every standard mark on iOS and leaves the training marks to the design system", () => {
    for (const name of STANDARD_GLYPHS) {
      expect({
        name,
        rendered:
          renderSystemSymbol({ name, size: 24, color: "#000" }) !== null,
      }).toEqual({ name, rendered: true });
    }
    for (const name of ["clicker-glyph", "treat", "target"]) {
      expect(renderSystemSymbol({ name, size: 24, color: "#000" })).toBeNull();
    }
  });
});

describe("joining names", () => {
  it("reads as a sentence in English", () => {
    const t = i18n.t.bind(i18n);
    expect(joinNames(["Sit"], t)).toBe("Sit");
    expect(joinNames(["Sit", "Down"], t)).toBe("Sit and Down");
    expect(joinNames(["Sit", "Down", "Come"], t)).toBe("Sit, Down and Come");
  });

  it("uses the Hebrew conjunction, attached to the last word", async () => {
    await i18n.changeLanguage("he-IL");
    const t = i18n.t.bind(i18n);
    expect(joinNames(["שב", "שכב"], t)).toBe("שב ושכב");
    expect(joinNames(["שב", "שכב", "בוא"], t)).toBe("שב, שכב ובוא");
  });
});
