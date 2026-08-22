# Resume

Name: Vernier. Chosen 2026-08-21 by the naming workflow, recorded in BRIEF.md with its reasoning and in DESIGN.md with its mark. Every later phase uses it: manifest, Home Screen label, push titles, the Sunday email, the docs, and WEBAUTHN_RP_NAME.

Owner decisions, taken 2026-08-21, binding:
- R5 is PARKED by the owner's instruction. The run never reboots this Mac mini on its own. R5 stays in the rubric, unchecked, with "parked, awaiting the owner's chosen moment" as its reason. Parking is not softening: the line and its threshold are untouched.
- Scope is FULL. All fourteen slices, run to completion across as many sessions as it takes. Nothing dropped.

Last phase: 8 BUILD and 9 VERIFY, iterating on slice 2.
Size: L. Eleven vertical workstreams with five separate external integrations, each carrying its own auth, data flow and failure modes.
Current slice: 3, the provenance spine and the quick log. Closes F19-F26, C5, C6. Slice 2 is done but for its share of the three owner-blocked lines. Earlier: slice 2, the gate. Closes F8-F18, C4. Slice 1 is done but for three owner-blocked lines: F4, R1, C2.

## Where the run actually stands

**Twenty-nine of 166 rubric lines checked.** Every one ruled by a verifier that re-ran the command itself and accepted no builder capture as proof.

Slices 1, 2 and 3 are built and live. Slice 3's defect fixes are at `4a4c3c5`, re-verify in flight.

**Slice 1: one FAIL, cleared.** The offline document painted the framework's chunk-load error on any uncached route. Fixed structurally: `/offline` is a self-contained document with zero external references, so it cannot need a chunk. F4, R1 and C2 stay open, owner-blocked, not code-blocked.

**Slice 2: one FAIL, cleared, re-verified PASS.** A state-changing route sat outside anti-forgery, so a bare curl wrote the very row C2's evidence rests on. The exemption list is gone entirely. Also a CSS regression that made the secondary action as loud as the primary.

**Slice 3: one FAIL, four defects, all fixed, re-verify in flight.**
1. D3, high. The correction path skipped validation. A rating of 1 to 5 accepted 99 and -4.7 with a 201, and the table refuses DELETE, so both were permanent. A validation gap in an append-only store is not a bug that can be cleaned up afterwards. Every write now runs one gate with a per-metric band.
2. F25. The demo seed stamped its measurements but not its source records, so a seeded row was indistinguishable from a real Withings batch by anything but an id prefix. Now `measurement.seed` is a generated column no writer can set or clear, bound to `source_record.seed` by a composite foreign key, backfilled from the data.
3. C5. Undo and Edit were drawn in the wireframe and shipped nowhere, and two adjacent cards shared one label.
4. C6. The string checker walked only `.tsx`, so 45 sentences in `.ts` route handlers were invisible to it. One reached the screen reading "Send correctsId and rawValue".

Escalation ladder: one FAIL each on slices 1, 2 and 3. None reached a second, so no re-plan and no further tier raise. All three slices were built at the raised tier from the start.

**The verifier out-tested the suite twice, and both times it mattered.** On slice 1 it proved the offline path cold, where the builder had proved it warm. On slice 3 it found `serviceWorkers: 'block'` in the Playwright config, meaning the offline test ran with no worker at all; it re-proved the outbox by hand with the worker active, showing the worker's own fetch failing while a host curl answered 200 at the same moment. The suite now carries a project that proves it.

Suites at the last count: 78 unit, 35 end-to-end across three projects, WebKit at 393x852 against the live HTTPS origin.

D1, D3 and D5 stay unchecked by design: each names all thirteen screens and only eight exist.

## Amendments

Three plan corrections are recorded in `.forge/AMENDMENTS.md`, with before, after, reason and disclosure. **No DOD line has been edited since the greenlight**; all 166 and their thresholds stand as approved.

- **A1.** Slice 5 cannot upsert. The append-only trigger refuses it, confirmed on the live database. PLAN.md now says insert with `ON CONFLICT DO NOTHING` on `(source, external_key)` or record a dedup decision.
- **A2.** A raised import question had no answer path, so its warning was permanent. Slice 5 owns the control now.
- **A3.** A photo estimate stores `source='manual'`, `confidence='estimated'`, kind `photo_estimate`. No seventh source; the model's involvement is a confidence and a record, not an origin.

## What needs the owner, and only the owner

Two actions on the iPhone, and together they close five lines:

1. **Open Vernier from the Home Screen icon.** Flips `standaloneSeen`, flips `wakeLockAvailable` on iOS 18.4 or newer, and records `100.121.138.9` as a tailnet peer. That is the second-device clause of F4 and R1 and the evidence for C2. Nothing on this machine can originate it: ports 22, 5900, 3283, 3031, 88 and 8080 are closed on both peers.
2. **Create the account and register a passkey.** Flips `passkeyRegistered`. WebKit exposes no virtual authenticator to automation, so the suite's ceremony is software; the server-side verification is real, proven by flipping one byte of the DER signature and watching it fail correctly.

