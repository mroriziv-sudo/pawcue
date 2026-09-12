/**
 * Jest stand-in for the RevenueCat SDK.
 *
 * Automatically substituted for every test (a `__mocks__` directory beside `package.json` shadows the node module),
 * because the real package binds a native module that does not exist under Jest. Tests that exercise the adapter
 * drive this fake through `__rcMock`; every other test simply never touches it.
 *
 * It models the SDK's *shape* — configure-once, error objects carrying a `code`, offerings with packages — and
 * nothing about its behaviour, so a test has to say what the store answers.
 */

export const PURCHASES_ERROR_CODE = {
  UNKNOWN_ERROR: "0",
  PURCHASE_CANCELLED_ERROR: "1",
  STORE_PROBLEM_ERROR: "2",
  PURCHASE_NOT_ALLOWED_ERROR: "3",
  PURCHASE_INVALID_ERROR: "4",
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: "5",
  PRODUCT_ALREADY_PURCHASED_ERROR: "6",
  RECEIPT_ALREADY_IN_USE_ERROR: "7",
  NETWORK_ERROR: "10",
  INVALID_CREDENTIALS_ERROR: "11",
  PAYMENT_PENDING_ERROR: "20",
  LOG_OUT_ANONYMOUS_USER_ERROR: "22",
  CONFIGURATION_ERROR: "23",
  OFFLINE_CONNECTION_ERROR: "35",
} as const;

export const LOG_LEVEL = {
  VERBOSE: "VERBOSE",
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
};

export interface RcMockState {
  configured: { apiKey: string; appUserID: string | null } | null;
  appUserId: string | null;
  logInCalls: string[];
  logOutCalls: number;
  offerings: { current: { availablePackages: unknown[] } | null };
  purchaseResult: unknown;
  purchaseError: { code: string; message: string } | null;
  customerInfo: unknown;
  restoreError: { code: string; message: string } | null;
}

export const __rcMock: RcMockState = {
  configured: null,
  appUserId: null,
  logInCalls: [],
  logOutCalls: 0,
  offerings: { current: null },
  purchaseResult: null,
  purchaseError: null,
  customerInfo: {
    subscriptionsByProductIdentifier: {},
    activeSubscriptions: [],
  },
  restoreError: null,
};

export function __resetRcMock(): void {
  __rcMock.configured = null;
  __rcMock.appUserId = null;
  __rcMock.logInCalls = [];
  __rcMock.logOutCalls = 0;
  __rcMock.offerings = { current: null };
  __rcMock.purchaseResult = null;
  __rcMock.purchaseError = null;
  __rcMock.customerInfo = {
    subscriptionsByProductIdentifier: {},
    activeSubscriptions: [],
  };
  __rcMock.restoreError = null;
}

const Purchases = {
  configure(config: { apiKey: string; appUserID?: string | null }) {
    __rcMock.configured = {
      apiKey: config.apiKey,
      appUserID: config.appUserID ?? null,
    };
    __rcMock.appUserId = config.appUserID ?? "$RCAnonymousID:mock";
  },
  setLogLevel: () => Promise.resolve(),
  isConfigured: () => Promise.resolve(__rcMock.configured !== null),
  getAppUserID: () => Promise.resolve(__rcMock.appUserId ?? ""),
  logIn(appUserID: string) {
    __rcMock.logInCalls.push(appUserID);
    __rcMock.appUserId = appUserID;
    return Promise.resolve({
      customerInfo: __rcMock.customerInfo,
      created: false,
    });
  },
  logOut() {
    if (
      !__rcMock.appUserId ||
      __rcMock.appUserId.startsWith("$RCAnonymousID")
    ) {
      return Promise.reject({
        code: PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR,
        message: "anonymous",
      });
    }
    __rcMock.logOutCalls += 1;
    __rcMock.appUserId = "$RCAnonymousID:mock";
    return Promise.resolve(__rcMock.customerInfo);
  },
  getOfferings: () => Promise.resolve(__rcMock.offerings),
  purchasePackage() {
    if (__rcMock.purchaseError) return Promise.reject(__rcMock.purchaseError);
    return Promise.resolve(__rcMock.purchaseResult);
  },
  restorePurchases() {
    if (__rcMock.restoreError) return Promise.reject(__rcMock.restoreError);
    return Promise.resolve(__rcMock.customerInfo);
  },
  getCustomerInfo: () => Promise.resolve(__rcMock.customerInfo),
};

export default Purchases;
