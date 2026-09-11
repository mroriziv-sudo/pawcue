import { resolveStartupRoute } from "../src/state/startup-route";

/**
 * Startup routing.
 *
 * Every state the phase names, asserted as a pure function. Routing is the one decision that has to be right
 * before anything is drawn — a wrong answer here is a user watching onboarding appear and vanish — so it is kept
 * free of navigation, network and React entirely.
 */

const EMPTY = {
  hydrated: true,
  dogId: null,
  onboardingSkipped: false,
  draft: {},
};

describe("before local state has been read", () => {
  it("decides nothing", () => {
    // The splash is correct here. Guessing would be how the wrong screen flashes.
    expect(resolveStartupRoute({ ...EMPTY, hydrated: false })).toEqual({
      kind: "loading",
    });
  });

  it("still decides nothing even when a dog id is already known", () => {
    expect(
      resolveStartupRoute({ ...EMPTY, hydrated: false, dogId: "dog-1" }),
    ).toEqual({ kind: "loading" });
  });
});

describe("a fresh install", () => {
  it("opens onboarding", () => {
    expect(resolveStartupRoute(EMPTY)).toEqual({ kind: "onboarding" });
  });
});

describe("an interrupted onboarding", () => {
  it("resumes on the step the user had reached", () => {
    expect(
      resolveStartupRoute({
        ...EMPTY,
        draft: { name: "Luna", stepIndex: 3 },
      }),
    ).toEqual({ kind: "onboarding_resume", stepIndex: 3 });
  });

  it("resumes even when only an optional answer was given", () => {
    // Someone who answered nothing but the breed has still started; sending them to the welcome screen would
    // silently discard that.
    expect(
      resolveStartupRoute({ ...EMPTY, draft: { breed: "Poodle" } }),
    ).toMatchObject({ kind: "onboarding_resume" });
  });

  it("treats an empty draft as never started", () => {
    expect(resolveStartupRoute({ ...EMPTY, draft: { stepIndex: 2 } })).toEqual({
      kind: "onboarding",
    });
  });

  it("ignores whitespace-only answers", () => {
    expect(resolveStartupRoute({ ...EMPTY, draft: { name: "   " } })).toEqual({
      kind: "onboarding",
    });
  });
});

describe("a guest with a dog", () => {
  it("goes straight to the app", () => {
    expect(resolveStartupRoute({ ...EMPTY, dogId: "dog-1" })).toEqual({
      kind: "app",
    });
  });

  it("does not show onboarding again even if a stale draft is still stored", () => {
    // A dog is the strongest signal there is: onboarding finished, whatever the draft still says.
    expect(
      resolveStartupRoute({
        ...EMPTY,
        dogId: "dog-1",
        draft: { name: "Half-finished", stepIndex: 2 },
      }),
    ).toEqual({ kind: "app" });
  });
});

describe("an authenticated user with a dog", () => {
  it("goes to the app, exactly as a guest with a dog does", () => {
    // Routing deliberately does not branch on identity. After a merge the dog is re-parented rather than
    // replaced, so the cached id stays correct and signing in changes nothing about where the app opens.
    expect(resolveStartupRoute({ ...EMPTY, dogId: "dog-1" })).toEqual({
      kind: "app",
    });
  });
});

describe("a guest who declined onboarding", () => {
  it("gets the app, because the clicker must work with no profile at all", () => {
    expect(resolveStartupRoute({ ...EMPTY, onboardingSkipped: true })).toEqual({
      kind: "app",
    });
  });

  it("is not pulled back into onboarding on the next launch", () => {
    // The choice is persisted precisely so a relaunch honours it.
    expect(
      resolveStartupRoute({
        ...EMPTY,
        onboardingSkipped: true,
        draft: { name: "Luna" },
      }),
    ).toEqual({ kind: "app" });
  });
});
