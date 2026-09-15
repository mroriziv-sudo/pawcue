-- Local development seed data (brief §41). Content is structured rows, never hardcoded into UI files.
-- Title/description/instruction/guidance columns store i18n KEYS (resolved via packages/i18n), never literal text.

insert into plan_engine_versions (id, version, changelog_key)
values ('00000000-0000-4000-a000-000000000001', '1.0.0', 'planEngine.changelog.v1_0_0');

insert into content_versions (id, domain, version)
values
  ('00000000-0000-4000-a000-0000000000c1', 'lessons', '1.0.0'),
  ('00000000-0000-4000-a000-0000000000c2', 'troubleshooting', '1.0.0');

-- ---------------------------------------------------------------------------
-- training_goals (brief §4 Screen 3)
-- ---------------------------------------------------------------------------
insert into training_goals (slug, title_key, description_key, sort_order) values
  ('biting_nipping',  'goal.bitingNipping.title',  'goal.bitingNipping.description',  1),
  ('potty_training',  'goal.pottyTraining.title',  'goal.pottyTraining.description',  2),
  ('leash_pulling',   'goal.leashPulling.title',   'goal.leashPulling.description',   3),
  ('recall',          'goal.recall.title',         'goal.recall.description',         4),
  ('jumping',         'goal.jumping.title',        'goal.jumping.description',        5),
  ('basic_commands',  'goal.basicCommands.title',  'goal.basicCommands.description',  6),
  ('crate_training',  'goal.crateTraining.title',  'goal.crateTraining.description',  7),
  ('calm_behavior',   'goal.calmBehavior.title',   'goal.calmBehavior.description',   8),
  ('other',           'goal.other.title',          'goal.other.description',          9);

-- ---------------------------------------------------------------------------
-- skills (brief §5 Screen 5 + prerequisite graph feeding the plan engine)
-- ---------------------------------------------------------------------------
insert into skills (id, slug, title_key, difficulty) values
  ('00000000-0000-4000-a000-0000000010a0', 'name_response',       'skill.nameResponse.title',      1),
  ('00000000-0000-4000-a000-0000000010a1', 'sit',                 'skill.sit.title',                1),
  ('00000000-0000-4000-a000-0000000010a2', 'down',                'skill.down.title',               2),
  ('00000000-0000-4000-a000-0000000010a3', 'stay',                'skill.stay.title',                2),
  ('00000000-0000-4000-a000-0000000010a4', 'come',                'skill.come.title',               2),
  ('00000000-0000-4000-a000-0000000010a5', 'leave_it',            'skill.leaveIt.title',            2),
  ('00000000-0000-4000-a000-0000000010a6', 'place',               'skill.place.title',              3),
  ('00000000-0000-4000-a000-0000000010a7', 'loose_leash_basics',  'skill.looseLeashBasics.title',   3);

-- 'stay' and 'come' build on 'sit'; 'place' builds on 'down'.
update skills set prerequisite_skill_ids = array['00000000-0000-4000-a000-0000000010a1'::uuid] where slug in ('stay', 'come');
update skills set prerequisite_skill_ids = array['00000000-0000-4000-a000-0000000010a2'::uuid] where slug = 'place';

