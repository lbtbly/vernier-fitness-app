# Brief

Name: **Vernier**. Chosen 2026-08-21 from 30 candidates, 9 shortlisted, each collision-checked against the app stores and against French, then ranked by three independent judges. A vernier scale reads finer than the instrument it sits on: the instrument does not improve, the reading does. That is the product's whole claim, a 7-day average pulled out of a scale that moves with hydration, and a vernier assists a judgement without ever issuing one, which is the proposes-never-imposes rule in one word. Home Screen label `Vernier`, seven letters, no descenders, no truncation. French /vɛʁ.nje/, English VER-nee-ay; the split does not matter because there is one user and he is French. Nothing in health, fitness, wellness or nutrition uses the name on either store. Vernier Science Education owns the search results, which costs a private app nothing.

Goal: A personal self-hosted PWA on an always-on Apple Silicon Mac mini that is the daily health dashboard and coach for one man (38, 183 cm, 89 kg now, 76 kg in 9 months), joining manual health logging, Withings Body Smart sync, Apple Health via an iOS Shortcut, validated blood-test import, an adaptive training coach with guided sessions, a nutrition coach with menus, recipes, macros and a shopping list, Google Calendar planning, and iPhone push plus weekly email reviews. Full spec, verbatim: .forge/GOAL.md

Size: L. Eleven vertical workstreams with five separate external integrations, each carrying its own auth, data flow and failure modes.

## Done level

Deployed and reachable. Not just "docker compose up works": the run ends with the app served from this machine over Tailscale Serve HTTPS on its private *.ts.net name, the PWA installed and exercised on the iPhone, healthcheck green, and the host listener bound to 127.0.0.1 only. The Tailscale name is configurable because it sets the WebAuthn origin and passkey RP ID.

Measured facts about the target host, read 2026-08-21: this machine is `lamberts-mac-mini`, arm64, macOS 26.6. Tailscale is running, tailnet `tailda76d6.ts.net`, so the app URL is `https://lamberts-mac-mini.tailda76d6.ts.net` and the RP ID is the tailnet domain `tailda76d6.ts.net`, not the full host. The reason is under Research below: the tailnet domain survives renaming the Mac, the hostname does not. Docker Engine 29.6.2 with Compose v5.3.1, daemon up, `linux/aarch64`. Node v26.7, npm 11.19. Absent: pnpm, corepack, age, gpg, psql. The iPhone `iphone181` is on the tailnet but last seen 23 days ago, so it must be brought online before the PWA can be installed.

## Hard constraints

From the spec, non-negotiable:
- No blood pressure anywhere: not in the schema, the UI, any import, any fixture, any PDF extraction, any recommendation. A PDF containing it is explicitly skipped.
- Never presented as a doctor, a medical device, or a diagnostic tool. Lab explanations stay educational, cautious, sourced, and invite a professional when relevant.
- Every coach change (training program, calorie target, menus) is proposed, then confirmed by the user before it applies. Every AI estimate is labelled as an estimate and stays editable.
- Data stays on the Mac mini. Claude receives only the minimum for one precise task, never a full medical record, never raw history, never credentials, never an unnecessary photo.
- Host listener on 127.0.0.1 only. Remote access through Tailscale Serve HTTPS, never Funnel, never a LAN port. Tailscale is the network barrier, never the authentication: passkey or backup password is always required.
- No invented APIs. HelloFresh, Uber Eats, Apple Health, Withings, Google, Anthropic: official current docs first, demo adapters and documented human steps where a key or consent is missing.
- Single-owner app. No social, multi-coach, professional, billing or marketplace features.
- Metric French units (kg, cm, km, kcal, g, mmol/L or g/L) and Europe/Paris dates.
- Accessibility, iPhone speed and simplicity outrank feature density.

Added at intake:
- App language is English. This overrides the spec's "en français" for all user-facing copy and for the documentation. Units stay metric and the timezone stays Europe/Paris, because those are physical facts about the user, not interface language.
- This machine is the Mac mini. Build, run, Docker and Tailscale all happen on the target host, so deployment is executed rather than only documented.
- Short deadline. One session to a complete, honest V1. Strict V1 scope; the optional pose-estimation feature stays behind its flag and out of this run.

## Taste references

Apple Health and Apple Fitness. Calm, sober, adult. iOS-grade typography, legible cards, generous touch targets, dark mode, trends over daily noise. No medical anxiety, no gamified confetti, no dashboard density for its own sake. Large controls during a workout, quiet everywhere else.

## Roles

One human wears every hat, but the hats have different mandates, different surfaces and different access needs, and the build has to serve all of them. A single owner account covers them; the census exists so no mode is designed away.

