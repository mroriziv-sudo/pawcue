import type {
  TrainingPlanGenerator,
  TrainingPlanGeneratorInput,
  GeneratedPlan,
} from "./training-plan-generator";

/**
 * Alternative provider interface prepared per brief §9 — NOT enabled by default and not implemented in v1. Any
 * future implementation must still satisfy `TrainingPlanGenerator` (deterministic per fixed engine version, no
 * hidden network dependency for the core "what to train today" answer) and must go through the same safety
 * constraints as `TrainingCoachProvider` (see providers/training-coach-provider.ts) for any free-text guidance it
 * attaches.
 */
export interface AiTrainingPlanGenerator extends TrainingPlanGenerator {
  readonly isAiBacked: true;
}

export function assertNotYetImplemented(): never {
  throw new Error(
    "AiTrainingPlanGenerator has no v1 implementation by design (brief §9: do not enable AI-generated training advice by default).",
  );
}

export type { TrainingPlanGeneratorInput, GeneratedPlan };
