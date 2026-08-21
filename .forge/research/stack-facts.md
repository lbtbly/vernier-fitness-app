# Stack facts

Library and runtime facts for a self-hosted Next.js + PostgreSQL PWA on Apple
Silicon. Every version below was checked against the package registry, the
project repository, or official documentation on the date noted.

**Host** (confirmed directly on this machine, 2026-08-21): macOS 26 arm64,
Node v26.7.0, npm 11.19.0, Docker 29.6.2, Docker Compose v5.3.1, OpenSSL 3.6.3,
git, jq, python3. `age`, `gpg`, `psql`, `pnpm` and `corepack` all confirmed
absent.
**Target**: everything runs inside a `linux/arm64` container. Fewer
dependencies wins ties.

All facts verified 2026-08-21 unless a different date is stated.

---

## 1. Anthropic SDK

**Package**: `@anthropic-ai/sdk`, latest **0.120.0**, published 2026-08-19
(registry.npmjs.org, verified 2026-08-21). Not deprecated. No `engines` field,
pure TypeScript, no native modules, so Node 26 and arm64 are both non-issues.
Install with `npm install @anthropic-ai/sdk`. `new Anthropic()` reads
`ANTHROPIC_API_KEY` from the environment.

**Vision**. Three source shapes on an `image` content block: `base64`, `url`,
and `file` (Files API, beta header `files-api-2025-04-14`). Accepted media
types are `image/jpeg`, `image/png`, `image/gif`, `image/webp` only. Animations
are ignored past the first frame. Limits on the Claude API: 10 MB per image
base64, 32 MB per request, 8000x8000 px max dimensions, 600 images per request
(100 on 200K-context models). Put the image block before the text block.

Cost is driven by pixels, not bytes. An image costs
`ceil(width / 28) * ceil(height / 28)` visual tokens. Claude 4.7 and later sit
in the high-resolution tier: long edge up to 2576 px, capped at 4784 visual
tokens. Older models are standard tier: 1568 px, capped at 1568 tokens. This
matters more than it looks. A 2000x1500 phone photo is not resized on Opus 5
and costs 3888 tokens; the same photo on a standard-tier model is downscaled to
1269x952 and costs 1564. Downscale client-side or server-side to about 1092 px
on the long edge (1521 tokens) before sending. Send JPEG or WebP, but do not
compress hard: heavy JPEG artefacts wreck small text, which is exactly what a
lab report is.

One limitation to record now rather than discover later: the vision docs state
Claude is not designed to interpret complex diagnostic scans and that its
output is not a substitute for professional medical advice. Fine for reading
numbers off a lab printout, not a basis for interpretation copy.

**Structured JSON**. Use `output_config.format`, not the deprecated
`output_format`. No beta header is required any more. In TypeScript:

```typescript
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
const res = await client.messages.parse({
  model, max_tokens: 16000, messages,
  output_config: { format: zodOutputFormat(LabReportSchema) },
});
res.parsed_output; // typed, validated
```

`jsonSchemaOutputFormat` from `@anthropic-ai/sdk/helpers/json-schema` is the
Zod-free equivalent. Schema rules: every object needs
`additionalProperties: false` and every property listed in `required`.
Unsupported: recursion, `minimum`/`maximum`, `minLength`/`maxLength`,
`minItems` other than 0 or 1, external `$ref`. The grammar compiles on first
use (one-off latency) and is cached 24 hours. Changing the format string
invalidates the prompt cache, and it is incompatible with citations.

**Model choice at runtime**. Every current model supports image input. Prices
per million tokens, from the models overview doc, verified 2026-08-21:
Opus 5 `claude-opus-5` $5 in / $25 out; Sonnet 5 `claude-sonnet-5` $2 / $10 on
introductory pricing that ends **2026-08-31**, reverting to $3 / $15;
Haiku 4.5 `claude-haiku-4-5` $1 / $5 (200K context, 64K output, no `effort`
parameter); Fable 5 `claude-fable-5` $10 / $50. Batch API is 50 percent off.
Cache writes bill about 1.25x, cache reads about 0.1x.

Never bake a model ID into source. Read `ANTHROPIC_MODEL` from the environment
with `claude-opus-5` as the default, then validate it once at boot against the
Models API rather than trusting the string:

```typescript
const m = await client.models.retrieve(process.env.ANTHROPIC_MODEL ?? "claude-opus-5");
// m.max_input_tokens, m.max_tokens are typed; capabilities is a plain object
if (!m.capabilities["image_input"]["supported"]) throw new Error("model has no vision");
```

`client.models.list()` auto-paginates and lets you filter by capability. Model
IDs from the 4.6 generation on are dateless but still pinned snapshots, not
evergreen pointers, so a retired ID fails at boot with a clear 404 instead of
silently at 2am. That boot check is the whole defence against ageing out.

**Timeouts and retries**. `new Anthropic({ timeout, maxRetries })`. Timeout is
in **milliseconds** in the TypeScript SDK (seconds in Python, a common
mistake), default 10 minutes, auto-scaled up to 60 minutes for large
`max_tokens` on non-streaming calls. `maxRetries` defaults to 2 and covers 408,
409, 429, 5xx and connection errors, honouring `retry-after`. Worst-case wall
clock is `timeout * (maxRetries + 1)`, so set both deliberately on a request
path a user is waiting on. Per-request override is the second argument:
`client.messages.create({...}, { timeout: 30_000, maxRetries: 1 })`. Catch
typed errors (`Anthropic.RateLimitError`, `Anthropic.BadRequestError`,
`Anthropic.APIError` with `.status`), never string-match messages.

