import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { userSchema, anonymousSessionSchema } from "./user";
import { dogSchema } from "./dog";
import {
  trainingGoalSchema,
  dogGoalSchema,
  skillSchema,
  dogSkillSchema,
} from "./goals-skills";
import {
  lessonSchema,
  lessonStepSchema,
  lessonTroubleshootingSchema,
} from "./lesson";
import {
  planEngineVersionSchema,
  trainingPlanSchema,
  planDaySchema,
  planActivitySchema,
} from "./plan";
import { trainingSessionSchema, sessionEventSchema } from "./session";
import {
  progressSchema,
  streakSchema,
  reminderSchema,
  notificationPreferenceSchema,
} from "./progress";
import {
  subscriptionSchema,
  entitlementSchema,
  purchaseEventSchema,
} from "./billing";
import { contentVersionSchema } from "./content";
import { appEventSchema } from "./analytics";

/**
 * Guards against drift between the hand-written domain models and the real database schema.
 *
 * `database.types.ts` is generated from the live linked project (`supabase gen types typescript --linked`), so it
 * is ground truth for what actually exists. Parsing it here — rather than type-level assertions — is deliberate:
 * generated types are erased at runtime, and a parsed comparison can name the exact offending column in the
 * failure message instead of emitting an opaque "Type X is not assignable to Y".
 */

const here = dirname(fileURLToPath(import.meta.url));
const generated = readFileSync(
  resolve(here, "../generated/database.types.ts"),
  "utf8",
);

/** Extract `public.Tables.<name>.Row` column names from the generated file. */
function parseRowColumns(source: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const publicBlock = source.slice(source.indexOf("  public: {"));
  const tableRe = /^      (\w+): \{\n        Row: \{\n([\s\S]*?)\n        \}/gm;
  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(publicBlock)) !== null) {
    const [, tableName, body] = match;
    if (!tableName || !body) continue;
    const columns = new Set<string>();
    for (const line of body.split("\n")) {
      const col = /^\s{10}(\w+):/.exec(line);
      if (col?.[1]) columns.add(col[1]);
    }
    tables.set(tableName, columns);
  }
  return tables;
}

const dbTables = parseRowColumns(generated);

const toSnake = (s: string) =>
  s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function schemaKeys(schema: z.ZodObject<z.ZodRawShape>): string[] {
  return Object.keys(schema.shape).map(toSnake);
}

/**
 * Columns that intentionally have no 1:1 domain field, with the reason. Anything NOT listed here that appears in
 * the database but not the domain model is a genuine drift failure.
 */
const INTENTIONAL_DB_ONLY: Record<string, Record<string, string>> = {
  dogs: {
    owner_user_id: "modeled as the OwnerRef union `owner`, not a raw column",
  },
  app_events: {
    user_id: "modeled as the OwnerRef union `actor`, not a raw column",
  },
};

/**
 * `localizationStringSchema` is intentionally absent: translations are file-backed resources in `packages/i18n`,
 * not a table (see the note on the model itself). It is listed here so its absence reads as a decision rather
 * than an oversight.
 */
const MODEL_TO_TABLE: Array<{
  table: string;
  schema: z.ZodObject<z.ZodRawShape>;
  domainOnly?: string[];
}> = [
  { table: "profiles", schema: userSchema },
  { table: "anonymous_sessions", schema: anonymousSessionSchema },
  { table: "dogs", schema: dogSchema, domainOnly: ["owner"] },
  { table: "training_goals", schema: trainingGoalSchema },
  { table: "dog_goals", schema: dogGoalSchema },
  { table: "skills", schema: skillSchema },
  { table: "dog_skills", schema: dogSkillSchema },
  { table: "lessons", schema: lessonSchema },
  { table: "lesson_steps", schema: lessonStepSchema },
  { table: "lesson_troubleshooting", schema: lessonTroubleshootingSchema },
  { table: "plan_engine_versions", schema: planEngineVersionSchema },
  { table: "training_plans", schema: trainingPlanSchema },
  { table: "plan_days", schema: planDaySchema },
  { table: "plan_activities", schema: planActivitySchema },
  { table: "training_sessions", schema: trainingSessionSchema },
  { table: "session_events", schema: sessionEventSchema },
  { table: "progress", schema: progressSchema },
  { table: "streaks", schema: streakSchema },
  { table: "reminders", schema: reminderSchema },
  { table: "notification_preferences", schema: notificationPreferenceSchema },
  { table: "subscriptions", schema: subscriptionSchema },
  { table: "entitlements", schema: entitlementSchema },
  { table: "purchase_events", schema: purchaseEventSchema },
  { table: "content_versions", schema: contentVersionSchema },
  { table: "app_events", schema: appEventSchema, domainOnly: ["actor"] },
];

describe("generated database types", () => {
  it("parsed at least the full public table set", () => {
    expect(dbTables.size).toBeGreaterThanOrEqual(25);
  });

  it("covers every table the domain models claim to map", () => {
    const missing = MODEL_TO_TABLE.filter((m) => !dbTables.has(m.table)).map(
      (m) => m.table,
    );
    expect(missing).toEqual([]);
  });
});

describe.each(MODEL_TO_TABLE)(
  "$table ↔ domain model",
  ({ table, schema, domainOnly = [] }) => {
    const columns = dbTables.get(table);

    it("every domain field exists as a database column", () => {
      expect(
        columns,
        `table ${table} missing from generated types`,
      ).toBeDefined();
      const allowed = new Set(domainOnly.map(toSnake));
      const orphaned = schemaKeys(schema).filter(
        (k) => !columns!.has(k) && !allowed.has(k),
      );
      expect(orphaned, `domain fields with no column in ${table}`).toEqual([]);
    });

    it("every database column is represented in the domain model", () => {
      expect(columns).toBeDefined();
      const modelled = new Set(schemaKeys(schema));
      const intentional = INTENTIONAL_DB_ONLY[table] ?? {};
      const unmodelled = [...columns!].filter(
        (c) => !modelled.has(c) && !(c in intentional),
      );
      expect(
        unmodelled,
        `columns in ${table} absent from the domain model`,
      ).toEqual([]);
    });
  },
);
