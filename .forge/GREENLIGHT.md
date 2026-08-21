# Greenlight

This is a summary for approving away from the desk. It is never a replacement
for the plan and the rubric. Approving means the full rubric applies, all one
hundred and sixty-six lines, at one hundred percent.

**Stack.** Next.js 16.3.2 App Router, React 19, TypeScript, Drizzle on PostgreSQL 18, in `node:24-slim` on `linux/arm64` under Docker Compose on this Mac mini, served by Tailscale Serve HTTPS at `https://lamberts-mac-mini.tailda76d6.ts.net`.

**Slices.** Fourteen. Slice 1 is the walking skeleton and its deploy, so the live URL exists before any line needs it. Auth and passkeys are slice 2. Features run slices 3 to 13 in the order section 17 of your spec asks for. Slice 14 is backup, hardening and the docs gate.

**Rubric.** 166 lines. Function 133, Craft 18, Release 15 including 5 disqualifiers. Seven lines are marked OPERATOR, meaning they need a credential or your phone in your hand; each names a sibling line that proves the same path with no external credential.

**Screens.** No Claude Design share link: that MCP server is not connected in this session. The approved artefact is thirteen HTML wireframes in `.forge/wireframes/`, with `index.html` as the contents page, plus thirteen matching PNG exports in `.forge/screens/` for the verifier. Open `.forge/wireframes/index.html` in a browser to review them.

**Design step.** Nothing to keep or strike. That option belongs to S goals. This is L, the design ran, and DESIGN.md is written.

---

## The three lines most likely to be contentious

**1. One hundred percent needs your hands, thirteen times.** Seven OPERATOR
lines plus C2 and R10 cannot be closed by the run at all: a real Withings
authorization, a real Google authorization, a real Anthropic call, a real push
landing on `iphone181`, a real email send, a Shortcut posting a live batch from
your phone, the Home Screen install, and the final manual mobile review. Each
has a sibling line proving the same path with demo adapters and contract mocks,
and those siblings the run can close alone. If you never do the thirteen human
steps, the honest ceiling is roughly 153 of 166 with every remaining line
blocked on a named prerequisite, not on the code. That is the difference
between a build that is finished and a run that is finished.

**2. R5 reboots your Mac mini.** "The stack returns to serving after a reboot
with no manual step, and liveness answers 200 within 5 minutes of the desktop
appearing." There is no way to prove unattended restart without restarting the
machine. It is always-on and it is your only server. Say now if you want that
line held until you choose the moment, and the run will park it rather than
reboot on its own.

**3. C6 bans inline strings.** "No user-facing string is written inline in a
component", proven by a string inventory and a timezone-shifted run producing
identical dates. For an English-only app for one person this is real extra work
and it will slow the early slices. It is in the rubric because the standards
skill requires English to ship first and the product to be built to add
languages later, and because a timezone-shifted run is the only honest proof
that Europe/Paris dates are actually pinned rather than accidentally correct on
a machine already in that timezone.

---

## One thing I have to say before you approve

You asked for a short deadline, one session. Fourteen slices and 166 evidence-
backed lines is not one session of work, and I will not pretend otherwise by
thinning the rubric to fit. The bar does not move.

What I propose instead, and what the plan is written for: the run builds
continuously, commits every green slice, and updates `.forge/RESUME.md` so any
later session resumes exactly where this one stopped without re-asking you
anything. When it runs out of actionable work it parks and writes what it is
waiting on. You get a working, deployed, honest product as early as slice 1 and
a steadily better one after that, rather than a mock today.

If you would rather cut scope to fit a single session, say which slices to drop
and I will send the plan back to the architect. Dropping scope is your call.
Softening a line to reach PASS is not on the table.

---

## Before this can reach a live URL

Read from your machine just now, not assumed. Fourteen items already pass.
Twenty-six are outstanding, and thirteen of those are genuine human work.

```
Before this can reach a live URL


  Already on this machine, verified 2026-08-21
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
  [ ] tailscale cert succeeds                       admin console, DNS, HTTPS Certificates, Enable
  [x] Serve subcommand runs      ok

  Before anything writes to disk: the archive destination
  [ ] Backup dir set on this Mac not set            pick a folder inside iCloud Drive and set BACKUP_DIR
  [ ] Backup dir exists writable                    mkdir -p "$HOME/Library/Mobile Documents/com~apple~CloudDocs/lbtbly-backups"

  Third-party accounts, before their slices
  [ ] Withings id, this Mac      not set            developer.withings.com/dashboard, create an application
  [ ] Withings secret, this Mac  not set            shown once at creation; if lost, rotate in the dashboard, then substitute
  [ ] Google id, this Mac        not set            console.cloud.google.com, Auth Platform, Clients, Web application
  [ ] Google secret, this Mac    not set            shown once; if lost, Add Secret on the client page, then substitute. Then Audience, Publish app
  [ ] Google client pair valid                      a client-id or secret error reports invalid_client; recheck both values
  [ ] Anthropic key, this Mac    not set            console.anthropic.com, API keys, Create key
  [ ] Anthropic key authorised                      a 401 means the key is wrong or revoked, a 429 means the account has no credit
  [ ] Mail transport, this Mac   not set            any SMTP account, or leave unset and keep preview-only

  The iPhone, before install, push and offline storage
  [ ] iPhone online on tailnet                      unlock the iPhone, open Tailscale, connect

  After the app is live: what the running system reports
  [ ] App answers over HTTPS     curl: (7) Failed to connect to lambert scripts/up.sh, then scripts/tailscale-serve.sh
  [ ] MASTER_KEY in container                       docker compose up -d --force-recreate after editing the environment file
  [ ] Withings secret in contai.                    docker compose up -d --force-recreate
  [ ] Google secret in container                    docker compose up -d --force-recreate
  [ ] Anthropic key in container                    docker compose up -d --force-recreate
  [ ] Standalone launch recorded curl: (7) Failed to connect to lambert on the iPhone open the URL in Safari, Share, Add to Home Screen, then open it from the icon
  [ ] Wake Lock reported         curl: (7) Failed to connect to lambert update the iPhone to iOS 18.4 or newer, then reopen from the Home Screen icon
  [ ] Passkey registered record. curl: (7) Failed to connect to lambert sign in on the iPhone and register a passkey; needs iCloud Keychain and two-factor on
  [ ] Push subscription recorded curl: (7) Failed to connect to lambert in the installed app, Settings, Enable notifications; the tap must be inside the app, not Safari
  [ ] Health batch within 36h    curl: (7) Failed to connect to lambert build the Shortcut from the in-app guide and run it once; turn on Allow Sharing Large Amounts of Data first

  26 of 40 outstanding. These gate the live URL, not the code.
```

Nothing here blocks arming. The run can start with every one of these
outstanding, build locally, and park the live-URL lines against the named
prerequisite. The one that matters first is Tailscale HTTPS certificates: until
that is enabled in the admin console, there is no HTTPS origin, and with no
HTTPS origin there are no passkeys, no Home Screen install, no push and no
offline storage. It is one toggle: admin console, DNS, HTTPS Certificates,
Enable.

---

## To arm the run

Approve in your own words, then paste this line:

```
/goal Every line of .forge/DOD.md checked, with evidence recorded in .forge/EVIDENCE.md, and a PASS verdict from the verifier agent.
```
