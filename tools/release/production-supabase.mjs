#!/usr/bin/env node
/**
 * Brings a Supabase project to the state the app needs — idempotently — and reports what it did.
 *
 * Written for the production project, usable for any: every step is safe to repeat.
 *
 *   1. Link the CLI to the project (the database password is read from `SUPABASE_DB_PASSWORD` or prompted by the
 *      CLI; it is never written anywhere by this script).
 *   2. `db push` — applies migrations not yet applied. Never resets.
 *   3. Seed the content catalogue **only if it is empty** (`lessons` has no rows). `seed.sql` is plain inserts;
 *      re-running it on a seeded database would fail on the first duplicate, so the check is what makes this
 *      idempotent. The seed contains catalogue rows only — goals, skills, lessons, steps, troubleshooting — no
 *      users, no fixtures.
 *   4. Deploy every Edge Function with `--no-verify-jwt` (each verifies its own tokens; the webhook has none).
 *   5. Show the auth/config diff so `[remotes.<env>]` overrides can be pushed knowingly (`--push-config` applies).
 *   6. List which secrets exist by name. Values are never printed; setting them is a separate, manual command.
 *
 * Usage:
 *   node tools/release/production-supabase.mjs --env production [--push-config] [--relink staging]
 *
 * Prerequisites: `supabase login` done interactively; `supabase/environments.json` names the project ref.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const envName = args[args.indexOf("--env") + 1];
const pushConfig = args.includes("--push-config");
const relinkIdx = args.indexOf("--relink");
const relinkTo = relinkIdx >= 0 ? args[relinkIdx + 1] : null;

const environments = JSON.parse(
  readFileSync(join(root, "supabase/environments.json"), "utf8"),
);
const ref = envName ? environments[envName] : null;
if (!envName || !ref) {
  console.error(
    "usage: production-supabase.mjs --env <production|staging> [--push-config] [--relink <env>]\n" +
      "The environment must have a project ref in supabase/environments.json.",
  );
  process.exit(2);
}
if (envName === "production" && ref === environments.staging) {
  console.error("Refusing: production and staging point at the same project.");
  process.exit(2);
}

const FUNCTIONS = [
  "auth-merge-guest",
  "purchases-verify",
  "revenuecat-webhook",
  "account-delete",
];

function supabase(cmdArgs, { capture = false, allowFail = false } = {}) {
  const full = ["supabase", ...cmdArgs];
  console.log(`\n$ pnpm ${full.join(" ")}`);
  const result = spawnSync("pnpm", full, {
    cwd: root,
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0 && !allowFail) {
    console.error(`\nFailed: pnpm ${full.join(" ")} (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? "";
}

console.log(`Target: ${envName} (${ref})`);

// 1. Link. The CLI stores the password in the OS keychain; SUPABASE_DB_PASSWORD, if set, is used silently.
supabase(["link", "--project-ref", ref]);

// 2. Migrations.
supabase(["db", "push", "--linked", "--yes"]);
supabase(["migration", "list", "--linked"]);

// 3. Content, once.
const countOut = execFileSync(
  "pnpm",
  [
    "supabase",
    "db",
    "query",
    "--linked",
    "--output",
    "json",
    "select (select count(*) from lessons) as lessons, (select count(*) from lesson_steps) as steps, (select count(*) from lesson_troubleshooting) as troubleshooting, (select count(*) from skills) as skills, (select count(*) from training_goals) as goals",
  ],
  { cwd: root, encoding: "utf8" },
);
// The CLI prints a `$ supabase …` echo line before the JSON document; the document itself carries `rows`.
const jsonStart = countOut.indexOf("{");
const counts = JSON.parse(countOut.slice(jsonStart)).rows?.[0] ?? {};
console.log("\nCatalogue rows:", counts);

if (Number(counts.lessons ?? 0) === 0) {
  console.log("Catalogue is empty — applying supabase/seed.sql once.");
  supabase(["db", "query", "--linked", "-f", "supabase/seed.sql"]);
} else {
  console.log("Catalogue already seeded — leaving it untouched.");
}

// 4. Functions.
for (const fn of FUNCTIONS) {
  supabase([
    "functions",
    "deploy",
    fn,
    "--project-ref",
    ref,
    "--no-verify-jwt",
  ]);
}

// 5. Config. The [remotes.<env>] block only applies when its project_id is this ref; refuse to push otherwise,
// because the base config would silently apply instead (local site_url, password sign-up enabled, Apple off).
supabase(["config", "diff", "--project-ref", ref], { allowFail: true });
const configToml = readFileSync(join(root, "supabase/config.toml"), "utf8");
const remoteBlock = new RegExp(
  `\\[remotes\\.${envName}\\]\\s*\\n\\s*project_id\\s*=\\s*"([a-z]{20})"`,
).exec(configToml);
const remoteRef = remoteBlock?.[1] ?? null;
if (pushConfig && remoteRef !== ref) {
  console.error(
    `\nRefusing to push config: [remotes.${envName}] project_id is ${remoteRef ?? "(missing)"}, not ${ref}. ` +
      "Set it in supabase/config.toml first.",
  );
  process.exit(2);
}
if (pushConfig) {
  supabase(["config", "push", "--project-ref", ref, "--yes"]);
} else {
  console.log(
    "\nConfig not pushed. Review the diff above; re-run with --push-config to apply [remotes." +
      envName +
      "] from supabase/config.toml.",
  );
}

// 6. Secrets, by name only.
supabase(["secrets", "list", "--project-ref", ref], { allowFail: true });
console.log(
  "\nRevenueCat secrets are set separately and never by this script:\n" +
    `  pnpm supabase secrets set --project-ref ${ref} REVENUECAT_SECRET_API_KEY=<sk_…> REVENUECAT_WEBHOOK_AUTH=<random>`,
);

if (relinkTo) {
  const back = environments[relinkTo];
  if (!back) {
    console.error(`Cannot relink: no ref for ${relinkTo}.`);
    process.exit(2);
  }
  supabase(["link", "--project-ref", back]);
  console.log(`\nRe-linked to ${relinkTo} (${back}).`);
}

console.log("\nDone.");
