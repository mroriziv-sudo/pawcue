# Phase 4 — onboarding, dog profile, account transition, server sync

## What owns what

```
packages/domain/onboarding/onboarding-flow.ts    the question list, validation, and the dogs-row projection
apps/mobile/src/dogs/dog-repository.ts           dog rows, through RLS
apps/mobile/src/state/onboarding-store.ts        the partially answered form
apps/mobile/src/state/dog-store.ts               the active dog, cached for routing
apps/mobile/src/state/startup-route.ts           where the app opens — a pure function
apps/mobile/src/sync/session-sync.ts             flushing local training to the server
supabase/functions/auth-merge-guest/index.ts     the guest merge, and the whole authorization boundary
```

## Onboarding is data

`ONBOARDING_STEPS` is a list of field definitions; one renderer draws whatever it contains. A new question is a
new entry, not a new screen — which is why accessibility, RTL, Dynamic Type, keyboard avoidance and validation
are solved once rather than five times.

**Every field already exists on `dogSchema`**, and a test asserts that, so the flow cannot grow questions the
product has nowhere to put. Only the name is required.

Answers are persisted on every keystroke. That is what makes Back lossless and an interrupted flow resumable:
the draft is the single record of what has been answered, so moving between steps is only ever a change of index.
The draft is cleared **after** the dog row exists, never before, so a failed creation costs nothing.

## Startup routing

`resolveStartupRoute` is a pure function of hydrated local state, because routing must not wait on the network —
a server round trip is exactly how a returning user ends up watching onboarding flash before their app.

| State                             | Route                                  |
| --------------------------------- | -------------------------------------- |
| Storage not yet read              | `loading` (splash)                     |
| No dog, no draft, not skipped     | `onboarding`                           |
| No dog, draft has answers         | `onboarding_resume` at the stored step |
| A dog exists (guest or signed in) | `app`                                  |
| Onboarding declined               | `app`                                  |

A dog is the strongest signal there is, so it beats a stale draft. Routing deliberately **does not branch on
identity**: after a merge the dog is re-parented rather than replaced, so signing in changes nothing about where
the app opens.

The redirect lives on the entry screen, not in the root layout. A `<Redirect>` returned from a layout replaces the
`<Stack>` it would otherwise render, unmounting the navigator the redirect needs — the first simulator run of this
phase produced exactly that infinite loop ("Maximum update depth exceeded").

Onboarding is escapable, and the escape is remembered. The product's first non-negotiable is that PawCue works
immediately with no account; being dropped back into a declined flow on every launch would break that.

## A guest owns a real dog

Anonymous sign-in produces a real `auth.users` row, and the Phase 0 trigger gives it a real `profiles` row. So
`dogs.owner_user_id` can point at a guest, and `dogs_all_own` (`auth.uid() = owner_user_id`, both `USING` and
`WITH CHECK`) governs it exactly as it governs a signed-in user. **No service-role key exists in the client and no
admin path is used** — the database decides.

`owner_user_id` is passed explicitly because the column has no default. That is safe rather than trusting: the
`WITH CHECK` means a caller can only ever name itself, and RLS refused the first test that omitted it.

## Guest → account

The client sends **two tokens and no identity at all**:

```
POST /v1/auth/merge-guest
Authorization:          Bearer <caller's authenticated JWT>   → supplies the merge TARGET
X-Guest-Authorization:  Bearer <anonymous session JWT>        → supplies the merge SOURCE
```

Both are verified independently, server-side. In the handler, `targetUserId` and `sourceUserId` are assigned only
from `getUser()` results; there is no code path where a body value reaches the RPC. A body `anonymousSessionId` is
accepted solely so it can be cross-checked and **rejected on mismatch**.

The guest token must be captured **before** sign-in, because signing in replaces the stored session. That ordering
is the one subtle part of the client flow.

Training history needs no special handling: sessions and events are owned _through_ the dog, so re-parenting the
dog carries them. Proven end to end against the real backend.

## Sync

Closes the boundary Phase 3 left open (`training_sessions.dog_id` is NOT NULL, and a guest had no dog).

Both writes are upserts keyed by ids the client generated **at the moment the thing happened** — the session id
from `startSession`, and one per event. So a retry after a dropped response, a crash mid-flush, or a
double-invocation rewrites the same rows rather than creating new ones.

- The session row is written before its events, because of the foreign key.
- A failure between the two leaves the record unsynced; the next run repairs it.
- `syncedToServer` is set **only after both writes succeed**, and the event payload is released only then. Local
  data never disappears before the server confirms it holds it.
- Sessions are flushed and marked one at a time, so one failure cannot discard the ones that succeeded.

`Progress` and `Streak` are untouched: server-derived from `session_events`, exactly as their contract says.

## Deliberately not done

- **Apple and Google sign-in raise `ProviderNotConfiguredError`.** Both need external configuration this project
  does not have — an Apple Developer account and its Sign in with Apple capability, Google OAuth client ids, and
  the matching Supabase provider entries. They are wired through the provider interface and the UI reports the
  failure honestly. A stub that returned success would make the merge path look exercised when it never ran.
- **Merge conflict resolution.** The 409 is surfaced with both summaries, so an existing-account merge is never
  silently resolved — that is the safety-critical half. Choosing which side to discard means deleting real
  training data and needs its own server-side transaction and its own tests.
- **Rate limiting is per-instance and in-memory**, so it raises the cost of a brute-force loop rather than
  eliminating it. A durable limit needs shared state.
