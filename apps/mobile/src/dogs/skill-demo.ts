import type { DogExpression, DogProp, DogPose } from "./dog-art";

/**
 * What the dog does while a lesson is in progress, by the skill the lesson teaches.
 *
 * The table in docs/architecture/phase-11-the-dog-at-work.md, verbatim. A skill the table does not name — or no
 * skill at all, before the catalogue has resolved — gets the plain sitting, attentive dog with nothing in front of
 * it. Props are declared here and nowhere else: a pose never implies one.
 */
export interface SkillDemo {
  pose: DogPose;
  expression: DogExpression;
  props: readonly DogProp[];
}

const DEFAULT: SkillDemo = { pose: "sit", expression: "attentive", props: [] };

const DEMOS: Record<string, SkillDemo> = {
  name_response: { pose: "sit", expression: "attentive", props: [] },
  sit: { pose: "sit", expression: "focused", props: ["treat"] },
  down: { pose: "down", expression: "focused", props: ["treat"] },
  stay: { pose: "sit", expression: "focused", props: [] },
  come: { pose: "run", expression: "happy", props: [] },
  leave_it: { pose: "sit", expression: "focused", props: ["treat"] },
  place: { pose: "down", expression: "focused", props: ["mat"] },
  loose_leash_basics: {
    pose: "stand",
    expression: "attentive",
    props: ["leash"],
  },
};

export function skillDemo(skillSlug: string | null | undefined): SkillDemo {
  if (!skillSlug) return DEFAULT;
  return DEMOS[skillSlug] ?? DEFAULT;
}
