# Brief

Goal: A personal self-hosted PWA on an always-on Apple Silicon Mac mini that is the daily health dashboard and coach for one man (38, 183 cm, 89 kg now, 76 kg in 9 months), joining manual health logging, Withings Body Smart sync, Apple Health via an iOS Shortcut, validated blood-test import, an adaptive training coach with guided sessions, a nutrition coach with menus, recipes, macros and a shopping list, Google Calendar planning, and iPhone push plus weekly email reviews. Full spec, verbatim: .forge/GOAL.md

Size: L. Eleven vertical workstreams with five separate external integrations, each carrying its own auth, data flow and failure modes.

## Done level

Deployed and reachable. Not just "docker compose up works": the run ends with the app served from this machine over Tailscale Serve HTTPS on its private *.ts.net name, the PWA installed and exercised on the iPhone, healthcheck green, and the host listener bound to 127.0.0.1 only. The Tailscale name is configurable because it sets the WebAuthn origin and passkey RP ID.

Measured facts about the target host, read 2026-08-21: this machine is `lamberts-mac-mini`, arm64, macOS 26.6. Tailscale is running, tailnet `tailda76d6.ts.net`, so the app URL is `https://lamberts-mac-mini.tailda76d6.ts.net` and the RP ID is that same hostname. Docker Engine 29.6.2 with Compose v5.3.1, daemon up, `linux/aarch64`. Node v26.7, npm 11.19. Absent: pnpm, corepack, age, gpg, psql. The iPhone `iphone181` is on the tailnet but last seen 23 days ago, so it must be brought online before the PWA can be installed.

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
- The WebAuthn RP ID must be the full tailnet hostname, `lamberts-mac-mini.tailda76d6.ts.net`, never a bare `ts.net`, and it must be configurable because renaming the machine invalidates every registered passkey.
- Wake Lock keeps the screen on during a session; iOS still suspends timers when the app backgrounds, so elapsed time is reconciled from wall-clock timestamps, never from interval ticks.
- GDPR's household exemption (Art. 2(2)(c)) covers the owner's own processing, but the third parties that receive data are bound independently. Minimising what leaves the machine is the real obligation.
- MDCG 2025-4 and the revised MDCG 2019-11 make the intended-purpose wording the classification test. Lab explanations give educational reference-range context, cite public sources, invite a professional, and never assess this person's condition.
- HelloFresh has no public API and prohibits automated access. The only lawful import is a single artifact the owner already holds, parsed locally.
- Uber Eats has no public API and no documented deep-link format. The app links to a search page and never claims nutrition it does not have.