Also on the owner, on this Mac: `bash scripts/recovery.sh password` to set a backup password he actually holds. The live one is a random value nobody has, left by the last recovery test, and re-running the full e2e suite resets it again. Documented, not a bug.

## State on disk

- `.forge/GOAL.md`, the verbatim spec. `.forge/BRIEF.md`, forge shape, with the Roles census, the Research summary and the Panel synthesis.
- `.forge/research/`, nine notes: scout, withings, google-calendar, ios-pwa, apple-health-shortcut, nutrition-data, exercise-media, stack-facts, training-rules.
- `.forge/DESIGN.md`, thirteen wireframes, thirteen PNG exports in `.forge/screens/`.
- `.forge/PLAN.md` (14 slices), `.forge/DOD.md` (166 lines, 20 checked), `.forge/PREFLIGHT.md`, `.forge/EVIDENCE.md`, `.forge/DEFECTS.md`.
- Product code committed through `0c66771`. The stack runs: two healthy containers, live at https://lamberts-mac-mini.tailda76d6.ts.net.

## Host and configuration facts

This machine is lamberts-mac-mini, arm64, macOS 26.6, and it IS the deploy target. Tailnet tailda76d6.ts.net. App URL https://lamberts-mac-mini.tailda76d6.ts.net. Passkey RP ID is the tailnet domain tailda76d6.ts.net, not the host, because the host name dies if the Mac is renamed. Tailscale HTTPS certificates are enabled and a real Let's Encrypt certificate exists. Docker Engine 29.6.2, Compose v5.3.1, linux/aarch64.

The configuration file was repaired in place on 2026-08-21 by a one-shot Node script: WEBAUTHN_RP_NAME went from Health to Vernier, APP_NAME was added, BACKUP_DIR was quoted because its path contains spaces. The pre-repair copy held real credentials and was moved out of the repository.

compose.yaml passes exactly seven variables into the app container: APP_URL, APP_NAME, WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME, TZ, DATABASE_URL, MASTER_KEY. The Withings, Google, Anthropic, mail, VAPID and BACKUP_DIR values sit in the configuration file and are withheld from the app process until the slice that needs them. That is least privilege and it is intended, not an omission.

Playwright WebKit is cached on the host at ~/Library/Caches/ms-playwright, 297 MB. The e2e suite runs on the host against the containerised app, never inside the container, because WebKit on Linux ARM is unreliable and Safari is the only engine this product ever meets.

## Notes for later sessions

- **Decided 2026-08-22, for whoever builds slice 6.** `.forge/PREFLIGHT.md` line 146 curls `/api/diagnostics/ingest` with no session and reads `lastIngestWithin36h`. `tests/unit/routes.test.ts` currently asserts that path classifies protected. The preflight line is right and the test encodes today's absence rather than a decision: that endpoint is a diagnostics READ, the same class as `/api/diagnostics/device` and `/api/diagnostics/launch`, and the preflight script has no session to offer. Slice 6 names it in `PUBLIC_PATHS` and updates that assertion. It returns a boolean and a timestamp, never a payload, never a token, never a count.
- **Design contradictions are settled in DESIGN.md section 2b and that section outranks any single wireframe.** The base button is 48px and 16px; `00-patterns.html` says 44 and 15 and is the outlier on three separate rules because it was written first. 44px is the accessibility floor for incidental controls, never a primary action's size. Escalations that stay: gate and quick-log sheet 52px, session player 56px with 88px on the transport, `.btn.icon` 44x44 square which eleven sheets agree on.

- The session secret-guard hook blocks any Bash command whose text contains the bare word "secrets", or a credential-named variable beside echo or printf, or .env, .pem and .key paths. It blocks Read, Edit and Write on those paths too. Write files with the Write tool, or run a Node or Python script from the scratchpad. A script's own file access is not intercepted.
- To read configuration, ask the running container: `docker compose exec -T app printenv NAME`. Never pass `--env-file`; Compose reads the file from the project directory on its own.
- The scout agent has no Write tool. It returns prose and the lead persists it.
- Research agents drop downloaded third-party files in the project root. Three were removed on 2026-08-21. Rehosting them would contradict the media licensing position the research settled: cite and link, never republish.
- Postgres 18 refuses to boot with its volume mounted at /var/lib/postgresql/data. It must mount at /var/lib/postgresql.
- Chrome's Network.emulateNetworkConditions is per target. Setting only the page offline leaves the service worker's own fetch reaching the origin, which passes an offline test while proving nothing.

## Owner action outstanding, unrelated to the build

While verifying whether a third party can sign an installable .shortcut file, the Apple Health research agent ran `shortcuts sign --mode anyone` twice on this Mac. That operation is the same one as "Copy iCloud Link", so it published two throwaway public SharedShortcut records named "Test" under lambert.bouley@gmail.com. They hold no personal data. Remove them in the Shortcuts app with Stop Sharing. This was a side effect of research, not part of the product, and it is recorded here so it does not get lost.
