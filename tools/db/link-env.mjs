#!/usr/bin/env node
/**
 * Links the Supabase CLI to a named environment from `supabase/environments.json`.
 *
 * `supabase link` is how the CLI chooses which project `--linked` commands act on; naming the environment rather
 * than pasting a ref keeps "which project am I about to reset" a word rather than twenty characters. The database
 * password comes from the OS keychain (saved by a previous link), `SUPABASE_DB_PASSWORD`, or the CLI's prompt —
 * never from this script or the repository.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const environments = JSON.parse(
  readFileSync("supabase/environments.json", "utf8"),
);
const name = process.argv[2];
const ref = name ? environments[name] : null;
if (!ref) {
  console.error(
    `usage: link-env.mjs <${Object.keys(environments)
      .filter((k) => !k.startsWith("$"))
      .join("|")}> — and the environment must have a ref`,
  );
  process.exit(1);
}
const result = spawnSync("pnpm", ["supabase", "link", "--project-ref", ref], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
