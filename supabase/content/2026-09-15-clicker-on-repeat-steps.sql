-- Content publish: the clicker on the repeat step of the four lessons whose repetitions contain a click.
--
-- The step model carries two independent flags — `requires_clicker_press` (the step expects at least one click)
-- and `repetition_target` (the step counts reps) — and the session screen shows the clicker for the first,
-- "Count it" for the second, and both together when both are set. Name Game, Stay, Leave It and Place put the
-- click on an earlier step and "Repeat" on a later one that declared reps only, so during the repetitions the
-- trainer was asked to count without a clicker on screen although every repetition contains the click. Rule,
-- applied exactly and not extended: a repetition step in a lesson whose equipment lists the clicker, where the
-- repeated sequence contains a click step, declares `requires_clicker_press = true` as well as its
-- `repetition_target`. Sit, Down and Come already did; the six lessons without a clicker use a spoken marker and
-- are untouched. Clicks and repetitions remain separate events; only which steps declare which changes.
--
-- Applied to a live environment with `supabase db query --linked -f supabase/content/<this file>`. The seed is
-- the source of truth for a *fresh* environment; this file is how the same change reaches one that already has
-- users, without `db reset`. UPDATE in place keeps every step id stable, so training history stays attached and
-- a paused lesson still resumes. Idempotent: keyed on (lesson slug, step_order), and re-running writes the same
-- values again.

with repeat_steps (slug, step_order) as (
  values
    ('name_game', 3),
    ('stay',      2),
    ('leave_it',  2),
    ('place',     2)
)
update lesson_steps s
set requires_clicker_press = true
from repeat_steps r
join lessons l on l.slug = r.slug
where s.lesson_id = l.id
  and s.step_order = r.step_order;

-- Proof, returned by the same call: every counted step in a clicker lesson, with its click flag. All true.
select
  l.slug,
  s.step_order,
  s.repetition_target,
  s.requires_clicker_press
from lesson_steps s
join lessons l on l.id = s.lesson_id
where 'clicker' = any (l.equipment)
  and s.repetition_target is not null
order by l.slug, s.step_order;
