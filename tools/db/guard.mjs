#!/usr/bin/env node
/**
 * Refuses to run a destructive database script against the wrong environment.
 *
 * `supabase db reset --linked` replays every migration from zero and discards every row; `rls_security.sql`
 * creates and deletes auth users. Both are correct against staging and catastrophic against production. The
 * Supabase CLI links one project per checkout, so "which project" is a file that changes whenever someone runs
 * `supabase link` — this guard reads it and compares it with `supabase/environments.json` before anything runs.
 *
 * Usage: node tools/db/guard.mjs <environment>     (exit 0 to proceed, 1 to refuse)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const wanted = process.argv[2];
const root = process.cwd();
const environments = JSON.parse(
  readFileSync(join(root, "supabase/environments.json"), "utf8"),
);

if (!wanted || !(wanted in environments)) {
  console.error(
    `usage: guard.mjs <${Object.keys(environments)
      .filter((k) => !k.startsWith("$"))
      .join("|")}>`,
  );
  process.exit(1);
}

const expected = environments[wanted];
if (!expected) {
  console.error(
    `No project ref recorded for "${wanted}" in supabase/environments.json.`,
  );
  process.exit(1);
}

const refFile = join(root, "supabase/.temp/project-ref");
const linked = existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : "";

if (linked !== expected) {
  console.error(
    `Refusing: the linked Supabase project is "${linked || "(none)"}" but this script targets ${wanted} (${expected}).\n` +
      `Run \`pnpm env:${wanted}\` to link it, or choose the script for the environment that is linked.`,
  );
  process.exit(1);
}

if (wanted === "production" && environments.staging === expected) {
  console.error("Refusing: production and staging point at the same project.");
  process.exit(1);
}
