# Privacy

PawCue is built privacy-by-design (brief §17, §31): minimal collection, no advertising SDK, no cross-app tracking,
guest mode never requires an account. This document is the engineering-facing privacy summary; the field-level
inventory is [DATA_MAP.md](DATA_MAP.md), and the store-facing questionnaires are tracked in
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## What we do not collect

Location, microphone, contacts, Bluetooth, motion data, health data, or any advertising/tracking identifier (brief
§18). There is no ATT prompt because there is nothing in v1 that requires one.

## What we do collect, and why

See [DATA_MAP.md](DATA_MAP.md) for the exhaustive field-level list. In summary: an identity (guest or Apple/Google
sign-in), a dog profile the user chooses to create, training activity needed to compute the plan/progress/streak
shown back to the user, and first-party product analytics events (closed enum, no free-text properties — brief
§29) needed to run the product. Optional dog photo upload is opt-in, initiated only by an explicit tap (brief §18).

## Guest mode

A guest is a real (if ephemeral) identity under the hood — see AUTH.md — but requires no personal information to
create: no email, no name. If a guest never signs in, their data is reachable only via their device's stored
session credential; there is no username/password recovery path for pure guest data, by design (matches the "no
forced login" principle — the tradeoff is explicit, not hidden).

## Third parties

- **Supabase** (database, auth, storage, edge functions) — infrastructure processor, not a data recipient in the
  advertising sense.
- **RevenueCat** (billing) — receives purchase/subscription data necessary for entitlement verification; see
  BILLING.md. No training/behavioral data is shared with it.
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

Deleting an account (Settings → Account → Delete Account, or the web `/delete-account` route) hard-deletes all
personal training data. Billing/audit records are retained with the personal link removed — see DATABASE.md and
DATA_MAP.md for exactly which tables and why. See AUTH.md for the full deletion pipeline.

## Medical/behavioral disclaimer

The app is educational and does not provide veterinary diagnosis (brief §13). Troubleshooting content that could
indicate a medical or safety issue is tagged `VET_RECOMMENDED` or `URGENT_SAFETY` and directs the user to a
professional rather than attempting to resolve it in-app (brief §14, §34) — see `packages/domain`
`safetyCategorySchema` and `supabase/seed.sql` for the mechanism.
