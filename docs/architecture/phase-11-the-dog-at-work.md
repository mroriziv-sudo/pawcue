# Phase 11 — the dog at work

The character learns to sit, lie, stand and run, meets three objects, and is tagged so it can move. This is the
contract for this phase and the two sessions after it (the wiring of the moments, then motion). It extends the
character section of DESIGN_SYSTEM.md and the "The character" paragraph of
[phase-10-field-notebook.md](phase-10-field-notebook.md); it changes nothing those two already decided.

## Poses

`bust | sit | down | rest | stand | run`. One geometry module, `apps/mobile/src/dogs/dog-art.ts`, builds every
pose from the same parameterised parts the nine families and the twenty-seven breed overrides already use — the
head, ears and markings of the bust, and a body made of a chest, a leg length, a tail kind and a build — so a
breed gets every pose for free and there are no per-breed pose drawings.

| Pose    | What it is                                                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bust`  | The head on the paper disc. Rows, headers, the tab bar. Never a body, never a prop, never animated.                                                                                                      |
| `sit`   | What Phase 10 called the scene: haunch behind, chest forward, front legs down, tail up. Long-low builds keep their barrel-and-four-legs sit, which is how the hound family already reads.                |
| `down`  | Alert lying: head up at the bust height, the long low body, front legs stretched forward, tail out along the ground.                                                                                     |
| `rest`  | The lying body the `resting` expression used to produce on its own: the same low body with the head sunk ten units and the tail resting.                                                                 |
| `stand` | Four legs on the ground under a horizontal barrel, tail level.                                                                                                                                           |
| `run`   | Stand with the near front leg reaching forward and the back legs driven back, ears swept back, tail up. The dog runs toward the reading edge; the renderer's RTL mirror turns it around with the layout. |

`scene`, Phase 10's name for the sit (or, with the `resting` expression, the rest), was kept as an alias for one
session so each call site could be moved to the pose it meant. It is gone: the wiring session moved the
production call sites, and the motion session moved the dev preview and removed the alias from the module and
the avatar (the note under "Wired").

**Expression and pose are now independent.** `resting` closes the eyes and relaxes the ears and does nothing else;
a sitting dog can rest its eyes and a lying dog can be attentive. `puzzled` tilts the head and one ear; `happy`
opens the mouth; `focused` draws the brows. Every family draws in every pose with every expression, as a puppy and
as a senior, and the breed overrides that change proportions — the hound's long-low build, the brachycephalic
mask, the ear kinds — carry into every pose because they are template values the poses read.

## Props

Exactly three, drawn in the same flat two-value style, and never overlapping a shape of the dog: they sit in front
of, under or beside it with clear paper between. Props are declared by the caller (`props: ["treat"]`), never
implied by a pose.

| Prop    | Drawing                                                                                                                                                                                                                                                                                              | Colour                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `treat` | A small rounded piece on the ground in front of the dog, a paw's width ahead of the nearest paw.                                                                                                                                                                                                     | The amber reward role (`#BF7A1E`) — the one place the character set uses a UI colour, because the treat is the reward. |
| `mat`   | A flat rounded rectangle under the dog, wider than its footprint, its top edge on the ground line the paws stand on — or, under a lying dog, just above the belly line, so the body settles into it and the paws lie on it. Drawn first, so the dog covers the mat and the mat never covers the dog. | The dog's collar colour lightened toward the paper, so it belongs to the dog and never competes with it.               |
| `leash` | A slack curve from the collar's leading end off the canvas toward the reading edge, mirrored with the layout.                                                                                                                                                                                        | The collar colour.                                                                                                     |

No other object joins the set. No hands, palms, legs or any other human part, ever: the trainer is the person
holding the phone, not a drawing.

## The moments

The next session wires these; nothing in this table is a new screen or a new state, only which drawing each
existing moment shows.

| Moment                                     | Pose  | Expression | Prop  |
| ------------------------------------------ | ----- | ---------- | ----- |
| Onboarding welcome                         | sit   | attentive  | —     |
| Today with a lesson waiting                | sit   | attentive  | —     |
| Today when the day's plan is done          | rest  | resting    | —     |
| Dog tab                                    | sit   | attentive  | —     |
| Session in progress — `name_response`      | sit   | attentive  | —     |
| Session in progress — `sit`                | sit   | focused    | treat |
| Session in progress — `down`               | down  | focused    | treat |
| Session in progress — `stay`               | sit   | focused    | —     |
| Session in progress — `come`               | run   | happy      | —     |
| Session in progress — `leave_it`           | sit   | focused    | treat |
| Session in progress — `place`              | down  | focused    | mat   |
| Session in progress — `loose_leash_basics` | stand | attentive  | leash |
| Session "Not working?"                     | bust  | puzzled    | —     |
| Session complete                           | sit   | happy      | treat |
| Any 44pt row, the tab bar                  | bust  | attentive  | —     |

The session keys on the lesson's skill; a skill not in the table shows `sit`, `attentive`, no prop.

## Parts, for the motion session

