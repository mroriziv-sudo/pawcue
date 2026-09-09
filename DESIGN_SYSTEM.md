# Design System — "Calm Premium Playful"

Original visual identity. Do not reuse or imitate Puppr/Dogo/Woofz assets, mascots, layouts, or trade dress.

## Feel

More elegant than Puppr, less visually busy than Dogo, warmer than a generic productivity app. Trustworthy, modern,
adult, premium, emotionally connected to dogs — never childish, never cluttered.

## Color tokens

Defined once in `packages/ui/src/tokens/color.ts`, consumed everywhere else by name — never a hex literal in a
screen or component.

| Token                   | Hex                      | Usage                                                      |
| ----------------------- | ------------------------ | ---------------------------------------------------------- |
| `color.background.base` | `#FAF8F4` Warm Ivory     | app background                                             |
| `color.brand.primary`   | `#23473C` Deep Evergreen | clicker surface, primary buttons, nav active state         |
| `color.brand.secondary` | `#82B79A` Soft Sage      | secondary accents, success-adjacent surfaces               |
| `color.accent.warm`     | `#F2B27B` Warm Apricot   | highlights, streak/celebration accents                     |
| `color.accent.cool`     | `#A79ACD` Muted Lavender | secondary highlights, premium accents                      |
| `color.text.primary`    | `#1F2523` Charcoal       | body text                                                  |
| `color.surface.raised`  | `#FFFFFF` White          | cards on top of base background                            |
| `color.border.subtle`   | `#E7E6E1` Soft Border    | 1px card/list borders                                      |
| `color.status.error`    | `#C75A55`                | error text/icons, paired with an icon, never color alone   |
| `color.status.success`  | `#4E8E68`                | success text/icons, paired with an icon, never color alone |

Tokens are structured as a flat design-token object today (single theme, per product brief — no dark mode requested
for v1) but namespaced (`color.background.base` not `colorBackgroundBase`) so a future theme swap doesn't require a
rename, only a second token map.

## Typography

Native/system font stack (`San Francisco` on iOS, `Roboto`/device default on Android) — no bundled/redistributed
font files. Scale in `packages/ui/src/tokens/typography.ts`:

| Style   | Size / Line height | Weight   |
| ------- | ------------------ | -------- |
| Display | 32 / 38            | Semibold |
| H1      | 28 / 34            | Semibold |
| H2      | 24 / 30            | Semibold |
| H3      | 20 / 26            | Semibold |
| Body    | 16 / 23            | Regular  |
| Small   | 14 / 20            | Regular  |
| Caption | 12–13 / 17         | Regular  |
| Button  | 16–17              | Semibold |

All font sizes must scale with the OS Dynamic Type / font-scale setting (no fixed-pixel text that ignores
accessibility font scaling) — verified in Phase 11.

## Layout

- 8pt spacing grid (`packages/ui/src/tokens/spacing.ts`: `space.1` = 4, `space.2` = 8, ... expressed as multiples of 4
  with 8 as the base unit).
- Card corner radius: 20–24.
- Button corner radius: 18–24.
- Borders: 1px, `color.border.subtle`.
- Shadows: soft only — small blur, low opacity, no generic large drop shadows. Single `shadow.card` token.
- Touch targets: minimum 44×44pt (iOS HIG) / 48×48dp (Material) — enforced as a lint rule on interactive primitives
  in Phase 1.
- Layout uses logical `start`/`end` (RTL-aware) properties exclusively — never `left`/`right` — see §RTL below.

## Motion

Defined in `packages/ui/src/tokens/motion.ts` (Reanimated durations/easings), 160–280ms for standard transitions.

- Clicker press: scale `1.00 → 0.96 → 1.00`.
- Card press: subtle scale (`1.00 → 0.985`).
- Lesson complete: checkmark path draw + slight spring.
- Plan generation: paw/path progress animation, 600–900ms minimum only when generation is server-fast (never a fake
  30s delay).
- Streak increase: small celebratory motion, no confetti bursts.
- **Reduce Motion:** every animated primitive checks `useReducedMotion()` and substitutes a fade or instant state
  change for scale/translate effects. This is a primitive-level concern (built into `packages/ui` components), not
  something each screen re-implements.

## Sound

- Clicker: mechanical, dry, 30–70ms, no reverb, preloaded at app boot, playback latency is the top perf budget for
  that component (see PERFORMANCE notes in ARCHITECTURE.md).
- Success: two-note confirmation, 250–400ms.
- Session start: optional soft cue.
- Errors: haptic + visual only, no error sound.
- Independent user settings: `Sound Effects` (global) and a clicker-specific sound control, plus `Haptics`.

## Haptics

- Click → light/crisp (`Haptics.ImpactFeedbackStyle.Light`).
- Lesson complete → medium success (`Haptics.NotificationFeedbackType.Success`).
- Error → notification/error haptic, used sparingly (not on every validation nudge).
- Never haptic on plain navigation.

## The clicker (signature element)

Large rounded squircle. Deep Evergreen surface, soft inset highlight, minimal glyph — an original mark, not a
competitor's icon. On press: compress → mechanical audio → haptic → subtle outward ring. Latency budget beats
animation richness: the sound must be perceived as instantaneous, which means audio is preloaded and the press
handler fires playback before starting any visual animation work, not after.

Accessibility label: `"Dog training clicker. Double tap to play click sound."` Completion states are never conveyed
by color alone — always paired with an icon/shape change and, ideally, a label.

## Illustration

Original geometric/soft-organic style, subtle texture, expressive dog posture, sophisticated rather than
cartoon-childish, diverse human figures where people appear, multiple breeds/body types. Until final artwork exists,
placeholder vector assets must be clearly labeled `placeholder` in filename and Storybook/preview so they're never
mistaken for final art at ship time.

## RTL

Hebrew is first-class, not an afterthought. All `packages/ui` primitives use `flex-direction` driven by
`I18nManager.isRTL` (via RN's automatic flip) and logical spacing props (`marginStart`/`marginEnd`, never
`marginLeft`/`marginRight`). Icons that encode direction (back arrows, chevrons) mirror; icons that don't (the
clicker glyph, the paw mark, a checkmark) must not. This list is maintained as an explicit allow-list in
`packages/ui/src/tokens/icon-mirroring.ts` so it's a deliberate decision per icon, not a global flip.
