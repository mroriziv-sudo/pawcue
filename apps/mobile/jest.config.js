/**
 * Jest via the `jest-expo` preset — the harness that can actually render React Native components.
 *
 * Vitest runs the framework-agnostic packages at the repo root; React Native needs Jest because RN ships
 * untranspiled Flow sources that require the RN Babel preset, which `jest-expo` configures. Two runners is the
 * cost of testing both layers honestly.
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  transformIgnorePatterns: [
    /**
     * The RN/Expo ecosystem and this workspace's own packages ship untranspiled (Flow, ESM) and must go through
     * Babel. Matching on a substring anywhere in the path rather than a leading package name is deliberate: pnpm's
     * virtual store flattens scoped names into `.pnpm/@react-native+jest-preset@0.86.3_.../node_modules/...`, so a
     * conventional `@react-native/...` prefix pattern silently fails to match and the file is left untransformed.
     */
    "node_modules/(?!.*(react-native|@react-native|expo|@expo|@pawcue|@testing-library))",
  ],
  testMatch: [
    "<rootDir>/**/__tests__/**/*.test.[jt]s?(x)",
    "<rootDir>/**/*.test.[jt]s?(x)",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/.expo/"],
  collectCoverageFrom: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
};