Every shape the module returns carries a `part`: `eye`, `eyelid`, `tail`, `body`, `head`, `ear` or `prop`. Open
eyes are `eye`; the closed-eye arcs of `resting` are `eyelid`; the tail is the one stroked path tagged `tail`;
legs, paws, torso and collar are `body`; the head ellipse, its markings, muzzle, nose, mouth and brows are `head`;
ears and their inner ears are `ear`; the three objects are `prop`. A renderer addresses the tail and the eyes by
tag and never by geometry.

Motion rules, decided here so the next sessions do not invent them:

- **Idle blink**: every 4 to 7 seconds, 120ms, the `eye` parts scaled to a line and back.
- **Breathing**: the whole body at 1.5% scale over 3 seconds, ease in and out, continuous.
- **A counted repetition**: a 400ms wag of the `tail` part about its root, on the responsive spring.
- **Completion**: one 300ms bounce of the whole dog, once, when the completion screen arrives.
- **None of it on busts, rows or the tab bar.** The bust never moves.
- **Reduce Motion**: all of it off. The reactive moments reduce to the expression change alone, which the
  cross-fade already carries.
- The clicker's amber ring and the rep marks keep their own motion (DESIGN_SYSTEM.md); the dog does not react to
  a click, only to a counted rep and to completion.

## What never changes

