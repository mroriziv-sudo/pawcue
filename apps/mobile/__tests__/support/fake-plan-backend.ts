import type { GeneratedPlan } from "@pawcue/domain";
import type { StoredPlan } from "../../src/plans/plan-repository";

/**
 * An in-memory stand-in for the `training_plans` tables.
 *
 * It enforces the one rule the schema enforces — `training_plans_one_active_per_dog` — because that constraint is
 * the whole reason the lifecycle supersedes rather than accumulates. A fake that allowed two active plans would
 * let a duplicate-generation bug pass.
 *
 * Writes are counted so a test can assert that an ordinary visit persisted *nothing*.
 */
export interface FakePlanBackend {
  rows: StoredPlan[];
  persistCalls: number;
  fetchCalls: number;
  /** Set to make persistence fail, as an offline or RLS-rejected write would. */
  failPersist: boolean;
  reset(): void;
}

export function createFakePlanBackend(): FakePlanBackend {
  return {
    rows: [],
    persistCalls: 0,
    fetchCalls: 0,
    failPersist: false,
    reset() {
      this.rows = [];
      this.persistCalls = 0;
      this.fetchCalls = 0;
      this.failPersist = false;
    },
  };
}

export function fakePersist(
  backend: FakePlanBackend,
  generated: GeneratedPlan,
  engineVersion: string,
): void {
  backend.persistCalls += 1;
  if (backend.failPersist) throw new Error("could not write plan");

  // Exactly what the repository does, and what the partial unique index requires.
  for (const row of backend.rows) {
    if (row.dogId === generated.plan.dogId && row.status === "active") {
      row.status = "superseded";
    }
  }

  backend.rows.push({
    id: `plan-${backend.rows.length + 1}`,
    dogId: generated.plan.dogId,
    engineVersion,
    status: "active",
    dailyMinutes: generated.plan.dailyMinutes,
    startDate: generated.plan.startDate,
    lengthDays: generated.plan.lengthDays,
    days: generated.days.map((entry) => ({
      dayIndex: entry.day.dayIndex,
      date: entry.day.date,
      totalMinutes: entry.day.totalMinutes,
      activities: entry.activities.map((activity) => ({
        lessonId: activity.lessonId,
        sortOrder: activity.sortOrder,
        estimatedMinutes: activity.estimatedMinutes,
        isReview: activity.isReview,
        selectionReason: activity.selectionReason,
      })),
    })),
  });
}

export function fakeFetchActive(
  backend: FakePlanBackend,
  dogId: string,
): StoredPlan | null {
  backend.fetchCalls += 1;
  return (
    backend.rows.find(
      (row) => row.dogId === dogId && row.status === "active",
    ) ?? null
  );
}

/** Active plans for a dog. More than one would mean the constraint was violated. */
export function activePlansFor(
  backend: FakePlanBackend,
  dogId: string,
): StoredPlan[] {
  return backend.rows.filter(
    (row) => row.dogId === dogId && row.status === "active",
  );
}
