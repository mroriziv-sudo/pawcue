import { defineConfig } from "vitest/config";

/**
 * Only the pure modules under `_shared/` are testable here: they have no imports and no Deno globals, which is a
 * property the Edge Functions rely on and this project enforces by running them under Node.
 */
export default defineConfig({
  test: {
    name: "@pawcue/edge-functions",
    include: ["_shared/**/*.test.ts"],
  },
});
