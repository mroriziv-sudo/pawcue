import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BILLING_PRODUCTS } from "@pawcue/config";
import type { ProductId } from "@pawcue/domain";
import PaywallScreen from "../app/paywall";
import { i18n } from "../src/i18n";
import { useDogStore } from "../src/state/dog-store";
import {
  useEntitlementStore,
  resetEntitlementGuards,
} from "../src/state/entitlement-store";
import { resetCatalogueCache } from "../src/lessons/useCatalogue";
import {
  ANNUAL_PRODUCT,
  createFakeBillingBackend,
  fakeProviderFor,
  FAKE_USER,
  MONTHLY_PRODUCT,
} from "./support/fake-billing-backend";

/**
 * The paywall.
 *
 * Most of these tests assert something is **absent**. That is the point: the patterns brief §33 and store review
 * both forbid — a hidden close button, a preselected expensive plan, a hardcoded price, a claim about a feature
 * that does not exist — are all things that arrive by being added, and a test that only checked the happy path
 * would never notice one appearing.
 */

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const backend = createFakeBillingBackend();
const mockProvider = fakeProviderFor(backend);

jest.mock("../src/billing/store-billing-provider", () => ({
  billingProvider: {
    getEntitlement: () => mockProvider.getEntitlement(),
    getAvailableProducts: () => mockProvider.getAvailableProducts(),
    purchase: (id: ProductId) => mockProvider.purchase(id),
    restorePurchases: () => mockProvider.restorePurchases(),
  },
  isStoreBillingConfigured: () => true,
  storeBillingLabel: () => null,
  registerStoreBillingAdapter: jest.fn(),
}));

const mockLoadCatalogue = jest.fn();
jest.mock("../src/plans/plan-repository", () => ({
  loadPlanningCatalogue: () => mockLoadCatalogue(),
  persistGeneratedPlan: jest.fn(),
  fetchActivePlan: jest.fn(),
}));

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

/** Two free lessons, three premium — so "unlocks N more lessons" has a real number behind it. */
const CATALOGUE = {
  skills: [
    {
      id: ID(1),
      slug: "sit",
      titleKey: "skill.sit.title",
      prerequisiteSkillIds: [],
      difficulty: 1,
      ...base,
    },
  ],
  lessons: [
    mkLesson(ID(10), "name_game", true),
    mkLesson(ID(11), "sit", true),
    mkLesson(ID(12), "stay", false),
    mkLesson(ID(13), "place", false),
    mkLesson(ID(14), "come", false),
  ],
};

function mkLesson(id: string, slug: string, isAlwaysFree: boolean) {
  return {
    id,
    slug,
    skillId: ID(1),
    titleKey: `lesson.${slug}.title`,
    goalKey: `lesson.${slug}.goal`,
    estimatedMinutes: 3,
    equipment: [],
    difficulty: 1,
    prerequisiteSkillIds: [],
    isAlwaysFree,
    contentVersionId: ID(900),
    ...base,
  };
}

const DOG = {
  id: ID(500),
  owner: { kind: "user" as const, userId: ID(501) },
  name: "Libi",
  birthdate: "2024-03-15",
  breed: "Border Collie",
  sex: "female" as const,
  photoUrl: null,
  dailyTrainingMinutes: 20 as const,
  ...base,
};

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderPaywall(direction: "ltr" | "rtl" = "ltr") {
  return await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction={direction}>
          <PaywallScreen />
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCatalogueCache();
  resetEntitlementGuards();
  backend.reset();
  backend.products = [MONTHLY_PRODUCT, ANNUAL_PRODUCT];
  mockLoadCatalogue.mockResolvedValue(CATALOGUE);
  await useEntitlementStore.getState().clear();
  useEntitlementStore.setState({ userId: FAKE_USER });
  useDogStore.setState({
    dog: DOG,
    dogId: DOG.id,
    hydrated: true,
    error: null,
  });
  await i18n.changeLanguage("en-US");
});