| Role | Mandate | Access | Key surfaces |
|---|---|---|---|
| Owner, daily | Know what to do today, log a measurement or a meal in seconds, run a guided session | Full, single owner account, passkey | Today, quick log sheet, guided session player, meal capture |
| Owner, weekly planner | Sunday evening: read the week back, confirm next week's sessions, menus and shopping list | Full | Weekly review, plan proposal and confirm, shopping list, calendar write confirm |
| Owner, data curator | Validate every extracted or estimated value before it becomes truth; curate the movement catalogue and its media provenance | Full, plus editorial surfaces | Lab PDF review and validate, meal estimate confirm, correction history, movement catalogue admin |
| Owner, operator | Keep the machine serving: containers, Tailscale, integration credentials, backups, restore, health | Full, plus host shell and the setup wizard | Setup wizard and integration status, diagnostics, backup and restore status, health endpoint, scripts |
| Unauthenticated visitor on the tailnet | None. Exists only as the thing the gate stops | None beyond the sign-in screen and the health endpoint | Sign-in, passkey prompt |

Access boundaries that follow: the ingest token for the iOS Shortcut is a separate credential from the web session and must never grant web access; it is shown once, stored encrypted, and is revocable. Third-party credentials are encrypted at rest with a master key from the environment and are never rendered back to the browser, never logged, never returned by an API. The unauthenticated visitor reaches nothing but the sign-in screen and an unauthenticated health endpoint that leaks no data.

## Research

Full notes in `.forge/research/`: scout.md (comparables, platform rules, legal), withings.md, google-calendar.md, ios-pwa.md, apple-health-shortcut.md, nutrition-data.md, exercise-media.md, stack-facts.md.

The findings that bind the build:
- iOS Web Push needs iOS 16.4+, a PWA already installed to the Home Screen, and a permission call inside a user gesture. Push is untestable until installation works, so installability ships early.
- Safari evicts script-writable storage after 7 unused days, and an installed PWA is exempt. Offline support depends on installation, not on clever caching.
- The WebAuthn RP ID is the tailnet domain `tailda76d6.ts.net`, not the full host and not a bare `ts.net`. `ts.net` and `*.c.ts.net` are Public Suffix List entries, so `ts.net` throws; `tailda76d6.ts.net` is legal and, unlike the full hostname, survives renaming the Mac, which would otherwise destroy every registered passkey with no migration path. It stays configurable.
- Wake Lock is iOS 18.4 and installed-PWA only, not 16.4. SpeechSynthesis `speak()` returns silently when it has no user gesture, so the voice must be primed on the session start tap. Vibration does not exist in any Safari. Timers derive from wall-clock `Date.now()`, never from accumulated ticks.
- iOS does not implement `pushsubscriptionchange`, and deleting the Home Screen icon destroys the push subscription. A push-woken service worker is the only substitute for Background Sync.
- GDPR's household exemption (Art. 2(2)(c)) covers the owner's own processing, but the third parties that receive data are bound independently. Minimising what leaves the machine is the real obligation.
- MDCG 2025-4 and the revised MDCG 2019-11 make the intended-purpose wording the classification test. Lab explanations give educational reference-range context, cite public sources, invite a professional, and never assess this person's condition.
- HelloFresh has no public API and prohibits automated access. The only lawful import is a single artifact the owner already holds, parsed locally.
- Uber Eats has no public API and no documented deep-link format. The app links to a search page and never claims nutrition it does not have.

## Panel

Four interviews, 2026-08-21, one man in his four modes: owner at the gym on a Tuesday, planner on the sofa on Sunday at 20:30, curator over a twenty-two row lab panel, operator in front of the cupboard. They agree more than they diverge, and where they agree they agree hard.

### Findings

**1. Silence is the failure mode, not error.** Nobody churns on a missing feature. They churn on the app doing something, or failing to, without saying so. The operator finds a dead Withings token by noticing a flat gap in a chart four days later: "I have to notice what isn't there, which is the worst possible failure signal, because I'm not looking for it." The curator's slow cases are exactly the ones where the honest answer is a conversion, a comparison, or a blank, and the app's temptation is to return one clean number instead. The planner's revocation trigger is an event he did not approve appearing in his calendar. Absence and smoothing are the same bug in different clothes. Every failure gets a named surface, a named cause, and one button to press. A green healthcheck on an unreachable app is the canonical version of this: two states, one signal.

**2. Trust does not fail locally, it generalises.** Two interviews reached the same sentence independently. The planner, on a session that ignores logged shoulder pain: "that's the moment I stop trusting every other number on the dashboard too, including the ones that were right." The curator, on a defaulted sauce: "the moment it starts smoothing over gaps to look more finished, I stop trusting the parts I didn't check." One unexplained write costs the whole dashboard. That makes provenance and reason strings load-bearing rather than decorative. A reason names the cause it acted on, "moved from Thursday because your calendar shows you busy 18:00 to 23:00", never a label like "recommended" or "rescheduled".

