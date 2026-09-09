# State flow: guest → first lesson → plan → sign-in → purchase

## States

```
                     ┌────────────────────┐
                     │  APP_LAUNCHED       │   no session, no network required
                     └─────────┬────────────┘
                               │ ensureAnonymousSession()
                     ┌─────────▼────────────┐
                     │  GUEST_CLICKER        │◄──────────────────────────────┐
                     │  (Screen 1)             │                              │
                     └─────────┬────────────┘                              │
                               │ 2–3 clicker presses                       │
                     ┌─────────▼────────────┐                              │
                     │  GUEST_FIRST_LESSON     │  "Name Game" (Screen 2)     │
                     └─────────┬────────────┘                              │
                               │ lesson completed                          │
                     ┌─────────▼────────────┐                              │
                     │  GUEST_ONBOARDING       │  Screens 3–6: goal, dog,   │
                     │  (goal → dog → skills →  │  skills, daily minutes    │
                     │   commitment)              │                          │
                     └─────────┬────────────┘                              │
                               │ POST /v1/plans/generate                   │
                     ┌─────────▼────────────┐                              │
                     │  PLAN_GENERATING        │  Screen 7 (deterministic, │
                     │                            │  ~600–900ms min visual)  │
                     └─────────┬────────────┘                              │
                               │ plan ready                                │
                     ┌─────────▼────────────┐                              │
                     │  PLAN_REVEALED          │  Screen 8 — Day 1 free     │
                     └─────────┬────────────┘                              │
                     ┌─────────┴────────────┐                              │
                     │                        │                              │
           continue day 1 free      attempt Day 2 / full catalog            │
                     │                        │                              │
                     │              ┌─────────▼────────────┐                │
                     │              │  PAYWALL (Screen 9)     │              │
                     │              └─────────┬────────────┘                │
                     │               close │      │ purchase                │
                     │                     │      │                          │
                     │           back to plan      │                          │
                     │           (still free)      │                          │
                     │                            ┌▼──────────────┐          │
                     │                            │ PURCHASE_FLOW    │          │
                     │                            │ (store sheet)      │          │
                     │                            └───────┬────────┘          │
                     │                                    │ entitlement       │
                     │                                    │ verified server-side
                     │                            ┌───────▼────────┐          │
                     │                            │ PREMIUM_ACTIVE    │──────┘
                     │                            └────────────────┘
                     │
           ┌─────────▼────────────┐   at any point, independent of the above:
           │  SIGN_IN (Apple/Google) │
           └─────────┬────────────┘
                     │ POST /v1/auth/merge-guest
           ┌─────────▼────────────┐
           │  AUTHENTICATED_ACTIVE   │  guest data now owned by real account
           └────────────────────────┘
```

## Key invariants

1. **Every state before `PAYWALL` is reachable with zero account and, after the very first launch, zero network
   call.** The clicker, the Name Game lesson, and (once fetched) the plan reveal all work offline.
2. **Sign-in is orthogonal to purchase.** A user can sign in without ever paying (to sync progress across devices for
   free), and in principle could restore a purchase before ever explicitly "signing in" (Apple/Google auth _is_ the
   sign-in — there's no separate email/password identity to create).
3. **The paywall is reachable from `PLAN_REVEALED` (attempting Day 2+), from `TRAIN` (full catalog), and from
   `Advanced troubleshooting`** — never shown unprompted on app open, per §33 (no interstitial ambush paywalls in
   v1).
4. **`GUEST_ONBOARDING` never blocks on the network.** Answers are held in the local Zustand store
   (`useOnboardingDraftStore`) and only submitted to `POST /v1/plans/generate` once, at the end. Abandoning
   onboarding mid-way leaves the guest in `GUEST_CLICKER`/`GUEST_FIRST_LESSON` with no partial server state to clean
   up.
5. **Merge-guest is safe to call more than once** (see `merge_guest_session` in DATABASE.md) — the client does not
   need to track "have I already merged" precisely; a duplicate call is a no-op.
6. **Existing-account conflict:** if `POST /v1/auth/merge-guest` finds the target account already has its own dog(s),
   it does **not** silently merge two histories. It returns a `409 GUEST_MERGE_CONFLICT` with both data summaries;
   the client shows a one-screen choice ("Keep this device's progress" / "Keep your account's progress") — never a
   silent data loss.

## Screen → state mapping

| Screen (brief §4)                     | State                                          |
| ------------------------------------- | ---------------------------------------------- |
| 1. Free clicker                       | `GUEST_CLICKER`                                |
| 2. First free lesson                  | `GUEST_FIRST_LESSON`                           |
| 3–6. Goal / dog / skills / commitment | `GUEST_ONBOARDING`                             |
| 7. Plan generation                    | `PLAN_GENERATING`                              |
| 8. Plan reveal                        | `PLAN_REVEALED`                                |
| 9. Premium                            | `PAYWALL` → `PURCHASE_FLOW` → `PREMIUM_ACTIVE` |
