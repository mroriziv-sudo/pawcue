# Phase 10 — the field-notebook redesign

Phase 10 changed how the product looks and reads, not what it does. No store contract, no engine rule and no
screen's purpose moved; every product decision the earlier phases encoded (the plan is a commitment, a locked
lesson routes to what resolves the lock, no invented streaks, pause not exit) is still asserted by the same tests.
What follows is the set of design decisions the phase committed to code, and the few places where behaviour
changed on purpose.

The direction is the PawCue Art Direction document; DESIGN_SYSTEM.md is its committed form.

## What owns what

```
packages/ui/src/tokens/*                    colour roles, the type scale, three radii, motion tokens and two springs
packages/ui/src/primitives/Row.tsx          the list vocabulary: a full-width row, inset hairline, 28pt leading column
packages/ui/src/primitives/TrailMark.tsx    where a thing is on its route: next / later / current / done / locked / paused
packages/ui/src/primitives/RepMarks.tsx     one amber mark per counted repetition
packages/ui/src/primitives/SegmentedControl.tsx
packages/ui/src/primitives/Sheet.tsx        the one overlay (page sheet on iOS)
packages/ui/src/primitives/Glyph.tsx        vector marks; platform symbols substituted through ThemeProvider.renderGlyph
apps/mobile/src/dogs/dog-art.ts             the character: nine family templates, 27 breed overrides, poses, expressions
apps/mobile/src/components/DogAvatar.tsx    the renderer: bust / scene, puppy and senior, photo, RTL mirroring, cross-fade
apps/mobile/src/dogs/dog-photo.ts           device-local photo storage and the only place the library permission is requested
apps/mobile/src/state/dog-photo-store.ts    which dog has a photo; hydrated at bootstrap, cleared with the identity
apps/mobile/src/components/SystemSymbol.tsx SF Symbols for the standard marks on iOS
tools/dog-art/preview.mjs                   renders the character set to SVG/PNG for review on a desktop
```

Retired: `StatusPill`, `Chip`, `SelectableCard`, `CelebrationMark`, `ProgressRing`, the icon-tile pattern, tinted
cards, the Today hero panel, the masked `YYYY-MM-DD` date field.

## Decisions

**Colour.** Nine roles. Amber (`#BF7A1E`) is the one new hue: reward, and only reward. Secondary text is a solid
rather than an alpha so it measures the same on paper and white. The completed mark uses the success green, not
Soft Sage, because Soft Sage cannot reach 3:1 on paper. Premium has no colour. The tint roles remain in the token
file for unmigrated surfaces (there are none left in the app; the dev plan inspector is the only consumer of
`Card` with a tint) and are documented as legacy.

**Type.** iOS sizes (17 body, 26 headline, 34 large title), weights 400–700, tracking only above 26pt and only in
Latin. Hebrew gets +2 line height and no tracking at the primitive. Section labels dropped from 20pt to 15pt: a
signpost, not a headline.

**Containers.** The page is the container. Rows with inset hairlines are the list vocabulary; the one card type
(16pt, hairline, no shadow) is reserved for standalone tappable objects — option tiles, breed tiles, the next
lesson on completion, plan options on the paywall. Sheets are sheets. Nothing else is boxed.

**Icons.** Standard marks are SF Symbols on iOS (`expo-symbols`) and the design system's own vector paths
elsewhere; the app injects the renderer through `ThemeProvider`, so every primitive draws from one source per
platform. Training marks (clicker, treat, target) are always the design system's own. The paw is gone.

**The character.** Flat two-value drawing from one geometry module. Nine families with one signature element each
(the shepherd's cap, the beagle's long ears, the rottweiler's tan points, the schnauzer's beard, the husky's mask,
the frenchie's bat ears and mask, the chihuahua's ears, the retriever's floppy ears, the mixed breed's one
half-pricked ear). Twenty-seven popular breeds are parameter overrides of their family — coat, marking, ear kind,
proportions — never a separate drawing, which is what keeps the set consistent. Coats are natural colours; the
white coat is a hair darker than the paper so a white dog has an edge. `tools/dog-art/preview.mjs` renders the
whole set through Quick Look for review.

**Photo.** Device-local. `dogs.photo_url` exists but no storage bucket, policy or signed-URL path does, and a
device path written to the row would be a path another device cannot open. The photo is copied into the app's
document directory and referenced from AsyncStorage by dog id; the illustration remains the identity on every
other device and in every scene. The library permission is requested only inside `pickDogPhoto`, called only by
the Choose a photo control; the config plugin declares the photo string and explicitly no camera or microphone
string. When a bucket exists, the upload slots in behind `pickDogPhoto` without changing a screen.