-- ---------------------------------------------------------------------------
-- lessons (brief §41 seed set) — each references a skill and a content_version
-- ---------------------------------------------------------------------------
insert into lessons (id, slug, skill_id, title_key, goal_key, estimated_minutes, equipment, difficulty, is_always_free, content_version_id) values
  ('00000000-0000-4000-a000-0000000020a0', 'name_game',            '00000000-0000-4000-a000-0000000010a0', 'lesson.nameGame.title',            'lesson.nameGame.goal',            3,  '{treats,clicker}',        1, true,  '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020a1', 'sit',                  '00000000-0000-4000-a000-0000000010a1', 'lesson.sit.title',                  'lesson.sit.goal',                  3,  '{treats,clicker}',        1, true,  '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020a2', 'down',                 '00000000-0000-4000-a000-0000000010a2', 'lesson.down.title',                 'lesson.down.goal',                 4,  '{treats,clicker}',        2, false, '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020a3', 'come',                 '00000000-0000-4000-a000-0000000010a4', 'lesson.come.title',                 'lesson.come.goal',                 5,  '{treats,clicker,leash}',  2, false, '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020a4', 'stay',                 '00000000-0000-4000-a000-0000000010a3', 'lesson.stay.title',                 'lesson.stay.goal',                 4,  '{treats,clicker}',        2, false, '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020a5', 'leave_it',             '00000000-0000-4000-a000-0000000010a5', 'lesson.leaveIt.title',              'lesson.leaveIt.goal',              4,  '{treats,clicker}',        2, false, '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020a6', 'place',                '00000000-0000-4000-a000-0000000010a6', 'lesson.place.title',                'lesson.place.goal',                5,  '{treats,clicker,mat_or_bed}', 3, false, '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020a7', 'calm_settle',          '00000000-0000-4000-a000-0000000010a6', 'lesson.calmSettle.title',           'lesson.calmSettle.goal',           5,  '{mat_or_bed}',            2, false, '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020a8', 'loose_leash_foundation','00000000-0000-4000-a000-0000000010a7', 'lesson.looseLeashFoundation.title', 'lesson.looseLeashFoundation.goal', 6,  '{treats,leash}',          3, false, '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020a9', 'jumping_foundation',   '00000000-0000-4000-a000-0000000010a1', 'lesson.jumpingFoundation.title',    'lesson.jumpingFoundation.goal',    4,  '{treats}',                2, false, '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020aa', 'biting_foundation',    '00000000-0000-4000-a000-0000000010a0', 'lesson.bitingFoundation.title',     'lesson.bitingFoundation.goal',     4,  '{treats}',                1, true,  '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020ab', 'crate_foundation',     '00000000-0000-4000-a000-0000000010a6', 'lesson.crateFoundation.title',      'lesson.crateFoundation.goal',      5,  '{treats,crate}',          2, false, '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-a000-0000000020ac', 'potty_foundation',     '00000000-0000-4000-a000-0000000010a0', 'lesson.pottyFoundation.title',      'lesson.pottyFoundation.goal',      3,  '{treats}',                1, true,  '00000000-0000-4000-a000-0000000000c1');

-- ---------------------------------------------------------------------------
-- lesson_steps — Name Game (brief §4 Screen 2) and Sit (brief §6 example) were authored first; the other eleven
-- followed in the Phase 8 content follow-up, below.
-- ---------------------------------------------------------------------------
insert into lesson_steps (lesson_id, step_order, instruction_key, requires_clicker_press, repetition_target) values
  ('00000000-0000-4000-a000-0000000020a0', 0, 'lesson.nameGame.step1', false, null),
  ('00000000-0000-4000-a000-0000000020a0', 1, 'lesson.nameGame.step2', true,  null),
  ('00000000-0000-4000-a000-0000000020a0', 2, 'lesson.nameGame.step3', false, null),
  ('00000000-0000-4000-a000-0000000020a0', 3, 'lesson.nameGame.step4', true,  5);

insert into lesson_steps (lesson_id, step_order, instruction_key, requires_clicker_press, repetition_target) values
  ('00000000-0000-4000-a000-0000000020a1', 0, 'lesson.sit.step1', false, null),
  ('00000000-0000-4000-a000-0000000020a1', 1, 'lesson.sit.step2', false, null),
  ('00000000-0000-4000-a000-0000000020a1', 2, 'lesson.sit.step3', true,  5);

