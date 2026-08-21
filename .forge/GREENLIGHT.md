# Greenlight

**The app is called Vernier.** The name arrived after the plan was written, so PLAN.md and DOD.md say "the product" throughout and no rubric line changes.

This is a summary for approving away from the desk. It is never a replacement for the plan and the rubric. Approving means the full rubric applies, all one hundred and sixty-six lines, at one hundred percent.

**Stack.** Next.js 16.3.2 App Router, React 19, TypeScript, Drizzle on PostgreSQL 18, in `node:24-slim` on `linux/arm64` under Docker Compose on this Mac mini, served by Tailscale Serve HTTPS at `https://lamberts-mac-mini.tailda76d6.ts.net`.

**Slices.** Fourteen. Slice 1 is the walking skeleton and its deploy, so the live URL exists before any line needs it. Auth and passkeys are slice 2. Features run slices 3 to 13 in the order section 17 of the spec asks for. Slice 14 is backup, hardening and the docs gate.

**Rubric.** 166 lines. Function 133, Craft 18, Release 15 including 5 disqualifiers. Seven are marked OPERATOR; each names a sibling line proving the same path with no external credential.

**Screens.** Thirteen HTML wireframes in `.forge/wireframes/`, `index.html` as contents, plus thirteen PNG exports in `.forge/screens/` for the verifier. No Claude Design share link: that MCP server is not connected here.

---

## Owner decisions, taken and binding

**R5 is parked.** The run never reboots this Mac mini on its own. R5 stays in the rubric, unchecked, reason recorded, until the owner picks the moment. Parking is not softening: the line and its threshold are untouched.

**Scope is full.** All fourteen slices, run to completion across as many sessions as it takes. Nothing dropped.

---

## Pre-flight, probed 2026-08-21 after the credentials landed

Twenty-four of forty satisfied. Sixteen outstanding, and only two of those are human work.

```
  Already on this machine
  [x] Docker Engine 24+          found v29
  [x] Docker daemon running      ok
  [x] Docker Compose v2+         ok
  [x] Postgres image pulled      ok
  [x] Node 24 build image        ok
  [x] Node 24+ for host tooling  found v26
  [x] npm 10+                    found v11
  [x] git                        found v2
  [x] curl                       found v8
  [x] Repository initialised     present
  [x] Tailscale app installed    present
  [x] Tailscale logged in        ok
  [x] MagicDNS resolves host     ok

  Run once, before the first build: values a script generates
  [ ] MASTER_KEY generated       not set            node scripts/gen-env.mjs
  [ ] POSTGRES_PASSWORD set      not set            node scripts/gen-env.mjs
  [ ] VAPID public key set       not set            node scripts/gen-vapid.mjs
  [ ] VAPID private key set      not set            node scripts/gen-vapid.mjs

  Before the first deploy: Tailscale HTTPS
  [x] tailscale cert succeeds    ok
  [x] Serve subcommand runs      ok

  Before anything writes to disk: the archive destination
  [x] Backup dir set on this Mac set, local only
  [ ] Backup dir exists writable                    re-download the environment file, the path needs quoting

  Third-party accounts, before their slices
  [x] Withings id, this Mac      set, local only
  [x] Withings secret, this Mac  set, local only
  [x] Google id, this Mac        set, local only
  [x] Google secret, this Mac    set, local only
  [x] Google client pair valid   ok
  [x] Anthropic key, this Mac    set, local only
  [x] Anthropic key authorised   ok
  [x] Mail transport, this Mac   set, local only

  The iPhone, before install, push and offline storage
  [ ] iPhone online on tailnet                      unlock the iPhone, open Tailscale, connect

  After the app is live: what the running system reports
  [ ] App answers over HTTPS                        scripts/up.sh, then scripts/tailscale-serve.sh
  [ ] MASTER_KEY in container                       docker compose up -d --force-recreate
  [ ] Withings secret in contai.                    docker compose up -d --force-recreate
  [ ] Google secret in container                    docker compose up -d --force-recreate
  [ ] Anthropic key in container                    docker compose up -d --force-recreate
  [ ] Standalone launch recorded                    install to the Home Screen, then open from the icon
  [ ] Wake Lock reported                            needs iOS 18.4 or newer
  [ ] Passkey registered record.                    register a passkey on the iPhone
  [ ] Push subscription recorded                    enable notifications inside the installed app
  [ ] Health batch within 36h                       build the Shortcut from the in-app guide, run it once

  16 of 40 outstanding.
```

Two checks were wrong rather than failing, and both are fixed:
- The certificate check passed `--key-file=/dev/null`, which Tailscale refuses, so it reported failure on a machine whose certificates already worked. It now provisions into a scratch directory, reads the real exit code and removes it. A valid Let's Encrypt certificate for `lamberts-mac-mini.tailda76d6.ts.net` exists, issued 2026-08-21, good to 2026-11-19.
- The mail check named `SMTP_URL`, a variable nothing writes. The environment file uses the discrete `MAIL_` set, so the check now names `MAIL_HOST`.

One real defect, in the setup page rather than the product: it wrote the backup path unquoted, and that path contains spaces, which breaks any shell that sources the file. The generator now quotes every free-text value. Re-open `SETUP.html`, press Download, move the file into place, and that line goes green.

---

## The host dependency this build will acquire

Named here because the operator rule says a dependency not named at the greenlight does not get to exist.

**Playwright's WebKit browser.** The end-to-end suite has to run against WebKit at an iPhone viewport, because Safari is the only engine this product ever meets. WebKit on Linux ARM inside a container is unreliable, so the suite runs on the host against the containerised app. `npx playwright install webkit` fetches roughly 1 to 2 GB into `~/Library/Caches/ms-playwright`. No sudo, no prompt, no human step: the build does it. Nothing else is added to this Mac.

**Nothing else is needed.** No Vercel CLI, no Supabase CLI, no `age`, no `gpg`, no `psql`, no pnpm. Vercel and Supabase are not part of this stack and cannot be: the product's first constraint is that the data stays on this machine.

---

## To arm the run

Approve in your own words, then paste this line:

```
/goal Every line of .forge/DOD.md checked, with evidence recorded in .forge/EVIDENCE.md, and a PASS verdict from the verifier agent.
```