**3. Interruption is the normal case.** A call mid-set. A phone asleep on the mat. Three evenings gone before the week begins. A macOS update that drops the Tailscale listener. All four describe a life that interrupts the app constantly, and all four name the same unacceptable response: work that has to be redone, or a guilt message. "Two missed sessions because Thursday ran late is not a failure state, it's Tuesday." The app absorbs interruption. It reconciles from wall-clock time, commits locally, re-proposes without scoring, and learns a correction instead of asking for it again next Sunday. Correcting Wednesday to Friday three weeks running and being offered Wednesday in week four is the whole test of whether "adaptive" means anything.

### Table stakes

Miss one and the product does not clear the floor.

**1. Nothing commits as a batch.** Per-item accept, edit and reject on one screen, not three flows. Per-row save on a lab panel behind an explicit save button, never autosave, never all-or-nothing across twenty-two rows. Two-tap undo that pulls one event back out of the dedicated calendar. A single whole-plan Accept gets the whole plan rejected the first time one line is wrong, and twenty minutes are gone.

**2. Every value keeps its origin and its original.** Manual, Withings, Apple Health, PDF or AI estimate, stored permanently, not "recently imported". Correction history append-only. A converted lab value shown beside the printed original with the factor visible, never the converted number alone. Confidence per row so attention goes to the three rows that need it. An estimate badged as an estimate, a gap left as a gap. Any chart point walks back to its source page in two clicks. A stored correction survives re-import, and a conflict with a new value is a question, not a decision.

**3. The capture path never blocks.** Offline write that commits locally in a basement gym with patchy signal and a wifi login screen every visit. Elapsed time from timestamps, never from interval ticks. Last week's working weight inline while the set is open, not behind a back button with a stranger waiting for the bench. Zero interstitials during a session: no rating prompt, no notification permission, no upsell, no ad. Nothing the owner logged himself sits behind a gate. Trends are the front door, 7 and 28 day, weight and waist on the same view, never the daily number leading.

### Risk

**The unapproved write.** The app mutates state the owner cannot see it mutating, and he finds out late or never. Two surfaces, one blast radius.

The calendar write is the sharp one. The planner confirms at 20:45 while tired, and the only thing between that and a revoked OAuth grant is a diff he can read in four seconds: the dedicated calendar before and after, added, moved and deleted listed plainly. A summary sentence is the cheap version of that screen, it is what deadline pressure produces, and it fails the exact test it exists to pass. His response is revocation with no warning and no explanation. The integration does not degrade, it ends.

The quiet one is the same shape with a longer fuse: a re-import that overwrites a corrected value, or a recipe format change that silently serves last month's macros as this month's. Nobody notices, so the trend is wrong and the wrong point cannot be found. "That's worse than not importing at all, because I won't know to check."

One rule covers both. Nothing writes outside a confirmed diff, and every write is reversible from the surface that showed it.

### Access boundaries

Who must never see what, as the interviews put it. These sharpen the Roles table above rather than replacing it.

| Who or what | Must never see | As raised |
|---|---|---|
| The schema | Blood pressure, from any source, any import, any PDF. Skipped at extraction, absent from the tables, verifiable by reading the schema. | "I don't want a hide BP toggle sitting on top of a BP value that's actually in the database." A UI filter is not a boundary. |
| Claude | A whole lab PDF, a full medical record, raw history, credentials, an unnecessary photo. One task, one crop, one row. | "Not my full medical history riding along because it was easier to send the whole document." |
| The browser, any API response, any log line | Third-party tokens, the master key, any secret value. Integration status shows connected, expiring, revoked or demo plus last successful sync, never the credential behind it. | "Status is not the same permission level as secrets, and I want the surface to enforce that distinction so I stop being the thing standing between convenient and leaked." |
| The web session | The iOS Shortcut ingest token, and the reverse. Separate credential, shown once, stored encrypted, revocable. Ingest never grants web access. | Ingest is a different door from sign-in and must fail closed as one. |
| The unauthenticated visitor on the tailnet | Everything but the sign-in screen and a health endpoint that returns liveness and nothing else. No integration names, no counts, no dates, and no requirement to SSH in to read it. | Tailscale is the network barrier, never the authentication. |
| The primary Google Calendar | Any write, ever. Writes land in the dedicated calendar only, after a per-item confirm. A widened scope on an update is a new consent, not a changelog line. | "The instant I see a write in a calendar I didn't designate, I revoke and I don't come back to explain why." |
| The owner | An AI estimate with its origin scrubbed. A converted value without the printed original beside it. A number defaulted over a gap it could not fill. | The owner is protected from false confidence, not only from disclosure. |
| Disk, after validation | The source lab PDF, if the owner says so. The app asks at the point where it matters and does what it is told. | "That's not a setting buried in an admin panel." Retention is a decision, not a default. |

One boundary the operator added that is not about data: every host dependency this build acquires is named at the greenlight in PREFLIGHT or it does not get to exist. Discovering that a restore needs `age` or `gpg` during the actual emergency is the failure the single gate exists to prevent.
