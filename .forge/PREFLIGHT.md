# Pre-flight

Everything a human must install, create or authorise before this stack can reach
`https://lamberts-mac-mini.tailda76d6.ts.net`. Read by `scripts/preflight.sh`;
run it with `--probe` to execute the `run:` checks.

Most of this machine is already satisfied. The short list of genuinely
outstanding work is the four accounts, one Tailscale setting, one folder, and
the iPhone.

Two notes on how to read the checks. `env:` reads **this machine**, so its labels
say so; the deploy target here is the app container on this same Mac, and the
container half is checked separately under the post-deploy heading with
`run:docker compose exec`. `remote-env:` is not used, because that check speaks
only Vercel and this build does not deploy to Vercel.

The Tailscale binary is not on `PATH` on this machine. It lives inside the app
bundle. A `cmd:tailscale` line would report a working machine as broken, so every
Tailscale check names the real path.

**Not your job. A script creates these, so do not go looking for them:** the Web
Push VAPID key pair (`scripts/gen-vapid.mjs`), the master encryption key and the
database password (`scripts/gen-env.mjs`), the first owner account (created once
by the app's own bootstrap screen), and the iOS Shortcut ingest token (created in
the app, shown once). They appear below only as checks that the generated values
landed.

---

## Already on this machine, verified 2026-08-21

- [ ] cmd:docker:24 | Docker Engine 24+ | docker.com/products/docker-desktop
- [ ] run:docker info >/dev/null 2>&1 | Docker daemon running | open Docker Desktop and wait for the whale
- [ ] run:docker compose version >/dev/null 2>&1 | Docker Compose v2+ | ships with Docker Desktop
- [ ] run:docker image inspect postgres:18-alpine >/dev/null 2>&1 | Postgres image pulled | docker pull --platform linux/arm64 postgres:18-alpine
- [ ] run:docker image inspect node:24-slim >/dev/null 2>&1 | Node 24 build image | docker pull --platform linux/arm64 node:24-slim
- [ ] cmd:node:24 | Node 24+ for host tooling | nodejs.org, only for scripts; the container pins its own
- [ ] cmd:npm:10 | npm 10+ | ships with Node
- [ ] cmd:git:2 | git | xcode-select --install
- [ ] cmd:curl:8 | curl | ships with macOS
- [ ] path:.git | Repository initialised | git init
- [ ] path:/Applications/Tailscale.app/Contents/MacOS/Tailscale | Tailscale app installed | tailscale.com/download/mac
- [ ] run:/Applications/Tailscale.app/Contents/MacOS/Tailscale status >/dev/null 2>&1 | Tailscale logged in | open Tailscale and sign in to tailnet tailda76d6.ts.net
- [ ] run:host lamberts-mac-mini.tailda76d6.ts.net >/dev/null 2>&1 | MagicDNS resolves host | admin console, DNS, enable MagicDNS

## Run once, before the first build: values a script generates

Nothing here is yours to invent. Run `node scripts/gen-env.mjs` and
`node scripts/gen-vapid.mjs`, which write into the environment file. They are
listed so a missing one is caught here rather than at first boot.

- [ ] env:MASTER_KEY | MASTER_KEY generated | node scripts/gen-env.mjs
- [ ] env:POSTGRES_PASSWORD | POSTGRES_PASSWORD set | node scripts/gen-env.mjs
- [ ] env:VAPID_PUBLIC_KEY | VAPID public key set | node scripts/gen-vapid.mjs
- [ ] env:VAPID_PRIVATE_KEY | VAPID private key set | node scripts/gen-vapid.mjs

## Before the first deploy: Tailscale HTTPS

`tailscale serve` cannot terminate TLS until HTTPS certificates are switched on
for the tailnet in the admin console. This is a per-tailnet setting, it is off by
default, and its state on this tailnet is unknown. Certificates are cached after
the first issuance, so this check costs one issuance and no more.

