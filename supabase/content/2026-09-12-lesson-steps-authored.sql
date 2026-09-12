-- Content publish: authored steps for the eleven lessons that shipped with the `<slug>.stepN` scaffold.
--
-- Applied to a live environment with `supabase db query --linked -f supabase/content/<this file>`. The seed is
-- the source of truth for a *fresh* environment; this file is how the same change reaches one that already has
-- users, without `db reset` — which would discard every dog and every training session on it.
--
-- UPDATE, not DELETE + INSERT, on purpose. `session_events.lesson_step_id` references these rows (ON DELETE SET
-- NULL), and a persisted in-progress session on a device holds `currentStepId`. Rewriting in place keeps every
-- step id stable, so training history stays attached and a paused lesson still resumes.
--
-- Idempotent: keyed on (lesson slug, step_order), and re-running writes the same values again.

with authored (slug, step_order, instruction_key, requires_clicker_press, repetition_target) as (
  values
    ('down',                   0, 'lesson.down.step1',                 false, null::smallint),
    ('down',                   1, 'lesson.down.step2',                 false, null),
    ('down',                   2, 'lesson.down.step3',                 true,  5),
    ('come',                   0, 'lesson.come.step1',                 false, null),
    ('come',                   1, 'lesson.come.step2',                 false, null),
    ('come',                   2, 'lesson.come.step3',                 true,  5),
    ('stay',                   0, 'lesson.stay.step1',                 false, null),
    ('stay',                   1, 'lesson.stay.step2',                 true,  null),
    ('stay',                   2, 'lesson.stay.step3',                 false, 5),
    ('leave_it',               0, 'lesson.leaveIt.step1',              false, null),
    ('leave_it',               1, 'lesson.leaveIt.step2',              true,  null),
    ('leave_it',               2, 'lesson.leaveIt.step3',              false, 5),
    ('place',                  0, 'lesson.place.step1',                false, null),
    ('place',                  1, 'lesson.place.step2',                true,  null),
    ('place',                  2, 'lesson.place.step3',                false, 5),
    ('calm_settle',            0, 'lesson.calmSettle.step1',           false, null),
    ('calm_settle',            1, 'lesson.calmSettle.step2',           false, null),
    ('calm_settle',            2, 'lesson.calmSettle.step3',           false, 3),
    ('loose_leash_foundation', 0, 'lesson.looseLeashFoundation.step1', false, null),
    ('loose_leash_foundation', 1, 'lesson.looseLeashFoundation.step2', false, null),
    ('loose_leash_foundation', 2, 'lesson.looseLeashFoundation.step3', false, 5),
    ('jumping_foundation',     0, 'lesson.jumpingFoundation.step1',    false, null),
    ('jumping_foundation',     1, 'lesson.jumpingFoundation.step2',    false, null),
    ('jumping_foundation',     2, 'lesson.jumpingFoundation.step3',    false, 5),
    ('biting_foundation',      0, 'lesson.bitingFoundation.step1',     false, null),
    ('biting_foundation',      1, 'lesson.bitingFoundation.step2',     false, null),
    ('biting_foundation',      2, 'lesson.bitingFoundation.step3',     false, 5),
    ('crate_foundation',       0, 'lesson.crateFoundation.step1',      false, null),
    ('crate_foundation',       1, 'lesson.crateFoundation.step2',      false, null),
    ('crate_foundation',       2, 'lesson.crateFoundation.step3',      false, 5),
    ('potty_foundation',       0, 'lesson.pottyFoundation.step1',      false, null),
    ('potty_foundation',       1, 'lesson.pottyFoundation.step2',      false, null),
    ('potty_foundation',       2, 'lesson.pottyFoundation.step3',      false, null)
)
update lesson_steps s
set instruction_key        = a.instruction_key,
    requires_clicker_press = a.requires_clicker_press,
    repetition_target      = a.repetition_target
from authored a
join lessons l on l.slug = a.slug
where s.lesson_id = l.id
  and s.step_order = a.step_order;

-- Proof, returned by the same call: nothing user-facing may still carry a scaffold key.
select
  count(*) filter (where instruction_key not like 'lesson.%') as scaffold_keys_remaining,
  count(*)                                                    as total_steps,
  count(distinct lesson_id)                                   as lessons_with_steps
from lesson_steps;
