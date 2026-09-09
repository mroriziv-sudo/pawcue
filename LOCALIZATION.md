# Localization

## Launch locales

`en-US` and `he-IL` are the only two locales a user can select in v1 (`packages/i18n` `SUPPORTED_LOCALES`).
Everything else in brief §25 (es, pt-BR, fr, de, it, ja, ko, zh-Hans, ar, hi) is architecture-ready but not
shippable — there is a real, enforced distinction in the domain layer between `localeSchema` (selectable) and
`translationReadyLocaleSchema` (resource-ready, not reviewed) — see `packages/domain/src/models/shared.ts` — so a
future locale can't accidentally leak into the language picker just by adding a resource file.

## No hardcoded strings

No screen component may contain a literal user-facing string — every string is a key into `packages/i18n`'s
resources, resolved via `useTranslation()`. This includes error messages, push notification text, and paywall/
subscription copy (brief §25). Enforced by an ESLint rule (Phase 1: a custom `no-literal-jsx-text` check scoped to
`apps/mobile/**`) rather than relying on review discipline alone.

## Structure

- `packages/i18n/src/locales/en-US/common.json`, `.../he-IL/common.json` — one namespace today; split into
  multiple namespaces (`common`, `paywall`, `lessons`, …) if the single file becomes unwieldy, not before.
- Content-table columns (`lessons.title_key`, `lesson_troubleshooting.guidance_key`, etc.) store i18n **keys**, not
  literal text — the same key resolves through the same `packages/i18n` resources whether the content came from a
  screen or from a database row (see DATABASE.md, supabase/seed.sql).

## Pluralization

i18next's default (CLDR-based) pluralization, `compatibilityJSON: "v4"`. English needs `_one`/`_other`; **Hebrew
needs `_one`/`_two`/`_many`/`_other`** — Hebrew's CLDR plural rules are not just singular/plural, and two of our
four daily-training-minute options (10, 20) fall in the "many" category while a 2-minute lesson falls in "two." See
`plan.minutes_*` in `he-IL/common.json` for the reference implementation; every future countable string in Hebrew
must follow the same four-suffix pattern, not the English two-suffix shortcut.

## Dates, numbers, units

Rendered via `Intl.DateTimeFormat`/`Intl.NumberFormat` with the active locale — never hand-formatted date strings.
Weight units: not currently part of any lesson content, but if added, must respect locale (kg for both launch
markets in practice, but the formatting layer should not assume that).

## RTL

See DESIGN_SYSTEM.md §RTL for the layout rules. Locale switch (`Settings → Language`) triggers
`I18nManager.forceRTL()`, which on React Native requires an app reload to fully apply — the settings screen must
show a "restarting…" transition rather than a half-flipped layout.

## Fallback behavior

Missing key in the active locale → falls back to `en-US` (i18next `fallbackLng`), never renders a raw key string
to the user. A CI check (Phase 10) fails the build if any key exists in `en-US` but not `he-IL`, since a silent
English fallback in a Hebrew session is a real quality bug, not an acceptable degradation, for our two launch
locales specifically (it _is_ the acceptable/expected behavior for the ten translation-ready-but-unreviewed
locales, precisely because those are explicitly not launch locales yet).

## Device locale

Initial language = device locale when it's one of the two supported locales, else English (brief §25). Changeable
anytime in `Settings → Language`.