- [ ] run:/Applications/Tailscale.app/Contents/MacOS/Tailscale cert --cert-file=- --key-file=/dev/null lamberts-mac-mini.tailda76d6.ts.net >/dev/null 2>&1 | tailscale cert succeeds | admin console, DNS, HTTPS Certificates, Enable
- [ ] run:/Applications/Tailscale.app/Contents/MacOS/Tailscale serve status >/dev/null 2>&1 | Serve subcommand runs | update Tailscale to 1.60 or newer

## Before anything writes to disk: the archive destination

The daily archive job writes here from its first run. The folder has to exist and
be writable before that run, not after it, or the first archive is lost and the
loss is silent.

- [ ] env:BACKUP_DIR | Backup dir set on this Mac | pick a folder inside iCloud Drive and set BACKUP_DIR
- [ ] run:sh -c 'set -a; . ./.env 2>/dev/null; set +a; test -d "$BACKUP_DIR" -a -w "$BACKUP_DIR"' | Backup dir exists writable | mkdir -p "$HOME/Library/Mobile Documents/com~apple~CloudDocs/lbtbly-backups"

## Third-party accounts, before their slices

Four accounts. Three are free. Anthropic is the only metered cost in the build and
has no free tier; the app runs its whole photo flow in demonstration mode without
it, so a missing key parks one rubric line rather than blocking a slice.

**Withings**, before slice 5. Sign in at `developer.withings.com/dashboard` with
the account that owns the Body Smart, create an application, and register
`https://lamberts-mac-mini.tailda76d6.ts.net/api/withings/callback` and
`http://localhost:3000/api/withings/callback` as Callback URLs, comma separated.
The client secret is shown at creation. If it is lost there is nothing to copy:
rotate it in the dashboard, then substitute the new value.

- [ ] env:WITHINGS_CLIENT_ID | Withings id, this Mac | developer.withings.com/dashboard, create an application
- [ ] env:WITHINGS_CLIENT_SECRET | Withings secret, this Mac | shown once at creation; if lost, rotate in the dashboard, then substitute

**Google**, before slice 11. Create a Cloud project, enable the Google Calendar
API, configure the Auth Platform branding as External, declare exactly the three
scopes the plan names, and create a Web application client with both callback
URLs. Then **publish the app to In production**. That last step has no machine
check and it is the one that decides whether the integration survives the week: a
project left in Testing issues a refresh token that dies seven days after consent,
with no code change and no warning. Do not add test users instead.

- [ ] env:GOOGLE_CLIENT_ID | Google id, this Mac | console.cloud.google.com, Auth Platform, Clients, Web application
- [ ] env:GOOGLE_CLIENT_SECRET | Google secret, this Mac | shown once; if lost, Add Secret on the client page, then substitute. Then Audience, Publish app
- [ ] run:sh -c 'set -a; . ./.env 2>/dev/null; set +a; curl -sS -d client_id="$GOOGLE_CLIENT_ID" -d client_secret="$GOOGLE_CLIENT_SECRET" -d grant_type=refresh_token -d refresh_token=preflight-probe https://oauth2.googleapis.com/token | grep -q invalid_grant' | Google client pair valid | a client-id or secret error reports invalid_client; recheck both values

**Anthropic**, before slice 10.

- [ ] env:ANTHROPIC_API_KEY | Anthropic key, this Mac | console.anthropic.com, API keys, Create key
- [ ] run:sh -c 'set -a; . ./.env 2>/dev/null; set +a; curl -sS -o /dev/null -w "%{http_code}" -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" https://api.anthropic.com/v1/models | grep -q "^200$"' | Anthropic key authorised | a 401 means the key is wrong or revoked, a 429 means the account has no credit

**Mail**, before slice 12, and optional. Without it the weekly review renders in a
local preview and the live-send rubric line parks.

- [ ] env:SMTP_URL | Mail transport, this Mac | any SMTP account, or leave unset and keep preview-only

## The iPhone, before install, push and offline storage

