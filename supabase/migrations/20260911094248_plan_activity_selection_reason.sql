-- Records why the plan engine chose each activity.
--
-- Additive to the Phase 0 schema. `is_review` is a boolean and cannot distinguish "only just became eligible"
-- from "brand new" from "you left this unfinished" — and when a recommendation looks wrong, that distinction is
-- the whole of the answer. Re-deriving it later is impossible: it depends on the history as it was at generation
-- time, which has since moved on.
--
-- Defaulted so existing rows remain valid, and checked so an unknown reason cannot be written.
alter table plan_activities
  add column selection_reason text not null default 'new_skill'
  check (
    selection_reason in (
      'continue_unfinished',
      'prerequisite_unlocked',
      'spaced_review',
      'new_skill'
    )
  );

comment on column plan_activities.selection_reason is
  'Machine-readable reason the plan engine selected this activity. is_review is true exactly when this is spaced_review.';
