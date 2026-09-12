import { defineConfig } from "vitest/config";

/**
 * One Vitest runner for the whole workspace.
 *
 * Each package used to carry its own `vitest` devDependency, which meant pnpm resolved a separate peer variant per
 * package — and produced a broken binary symlink for a package that didn't happen to depend on `@types/node`.
 * Hoisting the runner to the root removes that whole class of problem and guarantees every package is tested by the
 * same version.
 *
 * Run everything with `pnpm test`, or a single package with `pnpm test --project @pawcue/ui`.
 */
export default defineConfig({
  test: {
    projects: ["packages/*", "supabase/functions/vitest.config.ts"],
  },
});