**Counting tokens and enforcing a ceiling**. `client.messages.countTokens({
model, system, messages, tools })` returns `{ input_tokens }`. It is free, has
its own rate limit (2000 RPM on the Start tier), and accepts images, PDFs,
tools and system prompts. It is an estimate, and counts are tokenizer-specific:
Claude 4.7 and later produce roughly 30 percent more tokens for the same text,
so never reuse a count taken against another model. For the monthly ceiling,
do not rely on the estimate for billing. Pre-flight with `countTokens` to
reject an oversized request, then read the truthful numbers off the response:
`usage.input_tokens`, `usage.output_tokens`,
`usage.cache_creation_input_tokens`, `usage.cache_read_input_tokens`. Price
those four against a per-model rate table held in config, insert a row into a
`usage_ledger` table in the same transaction as the result, and have the call
site refuse when month-to-date plus the pre-flight estimate would cross the
cap. Keep the rate table in config, not in code, so a price change is an edit
and not a deploy.

On spend control, `output_config: { effort: "low" }` on Opus 5 is the cheapest
real lever for a mechanical extraction task, since thinking is on by default
there. Haiku 4.5 rejects `effort` entirely.

**Recommendation:** `@anthropic-ai/sdk` 0.120.0 with `ANTHROPIC_MODEL` env-var
selection validated once at boot via `models.retrieve`, `messages.parse` plus
`zodOutputFormat` for extraction, images downscaled to about 1092 px long edge,
and a `usage_ledger` table fed from `response.usage` for the monthly ceiling.

---

## 2. Web Push

**Library.** `web-push` 3.6.7, published 2024-01-16 (registry.npmjs.org,
verified 2026-08-21). Not deprecated, not archived. The repo
(`web-push-libs/web-push`, 3540 stars, 45 open issues) is still committed to as
of 2026-08-03, but there has been no npm release in two and a half years, and
issue #978 is literally titled "No Releases Since 3 Years Ago". `master` has
already migrated to `"type": "module"` and bumped `https-proxy-agent` to ^9 and
`http_ece` to 1.2.1, all unreleased; the published 3.6.7 is still CommonJS.
Single npm maintainer (`marco-c`). No alternative has displaced it:
`webpush-webcrypto` (1.0.5, 2025-04-22) and `@block65/webcrypto-web-push`
(1.0.2, 2024-12-15) are edge-runtime niche and less maintained. Verified live in
`node:26-slim` `linux/arm64`: installs clean, `generateVAPIDKeys()` works. Pure
JS, five direct deps, no native code.

**VAPID keys.** CLI: `npx web-push generate-vapid-keys`. Zero-dependency
equivalent, tested on Node 26:

```js
const { generateKeyPairSync } = require('node:crypto');
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const { x, y, d } = privateKey.export({ format: 'jwk' });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(x, 'base64url'), Buffer.from(y, 'base64url')]); // 65 B
// publicKey = pub.toString('base64url'), privateKey = d (32 B base64url)
```

**Encryption.** `web-push` does all of it: ECDH against the subscription's
`p256dh`, HKDF, `aes128gcm` (RFC 8188) per RFC 8291, plus the
`Authorization: vapid t=<JWT>, k=<pubkey>` header and `TTL` / `Urgency` /
`Topic`. You supply only the subscription object, the payload string, and the
VAPID keys plus a `subject` that must be a `mailto:` or `https:` URL.

**iOS.** Apple requires iOS or iPadOS 16.4+, the app added to the Home Screen
(manifest `display: "standalone"` or `"fullscreen"`), and `pushManager
.subscribe()` called synchronously inside a user-gesture handler. Endpoints land
on `https://*.push.apple.com`, in practice `web.push.apple.com`. Payload cap is
4 KB. There is no silent push: if the service worker does not call
`showNotification()` on every push, Safari revokes permission. The JWT `exp`
must be under 24 hours and must not refresh more than hourly.

**Dead subscriptions.** `WebPushError` carries `statusCode`, `headers`, `body`
and `endpoint`. Delete the row on **404** (endpoint invalid, never reuse) and
**410** (subscription expired). Do not delete on 400 (malformed request or bad
JWT), 403 (VAPID key mismatch), 413 (payload over 4 KB), or 429 (back off and
retry).

**Recommendation:** `web-push@3.6.7`, pinned exactly, with `sendNotification`
wrapped in a helper that deletes the subscription row on 404 and 410; the
release stall is a real risk but no maintained alternative covers RFC 8291 as
completely, and it is verified working on Node 26 arm64.

---

## 3. WebAuthn (server)

**Library.** `@simplewebauthn/server` **13.3.2** (2026-06-24) and
`@simplewebauthn/browser` **13.3.0** (2026-03-10), verified 2026-08-21.
Actively maintained (repo pushed 2026-08-14, only 10 open issues, MIT).
`engines.node: ">=20.0.0"`. Pure JS, zero native deps (`@peculiar/*`,
`@hexagon/base64`, `@levischuck/tiny-cbor`), so arm64 is a non-issue; verified
importing and resolving in `node:26-slim` arm64. Note that 13.3.2 fixes an x5c
trust-anchor advisory (GHSA-6hxq-p678-4hr2), so do not pin below it.
`@simplewebauthn/types` is deprecated; import types from `/server` and
`/browser` since v13.

**API, v13, exact.**