**Clicks and repetitions.** Kept independent. The step model declares `requiresClickerPress` and
`repetitionTarget` separately, the engine records `clicker_pressed` and `repetition_logged` as separate events,
and the history and the completion summary count them separately. Nothing in the domain says a click is a rep, so
the session dock does not pretend it does: a step that needs both shows the clicker (the dark object) and a white
"Count it" control beneath it, and the advance control stays quiet until the target is met. A content-level flag
(`clickCountsAsRepetition` on a step) is the right place to change that, if it should change.

**Onboarding inputs.** Native wheels (`@react-native-picker/picker`) for years and months, the platform's date
spinner (`@react-native-community/datetimepicker`) for an exact date, two tiles for sex, a segmented control for
the daily goal, a breed picker with a Common grid and an alphabetic list. A malformed birthdate can no longer be
entered, which is why the test that typed "soon" now asserts the wheel writes a real ISO date instead.

## The finish review

Impeccable's finish reviewer read the built screens against the direction and returned fifteen fixes; thirteen were
applied (flat eyes and a long-low build for hounds, flatter brachycephalic masks, smaller toy and spitz ears, a
saddle-height shepherd cap, a poodle topknot, front paws in the resting pose; the advance control kept pressable and
explaining rather than disabled; the name field's duplicate label hidden; a compact breed picker in the editor; the
owner's dog as the Dog tab mark; the restart notice in secondary ink, not the done green; completion reduced to one
route; 32pt between sections everywhere; the 14-day dot strip replaced by the sentence it already spoke; the photo
badge replaced by a text control; the clicker's inset highlight removed; 44pt segments; the paywall's group label
and bullet discs; the sparkle and heart marks deleted; the sex step's redundant third control removed). Two were
kept on purpose: the "Step 2 of 5" caption (the segments do not say how many questions remain; it is a caption,
not an eyebrow) and the 1.6× Dynamic Type cap on the name input (an anti-clipping cap on an input, not on reading
text, with a test that documents it).

A second motion pass found the cross-fade wrapper faded the new state in but dropped the old in a frame; it now
holds the outgoing state, hidden from assistive technology, while the new one arrives, and the session's advance
control morphs through it.

## Behaviour that changed on purpose

- Today's resume button no longer depends on the plan listing the paused lesson: a session paused yesterday on a
  lesson the planner has since rotated out is still resumable.
- The lesson overview and Settings gained a Back control; the app draws its own headers and had no way back but
  the edge swipe.
- The profile editor saves the daily goal; the Dog tab's Goals row opens it.
- Sync status moved from the profile editor to Settings → Account.
- A `Switch` inside a row's trailing slot was hidden from assistive technology by the decorative default; `Row`
  now takes `trailingInteractive`, and the tests for it are in `field-notebook.test.tsx`.

## Dependencies added

| Package                                        | Why                                                            |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `react-native-svg` 15.15.4                     | The character and the vector marks. Installed in the app only. |
| `expo-symbols` 57.0.3                          | SF Symbols for the standard marks on iOS.                      |
| `expo-image-picker` 57.0.17                    | Choosing the dog's photo. Config plugin: photos string only.   |
| `expo-file-system` 57.0.7 (explicit)           | Copying the photo into the app's own directory.                |
| `@react-native-community/datetimepicker` 9.1.0 | The exact-date spinner. Config plugin added to app.json.       |
| `@react-native-picker/picker` 2.11.4           | Native wheels for the dog's age.                               |

All are native modules: a new development build is required before any of this runs on a device.

`@pawcue/ui` imports `react-native-svg` but does not declare it, not even as a peer: the app's single copy reaches
the library through the workspace's `publicHoistPattern`. Declaring it in the library made pnpm auto-install a
second, differently peer-keyed copy of the same version, which Metro bundled alongside the first and React Native
rejected at launch ("Tried to register two views with the same name RNSVGCircle"). The rule is written down next
to the hoist pattern in `pnpm-workspace.yaml`.

## Deferred

Rive character animation; a display face (Rubik or Secular One) for the five display moments; coat and collar
pickers; the "Meet your dog" onboarding step; in-session demonstration scenes; folding the Progress tab into Dog;
milestone cosmetics; dark appearance; iPad layouts; a full sound-brand pass; uploading photos to a storage bucket.