-- The remaining eleven lessons, authored (Phase 8 content follow-up). Every instruction key is a literal under
-- `lesson.*` so the content-conformance test can resolve it in both locales; the computed `slug || '.stepN'`
-- scaffold this replaces produced keys no audit could see and no locale could translate.
--
-- Clicker steps only appear where the lesson's equipment lists the clicker. Calm Settle, Loose Leash, Jumping,
-- Biting, Crate and Potty are authored around a spoken marker instead, because a step that demands a click in a
-- lesson whose equipment says "treats" is asking for a tool the user was told they would not need.
--
-- A repetition step in a clicker lesson whose repeated sequence contains a click declares the click as well as
-- the count, so the clicker is on screen while the repetitions run (content follow-up, 2026-09-15). The two
-- flags stay independent events; this only says which steps declare which.
insert into lesson_steps (lesson_id, step_order, instruction_key, requires_clicker_press, repetition_target) values
  -- down — treats, clicker
  ('00000000-0000-4000-a000-0000000020a2', 0, 'lesson.down.step1',                 false, null),
  ('00000000-0000-4000-a000-0000000020a2', 1, 'lesson.down.step2',                 false, null),
  ('00000000-0000-4000-a000-0000000020a2', 2, 'lesson.down.step3',                 true,  5),
  -- come — treats, clicker, leash
  ('00000000-0000-4000-a000-0000000020a3', 0, 'lesson.come.step1',                 false, null),
  ('00000000-0000-4000-a000-0000000020a3', 1, 'lesson.come.step2',                 false, null),
  ('00000000-0000-4000-a000-0000000020a3', 2, 'lesson.come.step3',                 true,  5),
  -- stay — treats, clicker
  ('00000000-0000-4000-a000-0000000020a4', 0, 'lesson.stay.step1',                 false, null),
  ('00000000-0000-4000-a000-0000000020a4', 1, 'lesson.stay.step2',                 true,  null),
  ('00000000-0000-4000-a000-0000000020a4', 2, 'lesson.stay.step3',                 true,  5),
  -- leave_it — treats, clicker
  ('00000000-0000-4000-a000-0000000020a5', 0, 'lesson.leaveIt.step1',              false, null),
  ('00000000-0000-4000-a000-0000000020a5', 1, 'lesson.leaveIt.step2',              true,  null),
  ('00000000-0000-4000-a000-0000000020a5', 2, 'lesson.leaveIt.step3',              true,  5),
  -- place — treats, clicker, mat
  ('00000000-0000-4000-a000-0000000020a6', 0, 'lesson.place.step1',                false, null),
  ('00000000-0000-4000-a000-0000000020a6', 1, 'lesson.place.step2',                true,  null),
  ('00000000-0000-4000-a000-0000000020a6', 2, 'lesson.place.step3',                true,  5),
  -- calm_settle — mat only; quiet praise, no clicker, a small number of calm moments
  ('00000000-0000-4000-a000-0000000020a7', 0, 'lesson.calmSettle.step1',           false, null),
  ('00000000-0000-4000-a000-0000000020a7', 1, 'lesson.calmSettle.step2',           false, null),
  ('00000000-0000-4000-a000-0000000020a7', 2, 'lesson.calmSettle.step3',           false, 3),
  -- loose_leash_foundation — treats, leash
  ('00000000-0000-4000-a000-0000000020a8', 0, 'lesson.looseLeashFoundation.step1', false, null),
  ('00000000-0000-4000-a000-0000000020a8', 1, 'lesson.looseLeashFoundation.step2', false, null),
  ('00000000-0000-4000-a000-0000000020a8', 2, 'lesson.looseLeashFoundation.step3', false, 5),
  -- jumping_foundation — treats
  ('00000000-0000-4000-a000-0000000020a9', 0, 'lesson.jumpingFoundation.step1',    false, null),
  ('00000000-0000-4000-a000-0000000020a9', 1, 'lesson.jumpingFoundation.step2',    false, null),
  ('00000000-0000-4000-a000-0000000020a9', 2, 'lesson.jumpingFoundation.step3',    false, 5),
  -- biting_foundation — treats
  ('00000000-0000-4000-a000-0000000020aa', 0, 'lesson.bitingFoundation.step1',     false, null),
  ('00000000-0000-4000-a000-0000000020aa', 1, 'lesson.bitingFoundation.step2',     false, null),
  ('00000000-0000-4000-a000-0000000020aa', 2, 'lesson.bitingFoundation.step3',     false, 5),
  -- crate_foundation — treats, crate
  ('00000000-0000-4000-a000-0000000020ab', 0, 'lesson.crateFoundation.step1',      false, null),
  ('00000000-0000-4000-a000-0000000020ab', 1, 'lesson.crateFoundation.step2',      false, null),
  ('00000000-0000-4000-a000-0000000020ab', 2, 'lesson.crateFoundation.step3',      false, 5),
  -- potty_foundation — treats; a routine followed through the day, so no in-session repetition count
  ('00000000-0000-4000-a000-0000000020ac', 0, 'lesson.pottyFoundation.step1',      false, null),
  ('00000000-0000-4000-a000-0000000020ac', 1, 'lesson.pottyFoundation.step2',      false, null),
  ('00000000-0000-4000-a000-0000000020ac', 2, 'lesson.pottyFoundation.step3',      false, null);

