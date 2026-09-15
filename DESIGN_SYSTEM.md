# Design System — "A trainer's field notebook, brought to life by your dog"

Original visual identity. Do not reuse or imitate Puppr/Dogo/Woofz assets, mascots, layouts, or trade dress.

## Thesis

PawCue looks like the notes a good trainer would leave you: warm paper, dark green ink, big clear instructions, one
thing to do next, and your own dog drawn in the margin, reacting to how it went. The coach's authority comes from
typography and restraint. The warmth comes from the character. The reward comes from one colour, used only when
something was earned.

Three commitments follow:

1. **The page is the container.** Content sits on paper. Boxes exist only for things you pick up — a tappable
   object, a sheet, a field, the clicker.
2. **The dog is the only decoration.** No sprinkled paws, no floating tiles, no motes. If a screen needs warmth, the
   dog provides it, in the right pose for what is happening.
3. **Colour is earned.** Evergreen is the trainer (actions, the clicker, the live session). Amber is the treat
   (reward, reps counted, completion). Sage-green is done. Nothing else is coloured.

The full art direction that produced this system is the PawCue Art Direction document (design phase, September
2026); this file records what was committed to code.

## Colour

Defined once in `packages/ui/src/tokens/color.ts`, consumed everywhere by role — never a hex literal in a screen or
component. Eleven palette colours: the original ten plus Amber, the one hue the redesign added.

| Role                                    | Value                                      | Job                                                             |
| --------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `background.base` — paper               | `#FAF8F4`                                  | The canvas of every screen                                      |
| `surface.raised` — card                 | `#FFFFFF`                                  | Tappable objects only: option tiles, fields, the next-lesson    |
| `text.primary` — ink                    | `#1F2523`                                  | All primary copy                                                |
| `text.secondary` — secondary ink        | `#5C605E` (solid; charcoal 72% over paper) | Meta lines, hints, section labels' trailing facts               |
| `border.separator`                      | `#E7E6E1`                                  | Inset hairlines between rows; fields at rest                    |
| `brand.primary` — evergreen             | `#23473C`                                  | Primary buttons, the clicker, the active step, focus, selection |
| `accent.reward` / `text.reward` — amber | fill `#BF7A1E`, text `#8F5A12`             | A counted rep, the click ring, the treat, completion facts      |
| `status.completed` / `text.completed`   | fill `#4E8E68`, text `#2F6B49`             | The done mark and its word                                      |
| `status.error` / `text.error`           | fill `#C75A55`, text `#A33F3B`             | Account deletion, safety escalation                             |

Roles with no colour: **warning** (ink secondary plus the alert mark), **premium** (a lock glyph and the word),
**disabled** (40% opacity of the control). The tinted surfaces (`surface.tint*`), lavender (`accent.cool`) and
`text.mutedOnTint` remain in the token file only for screens that have not been migrated; nothing new may use them.

Every pair a screen draws is measured in `color.test.ts`: text ≥ 4.5:1 on paper and white, marks ≥ 3:1. Soft Sage
(`#82B79A`) measures 2.2:1 on paper, which is why the completed mark is the success green and not the sage.

Illustration colour is a separate palette (`apps/mobile/src/dogs/dog-art.ts`, `COATS`) and never borrows a UI role.
That is the rule that ended the green dogs.

## Typography

System face (San Francisco / SF Hebrew on iOS, the device default on Android); no bundled fonts. The full weight
range is used — 400, 500, 600, 700 — because two weights is why every screen used to read at one volume.

| Variant          | Size / line | Weight | Tracking | Where                                                     |
| ---------------- | ----------- | ------ | -------- | --------------------------------------------------------- |
| `largeTitle`     | 34 / 40     | 700    | −0.4     | The dog's name on its page                                |
| `headline`       | 26 / 32     | 600    | −0.2     | The coach line on Today; the step instruction; a question |
| `title`          | 20 / 25     | 600    | 0        | A sheet's heading; the completion line                    |
| `body`           | 17 / 24     | 400    | 0        | All reading text                                          |
| `bodyStrong`     | 17 / 24     | 600    | 0        | Row titles                                                |
| `secondary`      | 15 / 20     | 400    | 0        | Row meta, hints, sublines                                 |
| `sectionLabel`   | 15 / 20     | 600    | 0        | Section labels — a signpost, sentence case, never caps    |
| `caption`        | 13 / 18     | 400    | 0        | Timestamps, disclosures, legal                            |
| `button`         | 17 / 22     | 600    | 0        | All buttons                                               |
| `displayNumeral` | 56 / 60     | 700    | −1.5     | The rep count in the practice dock. Nowhere else.         |

Rules: screen titles are sentences, not labels. Numbers are display only when they are the screen's answer.
Tabular figures on every counter (`tabular` on `Text`). Dynamic Type caps only on `largeTitle` (1.5), `headline`
(1.7), `title` (1.8), `button` (1.8) and `displayNumeral` (1.4); everything else is uncapped.

**Hebrew** is resolved at the primitive (`resolveTextStyle`): +2pt line height, no tracking, weight ceiling 700,
`writingDirection` set so Latin dog names inside Hebrew sentences order correctly. Headings wrap; no title is
truncated to one line.

## Containers

| Container | Radius           | Edge                              | Used for                                                    |
| --------- | ---------------- | --------------------------------- | ----------------------------------------------------------- |
| Row       | 0                | Hairline below, inset to the text | Every list item (`Row`)                                     |
| Card      | 16 (`object`)    | Hairline, no shadow               | A standalone tappable object: option tiles, the next lesson |
| Sheet     | 20 top (`sheet`) | System                            | Troubleshooting, the photo sheet (`Sheet`)                  |
| Field     | 12 (`field`)     | Hairline; evergreen 2pt on focus  | Inputs and search (`TextField`)                             |
| Button    | 14 (`control`)   | None / hairline                   | All buttons, the segmented control                          |
| Clicker   | 0.28 × size      | None                              | The one ink surface                                         |
| Avatar    | Circle           | Hairline ring                     | Busts and photos                                            |