The family signature elements (the shepherd's cap, the beagle's ears, the rottweiler's points, the schnauzer's
beard, the husky's mask, the frenchie's bat ears and mask, the chihuahua's ears, the retriever's floppy ears, the
mixed breed's one half-pricked ear); the natural coats; the nine UI colour roles; the paper; and the rule that the
dog is the only decoration in the app. Nothing this phase adds is a second illustration: it is more of the dog.

## Wired (2026-09-15)

The moments table is now what the screens draw. Nothing in the geometry module changed; this session only told
each existing moment which drawing to ask for, and put the session scene where the contract says it goes.

**The session keys on the skill.** `apps/mobile/src/dogs/skill-demo.ts` is the moments table's session rows,
verbatim: `skillDemo(skillSlug)` returns the pose, expression and props for the eight skills and the plain
sitting, attentive dog for anything else — including no slug at all. The lesson already carries its skill's id
and the app already holds the planning catalogue, so the slug is a lookup, not a fetch. The scene is 140pt,
centred below the instruction block (instruction, coaching line, "Not working?", the requirements warning), and
it is drawn only while a step is in progress and only when the paper between that block and the dock measures at
least 200pt — both heights come from `onLayout`, nothing is assumed, and until they arrive there is no dog. It is
`pointerEvents="none"` and decorative, so it neither takes a tap nor a screen-reader stop. It is never drawn
while the help sheet is open: the puzzled bust on the sheet is the one dog in that state. Completion keeps its
200pt dog and now asks for `sit`, `happy`, `treat`.

**Today and the Dog tab.** Today with a lesson waiting sits the dog, attentive, beside the coach line (an owner's
photo keeps the bust: a photo cannot pose). Today with the plan finished draws `rest` with `resting` in place of
the old `scene`-with-`resting` call. The Dog tab and the onboarding welcome ask for `sit` by name. Every screen
state has one dog.

**Accessibility.** A drawn dog carries the label it always carried — the dog's name, or "your dog" — or none at
all when it is decoration; poses and props are never spoken. Under RTL the whole drawing is mirrored, so the
running dog turns to run toward the Hebrew reading edge and the leash leaves the collar toward it
([`he/session-come.png`](assets/phase-11/he/session-come.png),
[`he/session-loose-leash.png`](assets/phase-11/he/session-loose-leash.png)).

### Each moment and its screenshot

Dev build `5ddd4fa0` on the iPhone 17 Pro simulator, iOS 26.5, driven the way the Phase 10 acceptance pass was
driven — routes by deep link, session progress through the session store's own actions, the language switch
through the app's own `applyLocale` followed by a relaunch — with nothing tapped. Halved in resolution for the
repository. "Luna" is a Golden Retriever; the plan on the device held The Name Game, Sit and Potty Foundation.

| Moment                                     | Drawn                   | English                                                                    | Hebrew                                                                     |
| ------------------------------------------ | ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Today with a lesson waiting                | sit, attentive          | [`en/today-waiting.png`](assets/phase-11/en/today-waiting.png)             | [`he/today-waiting.png`](assets/phase-11/he/today-waiting.png) ¹           |
| Today when the day's plan is done          | rest, resting           | [`en/today-done.png`](assets/phase-11/en/today-done.png)                   | [`he/today-done.png`](assets/phase-11/he/today-done.png)                   |
| Dog tab                                    | sit, attentive          | [`en/dog-tab.png`](assets/phase-11/en/dog-tab.png)                         | —                                                                          |
| Session in progress — `sit`                | sit, focused, treat     | [`en/session-sit.png`](assets/phase-11/en/session-sit.png)                 | [`he/session-sit.png`](assets/phase-11/he/session-sit.png)                 |
| Session in progress — `down`               | down, focused, treat    | [`en/session-down.png`](assets/phase-11/en/session-down.png)               | [`he/session-down.png`](assets/phase-11/he/session-down.png)               |
| Session in progress — `place`              | down, focused, mat      | [`en/session-place.png`](assets/phase-11/en/session-place.png)             | [`he/session-place.png`](assets/phase-11/he/session-place.png)             |
| Session in progress — `come`               | run, happy              | [`en/session-come.png`](assets/phase-11/en/session-come.png)               | [`he/session-come.png`](assets/phase-11/he/session-come.png)               |
| Session in progress — `loose_leash_basics` | stand, attentive, leash | [`en/session-loose-leash.png`](assets/phase-11/en/session-loose-leash.png) | [`he/session-loose-leash.png`](assets/phase-11/he/session-loose-leash.png) |
| Session complete                           | sit, happy, treat       | [`en/completion.png`](assets/phase-11/en/completion.png)                   | [`he/completion.png`](assets/phase-11/he/completion.png)                   |
| Session — counting step, clicker dock      | no scene: under 200pt   | [`en/session-down-step3.png`](assets/phase-11/en/session-down-step3.png)   | —                                                                          |

¹ The device's plan was already finished when the Hebrew pass ran, so the waiting state was reached by hiding
today's records from the training log in memory for the one screenshot; a relaunch rehydrated the log from disk.
The plan, the dog and the layout are the real ones.

Onboarding welcome, `name_response`, `stay` and `leave_it` share drawings already shown above (sit, attentive;
sit, focused with and without the treat) and were not photographed separately. The "Not working?" sheet cannot
be opened without a tap; its puzzled bust is unchanged from Phase 10 and the scene's absence behind it is
asserted in `apps/mobile/__tests__/dog-at-work.test.tsx`.

### Decoration yields to text — the proof at accessibility-extra-large

Cold-launched at `accessibility-extra-large`, the one setting Phase 10 found trustworthy for Dynamic Type
screenshots:

| State                        | What happened                                                                 | Screenshot                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Sit, step 1                  | Two lines of instruction; the scene still fits and nothing above it moved.    | [`en-axl/session-sit.png`](assets/phase-11/en-axl/session-sit.png)               |
| Place, step 1                | Five lines; the scene still fits, with little to spare.                       | [`en-axl/session-place.png`](assets/phase-11/en-axl/session-place.png)           |
| Come, step 1                 | Five lines; the scene fits.                                                   | [`en-axl/session-come.png`](assets/phase-11/en-axl/session-come.png)             |
| Down, step 2                 | Six lines; under 200pt left, so **no dog** — the text and the dock as before. | [`en-axl/session-down-step2.png`](assets/phase-11/en-axl/session-down-step2.png) |
| Down, step 3 (clicker, reps) | The tall dock leaves no room; no dog.                                         | [`en-axl/session-down-step3.png`](assets/phase-11/en-axl/session-down-step3.png) |
| Today, plan done             | The resting dog at its 160pt, the heading and rows unchanged.                 | [`en-axl/today-done.png`](assets/phase-11/en-axl/today-done.png)                 |

**Where the scene competes with the dock, and the judgment.** On a counting step the dock holds the rep marks,
the clicker, "Count it" and the remaining count, and on a 6.3" phone at the default size the paper between the
instruction and that dock measures about 110pt ([`en/session-down-step3.png`](assets/phase-11/en/session-down-step3.png)).
The scene is therefore never drawn while reps are being counted on this device; it is drawn on the setup steps
before. That is the rule working, not a gap: while the trainer counts, the amber ring and the rep marks are the
moment, and the dog would have been a third thing to look at above a control that has to be hit without looking.
The scene will return on those steps on taller screens, where the measurement allows it, without any change.

Not in this session, by the brief: motion. The tags are in place and unused.

**Carried over from the review of the wiring (2026-09-16, `fix(dog-art)`).** Four corrections to the geometry
module before any motion work, each visible on the re-rendered sheets. The mat now makes contact: under the
lying body its top edge rises to just above the belly line, so the `place` dog rests on it instead of floating
over it (the paws lie on the mat; the mat stays behind every shape of the dog). The shepherd's saddle in the
side-on poses — `down`, `rest`, `stand`, `run` — is built from the barrel's own ellipse and shares its top line
from behind the neck to the rump, with a lower edge dipping just below the middle, where a centred dark ellipse
had read as a patch; `sit` and `bust` keep their chest stripe and cap unchanged. The `focused` brow drops
`0.4 × eyeR` over its run instead of `0.8`, half the slope, so it reads as attention rather than a frown on the
light coats. And the `scene` alias is retired: `apps/mobile/app/dev-preview.tsx` and the preview tool ask for
`sit` and `rest` by name, `DogPose` no longer includes it, `resolvePose` is gone from the module and the avatar,
and a stale caller sending `scene` gets an error rather than a guessed body — `dog-art.test.ts` asserts exactly
that in place of the old alias-equivalence test.
