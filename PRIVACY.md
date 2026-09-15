# Privacy

PawCue is built privacy-by-design (brief §17, §31): minimal collection, no advertising SDK, no cross-app tracking,
guest mode never requires an account. This document is the engineering-facing privacy summary; the field-level
inventory is [DATA_MAP.md](DATA_MAP.md), and the store-facing questionnaires are tracked in
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## What we do not collect

Location, microphone, contacts, Bluetooth, motion data, health data, or any advertising/tracking identifier (brief
§18). There is no ATT prompt because there is nothing in v1 that requires one.

## What we do collect, and why

See [DATA_MAP.md](DATA_MAP.md) for the exhaustive field-level list. In summary: an identity (guest, or Sign in with
Apple — email scope only, no name), a dog profile the user chooses to create, training activity needed to compute
the plan/progress/streak shown back to the user, and subscription state. The schema also provides for first-party
product analytics events (closed enum, no free-text properties — brief §29) and an optional dog photo. **Neither
reaches the server as built** — nothing calls `app_events`, and the dog photo, when an owner adds one, is stored on
the device only (see DATA_MAP.md): the photo-library permission is requested only from the explicit "Choose a photo"
action, and no camera permission exists. Both
must be added to this document, DATA_MAP.md, the privacy manifest (`app.json` → `ios.privacyManifests`) and the
published policy before they ship.

The user-facing texts are drafted from this behaviour in [docs/legal/](docs/legal/README.md) — Privacy Policy,
Terms of Use and the `/delete-account` page — and are not published until reviewed and hosted at a real domain.

## Guest mode

A guest is a real (if ephemeral) identity under the hood — see AUTH.md — but requires no personal information to
create: no email, no name. If a guest never signs in, their data is reachable only via their device's stored
session credential; there is no username/password recovery path for pure guest data, by design (matches the "no
forced login" principle — the tradeoff is explicit, not hidden).

## Third parties

- **Supabase** (database, auth, storage, edge functions) — infrastructure processor, not a data recipient in the
  advertising sense.
- **RevenueCat** (billing) — receives purchase/subscription data necessary for entitlement verification; see
  BILLING.md. No training/behavioral data is shared with it. Its customer record is deleted (`DELETE
/v1/subscribers/{id}`) as the first step of account deletion.
- **Apple / Google** (sign-in, IAP) — identity and purchase data flows only, standard for any app using their
  platform sign-in/IAP.
- **Crash/observability provider** — not selected yet (brief §40 requires the interface to exist before a vendor is
  picked); when one is chosen, this document and the relevant store privacy questionnaires are updated before it
  ships, not after.

No advertising or analytics-for-monetization SDK is integrated in v1.

## AI / training coach

`TrainingCoachProvider` is architected but disabled by default (brief §10) — no user data is sent to any AI/LLM
provider in v1. If a future release enables it, this document, DATA_MAP.md, and both stores' privacy questionnaires
must be updated before that flag is flipped, not after.

## Retention and deletion

Deleting an account (Settings → Account → Delete account and data — implemented in Phase 9.5 for guests and
accounts alike; the web `/delete-account` route is drafted and awaits a domain) hard-deletes all personal training
data and the RevenueCat customer. Billing/audit records are retained with the personal link removed — see
DATABASE.md and DATA_MAP.md for exactly which tables and why. See AUTH.md for the full deletion pipeline. On the
device, everything identity-scoped is cleared; language, sound and haptics are kept as device preferences.

### Apple privacy manifest

`app.json` → `ios.privacyManifests` declares the required-reason APIs the release binary uses (UserDefaults
CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1) and the collected data types above (user
id, email, user content, purchase history — all linked, none for tracking; `NSPrivacyTracking` false). The
DiskSpace entry exists because `ExpoFileSystem.framework` references the API and ships no manifest of its own —
found by `tools/release/audit-privacy-manifest.mjs` on the Phase 9 release artifact. Asserted by
`__tests__/privacy-manifest.test.ts`; re-run the audit script on every archive.

## Medical/behavioral disclaimer

The app is educational and does not provide veterinary diagnosis (brief §13). Troubleshooting content that could
indicate a medical or safety issue is tagged `VET_RECOMMENDED` or `URGENT_SAFETY` and directs the user to a
professional rather than attempting to resolve it in-app (brief §14, §34) — see `packages/domain`
`safetyCategorySchema` and `supabase/seed.sql` for the mechanism.