Bans: no container inside a container except a field inside a sheet; no tinted containers; no pill labels or status
pills; no icon tiles; no card around reading text; no elevation on cards. `shadow.card` belongs to the clicker and
to sheets only.

## Layout and spacing

4pt unit, 8pt rhythm (`space` tokens). Screen gutter 20. Headline → subline 8; subline → control 24; control →
first section 32; between sections 32; section label → first row 8; rows touch (hairlines). Rows are 60pt with a
28pt leading column (`ROW_LEADING_WIDTH`) so marks and text share edges from row to row. Buttons 52 (lg) or 56 (xl,
the session's controls); 48 (md) for compact controls. Touch targets 48 everywhere (clears iOS 44 and Android 48).

One question per screen, answered above the fold. One dark object per screen — the clicker where present, otherwise
the primary button. Nothing is centred except the character at scene size, the clicker, and terminal-screen
buttons.

## The dog

Every dog is drawn from `dog-art.ts`: nine breed-family templates and a generic mixed breed, each flat two-value
shapes (a natural coat and one marking) plus ink features; no outlines, no gradients. Twenty-seven popular breeds
are parameter overrides of their family template — never separate drawings — so a Border Collie is drawn by the
same hand as the shepherd beside it. Resolution: exact breed → breed family → generic (`lookFor`). Puppies under a
year get bigger eyes and softer ears; dogs over nine grey at the muzzle.

Two sizes of use: the **bust** (a head on a paper disc with a hairline ring) in rows and headers, and the **scene**
(sitting, resting, or happy with a tail wag) where a moment carries emotion. Expressions: attentive, happy, focused,
resting, puzzled. Under RTL the drawing is mirrored so the dog keeps looking toward the text beside it.

An owner's photo replaces the bust everywhere; the drawing stays for every scene, because a photo cannot pose. The
photo is device-local (see `dogs/dog-photo.ts`).

Training objects share the style: a round treat with a bite (the reward mark), and the box clicker seen from above
(the product mark). Never a paw, a heart, a sparkle or a bone as decoration.

**The dog at work.** Six poses (`bust`, `sit`, `down`, `rest`, `stand`, `run`), three props (the treat, a mat, a
leash) and part tags for motion are specified in
[docs/architecture/phase-11-the-dog-at-work.md](docs/architecture/phase-11-the-dog-at-work.md), with the table of
which moment shows which drawing and the motion rules. Expression and pose are independent there.

## Iconography

Standard marks come from SF Symbols on iOS (`expo-symbols`, injected through `ThemeProvider.renderGlyph`) and from
the design system's own vector paths (`Glyph`, react-native-svg) on Android and under test. Training marks — the
clicker, the treat, the target — are always the design system's own. Every mark is registered in
`icon-mirroring.ts`; direction-of-travel marks mirror in RTL, objects and symbols never do.

## Motion

`packages/ui/src/tokens/motion.ts`, React Native `Animated` on the native driver.

| Class        | Duration        | Use                                                          |
| ------------ | --------------- | ------------------------------------------------------------ |
| Press        | 100 in, 180 out | Every control, ease-out both ways. Scale 0.97; clicker 0.96  |
| State        | 220             | A mark filling, a segment completing, a button morphing      |
| Enter / exit | 280 / 200       | Content arriving / leaving. Exit is always faster than enter |
| Sequence     | ≤ 900           | Plan generation. Never longer                                |

Two springs: `responsive` (stiffness 320, damping 26) for controls and marks, no visible overshoot; `soft` (180, 20) for content and the character. Nothing bounces.

The moments: the clicker's amber ring on press (audio first, always); a rep mark filling on the responsive spring
and the numeral rolling; the next instruction entering from below; the dog cross-fading when its face changes; the
day's trail filling. What never moves: text being read, the clicker's position, the primary button, the tab bar.

**Reduce Motion:** scale and translate become fades, springs become 160ms fades, idle loops and the clicker ring are
removed. Haptics and sound remain. Mapped once at the token layer (`reducedMotionAlternative`), honoured by every
primitive.

## Sound and haptics

Unchanged from the original brief: a mechanical 30–70ms click, preloaded, played before any visual work; a two-note
success cue on lesson completion only; no error sound. Haptics: light on click and button, success on lesson
complete, error sparingly, never on navigation.

## Loading

Skeletons only where the layout is known before the data and the wait is usually longer than about 300ms — Today's
plan and the Dog tab's journey — with bones matching the final geometry, breathing 1.0 → 0.6 over 1200ms, static at
80% under Reduce Motion. Spinners only for a terminal, unknowable wait, inside or beside the control that started
it. Cached lessons render immediately.

## RTL

Hebrew is first-class. Logical properties only (`start`/`end`), an explicit per-icon mirroring registry, text
resolved per direction. Mirrors: chevrons, the trail, rep marks, leading/trailing row slots, the character's
facing, onboarding transitions. Never mirrors: the clicker, the check, the lock, the clock, search, play, the app
mark. Dates use the locale's order through the platform's own date spinner; no masked date field.

## Development preview

`app/dev-preview.tsx` (development builds only, reached from Settings → Diagnostics) renders every colour role,
type variant, control, mark, trail and rep state, the generic dog, the nine families, the exact breeds, a photo
state, skeletons and the Today states, with switches for RTL and for platform symbols.