```ts
generateRegistrationOptions({ rpName, rpID, userName, userID?, excludeCredentials?, authenticatorSelection?, attestationType? }) // 'none'|'direct'|'enterprise' only
verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID })
//   -> { verified: true, registrationInfo: { credential: { id, publicKey, counter, transports? },
//        aaguid, fmt, credentialDeviceType, credentialBackedUp, userVerified, origin, rpID } }
generateAuthenticationOptions({ rpID, allowCredentials?, userVerification? })   // rpID required
verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID, credential })
//   -> { verified, authenticationInfo: { credentialID, newCounter, credentialDeviceType, credentialBackedUp, ... } }
```

Renames to know: v10 made all credential IDs `Base64URLString` rather than
`Uint8Array` and made `rpID` required on auth options; v11 renamed
`AuthenticatorDevice` to `WebAuthnCredential` with `credentialID` and
`credentialPublicKey` shortened to `id` and `publicKey`; v12 nested them under
`registrationInfo.credential`; v13 dropped `attestationType: 'indirect'`.
Browser calls are now object-form: `startRegistration({ optionsJSON })`.

**Origin rules, and this one bites.** WebAuthn is secure-context only.
`http://localhost:3000` works. `http://192.168.1.x:3000` does not, and cannot be
made to, because a bare IP is not a valid domain string and so cannot be an RP
ID. `rpID` must equal or be a registrable domain suffix of the origin's host
(`rpID: "example.com"` for origin `https://app.example.com`). Self-hosting
therefore needs a real hostname over HTTPS.

**Postgres columns.** `id TEXT PRIMARY KEY` (base64url), `public_key BYTEA`,
`counter BIGINT`, `transports TEXT[]`, `device_type TEXT`, `backed_up BOOLEAN`,
`aaguid UUID`, `user_id` FK, plus `created_at` and `last_used_at`. Multiple rows
per user by design.

**Touch ID plus iCloud passkey.** Use
`authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }`,
omit `authenticatorAttachment`, keep `attestationType: 'none'`. Synced passkeys
report `counter: 0` forever and arrive as `credentialDeviceType: 'multiDevice'`
with `credentialBackedUp: true`. The library only errors when
`(counter > 0 || stored > 0) && counter <= stored`, so store `newCounter`
verbatim and never synthesize an increment. Pass every stored credential in
`excludeCredentials`.

Alternative: `fido2-lib` 3.5.9 (2026-03-11) is alive but has a clunkier
ArrayBuffer-centric API and weaker passkey and backup-flag ergonomics.

**Recommendation:** `@simplewebauthn/server@13.3.2` with
`@simplewebauthn/browser@13.3.0`, the only actively maintained, pure-JS,
passkey-aware option, on the understanding that it needs a real HTTPS hostname
and not a LAN IP.

---

## 4. Argon2id in Node

**Node has argon2 built in now.** `crypto.argon2(algorithm, parameters,
callback)` and `crypto.argon2Sync(algorithm, parameters)`, added in **v24.7.0**,
with no experimental stability marker in the docs (verified 2026-08-21 against
nodejs.org/docs/latest-v26.x and `doc/api/crypto.md` on `v26.x`). Verified
executing inside `node:26-slim` arm64:

```js
crypto.argon2Sync('argon2id', { message, nonce, parallelism: 1, tagLength: 32, memory: 19456, passes: 2 })
```

All six of `message`, `nonce` (minimum 8 bytes, use 16 random), `parallelism`,
`tagLength`, `memory` (KiB blocks) and `passes` are required; `secret` (a
pepper) and `associatedData` are optional. It returns a raw `Buffer`, not a PHC
string, so you store the salt and params yourself and compare with
`timingSafeEqual`.

**The two libraries.** `argon2` (node-argon2) **0.45.1**, 2026-07-21.
`@node-rs/argon2` **2.1.0**, 2026-08-13. Both current, neither deprecated. The
old "node-argon2 needs a toolchain" advice is now wrong: 0.45.1 ships
prebuildify N-API 8 binaries inside the tarball, including
`prebuilds/linux-arm64/argon2.armv8.glibc.node` and `.musl.node`. Verified: both
install and hash in `node:26-slim` `linux/arm64` (glibc 2.41, Node v26.7.0,
NODE_MODULE_VERSION 147, N-API 10) with no python3, make or g++ present at all.
N-API 8 prebuilds are ABI-stable, so Node 26 needs no rebuild.

One real difference: npm 11.19's `allowScripts` policy flags `argon2`'s install
script (`node-gyp rebuild`) as unapproved on every install. It is harmless today
because the bundled prebuild is found anyway, but it is noise, and a hard
failure if a prebuild is ever missing. `@node-rs/argon2` has no install script;
it resolves `@node-rs/argon2-linux-arm64-gnu` (and `-linux-arm64-musl` for
Alpine) as an optionalDependency. Both return PHC strings and expose `verify()`.

**Benchmarks** at the OWASP minimum, arm64 container: `@node-rs/argon2` 15.5 ms,
`crypto.argon2Sync` 20.7 ms, node-argon2 19.4 ms per hash.

**OWASP Password Storage Cheat Sheet** (read 2026-08-21; source last modified
2026-06-24), Argon2id rows verbatim:

- m=47104 (46 MiB), t=1, p=1
- m=19456 (19 MiB), t=2, p=1 (stated minimum)
- m=12288 (12 MiB), t=3, p=1
- m=9216 (9 MiB), t=4, p=1
- m=7168 (7 MiB), t=5, p=1

All five are equal defence, trading CPU against RAM. Node's own `scrypt` is the
zero-dependency alternative (OWASP: N=2^17, r=8, p=1).

