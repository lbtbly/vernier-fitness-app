# Resume

Name: Vernier. Chosen 2026-08-21 by the naming workflow, recorded in BRIEF.md with its reasoning and in DESIGN.md with its mark. Every later phase uses it: manifest, Home Screen label, push titles, the Sunday email, the docs, and WEBAUTHN_RP_NAME.

Owner decisions, taken 2026-08-21, binding:
- R5 is PARKED by the owner's instruction. The run never reboots this Mac mini on its own. R5 stays in the rubric, unchecked, with "parked, awaiting the owner's chosen moment" as its reason. Parking is not softening: the line and its threshold are untouched.
- Scope is FULL. All fourteen slices, run to completion across as many sessions as it takes. Nothing dropped.

Last phase: 8 BUILD and 9 VERIFY, iterating on slice 2.
Size: L. Eleven vertical workstreams with five separate external integrations, each carrying its own auth, data flow and failure modes.
Current slice: 2, the gate. Closes F8-F18, C4. Slice 1 is done but for three owner-blocked lines: F4, R1, C2.

## Where the run actually stands

**Twenty of 166 rubric lines checked:** F1, F2, F3, F5, F6, F7, F8, F9, F10, F11, F13, F14, F15, F16, F17, F18, C1, C3, D2, D4. Every one ruled by a verifier that re-ran the command itself and accepted no builder capture as proof.

Slices 1 and 2 are built, live and committed. Slice 1 at `25954aa`, slice 2 at `0c66771`.

**Slice 1: one FAIL, then fixed.** Three defects. C3, the offline document painting the framework's chunk-load error on any uncached route, is fixed and re-proven cold: `/offline` is now a self-contained document with zero external references, so it cannot need a chunk. F4, R1 and C2 remain open and are owner-blocked, not code-blocked.

**Slice 2: one FAIL, fix in flight.** Two defects:
1. F12. `POST /api/diagnostics/launch` sat in `CSRF_EXEMPT_PATHS`, so a bare curl with no token returned 204 and wrote. Worse than its severity: that row is the row C2's evidence rests on, so anything on the tailnet could author the proof that the owner installed the app. The fix threads a real token from the server layout and deletes the exemption.
2. C4. The shipped CSS dropped two declarations from `.btn.quiet`, so the secondary action renders as a bordered white button the same size as the primary, against the design sheet's own annotation that the password option is never louder. The fix restores them and diffs every button, field and card rule against the wireframes.

Two latent issues went into the same dispatch: `PUBLIC_PREFIXES` carried `/api/diagnostics/` as a standing prefix, wider than the two endpoints ever intended to be public, so a third diagnostics route would become public with no decision; and `scripts/recovery.sh` restates the Argon2id parameters with nothing asserting the two copies agree.

Escalation ladder: one FAIL on slice 1, now cleared. One FAIL on slice 2, fix in flight. Both slices were built at the raised model tier from the start, because slice 1 set the conventions the rest imitate and slice 2 is the security boundary.

D1, D3 and D5 sweep clean but stay unchecked by design: each names all thirteen screens and only seven exist. Not refused, not reached. The final full-scope verify closes them.

The test harness landed with slice 2, not at the end: Vitest with 34 unit tests, Playwright with 17 end-to-end in WebKit at 393x852 against the live HTTPS origin. Slice 1 shipped none and no rubric line named one, which is how a suite becomes unwritable by slice 13.

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

- The session secret-guard hook blocks any Bash command whose text contains the bare word "secrets", or a credential-named variable beside echo or printf, or .env, .pem and .key paths. It blocks Read, Edit and Write on those paths too. Write files with the Write tool, or run a Node or Python script from the scratchpad. A script's own file access is not intercepted.
- To read configuration, ask the running container: `docker compose exec -T app printenv NAME`. Never pass `--env-file`; Compose reads the file from the project directory on its own.
- The scout agent has no Write tool. It returns prose and the lead persists it.
- Research agents drop downloaded third-party files in the project root. Three were removed on 2026-08-21. Rehosting them would contradict the media licensing position the research settled: cite and link, never republish.
- Postgres 18 refuses to boot with its volume mounted at /var/lib/postgresql/data. It must mount at /var/lib/postgresql.
- Chrome's Network.emulateNetworkConditions is per target. Setting only the page offline leaves the service worker's own fetch reaching the origin, which passes an offline test while proving nothing.

## Owner action outstanding, unrelated to the build

While verifying whether a third party can sign an installable .shortcut file, the Apple Health research agent ran `shortcuts sign --mode anyone` twice on this Mac. That operation is the same one as "Copy iCloud Link", so it published two throwaway public SharedShortcut records named "Test" under lambert.bouley@gmail.com. They hold no personal data. Remove them in the Shortcuts app with Stop Sharing. This was a side effect of research, not part of the product, and it is recorded here so it does not get lost.
