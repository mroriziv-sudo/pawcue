# PawCue — App Store launch pack (draft for ASO review)

**Status: DRAFT.** Nothing here is final and nothing has been submitted. Every claim below is checked against
what the app does at Phase 9.5; nothing is promised that is not built. No awards, user counts, testimonials or
outcome guarantees appear here because none exist. Keyword and title choices need validation against live App
Store search data before use — treat this as a starting position, not truth.

Business goal the copy serves, in order: **organic acquisition → activation → retention → paid conversion.**
The free clicker is the acquisition hook (it is a real, complete utility); the first free lesson is activation;
the daily plan and history are retention; the premium catalogue is conversion. The store listing should make
that ladder visible in its first three lines.

## 1. Name

Apple allows 30 characters. The name and subtitle are the highest-weighted search fields, so the name carries the
brand plus the one term people actually search.

| Option                             | Chars | Notes                                                                                   |
| ---------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| **PawCue: Dog Clicker & Training** | 30    | Recommended. Leads with the free utility people search for; "Training" covers the rest. |
| PawCue – Dog Training & Clicker    | 30    | Same words, training first. Use if search data shows "dog training" outranks "clicker". |
| PawCue: Puppy & Dog Training       | 28    | Drops "clicker" from the name; better only if the clicker is moved to the subtitle.     |

Keep "PawCue" as the display name under the icon (`app.json` `name`), whichever store name is chosen.

## 2. Subtitle (30 chars)

| Option                           | Chars |
| -------------------------------- | ----- |
| **Daily plan, clicker, lessons** | 28    |
| Train your dog 5 min a day       | 26    |
| Clicker, lessons & daily plan    | 29    |

"5 min a day" is true — the plan engine supports 5/10/15/20-minute days — and is a stronger promise than a
feature list. It is the one to test first if the name already contains "Clicker".

## 3. Keywords (100 chars, comma-separated, no spaces, no words already in the name/subtitle)

Assuming name option 1 and subtitle option 1 (so _dog, clicker, training, daily, plan, lessons_ are already
indexed):

```
puppy,obedience,sit,recall,leash,potty,biting,crate,tricks,positive,reinforcement,trainer,behavior,commands
```

(96 characters.) Rationale: the lesson catalogue literally covers sit, recall, leash, potty, biting, crate —
every one of those is a real search intent the app satisfies on day one. "Positive reinforcement" is the method
and a differentiator against aversive-tool apps. No competitor names, no "free" (Apple ignores it), no plurals
of words already present.

Hebrew keywords (for the he-IL localisation; validate separately):
`אילוף,כלבים,גור,קליקר,ישיבה,בוא,רצועה,צרכים,נשיכות,כלוב,חיזוק חיובי`

## 4. Positioning statement

> PawCue is the calm, positive way to train your dog in a few minutes a day: a free clicker, guided step-by-step
> lessons, and a daily plan built for your dog — with your progress kept for you.

Internal version (why us): the clicker is genuinely free and genuinely good (45 ms latency budget, three
sounds, haptics); the plan is deterministic and personalised from the dog's age, goals and history rather than a
static course; troubleshooting is built into every lesson and routes safety issues to a professional instead of
pretending an app can fix them.

## 5. Screenshot sequence (6.9" and 6.5" iPhone; 6 screenshots)

Each screenshot is one message, caption first, UI second. Captions are the ad; the UI is proof.

| #   | Caption (EN)                             | Caption (HE)                       | Screen                                              |
| --- | ---------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| 1   | A free dog clicker. Really free.         | קליקר לכלבים. בחינם, באמת.         | Clicker screen, big button, mid-press state         |
| 2   | Lessons that tell you exactly what to do | שיעורים שאומרים לכם בדיוק מה לעשות | Sit lesson, step 2 of 3, repetition counter visible |
| 3   | A daily plan built for your dog          | תוכנית יומית שנבנתה לכלב שלכם      | Today screen with a named dog and two activities    |
| 4   | Stuck? Every lesson has "Not working?"   | נתקעתם? בכל שיעור יש "לא עובד?"    | Troubleshooting sheet open, one option selected     |
| 5   | See your progress add up                 | ההתקדמות שלכם מצטברת               | Progress screen with sessions and lessons learned   |
| 6   | Unlock every lesson with Premium         | פתחו את כל השיעורים עם פרימיום     | Train tab with locked lessons, paywall peeking      |

Rules: real screenshots from the release build (never mock-ups with invented data); the dog shown has a name and
a real plan; no prices in screenshots (they vary by territory and change); RTL screenshots for he-IL are taken
with the app actually in Hebrew, not mirrored in an editor.

## 6. Description (up to 4,000 chars; first 3 lines show before "more")

```
PawCue helps you train your dog in a few minutes a day, with a method that's kind to your dog and easy for you.

FREE DOG CLICKER
A fast, reliable clicker that works the moment you open the app — no account, no sign-up. Optional haptics, and it works offline.

GUIDED LESSONS
Step-by-step lessons for the things every dog needs: name response, sit, down, come, stay, leave it, place, calm settling, loose-leash walking, and foundations for jumping, biting, crate and potty training. Each lesson tells you what to do, how many times, and when to click and treat.

A DAILY PLAN FOR YOUR DOG
Tell PawCue about your dog — age, goals, and how many minutes a day you have — and get a daily plan built for them. It starts with the basics, unlocks the next skill when your dog is ready, and brings back what's worth practising again.

"NOT WORKING?" — BUILT IN
Every lesson has a troubleshooting button for the common ways training goes sideways, with a fix for each. If something needs a vet or a professional trainer, PawCue says so instead of guessing.

YOUR PROGRESS, KEPT
Sessions and minutes add up as you train, and you can see which days you trained. Train as a guest, or sign in with Apple to keep everything safe across devices.

POSITIVE REINFORCEMENT ONLY
No punishment, no aversive tools, no shortcuts. Just clear marking, good timing, and treats.

PAWCUE PREMIUM
The first lessons are free. Premium unlocks the full lesson catalogue and the complete daily plan. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the period, and are managed in your App Store account.

In English and Hebrew.

Terms of Use: https://soft-star-9254.pawcue-support.workers.dev/terms
Privacy Policy: https://soft-star-9254.pawcue-support.workers.dev/privacy
```