`iphone181` is on the tailnet but was last seen 23 days ago. It has to be online
and unlocked before anything below can happen. Three further device settings have
no check that can run from this Mac, so they are stated here and their effect is
visible in the recorded observations further down: iOS 18.4 or newer for Screen
Wake Lock during a session, iCloud Keychain and two-factor authentication both on
for passkeys to sync from the Mac's Touch ID, and Settings, Shortcuts, Advanced,
Allow Sharing Large Amounts of Data for the health batch.

Renaming this Mac is destructive and is not a step: a new origin orphans the
installed app's storage, invalidates the push subscription, and the relying-party
identifier is pinned to the tailnet domain precisely so passkeys survive it.

- [ ] run:/Applications/Tailscale.app/Contents/MacOS/Tailscale ping --c=1 --timeout=5s iphone181 >/dev/null 2>&1 | iPhone online on tailnet | unlock the iPhone, open Tailscale, connect

## After the app is live: what the running system reports

Nothing under this heading can pass before slice 1 deploys, because each one asks
the running app what it observed. Each label says "recorded" or "reported"
because that is what the check tests: an observation the app stored, not a state
this Mac can see directly.

- [ ] run:curl -fsS -o /dev/null --max-time 8 https://lamberts-mac-mini.tailda76d6.ts.net/healthz | App answers over HTTPS | scripts/up.sh, then scripts/tailscale-serve.sh
- [ ] run:docker compose exec -T app printenv MASTER_KEY >/dev/null 2>&1 | MASTER_KEY in container | docker compose up -d --force-recreate after editing the environment file
- [ ] run:docker compose exec -T app printenv WITHINGS_CLIENT_SECRET >/dev/null 2>&1 | Withings secret in container | docker compose up -d --force-recreate
- [ ] run:docker compose exec -T app printenv GOOGLE_CLIENT_SECRET >/dev/null 2>&1 | Google secret in container | docker compose up -d --force-recreate
- [ ] run:docker compose exec -T app printenv ANTHROPIC_API_KEY >/dev/null 2>&1 | Anthropic key in container | docker compose up -d --force-recreate
- [ ] run:curl -fsS --max-time 8 https://lamberts-mac-mini.tailda76d6.ts.net/api/diagnostics/device | grep -q '"standaloneSeen":true' | Standalone launch recorded | on the iPhone open the URL in Safari, Share, Add to Home Screen, then open it from the icon
- [ ] run:curl -fsS --max-time 8 https://lamberts-mac-mini.tailda76d6.ts.net/api/diagnostics/device | grep -q '"wakeLockAvailable":true' | Wake Lock reported | update the iPhone to iOS 18.4 or newer, then reopen from the Home Screen icon
- [ ] run:curl -fsS --max-time 8 https://lamberts-mac-mini.tailda76d6.ts.net/api/diagnostics/device | grep -q '"passkeyRegistered":true' | Passkey registered recorded | sign in on the iPhone and register a passkey; needs iCloud Keychain and two-factor on
- [ ] run:curl -fsS --max-time 8 https://lamberts-mac-mini.tailda76d6.ts.net/api/diagnostics/device | grep -q '"pushSubscription":true' | Push subscription recorded | in the installed app, Settings, Enable notifications; the tap must be inside the app, not Safari
- [ ] run:curl -fsS --max-time 8 https://lamberts-mac-mini.tailda76d6.ts.net/api/diagnostics/ingest | grep -q '"lastIngestWithin36h":true' | Health batch within 36h | build the Shortcut from the in-app guide and run it once; turn on Allow Sharing Large Amounts of Data first

---

## One item that is not a prerequisite, but is outstanding

While verifying whether a third party can sign an installable Shortcut file, the
research pass ran `shortcuts sign --mode anyone` twice on this Mac. That mode is
the same operation as Copy iCloud Link, so it published two public shortcut
records named "Test" under `lambert.bouley@gmail.com`. They hold no personal data.
Remove them in the Shortcuts app with Stop Sharing. Recorded here so it is not
lost; it gates nothing.