**Recommendation:** built-in `crypto.argon2Sync('argon2id', ...)` at m=19456,
t=2, p=1 with a 16-byte random nonce, storing salt and params alongside the tag,
because it is zero dependencies, zero install scripts and arm64-proof by
construction, with `@node-rs/argon2@2.1.0` as the fallback if PHC strings and a
free `verify()` are wanted.

---

## 5. PDF text extraction and OCR

All versions from the npm registry, verified 2026-08-21. Every API claim below
was executed locally on Node v26.7.0, darwin arm64.

**The Node 26 trap.** Node 26 has no global `DOMMatrix`, `Path2D` or
`ImageData`. `pdfjs-dist` 6.2.108 (2026-07-28, Apache-2.0, engines
`>=22.13.0 || >=24`) declares `@napi-rs/canvas` as an optionalDependency and
polyfills `DOMMatrix` from it at import time. Install with `--omit=optional`
and even pure text extraction dies at import:

```
pdf.mjs:16713  const SCALE_MATRIX = new DOMMatrix();
ReferenceError: DOMMatrix is not defined
```

So "text extraction needs no canvas" is false for pdfjs v6 raw. The non-legacy
build crashes identically; `pdfjs-dist/legacy/build/pdf.mjs` is mandatory in
Node. Fixes: keep `@napi-rs/canvas` 1.0.7 (it has `linux-arm64-gnu` and `musl`
prebuilds, but costs about 26 MB, and 34 MB with pdfjs), or set a ten-line
`globalThis.DOMMatrix` stub before a dynamic import (verified: 601 items with
`transform`).

**unpdf 1.8.1** (2026-08-13, unjs, MIT, zero runtime deps, 2.5 MB installed)
sidesteps all of it. Verified with no canvas anywhere: `extractText`,
`extractTextItems` (`x`, `y`, `width`, `height`, `fontSize`, `hasEOL`), and raw
`getDocumentProxy()` then `getPage()` then `getTextContent()` with full pdf.js
`transform` arrays. It repackages pdf.js for serverless; canvas is an optional
peer, needed only for rasterizing. Gotcha: pdf.js transfers the input buffer
(`byteLength` becomes 0), so pass a fresh `Uint8Array` per call.

**pdf-parse 2.4.5** (2025-10-20) is not abandoned. The name was taken over by
mehmet-kozan (repo pushed 2026-05-04) and rewritten in TypeScript. But it pins
`pdfjs-dist@5.4.296` plus `@napi-rs/canvas@0.1.80` (21 MB) and `getText()`
returns only `{pages:[{text,num}], text, total}`, with no positions. It does add
`getTable()`, based on ruling lines. `pdf-parse-fork@1.2.0` last shipped
2023-07-01 and is dead. `pdf-parse-new@2.1.0` is a rebadge of the old 1.x code.
Skip both.

**mupdf 1.28.0** (2026-06-29) is the official package: WASM, works on Node 26
arm64, gives per-line bounding boxes for structured text. 14 MB install,
10.4 MB wasm, and **AGPL-3.0-or-later**, which is fine for a private
single-owner app but taints the repository permanently. `mupdf-js@2.0.1` last
published 2024-06-28 with an untouched repo since: unmaintained, skip.

**Scanned PDFs.** None of these do OCR. Detect the case by summing
non-whitespace characters across `getTextContent()` items per page; under about
100 on A4 means image-only. Rasterize with unpdf's `renderPageAsImage`, which
is where `@napi-rs/canvas` becomes genuinely required. Measured 236 to 258 ms
per page at 150 to 300 DPI.

**tesseract.js 7.0.0** (2025-12-15, Apache-2.0). `tesseract.js-core@7.0.0`
exists but the `latest` tag still points at 6.1.2; `^7.0.0` resolves correctly
(verified by installing). Offline French, verified end to end with the network
path unused:

```js
const w = await createWorker('fra', 1, {
  langPath: '/app/tessdata',   // reads ${langPath}/fra.traineddata
  gzip: false,                 // true (the default) looks for fra.traineddata.gz
  cachePath: '/tmp/tesscache', // must be writable, or use cacheMethod: 'none'
});
```

Sizes, from HTTP `content-length` on the tessdata repos: `fra.traineddata` is
1.13 MB (tessdata_fast), 3.97 MB (tessdata_best), 14.2 MB (tessdata legacy plus
LSTM). `tesseract.js-core` installs 43 MB across six WASM variants; ship one.
`tesseract-core-simd-lstm.wasm` is 2.86 MB plus an 89 KB loader. Realistic
image delta is about 5 MB pruned, about 50 MB unpruned.

Speed, measured on this Mac (Apple Silicon arm64, Node 26.7, one worker, dense
A4 French lab page, 46 analyte rows): init 127 ms, 1.0 s per page at 150 DPI,
1.5 s per page at 300 DPI. A `linux/arm64` container on the same host should
land within 1x to 2x. Accuracy caveat worth designing around: confidence 78 to
79 on clean synthetic text, and it still returned `13.Q` for `13.0` and `4,50`
for `4.50`. Digit errors on lab values are the norm, so OCR output needs
explicit human confirmation before it becomes a stored value.

Alternative worth one line: `apt-get install tesseract-ocr tesseract-ocr-fra`
in a Debian slim image adds about 45 MB and runs several times faster natively
than WASM. `ocrmypdf` drags in Python, Ghostscript and qpdf for about 250 MB
and is overkill here.

**Recommendation:** `unpdf@1.8.1` as the only PDF dependency, since it is zero
deps, 2.5 MB, needs no canvas, and gives full `transform` / `x` / `y` layout for
column-aligned French lab reports on Node 26 arm64, with `@napi-rs/canvas` plus
`tesseract.js@7` and a pruned WASM variant and `fra.traineddata` (fast,
1.13 MB) added only behind the scanned-page branch.

