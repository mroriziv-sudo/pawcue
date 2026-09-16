# Legal documents — drafts for review

**Status: PUBLISHED (2026-09-14, every placeholder resolved on 2026-09-16). Not legal advice.** These texts were written from the codebase as built at
Phase 9.5 and describe only what the app does today. They must be reviewed by a person qualified to do so before
they are published, and both stores require them to be live at a public HTTPS URL before submission.

| Document                                         | Purpose                                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [privacy-policy.md](privacy-policy.md)           | Required by Apple (App Store Connect "Privacy Policy URL") and Google (Play Console + Data Safety). Linked from the paywall (`EXPO_PUBLIC_PRIVACY_URL`) and Settings.                           |
| [terms-of-use.md](terms-of-use.md)               | Required for an auto-renewable subscription on iOS (Guideline 3.1.2) and linked from the paywall (`EXPO_PUBLIC_TERMS_URL`). Includes Apple's minimum EULA terms so a custom EULA is acceptable. |
| [delete-account-page.md](delete-account-page.md) | The public, login-free web page Google Play's Data Safety form requires for account deletion (`/delete-account`). Also a good landing page for the same request from Apple's reviewers.         |

## Placeholders

Every value the repository cannot know is written as `[[LIKE THIS]]` and must be resolved before publishing.
Nothing was invented for them — no legal entity name, no postal address, no email, no domain, no jurisdiction.

| Placeholder          | What goes there                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `[[OPERATOR]]`       | The legal name of the person or company that publishes the app and is the data controller.                                        |
| `[[CONTACT_EMAIL]]`  | A monitored support/privacy address. Both stores and both policies need one.                                                      |
| `[[POSTAL_ADDRESS]]` | Required in some jurisdictions (and by Israel's Privacy Protection Law for a database owner). Leave out only on qualified advice. |
| `[[WEBSITE]]`        | The domain the policies are published on — also where `/delete-account` lives.                                                    |
| `[[GOVERNING_LAW]]`  | The jurisdiction and venue for the Terms. A legal decision, not a technical one.                                                  |
| `[[HOSTING_REGION]]` | The AWS region of the production Supabase project (staging is `us-east-1`; production is created in Phase 9.5's manual step).     |
| `[[EFFECTIVE_DATE]]` | The date the text is published.                                                                                                   |

## What the texts deliberately do not say

- **No AI features.** The training coach provider exists as an interface only and is disabled; no data is sent to
  any AI/LLM provider. The policy says so and must be updated _before_ that changes (PRIVACY.md).
- **No analytics or crash reporting.** Neither SDK is integrated. `app_events` exists in the schema but nothing
  writes to it. The policy lists no analytics data type.
- **No photos, notifications, location, contacts, microphone.** None is requested; the manifests prove it
  (RELEASE_CHECKLIST.md native audit).
- **No Google sign-in yet.** Only Sign in with Apple is implemented. Add Google to §2 of the privacy policy when
  it ships.
- **No name collection.** Sign in with Apple requests the email scope only.

## Hebrew

The app ships in Hebrew. Publishing the legal texts in Hebrew as well is a **legal/content decision**: a
translation of a legal document should be made or checked by someone qualified, and the English text should be
declared the governing version if both are published. Until that decision, the English documents are linked from
both locales.

## Where the published site lives

`legal-site/public/` is the rendered site: `/`, `/privacy`, `/terms`, `/delete-account`, `/support` and a `404`
page, one HTML file each, sharing one style. It is served by a Cloudflare Worker (static assets only, no code)
at `https://soft-star-9254.pawcue-support.workers.dev` since 2026-09-14; `legal-site/wrangler.jsonc` names that
Worker. To publish a change: from `legal-site/`, `npx wrangler@latest login` once, then `npx wrangler@latest
deploy`. On 2026-09-16 the owner resolved the last two placeholders: `[[OPERATOR]]` is **Ori Ziv**, named as
publisher and data controller on both policies and in their contact sections, and `[[POSTAL_ADDRESS]]` is
**omitted by the owner's decision**, with `pawcue.support@gmail.com` as the sole contact channel. The drafts in
this folder carry the same resolved values, so they and `legal-site/public` say the same thing.

## Publishing checklist

1. Resolve every placeholder; have the texts reviewed.
2. Publish at `[[WEBSITE]]/privacy`, `[[WEBSITE]]/terms`, `[[WEBSITE]]/delete-account` and `[[WEBSITE]]/support`
   over HTTPS (`npx wrangler@latest deploy` from `legal-site/`).
3. From `apps/mobile`: `npx eas-cli env:set production --name EXPO_PUBLIC_PRIVACY_URL --value https://… --visibility plaintext --type string --scope project --non-interactive`
   and the same for `EXPO_PUBLIC_TERMS_URL` (and for `preview`, so the simulator audit build shows them).
4. Enter the same URLs in App Store Connect (Privacy Policy URL, Support URL) and Play Console (Privacy policy;
   Data Safety → account deletion URL).
5. Keep DATA_MAP.md, PRIVACY.md and the published policy in step: a schema change that adds a personal-data
   field updates all three in the same change.