Everything in the description exists in the build. Lesson list = the 13 seeded lessons. "Works offline" = the
clicker and cached catalogue. "Sign in with Apple" = Phase 9.5. Two claims were removed on 2026-09-17 because
the build does not make them: "three click sounds" (the sound selector is development-only) and "streaks" (the
Progress and Dog screens count sessions and days trained; there is no streak by design). Remove or reword any
line whose feature is cut before submission.

## 7. Promotional text (170 chars; editable without a new build)

Launch:

> New: a free clicker, guided lessons and a daily training plan for your dog. Start with the basics today.

(Use this field later for real, true news — a new lesson, a new language — never for urgency or fake offers.)

## 8. Category

- **Primary: Lifestyle** — where dog-care and pet-training apps sit and where "dog training" browse traffic is.
- **Secondary: Education** — the lessons are structured instruction; it is a defensible second placement.
- Not Health & Fitness (that is for people), not Utilities (the clicker is the hook, not the product).

## 9. Age rating

Expected **4+**. The questionnaire answers are all "None": no violence, no medical/treatment information (the
app routes to a professional; it does not diagnose), no gambling, no unrestricted web access (the only links are
Terms, Privacy and subscription management), no user-generated content shared with others, no contests.

Do not select "Medical/Treatment Information" for the troubleshooting content — it is training guidance with a
referral, not treatment. Keep the copy that way.

## 10. What the listing must not say (checked against the build)

- No AI, coach, or "personal trainer in your pocket" language — the AI coach is not built.
- No photos, reminders or notifications — not built.
- No Google sign-in — not built.
- No "vet-approved", "certified", "trusted by N owners", ratings, awards or results ("your dog will sit in 3
  days"). None exists, and Guideline 2.3.1 / 5.6.4 both bite on unsubstantiated claims.
- No pricing in the description or screenshots; the paywall shows the store's price at runtime.
- No countdowns, "limited offer" or scarcity anywhere (RELEASE_CHECKLIST.md cross-cutting rule).

## 11. Review notes (App Review Information)

Guest mode reaches every free screen and the paywall without an account; note that. Provide the sandbox tester
credentials for purchase testing. Point the reviewer to Settings → Account → Delete account and data for the
deletion requirement, and to the paywall's Terms/Privacy links.

## 12. How to submit

`apps/mobile/eas.json`'s `submit.production` is deliberately `{}` — see
`apps/mobile/__tests__/release-hardening.test.ts`. Load the App Store Connect API key from `.env.local`
(`EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`) into the shell, then run:

```
eas submit --platform ios --profile production --path <path-to.ipa>   # or --id <build id>
```

`ascAppId` has no environment variable in `eas-cli`; when it is absent from the profile, `eas submit` resolves or
creates the App Store Connect app interactively from the bundle identifier — run this without `--non-interactive`.

## 13. App Privacy questionnaire (App Store Connect → App Privacy), from DATA_MAP.md as built

Answer "Yes, we collect data from this app", then declare exactly these. Everything is **linked to the user's
identity** (it hangs off the account or the guest identity), **not used for tracking**, and used for **App
Functionality** only. No third-party analytics or crash SDK is in the build (checked 2026-09-17), so nothing
under Diagnostics or Usage Data.

| Apple category → type                | Declare? | Why (DATA_MAP.md row)                                                                                  |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| Contact Info → Email Address         | Yes      | `profiles.email` from Sign in with Apple (email scope only; a private-relay address is still an email) |
| Contact Info → Name                  | No       | The name scope is never requested                                                                      |
| Identifiers → User ID                | Yes      | The account / guest identity and the RevenueCat app user id                                            |
| Purchases → Purchase History         | Yes      | `subscriptions`, `purchase_events`, `entitlements`                                                     |
| User Content → Photos                | No       | The dog photo never leaves the device (`photo_url` is never written)                                   |
| User Content → Other User Content    | Yes      | The dog's profile (name, birthdate, breed, sex), goals, plan, sessions, progress                       |
| Usage Data → Product Interaction     | No       | `app_events` exists in the schema but nothing writes it as built                                       |
| Diagnostics → Crash Data             | No       | No crash reporter                                                                                      |
| Location, Health, Contacts, Browsing | No       | Never requested                                                                                        |

Tracking: **No, we do not track**. Data linked to you: the four "Yes" rows. Deletion: tick that the app offers
in-app account deletion (Settings → Account → Delete account and data) and give the web URL
https://soft-star-9254.pawcue-support.workers.dev/delete-account.

## 14. Screenshots, produced

`tools/store-screens/compose.py` frames raw simulator screenshots with the §5 captions on Warm Ivory at the
6.9" size (1320×2868, iPhone 17 Pro Max) App Store Connect requires; ASC scales the 6.5" set from it. The
2026-09-17 set was captured from the Release build of the tree at 79c057a on a fresh profile named Luna, in
English and Hebrew, and lives outside the repo (binary marketing assets) in the owner's upload folder.