---

## 6. Scheduling

Versions from npm, verified 2026-08-21. DST behaviour executed locally.

**In-process tickers.** `node-cron` 4.6.0 (2026-07-05, ISC, zero deps, repo
pushed 2026-08-19) and `croner` 10.0.1 (2026-02-01, MIT, zero deps, pushed
2026-08-08) are both actively maintained. `cron` 4.4.0 (2025-12-09) works but
drags in luxon. Both handle Europe/Paris correctly: verified `0 20 * * 0` with
tz `Europe/Paris` gives next run `2026-08-23T18:00Z`, and croner across the
2026-10-25 fallback returns `18:00Z` then `19:00Z`, so 20:00 local holds with no
shift and no double-fire. node-cron v4 adds `noOverlap`, an `execution:missed`
event, and `distributed: true`. Croner documents DST gaps as skipped, overlaps
run once, plus a `protect` overrun guard.

What neither does is persist anything. Restart and the pending tick is gone; a
window missed while the container was down never fires.

**Postgres queues.** Both are pure JS, verified by finding zero `.node`
binaries in either tree, so arm64 is a non-issue.

- `pg-boss` 12.27.0 (2026-08-03, MIT, Node >=22.12, Postgres 13+). Creates
  schema `pgboss`: `version`, `job` (list-partitioned), `queue`, `schedule`,
  `subscription`, plus `create_queue` and `delete_queue`. It migrates
  automatically on start, or `migrate: false` with the CLI or static SQL for
  review. `boss.schedule('weekly-plan', '0 20 * * 0', null, { tz:
  'Europe/Paris' })` supports the timezone, is checked every 30 s, and is
  throttled so only one job is sent across instances. But it does not backfill:
  down at Sunday 20:00 and the run is simply lost. `singletonKey` and
  `singletonSeconds` are a time-slot throttle, not a run ledger.