describe("what it offers", () => {
  it("shows both plans once the store answers", async () => {
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-plans")).toBeTruthy(),
    );

    expect(
      screen.getByTestId(`paywall-plan-${BILLING_PRODUCTS.monthly}`),
    ).toBeTruthy();
    expect(
      screen.getByTestId(`paywall-plan-${BILLING_PRODUCTS.annual}`),
    ).toBeTruthy();
  });

  it("shows the store's own price, never one of its own", async () => {
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-plans")).toBeTruthy(),
    );

    expect(
      screen.getByTestId(`paywall-price-${BILLING_PRODUCTS.monthly}`),
    ).toHaveTextContent(/\$4\.99\/month/);
  });

  it("renders whatever currency the store returns", async () => {
    backend.products = [
      {
        ...MONTHLY_PRODUCT,
        localizedPrice: "₪19.90",
        localizedPricePerPeriod: "₪19.90 לחודש",
      },
    ];
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-plans")).toBeTruthy(),
    );

    expect(
      screen.getByTestId(`paywall-price-${BILLING_PRODUCTS.monthly}`),
    ).toHaveTextContent(/₪19\.90/);
  });

  it("counts the lessons a subscription actually unlocks", async () => {
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-value-count")).toBeTruthy(),
    );

    // Three premium lessons in the fixture — a real number from real content, not a marketing claim.
    expect(screen.getByTestId("paywall-value-count")).toHaveTextContent(/3/);
  });

  it("claims only features that exist", async () => {
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-value")).toBeTruthy(),
    );

    expect(screen.getByTestId("paywall-value-catalog")).toBeTruthy();
    expect(screen.getByTestId("paywall-value-plan")).toBeTruthy();

    /*
      Four more `paywall.feature.*` keys exist for features the product does not ship — daily plan updates (free
      users get those too), advanced troubleshooting, goal programs, full history. None may be advertised.
    */
    for (const claim of [
      "Daily plan updates",
      "Advanced troubleshooting",
      "Goal-specific programs",
      "Full progress history",
    ]) {
      expect(screen.queryByText(claim)).toBeNull();
    }
  });
});

describe("what it must not do", () => {
  it("offers a close control that is present from the first render", async () => {
    await renderPaywall();
    expect(screen.getByTestId("paywall-close")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("paywall-close"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("preselects the smallest immediate charge, not the largest", async () => {
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-plans")).toBeTruthy(),
    );

    const monthly = screen.getByTestId(
      `paywall-plan-${BILLING_PRODUCTS.monthly}`,
    );
    expect(monthly.props.accessibilityLabel).toMatch(/Selected/);

    const annual = screen.getByTestId(
      `paywall-plan-${BILLING_PRODUCTS.annual}`,
    );
    expect(annual.props.accessibilityLabel).not.toMatch(/Selected/);
  });

  it("discloses the recurring nature of the subscription", async () => {
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-disclosure")).toBeTruthy(),
    );

    expect(screen.getByTestId("paywall-disclosure")).toHaveTextContent(
      /Auto-renews/,
    );
  });

  it("does not mention a trial when the store reports none", async () => {
    backend.products = [MONTHLY_PRODUCT];
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-disclosure-text")).toBeTruthy(),
    );

    expect(screen.getByTestId("paywall-disclosure-text")).toHaveTextContent(
      /cancel anytime/,
    );
    expect(screen.getByTestId("paywall-disclosure-text")).not.toHaveTextContent(
      /free/,
    );
  });

  it("discloses the trial length the store reports, and never invents one", async () => {
    backend.products = [{ ...MONTHLY_PRODUCT, trialDurationDays: 7 }];
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-disclosure-text")).toBeTruthy(),
    );

    expect(screen.getByTestId("paywall-disclosure-text")).toHaveTextContent(
      /7 days free/,
    );
  });

  it("links Terms and Privacy, as an auto-renewing subscription must", async () => {
    await renderPaywall();
    expect(screen.getByTestId("paywall-terms")).toBeTruthy();
    expect(screen.getByTestId("paywall-privacy")).toBeTruthy();
  });

  it("says a legal link is unconfigured rather than doing nothing", async () => {
    // No EXPO_PUBLIC_TERMS_URL in this build — a dead link is worse than an honest one.
    await renderPaywall();
    await fireEvent.press(screen.getByTestId("paywall-terms"));

    expect(screen.getByTestId("paywall-terms-unavailable")).toBeTruthy();
  });
});

