import { create } from "zustand";
import {
  PLAN_ENGINE_VERSION,
  RulesBasedTrainingPlanGenerator,
  type Dog,
  type PlanningCatalogue,
  type TrainingSessionState,
} from "@pawcue/domain";
import {
  fetchActivePlan,
  persistGeneratedPlan,
  type StoredPlan,
} from "../plans/plan-repository";
import {
  regenerationReason,
  type RegenerationReason,
} from "../plans/plan-lifecycle";
import { buildPlanInput } from "../plans/plan-inputs";
import {
  useTrainingLogStore,
  type TrainingSessionRecord,
} from "./training-log-store";

/**
 * The dog's active training plan.
 *
 * Owns one decision: whether to reuse what is persisted or replace it. The rules themselves live in
 * `plan-lifecycle.ts` as a pure function, so this file is only responsible for *when* the question is asked and
 * for making sure it is asked once.
 *
 * This is not a second plan model. `StoredPlan` is the Phase 5 row read back; nothing here is derived state that
 * could disagree with the database.
 */

export type PlanStatus =
  | "idle"
  | "loading"
  | "ready"
  /** Content could not be reached and nothing was cached. Honest, not fabricated. */
  | "unavailable";

interface PlanState {
  plan: StoredPlan | null;
  status: PlanStatus;
  /** Why the last regeneration happened. Diagnostics; never shown to a user. */
  lastRegeneration: RegenerationReason | null;

  ensurePlanForToday: (args: EnsureArgs) => Promise<void>;
  clear: () => void;
}

export interface EnsureArgs {
  dog: Dog;
  catalogue: PlanningCatalogue;
  activeSession: TrainingSessionState | null;
  /** ISO date, `YYYY-MM-DD`. Injected so a test can control the day. */
  today: string;
}

/**
 * Guards against the same plan being generated twice.
 *
 * Two screens mounting together, or an effect re-firing, would otherwise each find no plan and each generate one
 * — and although `training_plans_one_active_per_dog` would stop two *active* rows existing, the loser would still
 * have superseded the winner, leaving a trail of dead plans and a race over which survived. Keyed by dog and day
 * because that is the granularity the question has an answer at.
 */
const inFlight = new Map<string, Promise<void>>();

/** Test seam. Not used by the app. */
export function resetPlanLifecycleGuards(): void {
  inFlight.clear();
}

function completedRecords(): TrainingSessionRecord[] {
  return useTrainingLogStore.getState().completed;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plan: null,
  status: "idle",
  lastRegeneration: null,

  ensurePlanForToday: async (args) => {
    const key = `${args.dog.id}:${args.today}`;
    const existing = inFlight.get(key);
    if (existing) return existing;

    const run = (async () => {
      if (get().status === "idle") set({ status: "loading" });

      let stored: StoredPlan | null = null;
      try {
        stored = await fetchActivePlan(args.dog.id);
      } catch {
        // Offline, or the row could not be read. Falls through to the validity check, which treats a missing plan
        // as a reason to generate — and generation will fail honestly if the server is genuinely unreachable.
        stored = null;
      }

      const reason = regenerationReason({
        plan: stored,
        catalogue: args.catalogue,
        engineVersion: PLAN_ENGINE_VERSION,
        today: args.today,
        dailyMinutes: args.dog.dailyTrainingMinutes ?? 10,
      });

      if (!reason && stored) {
        // The common path by a wide margin: a plan already exists for today and is still valid.
        set({ plan: stored, status: "ready" });
        return;
      }

      const generator = new RulesBasedTrainingPlanGenerator(args.catalogue);
      const generated = generator.generate(
        buildPlanInput({
          dog: args.dog,
          completed: completedRecords(),
          catalogue: args.catalogue,
          activeSession: args.activeSession,
          today: new Date(`${args.today}T00:00:00Z`),
          lengthDays: 1,
        }),
      );

      try {
        await persistGeneratedPlan(generated, PLAN_ENGINE_VERSION);
        // Read back rather than trusting the local projection: the row is the source of truth, and reading it
        // proves the write landed and that RLS allowed it.
        const saved = await fetchActivePlan(args.dog.id);
        set({
          plan: saved,
          status: saved ? "ready" : "unavailable",
          lastRegeneration: reason,
        });
      } catch {
        /**
         * The plan could not be stored.
         *
         * Deliberately not falling back to an unpersisted in-memory plan: that would be a second plan model with
         * different rules, invisible to every other surface and gone on relaunch. An honest unavailable state is
         * better than a plan that only exists on this screen.
         */
        set({ plan: null, status: "unavailable", lastRegeneration: reason });
      }
    })().finally(() => {
      inFlight.delete(key);
    });

    inFlight.set(key, run);
    return run;
  },

  clear: () => {
    inFlight.clear();
    set({ plan: null, status: "idle", lastRegeneration: null });
  },
}));
