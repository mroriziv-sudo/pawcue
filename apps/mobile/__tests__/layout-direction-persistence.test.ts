import { I18nManager } from "react-native";
import { applyLocale } from "../src/i18n";

/**
 * The saved layout direction always matches the chosen language.
 *
 * React Native reads the direction preference only when it builds the view hierarchy, so `I18nManager.isRTL`
 * describes the running process, not what is saved for the next launch. `applyLocale` used to skip the write
 * whenever the process already ran in the language's direction — and Hebrew → English → Hebrew without a relaunch
 * left the English answer on disk, so the next launch opened Hebrew in a left-to-right layout (Phase 10 native
 * acceptance, docs/architecture/phase-10-native-acceptance.md). The decision this encodes: the language the
 * app stores is the source of truth for the native direction, and "reopen the app" is reported only while this
 * process still runs the other way.
 */

const allowRTL = jest
  .spyOn(I18nManager, "allowRTL")
  .mockImplementation(() => {});
const forceRTL = jest
  .spyOn(I18nManager, "forceRTL")
  .mockImplementation(() => {});

function runningAs(rtl: boolean) {
  I18nManager.isRTL = rtl;
}

describe("applyLocale and the native layout direction", () => {
  const before = I18nManager.isRTL;
  beforeEach(() => {
    allowRTL.mockClear();
    forceRTL.mockClear();
  });
  afterAll(() => {
    I18nManager.isRTL = before;
    allowRTL.mockRestore();
    forceRTL.mockRestore();
  });

  it("writes the direction even when this process already runs in it", async () => {
    runningAs(true);
    const { requiresReload } = await applyLocale("he-IL");
    expect(forceRTL).toHaveBeenCalledWith(true);
    expect(allowRTL).toHaveBeenCalledWith(true);
    expect(requiresReload).toBe(false);
  });

  it("restores Hebrew after an English switch that was never relaunched", async () => {
    // A Hebrew launch: the process is RTL.
    runningAs(true);
    await applyLocale("en-US");
    expect(forceRTL).toHaveBeenLastCalledWith(false);

    // The user changes their mind before reopening the app. The process is still RTL.
    const { requiresReload } = await applyLocale("he-IL");
    expect(forceRTL).toHaveBeenLastCalledWith(true);
    expect(allowRTL).toHaveBeenLastCalledWith(true);
    // Nothing to reopen for: the process already runs the way Hebrew needs.
    expect(requiresReload).toBe(false);
  });

  it("asks for a reopen only when the process runs the other way", async () => {
    runningAs(false);
    expect((await applyLocale("he-IL")).requiresReload).toBe(true);
    expect((await applyLocale("en-US")).requiresReload).toBe(false);
  });
});