- `graphile-worker` 0.17.3 (2026-07-08, MIT, Postgres 12+, Node 22.18+).
  Creates schema `graphile_worker` including
  `_private_known_crontabs (identifier, known_since, last_execution)`. Crontab
  entries like `0 18 * * 0 weekly_plan ?fill=2d` do backfill missed runs after
  downtime, and the payload carries `_cron.ts` and `_cron.backfilled`; `jobKey`
  dedupes. But the crontab is UTC only (the docs say "We only handle timestamps
  in UTC"), so `0 18 * * 0` becomes 19:00 Paris after the October fallback.

pg-boss has the timezone, graphile-worker has the backfill, neither has both,
and both cost a schema plus a migration story for one weekly and one daily job.

**System cron in the container.** `node:*-slim` has no cron. You add the
package, a second process, a supervisor or shell entrypoint, and log plumbing
to stdout. Slim images carry no anacron either, so a missed window still fires
nothing. It buys nothing and costs a process. A cron sidecar hitting an
authenticated endpoint is defensible but adds a container and a shared secret,
and still needs the ledger below.

**The pattern that actually works.** A ticker plus a run ledger in the Postgres
you already run:

```sql
create table job_run (
  job_name     text        not null,
  period_start timestamptz not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text        not null default 'running',
  primary key (job_name, period_start)
);
```

Claim the slot before doing any work. The primary key is the thing that
prevents a double-fire:

```sql
insert into job_run (job_name, period_start)
values ($1, $2)
on conflict (job_name, period_start) do nothing
returning period_start;
```

No row back means that period is already claimed, so skip. Compute
`period_start` in Paris local time
(`date_trunc('week', now() at time zone 'Europe/Paris')` for the weekly run,
`(now() at time zone 'Europe/Paris')::date` for the backup) so DST can never
produce two distinct keys for one Sunday evening. Run the claim on every tick
and once at boot, so a container that was down on Sunday fires the run late
exactly once on Monday; cap catch-up to the current and previous period. On
startup, mark rows still `running` past a timeout as `failed`, so a crash
mid-run does not wedge the slot forever.

**Recommendation:** `node-cron@4.6.0` as an in-process ticker plus a
`job_run(job_name, period_start)` unique-key ledger in Postgres, because the
ledger is what delivers idempotency, restart survival and sane catch-up, while
node-cron adds zero dependencies, no schema, no second process, and gets
Europe/Paris DST right.

---

## 7. Prisma vs Drizzle

**Versions**, verified 2026-08-21 against the npm registry.

- `prisma` / `@prisma/client` **7.9.1**, published 2026-07-27 (7.0.0 landed
  2025-11-19). `engines.node: ^20.19 || ^22.12 || >=24.0`, so Node 26 is fine.
  The `next` tag is already **8.0.0-rc.7**, published 2026-08-20.
- `drizzle-orm` **0.45.2** (2026-03-27) and `drizzle-kit` **0.31.10**
  (2026-03-17) are `latest`. v1.0.0 has been in prerelease since April: `rc.4`
  on GitHub 2026-06-27, `rc.5` prereleases on npm through 2026-08-12. Active,
  but v1 stable has not shipped.
- `pg` **8.23.0** (2026-08-08); `pg-native` is optional and not installed
  unless you ask for it. `postgres` (postgres.js) **3.4.9** (2026-04-05), pure
  JS. Neither is deprecated.

**Prisma 7 reality.** The Rust query engine is gone: `prisma-client` is the
default generator, `output` is mandatory, the package is ESM-only
(`"type": "module"`), driver adapters are required (`@prisma/adapter-pg@7.9.1`
wants `pg ^8.16.3`), and `binaryTargets` no longer applies to the client. But
`prisma@7.9.1` still depends on `@prisma/engines@7.9.1`, whose `postinstall`
downloads `BinaryType.SchemaEngineBinary` (read from the published
`dist/scripts/postinstall.js`), and `@prisma/get-platform@7.9.1` still
enumerates `linux-arm64-openssl-3.0.x` and `linux-musl-arm64-openssl-3.0.x`. So
`migrate deploy` still needs a libc-matched Rust binary and
`PRISMA_CLI_BINARY_TARGETS` is the lever. Build on macOS arm64, run in a Debian
arm64 slim image, and a host-fetched binary is the wrong target. Install inside
the image, never copy `node_modules` across.

**Size and standalone.** The `prisma` CLI unpacks to 43.8 MB, `@prisma/client`
to 78.4 MB. Next `output: "standalone"` traces the generated `output` directory
plus the query-compiler `.wasm`, and Prisma's Next.js guide never mentions
standalone, so you own an `outputFileTracingIncludes` entry and a runner stage
carrying the CLI plus the schema-engine binary for migrations. Drizzle copies
nothing: `.next/standalone` plus a `drizzle/` SQL folder.

**Migrations.** Drizzle runs `drizzle-kit generate` at dev time and applies with
a few-KB programmatic call, no CLI in the runtime image:

```ts
import { migrate } from 'drizzle-orm/node-postgres/migrator'
await migrate(db, { migrationsFolder: './drizzle' })
```

Shadow DB matters only for `prisma migrate dev` (needs `CREATEDB`);
`migrate deploy` never uses one. Drizzle has no shadow DB at all. Neither needs
`psql` on the host.

**Seeding.** Prisma 7 moved it to `prisma.config.ts` (`migrations.seed`) and
removed auto-seed from `migrate dev` and `reset`. Drizzle: `node seed.mjs`.

**Churn and escape hatch.** v6 to v7 was ESM-only plus mandatory adapters; the
v8 RC restructures the CLI again (571 KB, no `@prisma/engines`). Drizzle raw SQL
is ``db.execute(sql`...`)`` against the same `pg` pool.

**Recommendation:** Drizzle plus `pg`, because it adds no platform-specific
binary, no CLI in the runtime image, and no engine or libc failure mode to
debug on arm64.

---

## 8. Backup encryption

**Option 1, age.** **v1.3.1**, released 2025-12-28 (GitHub releases, verified
2026-08-21); `age-v1.3.1-linux-arm64.tar.gz` is 9,466,344 bytes. Debian trixie
ships `age` **1.2.1-1+b5** on arm64 (1.43 MB deb, 6.47 MB installed); bookworm
has 1.1.1-1+b3; Alpine edge community has 1.3.1-r6 aarch64 (`apk add age`).
Real AEAD: ChaCha20-Poly1305 in STREAM chunks, "16 bytes every 64KiB of
plaintext" per the age man page, so truncation and reordering are both
detected. `age-keygen` emits an X25519 identity (`AGE-SECRET-KEY-1...`); `-p` is
scrypt passphrase mode. Encrypt with `age -R recipients.txt`, restore with
`age -d -i key.txt dump.sql.age`. The catch: restore needs the `age` binary,
which is not on the Mac. That means a `docker run` with the identity file
bind-mounted, at exactly the moment you are least calm.

**Option 2, Node `crypto` with AES-256-GCM.** Verified by running it on the
host, Node v26.7.0: 32-byte key, 12-byte IV, 16-byte tag, `setAAD` /
`getAuthTag` / `setAuthTag`. One real trap, also verified:
`scryptSync(pw, salt, 32, {N:32768,r:8,p:1})` throws
`ERR_CRYPTO_INVALID_SCRYPT_PARAMS` ("memory limit exceeded") because `maxmem`
defaults to 32 MiB. Pass `maxmem: 96*1024*1024`.

GCM has no framing and NIST SP 800-38D caps one key and IV at 2^39 minus 256
bits (about 64 GiB), so frame it yourself:

```
header: magic|ver|salt16|N,r,p|chunkSize|noncePrefix4   (whole header = AAD)
chunk:  ct(len<=chunkSize) || tag16,  iv = noncePrefix4 || u64be(seq)
AAD per chunk: u64be(seq) || finalFlag   -> reorder and truncation both fail
```

Zero dependencies, zero host installs, restore is `node restore.mjs`.

**Option 3, `openssl enc`.** Verified on host OpenSSL 3.6.3:
`openssl enc -aes-256-gcm` prints `enc: AEAD ciphers not supported`. The man
page confirms it "will not support such modes in the future", because `enc`
streams output before a tag could be checked and has nowhere to put the tag.
`-aes-256-cbc -pbkdf2 -iter N` (default 10000) gives confidentiality and no
authentication; a padding check succeeds by chance roughly 1 time in 256, which
is not integrity. Bolting on HMAC-then-verify is sane in theory and a
hand-rolled two-key protocol in practice. Availability is uneven too: `openssl`
is present in `postgres:*` (postgresql-common pulls ssl-cert which depends on
openssl) but **absent from `node:*-slim`** (checked on `node:26-slim`), whose
Dockerfile installs only ca-certificates, curl, wget, gnupg, dirmngr, xz-utils
and libatomic1, then purges.

**Restore path for the Node option, four steps.**

1. `docker compose exec -T db pg_dump -Fc -U app app > /dev/null` confirms the
   backup job's source still works.
2. `read -s BACKUP_PASSPHRASE` on the Mac, or read it from the password manager.
3. `node scripts/restore.mjs backups/2026-08-21.dump.enc > /tmp/restore.dump`,
   which fails loudly on any bad tag.
4. `docker compose exec -T db pg_restore -c -U app -d app < /tmp/restore.dump`,
   then `rm` the plaintext.

**Recommendation:** Node's built-in `crypto` with chunk-framed AES-256-GCM,
because it is the only option that is authenticated, truncation-detecting, and
restorable on this Mac with software that is already installed.

---

## 9. Charts

All versions and statuses verified 2026-08-21 (npm registry plus repo APIs).
Sizes are min+gzip from bundlephobia.

**Hand-rolled server SVG, zero dependencies, zero client bytes.** A server
component maps points to a `d` string and returns `<svg>`. Cost is roughly 60
lines for a line chart plus a moving-average path; you write your own tick
placement and nice-number rounding. You give up hover tooltips and crosshairs,
which need a client island. Accessibility is where it wins: you control the
whole tree.

```tsx
<figure>
  <svg viewBox="0 0 320 120" role="img" aria-labelledby="wt wd" preserveAspectRatio="none">
    <title id="wt">Weight, last 90 days</title>
    <desc id="wd">Down 3.4 kg, from 84.1 to 80.7.</desc>
    <path d={d} fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" />
  </svg>
  <table className="sr-only">{/* real accessible fallback: date and value rows */}</table>
</figure>
```

`currentColor` inherits `prefers-color-scheme` from CSS with no JS.
`vector-effect="non-scaling-stroke"` keeps a 1px line at 1px under
`preserveAspectRatio="none"`. Gate any transition behind
`@media (prefers-reduced-motion: reduce)`. The visually-hidden `<table>` is the
fallback that actually works in VoiceOver; `role="img"` plus `aria-label` alone
announces one string and hides the data.

**`d3-scale` 4.0.2 + `d3-shape` 3.2.0** (16.0 kB / 5.7 kB gz; both ESM-only,
`"type": "module"`, `sideEffects: false`). Mature but slow-moving: d3-scale last
published 2021-09-24, d3-shape 2022-12-20. Imported server-side only they ship
zero bytes to the iPhone and remove the fiddly parts of hand-rolling
(`scaleTime`, `scaleLinear`, `line().curve()`, `.ticks()`). This is the real
middle ground.

**visx 4.0.0** (all `@visx/*` published 2026-06-11; airbnb/visx not archived,
last commit 2026-06-22, 21.0k stars). `@visx/scale` 17.5 kB, `@visx/shape`
10.7 kB, `@visx/axis` 15.2 kB. Both tarballs unpacked: zero `"use client"`
directives, `@visx/scale` uses no React at all, and only `SplitLinePath.js`
touches hooks. `LinePath` is a plain function emitting `<path d>`, so it renders
inside an RSC with no client JS. d3 arrives via `@visx/vendor` 4.0.0, which
re-bundles 11 `d3-*` modules.

**recharts 3.10.1** (published 2026-07-25, repo active today). 147.5 kB gz,
7.11 MB unpacked, 11 runtime deps including `@reduxjs/toolkit`, `react-redux`,
`immer`, `victory-vendor`. The tarball contains zero `"use client"` directives,
so you must add the wrapper yourself; it can never be an RSC. React 19 is in
peers. Wrong tool for a 40px sparkline.

**`@observablehq/plot` 0.6.17**, npm publish 2025-02-14, 18 months stale (repo
still active). 128.0 kB gz, depends on full `d3`. SSR needs a DOM: docs specify
`document: new JSDOM("").window.document`, and jsdom 30.0.1 adds 6.76 MB and 21
deps to the image. `ariaLabel` / `ariaDescription` / `ariaHidden` are per-mark
channels, but they do not replace a data table.

**Recommendation:** Hand-rolled SVG in server components with `d3-scale` and
`d3-shape` used server-side only, because it ships zero client JavaScript to the
iPhone while giving VoiceOver a real `<table>` fallback that no chart library
provides.

---

## 10. Next.js and PWA

Verified 2026-08-21. `next` dist-tags: **`latest` 16.3.2** (published 2026-08-21
09:54 UTC), `canary` 16.4.0-canary.0, `preview` 16.3.0-preview.10. Peers:
`react` / `react-dom` `^18.2.0 || ^19.0.0`; current React is 19.2.8. Declared
engine: `node: ">=20.9.0"`, no upper bound. Turbopack is the default bundler for
`next dev` and `next build` since Next 16 stable; opt out with
`next build --webpack`.

**arm64 is not the risk. Node 26 is.** `@next/swc-linux-arm64-gnu` and `-musl`
are both published at 16.3.2 (`os: linux`, `cpu: arm64`, `libc: glibc` / `musl`)
and listed in `next`'s `optionalDependencies` at the exact version. The mismatch
trap is that `npm install` on the Mac resolves only `@next/swc-darwin-arm64`, so
never `COPY node_modules` from the host. Run `npm ci` inside the Linux stage, as
the official example does.

Node 26.7.0 is a Current release, not LTS until 2026-10-28 (nodejs/Release
schedule); Node 24.19.0 is Active LTS. Two open Node 26 problems in
vercel/next.js: **#96165** (RSC stream truncates, `ArrayBuffer is not
detachable`, from Node 26 raising `Buffer.poolSize` 8 to 64 KiB; closed by the
no-repro bot, not fixed) and **#97492** (open PR: Node 26 removed `SlowBuffer`,
breaking the vendored `jsonwebtoken` behind Preview Mode; Node 24 unaffected).
The official `examples/with-docker/Dockerfile` pins
`ARG NODE_VERSION=24.13.0-slim`. Pin `node:24-slim` in the container regardless
of the host's 26.7.

**`output: "standalone"`** emits `.next/standalone` with a `server.js` and a
pruned `node_modules`; `public` and `.next/static` are not copied
automatically. Runner stage, verbatim from the official example:

```dockerfile
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["node", "server.js"]
```

`HOSTNAME=0.0.0.0` is mandatory or the server binds loopback and the port
publish does nothing. In a monorepo-ish layout, tracing roots at the folder
containing `next.config`, so set
`outputFileTracingRoot: path.join(__dirname, '../../')` or traced files land
outside the copy.

**PWA plugins.** `next-pwa` 5.6.0 last published 2022-08-23, repo last pushed
2024-07-27, peer `next: ">=9"`. Dead, do not use. `@ducanh2912/next-pwa` 10.2.9
published 2024-09-18; its README says migrate to `@serwist/next`, so it is
retired. `@serwist/next` 9.5.12 (published 2026-07-22) is genuinely maintained,
App Router ready, peer `next: ">=14"`, but the Turbopack path is
`@serwist/turbopack`, and the repo's own `next-turbo-basic` example pins
`serwist@preview` (10.0.0-preview.14). Since Turbopack is now the default,
adopting Serwist means the preview line or `--webpack`.

**First-party support today (16.3.2)**: `app/manifest.ts` typed as
`MetadataRoute.Manifest` is stable. There is no `app/sw.ts` convention. The
official PWA guide has you hand-write `lib/service-worker.js` and register it
via `new URL('../lib/service-worker.js', import.meta.url)` with
`updateViaCache: 'none'`, serving `/sw.js` with
`Cache-Control: no-cache, no-store, must-revalidate`. New in 16.x is the
experimental `useOffline` hook (`next/offline` plus `experimental.useOffline`),
explicitly not recommended for production; it detects connectivity and retries
requests, it does not register a service worker.

**iOS specifics.** Installed only via Share then Add to Home Screen;
`beforeinstallprompt` does not exist on Safari. iOS honours
`display: "standalone"`, `start_url`, `scope`, `name` / `short_name`,
`theme_color`, `background_color`, and manifest `icons`, but still prefers
`<link rel="apple-touch-icon">` at 180x180, so ship both. An installed iOS PWA
gets a separate storage jar from Safari, so cache and IndexedDB do not carry
over from the browser tab; treat first launch as cold. Avoid the stale-shell
trap with `skipWaiting()` plus `clients.claim()`, a versioned precache name, and
deleting non-matching caches in `activate`. The classic failure is an app shell
pinned forever while the API returns new data.

**Recommendation:** Next.js 16.3.2 built and run inside `node:24-slim` arm64
with `output: "standalone"`, plus a hand-written service worker of about 40
lines, because it adds zero dependencies, dodges both open Node 26 defects, and
sidesteps Serwist's preview-only Turbopack path.

---

## Cross-cutting flags for the architect

These cut across sections and change decisions elsewhere. Read them before
picking anything.

**1. The container runs Node 24, not Node 26.** Next.js 16.3.2 has two open
Node 26 defects (vercel/next.js #96165, #97492) and the official Docker example
pins `24.13.0-slim`. Node 24.19.0 is Active LTS; Node 26 is Current until
2026-10-28. But `crypto.argon2Sync` landed in **Node 24.7.0**, so the base image
must be at least that. `node:24-slim` at 24.19 satisfies both. The host's Node
26.7 stays a tooling runtime only.

**2. WebAuthn forces a real HTTPS hostname. This is a human dependency.**
`http://192.168.1.x:3000` cannot do WebAuthn, ever, because a bare IP cannot be
an RP ID. iOS web push needs the same secure origin plus a Home Screen install.
A self-hosted box reached over the LAN by IP fails both features silently. The
hostname and certificate belong in `.forge/PREFLIGHT.md` and must be named at
the greenlight, not discovered in the build.

**3. Never copy `node_modules` from the Mac into the image.** `npm install` on
macOS arm64 resolves `@next/swc-darwin-arm64` and darwin prebuilds for every
native package. Run `npm ci` inside the Linux stage. This is the single most
likely arm64 failure in the whole stack, and it is entirely avoidable.

**4. `openssl` is absent from `node:*-slim`.** It is present in `postgres:*`.
Any backup or crypto step that assumes the openssl CLI in the app container is
broken before it runs. The Node `crypto` recommendation in section 8 is partly
what falls out of this.

**5. `web-push` is the one dependency with real maintenance risk.** Two and a
half years without an npm release, one maintainer, unreleased fixes on `master`.
It works, nothing has displaced it, and there is no better option. Pin it
exactly and treat a break as a known future cost.

**6. Sonnet 5 introductory pricing ends 2026-08-31**, going from $2/$10 to
$3/$15 per million tokens. If the monthly ceiling is calibrated this month
against Sonnet 5, it moves in ten days.

**7. Dependency count, if every recommendation is taken.** Runtime:
`next`, `react`, `react-dom`, `@anthropic-ai/sdk`, `drizzle-orm`, `pg`,
`web-push`, `@simplewebauthn/server`, `@simplewebauthn/browser`, `unpdf`,
`node-cron`, `d3-scale`, `d3-shape`. Behind the scanned-PDF branch only:
`@napi-rs/canvas`, `tesseract.js`. Dev only: `drizzle-kit`, `typescript`. Zero
extra software on the Mac. Argon2id, backup encryption, charts and the service
worker are all built-ins or hand-written.