-- ---------------------------------------------------------------------------
-- lesson_troubleshooting — the core differentiator (brief §7). Fully authored for Name Game and Sit;
-- every option below carries a required safety_category, per brief §10/§34.
-- ---------------------------------------------------------------------------
insert into lesson_troubleshooting (lesson_id, slug, prompt_key, guidance_key, safety_category, sort_order) values
  ('00000000-0000-4000-a000-0000000020a0', 'dog_walks_away',          'troubleshoot.dogWalksAway.prompt',          'troubleshoot.dogWalksAway.guidance',          'NORMAL', 1),
  ('00000000-0000-4000-a000-0000000020a0', 'dog_distracted',          'troubleshoot.dogDistracted.prompt',          'troubleshoot.dogDistracted.guidance',          'NORMAL', 2),
  ('00000000-0000-4000-a000-0000000020a0', 'dog_doesnt_understand',   'troubleshoot.dogDoesntUnderstand.prompt',    'troubleshoot.dogDoesntUnderstand.guidance',    'NORMAL', 3),
  ('00000000-0000-4000-a000-0000000020a0', 'dog_already_knows_this',  'troubleshoot.dogAlreadyKnowsThis.prompt',    'troubleshoot.dogAlreadyKnowsThis.guidance',    'NORMAL', 4);

insert into lesson_troubleshooting (lesson_id, slug, prompt_key, guidance_key, safety_category, sort_order) values
  ('00000000-0000-4000-a000-0000000020a1', 'dog_jumps_for_treat',     'troubleshoot.dogJumpsForTreat.prompt',       'troubleshoot.dogJumpsForTreat.guidance',       'NORMAL', 1),
  ('00000000-0000-4000-a000-0000000020a1', 'dog_gets_frustrated',     'troubleshoot.dogGetsFrustrated.prompt',      'troubleshoot.dogGetsFrustrated.guidance',      'NORMAL', 2),
  ('00000000-0000-4000-a000-0000000020a1', 'dog_distracted',          'troubleshoot.dogDistracted.prompt',          'troubleshoot.dogDistracted.guidance',          'NORMAL', 3);

-- Biting Foundation carries an escalation example per brief §34/§10 — injury-causing biting routes to a professional.
insert into lesson_troubleshooting (lesson_id, slug, prompt_key, guidance_key, safety_category, sort_order) values
  ('00000000-0000-4000-a000-0000000020aa', 'dog_gets_frustrated', 'troubleshoot.bitingFrustrated.prompt', 'troubleshoot.bitingFrustrated.guidance', 'NORMAL', 1),
  ('00000000-0000-4000-a000-0000000020aa', 'dog_walks_away',      'troubleshoot.dogWalksAway.prompt',     'troubleshoot.dogWalksAway.guidance',     'NORMAL', 2),
  ('00000000-0000-4000-a000-0000000020aa', 'biting_causes_injury','troubleshoot.bitingCausesInjury.prompt','troubleshoot.bitingCausesInjury.guidance','PROFESSIONAL_TRAINER_RECOMMENDED', 3);
