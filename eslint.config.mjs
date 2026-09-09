import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat config shared by every workspace package (ESLint searches upward from each package's cwd to find it).
 *
 * Type-aware linting is on via `projectService`, which is why `typescript` is pinned to the 6.x line — the current
 * typescript-eslint peer range is `>=4.8.4 <6.1.0`, so TypeScript 7 would silently cost us these rules. See
 * docs/architecture/tech-stack-versions.md.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.expo/**",
      "**/coverage/**",
      // Generated from the live database schema; not hand-edited, so linting it is noise.
      "packages/domain/src/generated/**",
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The brief forbids `any` unless explicitly justified, so an inline disable comment must be the only route in.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    /**
     * Hooks rules apply to the UI package's components. `exhaustive-deps` is treated as an error, not a warning:
     * a stale closure in a press handler or an effect that misses a cleanup is a real runtime bug, and this is the
     * only automated check for it.
     */
    files: ["packages/ui/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    // Tests assert on deliberately malformed input, so the strictness that protects product code gets in the way.
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
);
