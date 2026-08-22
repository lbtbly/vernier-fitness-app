# Plan

Single-owner self-hosted health PWA, served from this Mac mini over Tailscale
Serve HTTPS. Fourteen vertical slices. Done level: deployed and reachable.

---

## Stack

Next.js 16.3.2 with the App Router, React 19, TypeScript, Drizzle plus `pg` on
PostgreSQL 18, built and run inside `node:24-slim` on `linux/arm64` under Docker
Compose on this machine, fronted by Tailscale Serve HTTPS at
`https://lamberts-mac-mini.tailda76d6.ts.net`.

Everything that could have been a dependency is a built-in here, and that is the
defence: Argon2id is `crypto.argon2Sync`, backup encryption is chunk-framed
AES-256-GCM from Node `crypto`, charts are hand-rolled server SVG with `d3-scale`
and `d3-shape` imported server-side only, and the service worker is forty
hand-written lines, so the image carries no native binary, no CLI, no `age`, no
`gpg`, no `openssl` and no dead PWA plugin. Drizzle over Prisma because Prisma 7
still ships a libc-matched Rust schema engine and a 78 MB client that has to be
traced into a standalone build, while Drizzle's runtime is a SQL folder and a
programmatic migrator. The container pins Node 24, not the host's Node 26,
because Next.js 16.3.2 carries two open Node 26 defects (vercel/next.js #96165
truncating RSC streams, #97492 on the removed `SlowBuffer`) and `crypto.argon2Sync`
landed in Node 24.7, so `node:24-slim` at 24.19 satisfies both ends.

Nothing in `.forge/research/stack-facts.md` is overruled.

Runtime dependencies, complete: `next`, `react`, `react-dom`, `drizzle-orm`,
`pg`, `@simplewebauthn/server`, `@simplewebauthn/browser`, `@anthropic-ai/sdk`,
`web-push`, `unpdf`, `node-cron`, `d3-scale`, `d3-shape`. Behind the scanned-PDF
branch only: `@napi-rs/canvas`, `tesseract.js`. Dev only: `drizzle-kit`,
`typescript`, `vitest`, `@playwright/test`.

## Deploy target

Not Vercel. The ship skill's Vercel runbook does not apply. The deploy is
`docker compose up -d --build` on this host plus an idempotent
`scripts/tailscale-serve.sh`, and the runbook lives in
`docs/mac-mini-deployment.md` and `docs/tailscale.md`. The finisher reads those,
not the Vercel section.

Three facts the build treats as configuration, never as constants:

- `APP_ORIGIN=https://lamberts-mac-mini.tailda76d6.ts.net`
- `RP_ID=tailda76d6.ts.net`, the tailnet domain, not the full hostname. `ts.net`
  is a Public Suffix List entry so a bare `ts.net` throws; `tailda76d6.ts.net` is
  legal and survives renaming the Mac, which the full hostname does not. This
  corrects the line in BRIEF.md that named the full hostname.
- The host listener binds `127.0.0.1` only. Tailscale is the network barrier and
  never the authentication.

## Direction

`.forge/DESIGN.md` is the approved direction and it is executed, not explored.
Thirteen exported screens in `.forge/screens/00-patterns.png` through
`12-settings-integrations.png`, with the standalone HTML wireframes in
`.forge/wireframes/` as the interactive reference. Tokens are copied verbatim
from DESIGN.md section 3; the attribute-selector order is load bearing.

The three decisions a builder must not improvise are DESIGN.md section 5, and
each one is a rubric line: nothing writes without a confirmed diff, absence is
drawn as absence and provenance is never scrubbed, colour is state and never
decoration.

## Roles and capabilities

One human wears four hats and one account carries all four, so the matrix that
matters is not owner-versus-owner. It is owner versus the two non-human
principals and the visitor at the gate.

| Capability | Owner session | iOS Shortcut ingest token | Unauthenticated tailnet visitor |
|---|---|---|---|
| Sign in, read every screen | yes | **no** | no |
| Write a measurement through the web UI | yes | **no** | no |
| POST `/api/ingest/health` | **no** | yes | no |
| Read `/healthz` | yes | yes | yes, liveness only |
| Read integration status (state, last sync) | yes | no | no |
| Read any credential value | **no** | **no** | **no** |
| Create or revoke an ingest token | yes | **no** | no |
| Confirm a calendar write | yes | no | no |
| Run backup, restore, export, delete | yes | no | no |
| Reach any route other than `/sign-in`, `/healthz`, the static shell | yes | no | **no** |

Three cells are denied and tested as failures, not assumed: the ingest token
reaching a web route (F51), a web session reaching the ingest endpoint (F51), and
any principal reading a credential value from the browser, an API response or a
log line (F16). A role reading what it must never see is a FAIL with the capture
attached.

Test identities, seeded by `scripts/seed-demo.mjs` so the verifier walks every
role with no operator credential:

| Identity | How it is created | What it proves |
|---|---|---|
| `owner` with the backup password from `DEMO_OWNER_PASSWORD` | seed, only under `DEMO_MODE=1` | all four owner modes |
| `ingest-demo`, an ingest token printed once by the seed | seed, only under `DEMO_MODE=1` | the Shortcut principal, both denied directions |
| no identity | none needed | the visitor at the gate |

Passkeys cannot be seeded; the passkey path is exercised by a Playwright WebKit
virtual authenticator, and the real-device registration is captured once.

## Operator surfaces, named now

The operator is a first-class user of this build, not an afterthought.

- **Setup wizard and integration status**, slice 5 onward: per-integration state
  (connected, expiring, revoked, demo), last successful sync, a test button, and
  no credential ever rendered back.
- **Ingest diagnostics**, slice 6: the canonical string, the digest the server
  computes for it, and the `curl` line, so a silent mismatch becomes visible.
- **Push diagnostics**, slice 12: eleven rows, each with its own remedy, ordered
  so the first failure is the only one shown.
- **Machine status**, slice 13: container state, disk headroom, last backup, last
  restore check, last successful sync per integration, warn thresholds.
- **How the operator learns something broke**, slice 13, F133: any failed
  scheduled job, backup or integration raises one push and one persistent banner
  naming the surface, the cause and one action. The panel's first finding is that
  silence is the failure mode; a green healthcheck on a broken sync is the
  canonical version of it.
- **Abuse and rate limits**, slice 2: six failed sign-ins a minute returns 429,
  every attempt appends an audit row. Slice 6: timestamp skew 300 s, a 24-hour
  nonce set, and a body cap of 8 MB, 32 series, 20,000 rows.
- **Backup and restore**, slice 13: encrypted archive, integrity that fails loudly
  on truncation, reorder and a flipped byte, and a restore proven on temporary
  data inside the test suite.
- **Moderation and notice queues do not fire.** Single-owner app, no social
  surface, no other user's content, nothing to report and nobody to report it to.
  Adding a moderation queue here would be a defect.

## What the free tier cannot carry

Named now so it is not discovered at slice 10.

- **Anthropic is the only metered cost in the build.** There is no free tier. A
  monthly ceiling in `usage_ledger` refuses the call rather than overspending,
  and `ANTHROPIC_MODE=demo` runs the whole photo flow with no key. Sonnet 5
  introductory pricing ends 2026-08-31; the rate table lives in config, not code.
- **Withings free tier covers every metric a Body Smart produces.** All seven sit
  in the Basic Biomarker Pack. Visceral fat and BMR are not API-exposed for this
  model; plan against the seven and treat anything else as a bonus.
- **Withings webhooks are unreachable behind Tailscale** and are not built. The
  poller uses `lastupdate`, which Withings itself recommends and which is
  strictly more complete than a webhook.
- **Google Calendar must be published to In production, unverified.** Left in
  Testing, the refresh token dies seven days after consent with no code change.
  This is a PREFLIGHT item, not a runtime concern.
- **HelloFresh has no API and prohibits automated access. Uber Eats has no public
  consumer API and no documented deep-link format.** The lawful scope is one
  artifact the owner already holds, parsed locally, and a link to a search page.
- **YouTube embeds do not work offline and may not be cached.** Bundled local
  media is the primary layer; video is the optional third layer.
- **Let's Encrypt rate limits** apply to `tailscale cert`. Certificates are
  cached; do not loop on issuance.
- **iOS gives no background execution.** No Background Sync, no Periodic Sync.
  The outbox drains on six explicit triggers plus a push-woken worker.

---

# The slices

Fourteen, not the usual ten to thirteen. Section 17 of GOAL.md names eleven
workstreams, the deployed done level adds a walking skeleton in front of them,
and the spec's own step 11 splits cleanly into a backup-and-operator epic and a
final-gate epic. Compressing further would push a slice past a dozen rubric
lines, which is the line that matters.

Every slice ends green, committed, and redeployed, so every rubric line naming
the live URL can be measured the day its slice lands.

---

## Slice 1. The walking skeleton and the live URL

**The owner, in operator mode, can reach a running app at
`https://lamberts-mac-mini.tailda76d6.ts.net` from his iPhone, add it to the Home
Screen, and see five named tabs that build, deploy and answer.**

Compose brings `postgres:18-alpine` and the app image up on `linux/arm64`.
Drizzle migrations run from the app container on boot and are idempotent on the
second run. `/healthz` answers liveness and nothing else: no integration name, no
count, no date, no third-party version, because the unauthenticated visitor
reaches it. The published port binds `127.0.0.1` only and the LAN address refuses
the connection. `scripts/tailscale-serve.sh` configures one HTTPS proxy to
`127.0.0.1:3000`, never Funnel, and runs twice without changing anything.

Five tab routes plus `/sign-in` exist and render their own titles, styled with the
DESIGN.md tokens. The manifest is served as `application/manifest+json` with
`display: standalone`, a 180x180 `apple-touch-icon` PNG is linked, and the
hand-written service worker precaches the shell and serves an offline screen that
names the cause rather than showing a browser error. `APP_ORIGIN` and `RP_ID` come
from the environment; changing them and restarting changes the rendered origin
with no code edit.

This slice ends with the app live at the real URL, recorded in EVIDENCE.md.
Nothing after it may claim the URL before this lands.

Closes: F1, F2, F3, F4, F5, F6, F7, C1, C2, C3, R1

---

## Slice 2. The gate: passkey, password and the credential boundary

**The owner can create his single account once, sign in with a passkey on the
iPhone or Touch ID on the Mac, fall back to a complex password, and know that no
credential value is reachable from the browser, an API response or a log line.**

First-run bootstrap creates exactly one owner and refuses the second attempt with
409. Passkeys register and authenticate against RP ID `tailda76d6.ts.net` with
`residentKey: 'preferred'`, `userVerification: 'preferred'`, `attestationType:
'none'`, storing `newCounter` verbatim so a synced iCloud passkey reporting
counter 0 forever never trips the replay check. The backup password hashes with
`crypto.argon2Sync('argon2id', ...)` at m=19456, t=2, p=1 with a 16-byte nonce,
salt and parameters stored beside the tag.

The session cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, rotates on sign-in,
and expires. CSRF is enforced on every mutating route. Sign-in is rate limited and
every attempt writes one local audit row. A script walks the route table and
asserts that every route except `/sign-in`, `/healthz` and the static shell
refuses an unauthenticated request.

Third-party credentials are encrypted at rest with the master key from the
environment. The settings screen renders state, scope and last successful sync,
never the credential. A missing master key refuses to boot with a named error; a
wrong one fails decryption loudly instead of returning empty. The documented local
recovery path restores access from the host shell with no secret question and no
emailed password.

Closes: F8, F9, F10, F11, F12, F13, F14, F15, F16, F17, F18, C4

---

## Slice 3. The provenance spine and the quick log

**The owner, in daily mode, can log a waist measurement, an energy rating or a
note in six taps from Today, in a basement gym with no signal, and every value he
or the machine ever stores keeps its origin, its original and its correction
history.**

The measurement table carries raw value, unit, timezone, source in the six named
values, measured-at, imported-at, confidence, import version and a dedup decision,
all NOT NULL. An edit appends a correction row and never overwrites; the original
survives three edits. Every value on screen carries a source chip; tap one for the
value sheet, tap again to reach the source, and all six sources land on the same
destination shape.

Quick log covers waist, energy, fatigue, hunger, satiety and a free note. Writes
apply optimistically, enqueue into an IndexedDB outbox keyed by a client UUID that
doubles as the `Idempotency-Key`, and replay exactly once on any of the six
triggers. The UI never branches on online versus offline, which is what makes the
offline path trustworthy rather than a second less-tested mode.

The demo seed loads only under `DEMO_MODE=1` and stamps every row `demo`. A
re-import that disagrees with a stored correction raises a question holding both
values and writes nothing, which is the quiet half of the panel's unapproved-write
risk.

Closes: F19, F20, F21, F22, F23, F24, F25, F26, C5, C6

---

## Slice 4. Today, Health and the trend charts

**The owner opens Today and answers "what do I do today" and "is my health
improving" in under ten seconds, with the trend leading, the goal visible, and
every gap in the data drawn as a gap.**

A freshly loaded Today fits the session row, the meals, what needs logging and the
weight trend inside the 715 px above the fold at 393x852, in every state the
owner's data can produce. Adherence sits below the trend, where screen 02 draws
it. Everything above the trend is bounded by construction: the notice region at a
constant height whatever it holds, and the day card at the row count screen 02
draws whatever was logged into it. Card padding and card gap on Today are the
16 px and 12 px DESIGN.md section 3 fixes; the fold is not bought by squeezing
them. See `.forge/AMENDMENTS.md` A5 and A6.

Charts are server-rendered SVG: 2.1 px daily dots never connected, a 2.6 px
seven-day average as the loudest object, a 1.5 px dashed goal trajectory with a
plus or minus 0.5 kg corridor, and gridlines at whole kilograms.

The 89.0 kg to 76.0 kg over nine months goal is visible and editable, and the
trajectory redraws. A gap of three days or more breaks the line, hatches the range
at 45 degrees and labels the dates; nothing is interpolated, carried forward or
zero-filled; a rolling average on a short window states its count and goes dashed
then undrawn. Waist shares the weight axis. Activity, sleep, heart rate, recovery
and VO2 max render when present and render an empty state naming the absence when
not, never zero. Adherence is a number over its denominator. A sync older than 36
hours shows a warn chip naming the age and the cause. A daily body-composition
reading is never the headline, and one sentence says why.

Every chart ships a visually hidden data table, a `<title>` and a `<desc>`, which
is what VoiceOver actually reads. It is hidden from the eye without leaving the
layout box, so the card does not lay out wider than the viewport.

**Carried into the re-dispatch, from four failed verifications.** Three lines this
slice regressed are slice 3's and are repaired here without moving into this
slice's Closes list: C5 and F24, where the offline queue count went behind a
disclosure and the quick-log sheet inherited Today's compression, and F23, whose
first-ever waist takes 60 taps because the stepper steps from zero instead of from
the `--` screen 03 frame 3 draws. C7 and F23 lost their tick at the slice 4
ruling; `.forge/RULING-SLICE-4.md` says why and what closes each.

Closes: F27, F28, F29, F30, F31, F32, F33, F34, F35, C7, C8

---

## Slice 5. Withings, demo and real

**The owner connects his Body Smart once and thereafter steps on the scale and
sees the trend move, with a status screen that tells him the moment it stops.**

`WITHINGS_MODE=demo` runs connect, historical import, incremental sync and status
against a seeded realistic dataset with no client id and no network. The real
adapter follows the official flow exactly: authorize with `response_type=code`,
`client_id`, `state`, `scope=user.metrics`, `redirect_uri`, and no PKCE parameter
because Withings does not document one. Token exchange and refresh POST
`action=requesttoken` form-encoded, and the rotated refresh token replaces the old
one in the same transaction.

The measure call sends `meastypes=1,5,6,8,11,76,77,88` and `category=1`
explicitly, never an unfiltered call, loops on `more`/`offset` with a bounded page
cap, decodes each value as `value * 10 ** unit`, inserts with `ON CONFLICT DO
NOTHING` against a unique index on `(source, external_key)` where the external
key is `grpid:type`, or records a dedup decision when the row already exists,
and advances the cursor to `max(modified)` only after the write commits. It
cannot upsert: slice 3 made the measurement table append-only with a trigger,
and an upsert fires it. See `.forge/AMENDMENTS.md` A1.

A re-import that disagrees with a stored correction raises an import question,
and this slice also ships the control that answers one: both values with their
provenance, the owner picks or edits, the choice writes a correction naming the
question, and the question closes. See `.forge/AMENDMENTS.md` A2. Blood
pressure is excluded twice: a group carrying type 9 or 10 is dropped whole, so its
type 11 is never harvested, and the storage layer rejects any type outside the
allowlist even if the fetch layer is bypassed.

The envelope is read before the HTTP status, always. The seven authentication
codes trigger one refresh and one retry then a reconnect prompt; 601 backs off;
522 retries. Status 100 is disambiguated by whether `measuregrps` is present and
empty. With Withings unreachable the rest of the app still renders and names the
stale source by cause.

Closes: F36, F37, F38, F39, F40, F41, F42, F43, F44

---

## Slice 6. Apple Health ingest and the Shortcut guide

**The owner builds one Shortcut on his iPhone from a guide that names every action
correctly, and three times a day his steps, sleep, heart rate and VO2 max arrive
on their own, with a diagnostics screen that turns a silent mismatch into a
number.**

`POST /api/ingest/health` accepts the versioned columnar `health.ingest.v1` batch:
one window, N series, six parallel arrays of equal length per series, every value a
string, every timestamp ISO 8601 with a numeric offset. A bare `Z` is accepted only
when the offset is genuinely zero, because a local time labelled `Z` is the silent
two-hour bug.

Authentication is a bearer token plus a two-pass keyed SHA-256 digest the server
recomputes from parsed fields, never from a client-supplied string, compared in
constant time. Timestamp skew is 300 s, nonces are kept 24 hours behind a unique
index, and `Idempotency-Key` stores the response. Rows dedupe on a synthesised key
because Shortcuts exposes no sample UUID, so an overlapping 48-hour window costs
nothing and a nervous owner can re-run ten times.

Blood pressure is rejected 422 for the whole batch, never dropped silently, across
five string variants plus both HealthKit symbols, and the schema has no column for
it anyway. The ingest token grants ingest and nothing else, in both directions,
and is shown once, stored hashed and revocable within one request.

Every response carries a plain-English `message`, because `Get Contents of URL`
gives the Shortcut no status code. There is no sync cursor a failed locked run
could advance past. Today shows the last successful ingest and turns warn past 36
hours, which is the app noticing the silence so the owner does not have to.

Closes: F45, F46, F47, F48, F49, F50, F51, F52, F53, F54, F55, F56

---

## Slice 7. Blood tests: manual, PDF, and per-row validation

**The owner, in curator mode, drops a twenty-two row lab PDF into the app and
walks it row by row, accepting the fifteen that are obviously right, correcting
two, rejecting one, and reading the printed original beside every conversion.**

Two paths: a structured manual form, and a PDF parsed locally with `unpdf`, which
gives full `x`, `y` and `transform` layout for column-aligned French lab reports
with no canvas dependency. A scanned image-only page is detected by summing
non-whitespace characters per page and routed to `tesseract.js` with a pruned WASM
variant and `fra.traineddata`; every OCR row arrives flagged, because OCR returns
`13.Q` for `13.0` often enough that unconfirmed storage would be a lie.

Nothing persists until a row is explicitly accepted. Per-row accept, edit or reject
on one screen behind an explicit save. No autosave. No control that commits
twenty-two rows at once. A converted value renders the printed original, the factor
and the stored value on one line and stores all three. An ambiguous or
low-confidence row is flagged and blocked, never saved quietly. At the moment of
validation the owner is asked whether to keep or delete the source PDF, and delete
removes it from the volume.

Blood pressure in a PDF produces a named refusal that does not print the value it
refused.

Explanations give general reference-range context, cite a public source and invite
a professional. They never assess this person's condition and never recommend a
clinical action, because MDCG 2025-4 and the revised MDCG 2019-11 make the stated
intended purpose the classification test.

Closes: F57, F58, F59, F60, F61, F62, F63, F64, F65, C10, R2

---

## Slice 8. Train: the catalogue, the week and the guided session

**The owner opens Train on a Tuesday evening, accepts three of the four proposed
sessions, taps into the calisthenics one, and runs it end to end in a basement gym
with no signal, with last week's numbers in front of him and nothing interrupting
the set.**

The catalogue seeds from Everkinetic SVG, the CDC Growing Stronger public-domain
GIFs and named-author Wikimedia files, about 5 MB bundled, plus `free-exercise-db`
text with its image arrays stripped. Every media row carries url, author or source,
verified date, licence or embedding mode and its movement, and a null author is
rejected at write, which is what keeps the infringing aggregator sets out
permanently. YouTube is the optional third layer: a `youtube-nocookie.com` iframe
the browser fetches directly, validated keylessly by oEmbed, never downloaded,
never proxied, never overlaid.

Intensity is presented honestly and this is where `.forge/research/training-rules.md`
binds the build. Zones are ranges, never point targets, derived from Tanaka
(HRmax 181 at 38), using percent heart-rate reserve when resting heart rate is
known and percent HRmax when it is not, and never both on one screen. Individual
error on any estimate is 10 to 12 bpm with validated limits of agreement of plus or
minus 18 to 24 bpm at this age, wide enough to move a person across two zones, so a
five-zone dial as the primary interface does not ship. The only in-session control
is the talk-test ceiling in the NHS wording. The app does not track heart rate live.

Progression follows what survives the evidence. Sessions are 2 to 3 full body per
week with 48 hours between sessions for the same muscle. Advancement uses the
2-for-2 trigger and is proposed, then confirmed, never applied silently, and the
app says in its own words that the magnitude is convention. A session longer than
110 percent of the longest session in the past 30 days is flagged as a plain fact
naming the percentage, with no risk number attached. The 10 percent weekly rule as
injury prevention does not ship: a 532-person randomised trial falsified it at
P=.90. No acute-chronic workload gauge, no readiness score, no personalised
injury-risk number exists anywhere in the build.

The readiness gate is the ACSM 2015 screening algorithm, three inputs and the
verbatim symptom list. PAR-Q+ is not re-implemented as native screens and its text
appears nowhere in the repository; its terms forbid incorporation into electronic
surveys or derivative materials without written consent.

The session player runs offline, keeps the screen awake on iOS 18.4 or shows the
honest banner when it cannot, derives elapsed and remaining time from wall-clock
timestamps so a call mid-set costs nothing, and primes SpeechSynthesis on the start
tap because `speak()` returns silently without a gesture. Every spoken cue has a
visible equivalent, because vibration does not exist in any Safari and the ringer
may be off. Last week's load renders inside the open set. An easier variant, a
harder variant and a substitution are each one tap away. Effort is captured as reps
in reserve for resistance and on the CDC public-domain 0-to-10 scale for cardio;
Borg's anchor words are licence-gated and ship nowhere. Pain follows the Silbernagel
rule: at most 5 of 10 during, subsided by the next morning, no week-to-week
increase, and the same site twice in a row deloads and never advances.

Nothing interrupts an open session. No rating prompt, no permission prompt, no
upsell, no banner.

C9 moves here from slice 4. Its line names four surfaces and one of them is the
session player, which this slice builds, so it could not close in slice 4 and the
verifier correctly left it unchecked twice. This slice walks all four: Today,
Health, the quick-log flow as a write and not only as an open-and-close, and the
player, at three viewports, printing the surfaces it walked.

Closes: F66, F67, F68, F69, F70, F71, F72, F73, F74, F75, F76, F77, C11

---

## Slice 9. The nutrition week and the shopping list

**The owner, planning on a Sunday, generates a week of breakfasts, weekday lunches
and home dinners inside his calorie and macro targets, accepts them one at a time,
and walks out with a shopping list grouped by aisle with the box-supplied items
already deducted.**

The food table seeds from ANSES CIQUAL 2025 under Licence Ouverte 2.0: about 3,100
rows, under 400 KB committed, kcal, protein, carbohydrate, fat and fibre, with a
missing nutrient stored NULL and rendered "unknown", never 0. Energy computed by
the EU 1169/2011 Atwater factors where CIQUAL publishes none is flagged and the
flag is one tap from the number. Recipe nutrition computes from ingredient rows and
stores a versioned per-serving snapshot with `provenance`, `coverage_pct` and a
separate fibre coverage; under 85 percent coverage renders a wider range and says
so; a changed source hash raises a question rather than silently serving last
month's macros, which is the second half of the panel's unapproved-write risk.

Targets use Mifflin-St Jeor with a FAO/WHO/UNU PAL band, not the unsourced 1.2
ladder every calculator repeats. The floors are implemented, not promised: a target
under estimated RMR warns, under 1500 kcal is blocked behind an explicit
confirmation naming a professional, and a planned rate above 0.89 kg a week is
refused with the nearest compliant rate offered.

Allergy, intolerance, exclusion and preference are four distinct rules, so nuts and
shellfish can never collapse into each other. No generated menu contains molluscs,
crustaceans or shellfish. Every dairy item offers a lactose-free alternative and
swapping recomputes the macros. Macros carry no decimal place because a decimal on
an estimate is a lie about precision.

Closes: F78, F79, F80, F81, F82, F83, F84, F85, F86, F87, F88, F89, C12

---

## Slice 10. HelloFresh, Uber Eats and the meal estimate

**The owner photographs his lunch, sees a range rather than a false number,
corrects the portion, saves it, and the entry still says "estimate" three edits
later.**

Two HelloFresh recipes of two portions default into the week as four consumed
meals, and each recipe asks separately whether the second portion is eaten
tomorrow, moved to another meal, or frozen. Import is one artifact the owner
already holds, parsed locally: a URL he pastes, a PDF he downloaded, a photo of his
own card, or manual entry. No stored HelloFresh credential, no crawler, no
scheduled fetch exists in the repository, because there is no public API and
automated access is prohibited. Two Uber Eats meals a week are proposed as dish
types compatible with the targets and exclusions, and the link opens a search page;
no item-level deep link is constructed because none is documented, and no menu or
price is stored.

The photo flow follows the mandatory sequence. The image is downscaled to about
1092 px on the long edge and re-encoded through canvas on the device, which strips
EXIF and GPS by re-encoding rather than by parsing a metadata format. The consent
screen names the exact categories before the first send, and photo analysis, menu
generation and health explanations toggle independently, as do calendar event
titles; with a toggle off the call is not made. `ANTHROPIC_MODE=demo` runs the
whole flow with no key.

Claude returns a range on a coarse grid, never a bare point, because only 35
percent of image-based portion estimates land within 25 percent of truth. Nothing
is stored until the owner confirms or corrects. After confirmation and after three
later edits the entry still carries `ai_estimate` and still reaches the photo and
the model reply in two taps. A monthly ceiling refuses the call when month-to-date
plus the pre-flight token count would cross it, `usage_ledger` rows are written in
the same transaction as the result, and `ANTHROPIC_MODEL` is validated once at boot
against the Models API so a retired snapshot fails loudly at start rather than
silently at 2am.

Closes: F90, F91, F92, F93, F94, F95, F96, F97, F98, F99, F100, C13, R3

---

## Slice 11. Google Calendar and the confirmed diff

**The owner, tired at 20:45 on a Sunday, reads a four-second diff of exactly what
will land in his dedicated calendar, confirms five of six rows, and can pull any of
them back out two taps later.**

Three scopes and no more: `calendar.calendarlist.readonly` for the picker,
`calendar.freebusy` for availability, `calendar.app.created` for the dedicated
calendar. Never `calendar`, never `calendar.events`, both of which grant write
access to every calendar the owner can touch. The scope list in code matches the
Data access page exactly, or the mismatch alone produces the unverified-app screen.
Authorization carries `access_type=offline` and `prompt=consent` on every run,
validates `state`, persists the refresh token before the handler returns, and
redirects to a URL carrying no code.

Availability comes from `freeBusy.query` only, never `events.list` on the owner's
other calendars, and per-calendar `errors` entries are surfaced rather than read as
free, because an unshared calendar returns an empty busy list that is
indistinguishable from a free one. Every write targets the stored app-created
calendar id; no request path contains `primary`. Event ids are derived
deterministically so re-applying the same plan writes no duplicate.

The confirm diff is the risk control the panel named, and a summary sentence fails
the test it exists to pass. Counts first at metric size in the order added, moved,
removed. Before and after columns. Rows grouped by verb, each naming the cause in
plain words: "moved from Thursday because your calendar shows you busy 18:00 to
23:00", never "rescheduled". Additions and moves default selected, removals default
unselected, so a delete is opted into. A sticky footer states the count. Nothing
writes before it. Afterwards the same list carries outcomes plus undo, and a
permanent write log keeps undo for every past write.

`invalid_grant` is permanent: delete the token, disconnect with a timestamp and the
raw error, stop background sync, show one reconnect action, never retry.

One rubric line covers the whole risk class: every outbound write call site is
reachable only from a confirm handler, and driving each one with the confirm
skipped writes nothing.

Closes: F101, F102, F103, F104, F105, F106, F107, F108, F109, F110, F111, F112, C14

---

## Slice 12. Push, the email review and the Sunday run

**The owner gets one grouped reminder at the right time, a weekly review he can
read on a Sunday evening, and a plan that fires exactly once even if the Mac was
down when it was due.**

Web Push needs iOS 16.4 or newer, the app already on the Home Screen, and
`subscribe()` called inside the tap handler with no await before
`Notification.requestPermission()`, because an await spends the transient
activation and the prompt never appears. The worker shows a notification on every
push, and a send that would show none is refused at the source, because violating
`userVisibleOnly` revokes the subscription. Payloads carry the Declarative Web Push
shape as well as the classic one, so a notification renders even off-tailnet where
the worker cannot fetch the origin. 404 and 410 delete the subscription row; 400,
403, 413 and 429 do not. iOS never fires `pushsubscriptionchange`, so the app
re-reads and re-posts the subscription on every launch when the endpoint differs.

Reminders are configurable per category, grouped into one notification per window,
respect quiet hours, and each carries a Done action.

The weekly email renders in a local preview route with no SMTP configured, holding
weight and waist, adherence, activity, sleep, training, nutrition, what went well
and what was hard, then the proposal.

Scheduling is `node-cron` plus a `job_run(job_name, period_start)` ledger, claimed
before any work. `period_start` is computed in Paris local time so the October
fallback cannot produce two keys for one Sunday evening. Five ticks in one period
produce one row and one plan. A container down across Sunday fires once on next
boot and no more. A run still marked running past its timeout is marked failed at
startup rather than wedging the slot forever.

Two missed sessions because Thursday ran late is not a failure state. The review
carries no score, no colour on a missed session and no guilt copy, and a denylist
test enforces it.

Closes: F113, F114, F115, F116, F117, F118, F119, F120, F121, F122, F123, C15

---

## Slice 13. Backup, restore, export, deletion and the operator console

**The owner, in operator mode in front of the cupboard, can see at a glance that
the machine is healthy, prove a backup restores, export everything he owns, and
delete a category permanently.**

The daily archive is chunk-framed AES-256-GCM from Node `crypto`: a header holding
magic, version, salt, KDF parameters, chunk size and a nonce prefix, all of it the
AAD; per-chunk sequence and final flag in the per-chunk AAD, so truncation and
reordering both fail the tag. It holds a `pg_dump`, the media and PDF volume, and a
version manifest. It needs no `age`, no `gpg` and no `openssl`, none of which are on
this Mac and the last of which is absent from `node:*-slim` anyway. Discovering that
a restore needs a missing binary during the actual emergency is the failure the
single gate exists to prevent.

Integrity is proven by failure, not by assertion: three deliberately corrupted
copies, one truncated, one with chunks reordered, one with a flipped byte, each
exit non-zero with a named error. Restore into a scratch database matches the source
row counts exactly and runs inside the test suite on temporary data. Backups land in
the configured iCloud Drive path; with that path unavailable they land in the local
fallback and the machine status screen raises an alert naming the path and the cause.
Retention is enforced. Volumes are explicit and `down -v` appears nowhere.

Export is full JSON and full CSV, re-importable into a scratch instance with matching
counts, plus a readable PDF of one health report. Permanent deletion is by category,
behind a typed phrase, and a post-deletion query returns zero. Retention per data
category is stated in `docs/privacy.md` and matches the code, which is what makes the
GDPR line an artifact rather than a claim.

The machine status screen is the operator's single surface: container state, disk
headroom, last backup, last restore check, last successful sync per integration, warn
thresholds, no credential. And the app tells him when something breaks rather than
waiting to be asked: one push and one persistent banner naming the surface, the cause
and one action.

Closes: F124, F125, F126, F127, F128, F129, F130, F131, F132, F133, C16, R4

---

## Slice 14. The final gate

**A technical stranger can install this from zero on a fresh Mac mini, and the
owner can see one matrix proving every acceptance criterion he wrote is met.**

The stack comes up after a reboot of this Mac with no manual step. Lint, typecheck,
dependency audit and the secret scanner exit 0 or every exception is documented with
a reason and a date. Unit, integration and Playwright suites pass, including a WebKit
project at 393x852. README plus the twelve documents the spec names exist, are
non-empty, carry the official URLs consulted with their verification dates, and carry
no real credential and no real health value. `docs/progress.md` holds one row per
acceptance criterion in GOAL.md section 20, each naming its evidence.
`docs/screenshots/` holds the final manual mobile review.

Contrast is measured on every token pair against its own ground rather than asserted.
Pseudo-locale at 40 percent text expansion holds on all thirteen screens, because
English ships first and the product is built to add languages later.

Then the disqualifier sweep, which is a sweep and not a promise: placeholder copy,
default favicon, unstyled empty or error states, TODO markers, and single-viewport
layouts each have their own command and their own recorded output.

Closes: C17, C18, R5, R6, R7, R8, R9, R10, D1, D2, D3, D4, D5

---

## Partition check

| Slice | Lines | Ids |
|---|---|---|
| 1 | 11 | F1-F7, C1-C3, R1 |
| 2 | 12 | F8-F18, C4 |
| 3 | 10 | F19-F26, C5-C6 |
| 4 | 12 | F27-F35, C7-C9 |
| 5 | 9 | F36-F44 |
| 6 | 12 | F45-F56 |
| 7 | 11 | F57-F65, C10, R2 |
| 8 | 13 | F66-F77, C11 |
| 9 | 13 | F78-F89, C12 |
| 10 | 13 | F90-F100, C13, R3 |
| 11 | 13 | F101-F112, C14 |
| 12 | 12 | F113-F123, C15 |
| 13 | 12 | F124-F133, C16, R4 |
| 14 | 13 | C17-C18, R5-R10, D1-D5 |

F1 through F133, C1 through C18, R1 through R10, D1 through D5. One hundred and
sixty-six lines. No id appears twice. No id is unassigned.

/goal Every line of .forge/DOD.md checked, with evidence recorded in .forge/EVIDENCE.md, and a PASS verdict from the verifier agent.
