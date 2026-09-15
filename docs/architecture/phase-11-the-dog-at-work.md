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

`scene` stays as a deprecated alias. It resolves to `sit`, except that with the `resting` expression it resolves
to `rest`, because that is exactly what it drew before this phase and two Today states and the dev preview still
ask for it that way. The next session replaces those call sites with `rest` and removes the alias.

**Expression and pose are now independent.** `resting` closes the eyes and relaxes the ears and does nothing else;
a sitting dog can rest its eyes and a lying dog can be attentive. `puzzled` tilts the head and one ear; `happy`
opens the mouth; `focused` draws the brows. Every family draws in every pose with every expression, as a puppy and
as a senior, and the breed overrides that change proportions — the hound's long-low build, the brachycephalic
mask, the ear kinds — carry into every pose because they are template values the poses read.

## Props

Exactly three, drawn in the same flat two-value style, and never overlapping a shape of the dog: they sit in front
of, under or beside it with clear paper between. Props are declared by the caller (`props: ["treat"]`), never
implied by a pose.

| Prop    | Drawing                                                                                                              | Colour                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `treat` | A small rounded piece on the ground in front of the dog, a paw's width ahead of the nearest paw.                     | The amber reward role (`#BF7A1E`) — the one place the character set uses a UI colour, because the treat is the reward. |
| `mat`   | A flat rounded rectangle under the dog, wider than its footprint, its top edge on the ground line the paws stand on. | The dog's collar colour lightened toward the paper, so it belongs to the dog and never competes with it.               |
| `leash` | A slack curve from the collar's leading end off the canvas toward the reading edge, mirrored with the layout.        | The collar colour.                                                                                                     |

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