describe("the store cannot be reached", () => {
  it("says so and stays usable instead of showing an empty list", async () => {
    backend.productsThrow = new Error("store down");
    await renderPaywall();

    await waitFor(() =>
      expect(screen.getByTestId("paywall-unavailable")).toBeTruthy(),
    );
    expect(screen.queryByTestId("paywall-cta")).toBeNull();
    // The way out still works.
    expect(screen.getByTestId("paywall-close")).toBeTruthy();
  });

  it("says it once: the unavailable block, not also the generic alert line", async () => {
    // Phase 10 acceptance, finding 5: the same failed fetch rendered both.
    backend.productsThrow = new Error("store down");
    await renderPaywall();

    await waitFor(() =>
      expect(screen.getByTestId("paywall-unavailable")).toBeTruthy(),
    );
    expect(screen.queryByTestId("paywall-message")).toBeNull();
  });

  it("still reports a restore that fails while the store is down", async () => {
    backend.productsThrow = new Error("store down");
    backend.restoreThrow = new Error("restore down");
    await renderPaywall();
    await waitFor(() =>
      expect(screen.getByTestId("paywall-unavailable")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("paywall-restore"));

    await waitFor(() =>
      expect(screen.getByTestId("paywall-message")).toBeTruthy(),
    );
  });
});

describe("buying", () => {
  it("does not report success on the store's callback alone", async () => {
    backend.purchaseOutcome = {
      outcome: "purchased",
      entitlement: {
        id: ID(20),
        userId: FAKE_USER,
        isPremiumActive: true,
        source: "active",
        expiresAt: null,
        createdAt: TS,
        updatedAt: TS,
      },
    };
    // The server is never told, so it never confirms.
    await renderPaywall();
    await waitFor(() => expect(screen.getByTestId("paywall-cta")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("paywall-cta"));

    await waitFor(() =>
      expect(screen.queryByTestId("paywall-unlocked")).toBeNull(),
    );
    expect(screen.getByTestId("paywall-message")).toBeTruthy();
  });

  it("celebrates only once the server confirms", async () => {
    backend.purchaseOutcome = {
      outcome: "purchased",
      entitlement: {
        id: ID(20),
        userId: FAKE_USER,
        isPremiumActive: true,
        source: "active",
        expiresAt: null,
        createdAt: TS,
        updatedAt: TS,
      },
    };
    backend.grantFromServer();

    await renderPaywall();
    await waitFor(() => expect(screen.getByTestId("paywall-cta")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("paywall-cta"));

    await waitFor(() =>
      expect(screen.getByTestId("paywall-unlocked")).toBeTruthy(),
    );
  });

  it("says nothing at all when the user cancels", async () => {
    backend.purchaseOutcome = { outcome: "cancelled" };
    await renderPaywall();
    await waitFor(() => expect(screen.getByTestId("paywall-cta")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("paywall-cta"));

    // Backing out of a purchase is not an error and is never dressed as one.
    await waitFor(() =>
      expect(screen.queryByTestId("paywall-message")).toBeNull(),
    );
  });

  it("explains a pending purchase without claiming it failed", async () => {
    backend.purchaseOutcome = { outcome: "pending" };
    await renderPaywall();
    await waitFor(() => expect(screen.getByTestId("paywall-cta")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("paywall-cta"));

    await waitFor(() =>
      expect(screen.getByTestId("paywall-message")).toHaveTextContent(
        /waiting for approval/,
      ),
    );
  });
});

describe("restore", () => {
  it("is reachable from the paywall, as the stores require", async () => {
    await renderPaywall();
    expect(screen.getByTestId("paywall-restore")).toBeTruthy();
  });

  it("says plainly when there was nothing to restore", async () => {
    backend.ownedTransactions = [];
    await renderPaywall();

    await fireEvent.press(screen.getByTestId("paywall-restore"));

    await waitFor(() =>
      expect(screen.getByTestId("paywall-message")).toHaveTextContent(
        /no purchases to restore/,
      ),
    );
  });
});

describe("already subscribed", () => {
  it("says so rather than selling again", async () => {
    backend.grantFromServer();
    await useEntitlementStore.getState().refresh();

    await renderPaywall();

    await waitFor(() =>
      expect(screen.getByTestId("paywall-already-premium")).toBeTruthy(),
    );
  });
});

describe("Hebrew", () => {
  it("renders in the active language", async () => {
    await i18n.changeLanguage("he-IL");
    await renderPaywall("rtl");

    await waitFor(() =>
      expect(screen.getByTestId("paywall-title")).toBeTruthy(),
    );
    expect(screen.getByTestId("paywall-title")).toHaveTextContent(/Libi/);
    expect(screen.getByTestId("paywall-restore")).toBeTruthy();
  });
});
