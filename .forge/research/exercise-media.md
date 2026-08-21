# Exercise demonstration media: the legal and concrete answer

Research date: 2026-08-21. Every URL below was fetched live on that date unless marked
UNVERIFIED. Every "last updated" string is the one the page itself prints, not an
inference.

Scope: one self-hosted PWA, one user, served over Tailscale Serve HTTPS on a private
`*.ts.net` name. English UI. 30 to 45 movements across three session types: gym cardio
(treadmill and bike), home calisthenics with a mat, active recovery walking.

The three hard rules this document has to satisfy, from `.forge/GOAL.md` section 10:

- Never download or rehost protected video.
- Store per media item: URL, author or source, date verified, licence or embedding mode,
  associated movement.
- External media restricted by a domain allowlist, with editorial validation in a personal
  admin UI.

---

## 0. The short version

1. **YouTube embedding is permitted** for this app, by name, in the consumer Terms of
   Service. No API key. No Google Cloud project. `youtube-nocookie.com` changes the cookies,
   not the terms, and you should use it. A private Tailscale hostname does not break it.
2. **Do not use the images from `yuhonas/free-exercise-db`.** The repo is Unlicense but the
   images are not the maintainer's to license. He says so in writing. The data is fine, the
   pictures are not. This is the single most important finding here.
3. **Everkinetic plus the CDC Growing Stronger GIFs cover most of the catalogue**, cleanly,
   at about 11 MB bundled. Everything else is gap filling from Wikimedia Commons.
4. **Three movements have no free asset anywhere: dead bug, wall sit, mountain climber.**
   Those get cue text plus an optional validated embed, or original artwork.
5. **NHS text is reusable under OGL v3.0, NHS exercise photos are not.** All seven photos on
   the NHS strength page are on the published exclusion list.
6. **The Borg RPE scale is licence gated.** Ship the CDC/PAG 0 to 10 relative intensity
   scale instead. It is public domain and says almost the same thing.

---

## 1. YouTube embedding

### 1.1 What the documents say, and when they say it

| Document | URL | Date the page prints |
|---|---|---|
| YouTube Terms of Service (US/en) | `https://www.youtube.com/t/terms?gl=US&hl=en` | Effective as of **December 15, 2023** |
| YouTube Terms of Service (FR variant) | `https://www.youtube.com/t/terms` | En date du **9 janvier 2026** |
| YouTube API Services Terms of Service | `https://developers.google.com/youtube/terms/api-services-terms-of-service` | Last updated **2026-04-28 UTC** |
| YouTube API Services Developer Policies | `https://developers.google.com/youtube/terms/developer-policies` | Last updated **2026-06-24 UTC** |
| Required Minimum Functionality (RMF) | `https://developers.google.com/youtube/terms/required-minimum-functionality` | Last updated **2026-04-28 UTC** |
| IFrame Player API reference | `https://developers.google.com/youtube/iframe_api_reference` | Last updated **2026-04-28 UTC** |
| Player parameters | `https://developers.google.com/youtube/player_parameters` | Last updated **2026-04-28 UTC** |
| Data API v3 getting started | `https://developers.google.com/youtube/v3/getting-started` | Last updated **2026-06-01 UTC** |
| Embed videos and playlists (privacy-enhanced mode) | `https://support.google.com/youtube/answer/171780?hl=en` | **no revision date printed** |
| Terms revision history (authoritative changelog) | `https://developers.google.com/youtube/terms/revision-history` | dated per entry |

Two cautions on those dates. The `developers.google.com` "Last updated" strings are page
build timestamps, not legal effective dates: the dated changelog is the revision history
page, and API ToS section 2.3 says changes take effect no sooner than 30 days after
posting. And the consumer ToS is geo-variant: the US English text is dated 2023-12-15 while
the French text is dated 2026-01-09. For a user in France, the French variant governs.

### 1.2 What is permitted

The consumer ToS grants embedding in one sentence, under "Permissions and Restrictions":

> "You may access and use the Service as made available to you, as long as you comply with
> this Agreement and applicable law. You may view or listen to Content for your personal,
> non-commercial use. **You may also show YouTube videos through the embeddable YouTube
> player.**"

A private single-user fitness app is squarely personal, non-commercial use. Restriction 9
forbids using the Service "to view or listen to Content other than for personal,
non-commercial use (for example, you may not publicly screen videos or stream music from
the Service)". Showing yourself a squat demo on your own tailnet is the opposite of a public
screening.

Auth-gating is blessed explicitly. Developer Policies, Playback Integrity:

> "For clarity, if your API Client's normal functionality requires a certain action that is
> not specific to YouTube API Services, such as login or age verification, that
> functionality is allowed."

That matters here, because this app is behind a passkey.

### 1.3 What is forbidden

**Downloading, caching, offline copies.** Developer Policies section III.E:

> "You and your API Clients must not, and must not encourage, enable, or require others to:
> **download, import, backup, cache, or store copies of YouTube audiovisual content** without
> YouTube's prior written approval, **make content available for offline playback**, or use
> any aspect of the YouTube API Services to facilitate or promote copyright infringement..."

Reinforced by consumer ToS restriction 2, against circumventing "features that (a) prevent
or restrict the copying or other use of Content". `yt-dlp` into a local cache violates both.
Do not build it, not even for one user, not even privately. This kills any "cache the
workout for the gym basement" feature, and that constraint belongs in `.forge/PREFLIGHT.md`
at the greenlight rather than as a surprise mid-build.

**Overlays and player modification.** RMF, "Overlays and frames":

> "You must not display overlays, frames, or other visual elements in front of any part of a
> YouTube embedded player, including player controls. Similarly, you must not use overlays,
> frames or other visual elements to obscure any part of an embedded player, including
> player controls."

Developer Policies section III.I adds "modify, build upon, or block any portion or
functionality of a YouTube player". Concretely, for a guided-session screen: the rep counter,
the set timer and the rest clock go **beside** the player, never on top of it. No scrim, no
CSS crop, no custom play chrome.

**Stripping branding.** Section III.F:

> "You and your API Clients must not... interfere with or obscure any attribution provided by
> YouTube, including attribution provided via or shown in embedded YouTube players."

Section III.I: "you must not remove, obscure, alter, or disable any links that appear in
YouTube players". Note that `modestbranding` is deprecated and has no effect as of the
2023-08-15 revision-history entry. Do not plan around it.

**Proxying.** Serving the video bytes through your own host is "download... or store copies"
under III.E and "access, reproduce, download, distribute, transmit" under consumer ToS
restriction 1. The iframe must be fetched by the browser, directly, from Google.

**Other RMF limits worth encoding as lint rules:** player viewport at least 200x200 px
(16:9 recommended at least 480x270); no autoplay until more than half the player is visible;
no audio-only or hidden background player; any thumbnail that starts playback at least
120x70 px.

### 1.4 youtube-nocookie.com

Official page: `https://support.google.com/youtube/answer/171780?hl=en` (no revision date
printed).

> "The Privacy Enhanced Mode of the YouTube embedded player prevents the use of views of
> embedded YouTube content from influencing the viewer's browsing experience on YouTube."
> ... "Change the domain for the embed URL in your HTML from `https://www.youtube.com` to
> `https://www.youtube-nocookie.com`."

Measured difference, live:

```
curl -sI https://www.youtube.com/embed/<id>          | grep -ci set-cookie  ->  6
curl -sI https://www.youtube-nocookie.com/embed/<id> | grep -ci set-cookie  ->  0
```

The regular host sets `YSC`, `VISITOR_INFO1_LIVE`, `VISITOR_PRIVACY_METADATA`,
`__Secure-YNID`, `__Secure-YEC`, `__Secure-ROLLOUT_TOKEN` on first load. The nocookie host
sets none. Storage can still be written once playback starts, so the name slightly
overpromises.

**Does it change the terms? No.** There is no separate ToS for `youtube-nocookie.com`. Same
agreement, same Developer Policies, same RMF. It is a player mode, not a different legal
product. Use it anyway: strictly better privacy, zero cost, and it fits the "data stays on
the Mac mini" posture in the brief.

### 1.5 Does embedding require an API key?

| What you do | Key needed | Evidence |
|---|---|---|
| Plain `<iframe src="https://www.youtube-nocookie.com/embed/ID">` | **No** | `/embed/ID` returns HTTP 200 with no credential. Nothing in `player_parameters` mentions a key. |
| IFrame Player API JS (`enablejsapi=1`) | **No** | The "Requirements" section of `iframe_api_reference` lists only postMessage support, a 200x200 viewport, and an `onYouTubeIframeAPIReady` function. Zero mentions of key, credential or quota on the whole page. Developer Policies: "The YouTube IFrame Player API service, which lets you embed videos in a website, does not require authorization just as users do not need to log in to the YouTube website to watch a video." |
| oEmbed `https://www.youtube.com/oembed` | **No** | Verified: 200 OK with no credential, and CORS-enabled. |
| **YouTube Data API v3** | **Yes** | Verified: `GET https://www.googleapis.com/youtube/v3/videos?part=status&id=...` with no key returns **HTTP 403**, "Method doesn't allow unregistered callers (callers without established identity). Please use API Key or other form of API consumer identity to call this API." |

So the entire media feature (embed, player control, and non-embeddable detection) ships with
**no Google Cloud project and no API key**. That is one fewer human dependency at the
greenlight. A key is needed only if you want search or metadata from the Data API, and this
app does not: the admin pastes a URL.

One contradiction worth flagging rather than resolving. Developer Policies section III.D
says the "YouTube embedded player" documents steps for creating API Credentials, and the
next paragraph says the IFrame Player API "does not require authorization". Empirically no
key is needed. Do not cite the first sentence as evidence a key is required.

### 1.6 Exact CSP origins

The critical fact: a cross-origin iframe is a separate browsing context with its own CSP.
Your policy governs the iframe **URL**, not what loads inside it. Verified: the
`/embed/` document ships its own `Content-Security-Policy` header, and that policy, not
yours, governs `googlevideo.com`, `i.ytimg.com`, `/youtubei/v1/player` and the rest. You
never need `*.googlevideo.com` and you never need `media-src` for this.

Recommended policy for the app:

```
default-src   'self';
base-uri      'self';
object-src    'none';
frame-ancestors 'none';
form-action   'self';
script-src    'self' 'nonce-{N}' 'strict-dynamic';
style-src     'self' 'nonce-{N}';
img-src       'self' data: blob: https://i.ytimg.com https://i9.ytimg.com;
media-src     'self';
connect-src   'self' https://www.youtube.com;
frame-src     https://www.youtube-nocookie.com;
```

Line by line:

- **`frame-src https://www.youtube-nocookie.com`** is the only origin strictly required.
  Add `https://www.youtube.com` only if you also embed from the non-nocookie host. This app
  should not.
- **`youtu.be` is never a frame origin.** Verified: `https://youtu.be/ID` returns HTTP 303 to
  the watch page and carries `X-Frame-Options: SAMEORIGIN`. It is a share-link shortener.
  Accept it in the admin paste box, normalise it to `/embed/ID`, never put it in an iframe.
  The same is true of `/watch?v=`, which also sends `X-Frame-Options: SAMEORIGIN`.
- **`script-src`**: `https://www.youtube.com/iframe_api` is not a redirect (verified: HTTP
  200, `text/javascript`). It is a ~700 byte loader that injects a second script from
  `https://www.youtube.com/s/player/<hash>/www-widgetapi.vflset/www-widgetapi.js`, same host.
  It propagates the nonce from `document.currentScript`, so with a nonce plus
  `'strict-dynamic'` you need **no host entry at all**. Without nonces, add
  `https://www.youtube.com`. Never pin the full player path: the build hash rotates.
- **`img-src`**: only needed if the app paints its own poster thumbnails. Verified:
  `https://i.ytimg.com/vi/ID/hqdefault.jpg` returns 200 with
  `access-control-allow-origin: *`. `maxresdefault.jpg` also 200. `i9.ytimg.com` serves
  signed and resized variants and 404s on bare paths, so include it defensively but request
  `hqdefault.jpg` from `i.ytimg.com`.
- **`connect-src`**: zero origins needed for a pure iframe. Needed only if the browser calls
  oEmbed directly. Since the admin UI is the only place that validates, prefer validating
  server-side from the Mac mini and drop this line.

Also required by RMF, and easy to break:

```
Referrer-Policy: strict-origin-when-cross-origin
```

> "API Clients that use the YouTube embedded player (including the YouTube IFrame Player API)
> must provide identification through the HTTP Referer request header... YouTube recommends
> using `strict-origin-when-cross-origin` Referrer-Policy."

A blanket `Referrer-Policy: no-referrer`, which is a common hardening default and tempting
for a health app, **breaks RMF compliance**. Set it per-response or scope the strict policy
away from pages that carry a player.

### 1.7 Does the embed work from a private Tailscale hostname?

**Yes.** Four independent confirmations.

1. **Nothing requires public accessibility.** The strings "publicly accessible" and "publicly
   available" appear **zero times** across the API ToS, the Developer Policies and the RMF.
2. **The embed endpoints are deliberately framable from anywhere.** Verified:
   `https://www.youtube.com/embed/ID` and `https://www.youtube-nocookie.com/embed/ID` send
   **no `X-Frame-Options` and no `frame-ancestors`**. By contrast `/watch?v=` and `youtu.be`
   both send `X-Frame-Options: SAMEORIGIN`.
3. **YouTube accepts the private origin at the HTTP layer.** Verified: requests with
   `Referer: https://box.tailnet-name.ts.net/`, with `Referer: http://box:3000/`, and with
   no Referer at all, all return HTTP 200. Requests with
   `?enablejsapi=1&origin=https://box.tailnet-name.ts.net` and with
   `?enablejsapi=1&origin=http://box:3000` both return HTTP 200.
4. **oEmbed reflects the private origin in CORS.** Verified: `Origin:
   https://box.tailnet-name.ts.net` returns
   `access-control-allow-origin: https://box.tailnet-name.ts.net`, and it does the same for
   `http://box:3000`. No proxy required.

**The `origin=` parameter.** From `iframe_api_reference`:

> "As an extra security measure, you should also include the `origin` parameter to the URL,
> specifying the URL scheme (`http://` or `https://`) and full domain of your host page as the
> parameter value. **While `origin` is optional**, including it protects against malicious
> third-party JavaScript being injected into your page and hijacking control of your YouTube
> player."

It is the `targetOrigin` for the postMessage channel between page and player. It is a
browser-side string comparison against the parent's real `window.location.origin`. YouTube
never resolves it in DNS, never connects to it, and there is no allowlist to register. So a
`.ts.net` name is fine.

The real failure mode is a mismatch: wrong scheme, missing port, or a trailing slash makes
`onReady` and `onStateChange` never fire while the video still plays, which is a maddening
bug to chase. Never hardcode it:

```js
`https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&rel=0&origin=${encodeURIComponent(location.origin)}`
```

That is correct on `localhost:3000`, on `http://box:3000`, and on
`https://box.tailnet-name.ts.net` with no config change. If you use a plain iframe with no
`enablejsapi=1`, omit `origin` entirely.

**Serve over HTTPS, not the bare MagicDNS name.** Tailscale docs
(`https://tailscale.com/kb/1153/enabling-https`, Dec 10, 2025):

> "Using `tailscale cert` (with `sudo` as needed), Tailscale will automatically request a
> certificate for this machine on this domain, using **Let's Encrypt**."
> ... "You cannot obtain an HTTPS URL to go to a bare hostname, such as
> `https://machine-name`."

These are genuine publicly-trusted certificates, so `https://box.tailnet-name.ts.net` is a
full secure context. That matters beyond YouTube: `navigator.wakeLock`, which a workout timer
wants so the phone does not sleep mid-set, plus Service Workers for the PWA, plus the
Clipboard API, are all unavailable on `http://box:3000`. Chrome grants secure-context status
to `localhost` but **not** to a bare LAN hostname. The brief already mandates Tailscale Serve
HTTPS, and this is a second reason it is right.

One privacy note the brief should carry: Tailscale's own docs warn that
"All TLS certificates on the web are recorded in the Certificate Transparency (CT)
append-only public ledger... Notably, this includes the fully qualified domain name of your
devices." That is a Tailscale property, not a YouTube one, but it is worth knowing that the
machine's FQDN becomes public.

**Offline: embeds do not work.** The iframe, the player JS and the media stream are three
public-internet fetches originating from the **viewer's browser**. A Mac mini with internet
does not help an iPhone without it. With no internet you get an empty frame, and you may not
fix it by caching. This is the argument for bundling local assets as the primary media and
treating video as the optional layer, which is what the catalogue in section 6 does.

### 1.8 Validating an embed with no API key

`GET https://www.youtube.com/oembed?url=<watch or youtu.be url>&format=json`

Empirically characterised across 358 real video IDs from eight searches, of which 23 returned
401:

| HTTP | Meaning | Action in the admin UI |
|---|---|---|
| **200** | Embeddable. Returns `title`, `author_name`, `author_url`, `thumbnail_url`, and a ready-made iframe snippet. | Accept. Store the metadata (permitted: this is API Data, not audiovisual content). |
| **401** | Not embeddable: either age-restricted or `playableInEmbed: false`. 401 does not distinguish the two. | Reject: "the owner does not allow embedding, or it is age-restricted." |
| **404** | Deleted, private, or region-blocked from the requesting IP. | Reject: "unavailable or removed." |
| **400** | Malformed URL or nonexistent ID. | Reject: "that is not a YouTube link." |

**You cannot detect this from the embed endpoint.** Verified: `GET /embed/ID` returns HTTP
200 for every case above, including both 401 classes, because `playabilityStatus` is fetched
by the player at runtime via `/youtubei/v1/player` and is not in the served HTML. oEmbed is
the only keyless preflight that works.

**Validate from the Mac mini, not from CI.** oEmbed is geo-sensitive to the *requesting*
IP, not the viewer's. A video that 404s from a US runner may be fine from Paris and vice
versa. Since the box and the human are in the same place, validating server-side on the box
is both correct and simpler.

The support page also states, for age-restricted content: "Age-restricted videos can't be
watched on most 3rd party websites. These videos will redirect viewers back to YouTube when
played."

This oEmbed call is also how you satisfy "date verified" in the provenance record: store the
HTTP status and the timestamp, and re-run it on a schedule so a dead embed surfaces as a
lint failure rather than as a black rectangle mid-workout.

### 1.9 Honest ambiguities

Do not overclaim these at the greenlight. State them and move on.

1. **Does a bare iframe make you an "API Client"?** The phrase "embedded player" appears
   **zero times** in the API Services ToS, and the definition of "YouTube API Services"
   neither includes nor excludes it. The Developer Policies and the RMF plainly assume it
   does. Build to the stricter reading, which is what this document does.
2. **The published privacy policy duty** (Developer Policies III.A.2) is written absolutely,
   with no carve-out for a single-user private app. A one-user app with no published policy
   is technically non-conforming. Cost of compliance is one static page; write it.
3. **The audit clause** (III.H) requires providing YouTube with accounts to review
   in-production API Clients. A tailnet-only app cannot be reviewed without provisioning
   tailnet access. No realistic enforcement surface, but it is not squarely satisfied.
4. **Geo-variant terms.** For a user in France, pull the French variant, dated 2026-01-09,
   not the US text dated 2023-12-15.

### 1.10 Verdict

Green: embed third-party fitness videos via the official iframe, on nocookie, behind the
passkey, on the `.ts.net` name, with no API key. Red: any download or cache, any overlay on
the player, any branding removal, any proxying, any audio-only or background player.

Video is the **optional third layer** for this app, under the cue text and the bundled still
or animation, precisely because it is the only layer that breaks without internet and the
only layer whose rights you do not hold.

---

## 2. Openly licensed media that can actually be self-hosted

All counts below are measured, on 2026-08-21, not quoted from a README.

### 2.1 Summary table

| Source | Licence | What is there | Bundle in repo? |
|---|---|---|---|
| **Everkinetic** `github.com/everkinetic/data` | **CC BY-SA 4.0** (full text in repo) | 537 SVG / 541 PNG, 269 complete exercise pairs, 10.2 MB for all SVG | **YES. Primary source.** |
| **CDC Growing Stronger GIFs** on Wikimedia Commons | **Public domain** (US federal) | 22 animated GIFs, **439 KB total** | **YES. No attribution required.** |
| **Wikimedia Commons**, individual files | CC0 / PD / CC BY / CC BY-SA, per file | gap fillers: bird dog, glute bridge, jumping jacks, high knees, burpee, treadmill, bike | **YES, per file, with per-file attribution.** |
| **wger** `wger.de` images | CC BY-SA 4.0 (277) / 3.0 (88) | 365 images, only 268 of 873 exercises have any | **YES but only the 278 with a named author.** |
| **free-exercise-db** `dist/exercises.json` | **Unlicense** | 873 exercises of structured text | **YES, text only.** |
| **free-exercise-db** images | **none, and not the maintainer's to give** | 1,746 JPGs, 94 MB | **NO. Not bundle, not hotlink, not at all.** |
| **Openclipart** | CC0 | 549 "exercise", 63 "plank", 23 "squat", 6 "push-up" | YES, but icons, not demos |
| **OpenMoji** | CC BY-SA 4.0 | emoji only | YES, zero form value |
| **unDraw** | custom, **bans redistribution in packs** | illustrations | **NO** |
| **MuscleWiki** | all rights reserved, explicit | | **NO** |
| **ExRx.net** | commercial, all rights reserved | | **NO** |
| **ExerciseDB / RapidAPI** and its GitHub mirrors | paid, AGPL wrapper does not free the media | | **NO** |

### 2.2 Everkinetic: the primary source

`https://github.com/everkinetic/data`. Alive: default branch `main`, last push **2026-01-21**,
113 stars, not archived, homepage `db.everkinetic.com`. `LICENSE.md` is the full
**Creative Commons Attribution-ShareAlike 4.0 International** text; GitHub's detector agrees
(`CC-BY-SA-4.0`). Single named rights holder, created by Greg Priday from everkinetic.com.
That combination, one owner and an explicit full licence text in-repo, is what makes it safe
in a way none of the aggregator repos are.

Measured from the full recursive git tree (3,901 blobs, not truncated):

| Path | Files | Bytes |
|---|---|---|
| `dist/svg/` | **537** | 10,653,234 (10.2 MB), avg 19.8 KB |
| `dist/png/` | **541** | 23,068,701 (22.0 MB), avg 42.6 KB |

`exercises.json` (396 KB) holds **293 exercises**. Files are named
`{id}-relaxation` and `{id}-tension`, meaning start and end position, which is exactly the
two-frame structure a coaching card wants. Cross-matching the tree against the JSON:
**269 of 293 exercises have a complete SVG pair**, 28 of them `equipment: ["body", ...]`.

Verified render: `dist/png/0077-relaxation.png` is 28,940 bytes, PNG 928x535 8-bit
grayscale, clean black line art of a man in a push-up with the working muscles sketched in,
no background. SVG means it scales on a Retina iPhone and can be recoloured for dark mode.

**Correction worth making loudly, because the obvious reading of the index is wrong.** I
parsed all 293 records of `exercises.json` and filtered on `equipment` containing `body`.
Everkinetic's bodyweight set is **much narrower than its exercise count suggests**. There is
**no bodyweight squat, no bodyweight lunge, no front plank, no standing calf raise and no
unloaded step-up.** All 25 squat records and all 8 lunge records are barbell, dumbbell,
Smith machine or hack machine. The `0114` to `0161` range is the *loaded* squat and lunge
family, not a bodyweight one.

The genuinely usable bodyweight records, all verified `equipment: ["body"]`:

| id | name | use here |
|---|---|---|
| `0077` | push-ups | push-up |
| `0073` | push-ups close and wide hand versions | push-up variants |
| `0075` / `0301` | push-up feet elevated | push-up progression |
| `0188` | close triceps pushup | push-up variant |
| `0113` | side-plank | side plank |
| `0109` | bridging | glute bridge |
| `0105` | supermans | superman |
| `0287` | bent-knee-hip-raise | core |
| `0291` | crunches | core |
| `0275` | donkey-calf-raises | calf (bent-over variant, second choice) |
| `0021` | flat-bench-leg-raises | core |
| `0027` | stationary-abdominal-draw-in | bracing cue |
| `0162` / `0172` | bench dips / tricep dips using body weight | triceps |
| `0054` | chest-dips | requires parallel bars |

So Everkinetic contributes roughly **14 usable movements**, not 269. It owns push-up, side
plank, glute bridge and superman. **The CDC Growing Stronger set has to carry squat, lunge,
wall push-up, calf raise and step-up**, which it does, and in public domain. That reshuffle
is the practical shape of the media plan in section 6.

**Absent from Everkinetic: bird dog, dead bug, mountain climber, burpee, wall sit, jumping
jack, bodyweight squat, bodyweight lunge, front plank.**

Fetch: `git clone --depth 1 https://github.com/everkinetic/data`, take `dist/svg/`, drop the
rest. Or fetch individual files from
`https://raw.githubusercontent.com/everkinetic/data/main/dist/svg/{id}-{relaxation|tension}.svg`.

Attribution, one line in an About screen covers all 537 files:

```
Illustrations by Everkinetic (http://db.everkinetic.com), licensed CC BY-SA 4.0
(https://creativecommons.org/licenses/by-sa/4.0/).
```

### 2.3 CDC "Growing Stronger" GIFs: 22 animations, public domain, 439 KB

The best find in this research. US federal government work on Wikimedia Commons,
`attribution_required = false`. Genuinely animated (frame counts sampled: 7, 7, 5, 8).
Clean colour cartoon of an adult on a white background.

| Movement | File (suffix `-CDC strength training for older adults.gif`) | Bytes | Dims |
|---|---|---|---|
| Squat | `Squat-...` | 18,407 | 220x275 |
| Lunge | `Lunge-...` | 27,048 | 200x292 |
| Wall push-up | `Wallpushup-...` | 19,551 | 290x250 |
| Abdominal curl | `Abdominal curl-...` | 50,085 | 300x176 |
| Floor back extension (superman) | `Floor back extensions-...` | 63,111 | 340x112 |
| Toe stand (calf raise) | `Toe stand-...` | 10,643 | 160x275 |
| Step up | `Step up-...` | 21,319 | 145x275 |
| Pelvic tilt | `Pelvic tilt-...` | 5,477 | 250x200 |
| Knee curl | `Knee curl-...` | 17,245 | 212x275 |
| Knee extension | `Knee extension-...` | 20,895 | 225x275 |
| Hip abduction | `Hip abduction-...` | 25,818 | 176x300 |
| Back stretch | `Backstretch-...` | 16,957 | 200x342 |
| Chest stretch | `Chest stretch-...` | 9,819 | 200x275 |
| Hamstring stretch | `Hamstring stretch-...` | 33,041 | 200x275 |
| Quad stretch | `Quad stretch-...` | 21,738 | 199x279 |
| plus biceps curl, overhead press, chest press, upward row, grip strength, finger marching x2 | | | |

**Total for all 22: 449,623 bytes (439 KB).**

Verified direct URLs:
- `https://upload.wikimedia.org/wikipedia/commons/a/a9/Squat-CDC_strength_training_for_older_adults.gif`
- `https://upload.wikimedia.org/wikipedia/commons/a/af/Lunge-CDC_strength_training_for_older_adults.gif`
- `https://upload.wikimedia.org/wikipedia/commons/7/7a/Wallpushup-CDC_strength_training_for_older_adults.gif`
- `https://upload.wikimedia.org/wikipedia/commons/2/2f/Floor_back_extensions-CDC_strength_training_for_older_adults.gif`

No attribution legally required. Give one anyway, because it costs nothing and it is true:

```
Centers for Disease Control and Prevention, "Growing Stronger: Strength Training for Older
Adults" (public domain).
```

One caveat worth stating plainly, because it cuts the other way from the images. The
**Growing Stronger PDF text** is *not* public domain: the book is
"Copyright (c) 2002 by Tufts University", distributable only whole and unaltered
("please credit the authors and Tufts University and do not change any of the content").
The GIFs on Commons are a separate, PD-tagged federal derivative. So: use the pictures
freely, and treat the book's wording as paraphrase-only. Do not conflate them.

Also note the source population is older adults. The art reads as calm and clinical rather
than athletic, which actually suits the Apple Health taste reference in the brief better
than a gym-bro photo would. For a 38-year-old, pair the GIF with a harder variant in the
progression ladder so the movement does not read as remedial.

### 2.4 Wikimedia Commons gap fillers

Verified individual files. Direct URLs are under
`https://upload.wikimedia.org/wikipedia/commons/{h0}/{h0h1}/{Underscored_Filename}`.

| Movement | File page | Licence | Author | Path | Size / dims |
|---|---|---|---|---|---|
| **Bird dog** | `File:Birddog exercise.svg` | CC BY-SA 4.0 | Pk0001 | `/0/0a/Birddog_exercise.svg` | 23,509 B, 1233x783 |
| **Glute bridge** | `File:Bridge exercise.svg` | CC BY-SA 4.0 | Pk0001 | `/b/ba/Bridge_exercise.svg` | 19,264 B, 1233x783 |
| **Plank** | `File:Plank exercise.svg` | CC BY-SA 4.0 | Pk0001 | `/3/35/Plank_exercise.svg` | 14,811 B, 1233x783 |
| Crunch | `File:Crunch exercise.svg` | CC BY-SA 4.0 | Pk0001 | `/6/67/Crunch_exercise.svg` | 24,466 B, 1233x783 |
| Isometric | `File:Isometric exercise.svg` | CC BY-SA 4.0 | Pk0001 | `/3/39/Isometric_exercise.svg` | 26,389 B, 1233x783 |
| Glute bridge (photo) | `File:Glute-bridge.png` | CC BY-SA 4.0 | Marianne Gilbak | `/3/34/Glute-bridge.png` | 100,487 B, 1080x1080 |
| **Jumping jack** | `File:Jumpingjacks.gif` / `File:Jumpingjacks wbs.gif` | CC BY-SA 4.0 | Wensceslao | `/a/ac/Jumpingjacks.gif` | 382,580 / 69,254 B |
| **High knees** | `File:High knees.gif` / `File:Highknees wbs.gif` | CC BY-SA 4.0 | Wensceslao | `/4/4e/High_knees.gif` | 118,106 / 9,950 B |
| Squat (anim) | `File:Squats.gif` / `File:Squats wbs.gif` | CC BY-SA 4.0 | Wensceslao | `/e/e6/Squats.gif` | 559,677 / 114,630 B |
| **Burpee** | `File:Burpees.gif` / `File:Burpees WBS.gif` | CC BY-SA 4.0 | Wensceslao | `/a/ac/Burpees.gif` | 800,809 / 146,308 B |
| Burpee (compact) | `File:Burpee.gif` | CC BY-SA 4.0 | Taco fleur | `/d/df/Burpee.gif` | 208,600 B, 320x192 |
| Skier jacks | `File:Skierjacks.gif` | CC BY-SA 4.0 | Wensceslao | `/2/23/Skierjacks.gif` | 462,144 B |
| Toe touches | `File:Touchankles.gif` | CC BY-SA 4.0 | Wensceslao | `/d/d2/Touchankles.gif` | 103,656 B |
| Push-up (diagram) | `File:Push up (PSF).png` | **Public domain** | Pearson Scott Foresman | `/6/6e/Push_up_%28PSF%29.png` | 143,125 B, 3632x688 |
| Push-up (anim) | `File:Liegestuetz02 ani fcm.gif` | CC BY-SA 4.0 | Frank C. Müller | `/b/b8/Liegestuetz02_ani_fcm.gif` | 3,028,448 B, 1196x806 |
| Back extension (anim) | `File:Roman chair (hyperextension) animation.gif` | CC BY-SA 4.0 | O'Dea | `/0/06/Roman_chair_%28hyperextension%29_animation.gif` | 42,698 B, 765x900 |
| **Treadmill** | `File:Man on a Treadmill GIF Animation Loop.gif` | CC BY-SA 4.0 | VideoPlasty | `/0/0a/Man_on_a_Treadmill_GIF_Animation_Loop.gif` | 815,421 B |
| **Exercise bike** | `File:Man on an Exercise Bike GIF Animation Loop.gif` | CC BY-SA 4.0 | VideoPlasty | `/a/ad/Man_on_an_Exercise_Bike_GIF_Animation_Loop.gif` | 808,676 B |
| Exercise bike (tiny) | `File:Motionscykel Sjukgym.gif` | **CC BY 3.0** | Nisse WC | `/5/5e/Motionscykel_Sjukgym.gif` | 2,931 B, 150x200 |
| Cycling | `File:Theqcycle.gif` | CC BY-SA 3.0 | Neveu, Curtis | `/e/ed/Theqcycle.gif` | 205,197 B |

Two whole collections worth knowing:

- **VideoPlasty** has **266 CC BY-SA 4.0 animated GIF loops** on Commons, including
  `Man Walking`, `Man Jogging`, `Man Running`, `Man Doing Push Ups`, `Man Doing Sit Ups`,
  `Man Doing Yoga`, all suffixed `GIF Animation Loop.gif`. These are flat-illustration
  loops, visually coherent as a set, and a good fit for the cardio and walking cards where
  Everkinetic has nothing.
- **Everkinetic on Commons: 1,084 files**, all tagged CC BY-SA **3.0** because they were
  uploaded in the 3.0 era. Same art as the GitHub repo. Prefer the GitHub repo: 4.0 is the
  cleaner licence and the repo has the full text in it.

Two traps:

- `File:Bodyweight Squats.gif` and `File:Narrow Push Ups.gif` (Danielflefil, CC BY-SA 4.0)
  are **37 MB and 28 MB**. Do not commit them raw. Re-encode or skip.
- `upload.wikimedia.org` blocks generic user agents. Send a `User-Agent` with contact info
  on the fetch script.

**Genuinely absent from Commons: dead bug, wall sit, mountain climber (searching returns
actual mountaineers), hip thrust.**

### 2.5 wger

`https://wger.de`. The API needs **no auth for reads**: every read endpoint returns HTTP 200
with no token. Note the HTML site sits behind an Anubis proof-of-work wall, but `/api/v2/`
does not.

Current endpoints, measured:

- `/api/v2/exercise/?format=json` -> `count: 860`
- `/api/v2/exerciseinfo/?format=json` -> `count: 873` (the current fat endpoint)
- `/api/v2/exercisebaseinfo/` -> **HTTP 404, removed.** Do not use.
- `/api/v2/exerciseimage/?format=json` -> `count: 365`
- `/api/v2/video/?format=json` -> `count: 78`
- `/api/v2/license/?format=json` -> 5 licences: CC-BY-SA 3 (1), CC-BY-SA 4 (2), CC0 (3),
  CC-BY 4 (4), ODbL (5)

Licence split, measured across all 873 exercises and all 365 images:

| Layer | Counts |
|---|---|
| Exercise **data** (text) | 724 CC-BY-SA 4.0, 128 CC-BY-SA 3.0, 21 CC0 |
| Exercise **images** | 277 CC-BY-SA 4.0, 88 CC-BY-SA 3.0, **0 CC0, 0 PD** |
| Coverage | only **268 of 873 exercises (30.7%)** have any image |
| AI-generated flag | 330 false, **35 true** (`is_ai_generated`) |

The app code is AGPL-3.0. **The AGPL does not touch the media.** Data licence documented at
`https://github.com/wger-project/docs/blob/master/docs/index.rst`: "The initial exercise and
ingredient data is licensed additionally under a Creative Commons Attribution Share-Alike
3.0 (CC-BY-SA 3.0)."

**The blocker: 87 of 365 images have an empty `license_author`.** 84 of those are CC-BY-SA
4.0. CC-BY-SA requires attributing the creator, and where wger does not know who it is, you
cannot comply. Those 87 are unusable, full stop. Filter on
`license_author != ""` before you fetch anything. Top named authors: Everkinetic (83),
Franpol (30), Davidgj32 (23), philip (16).

**Size:** originals average 1,097,162 bytes, so all 365 is about 381 MB. Do not bundle raw.
The API's `thumbnails` object exposes `small` (200x200) and `medium` (400x400); the 400x400
sample averages 65,589 bytes, so the whole usable set is about 23 MB. That is the only sane
path.

**No bulk image dump exists.** `wger-project/data` (21 KB, last push 2024-05-29) holds only
zipped *ingredient* fixtures. The main repo's exercise fixtures are text only. Images are
pulled at runtime by `manage.py download-exercise-images`. So bulk acquisition means
paginating the API yourself.

Bodyweight coverage with usable images is thin: Plank (id 458, 9 images), Bird Dog (1572),
Jumping Jacks (320), Marching High Knees (1965), Push-Up (1551), Standing Calf Raises (622),
Double Leg Calf Raise (1243), Dips (194, **CC0**), Crunches (167). **Zero images** for glute
bridge, dead bug, superman, mountain climber, burpee, side plank, hip thrust. No wall sit
record at all. And the two most tempting entries, High knees (983) and Lunges (984), both
have a **blank author** and are therefore unusable.

Verdict: **safe to bundle, but only the 278 named-author images, at 400x400, and only where
Everkinetic and the CDC set leave a gap.** For this catalogue that is a small handful, so
wger is a backstop rather than a pillar. Attribution per image:

```
{license_author}, "{exercise_name}", {license} (https://creativecommons.org/licenses/by-sa/4.0/),
via wger.de, https://wger.de/en/exercise/{exercise_id}/view/
```

### 2.6 free-exercise-db: take the data, refuse the images

`https://github.com/yuhonas/free-exercise-db`. Repo 97,807 KB, last push 2026-05-24, 1,783
stars. `LICENSE.md` is The Unlicense (note `/LICENSE` is a 404, the file is `LICENSE.md`).
`dist/exercises.json` is 1,001,472 bytes, **873 exercises**, **1,746 image refs** (exactly 2
per exercise). The 1,746 JPGs total **94 MB**. The JSON schema has **no licence field at
all**.

**The images are not the maintainer's to license, and the provenance chain is documented in
the repos themselves:**

1. `yuhonas/free-exercise-db` is a fork of `wrkout/exercises.json`, stated in its own README.
2. `wrkout/exercises.json` `CONTRIBUTING.md`, verbatim: *"Currently all exercises have two
   images, these have been scrapped off the internet, therefore l do not own the copy right
   for these images and would advise against using them in comercial projects."*
3. wrkout issue **#305** (open), 2024-06-05: reverse image search points to bodybuilding.com,
   quotes their ToU, concludes *"the license status is clearly infringing."*
4. free-exercise-db issue **#2**, the maintainer, 2023-06-27: *"I actually have no idea where
   the images are from or if they are royalty free so usage would be at your own risk."*
5. free-exercise-db issue **#13** (open), 2026-08-01: *"some of these appear to be from
   ExRx.net."* Maintainer, 2026-08-02: *"A good place to start if we're going to drop the
   current images could be to swap with placeholders."*

Independent confirmation: `exercises/Plank/0.jpg` downloads as an 850x567 studio photograph
of a male model in a blue tank top and Nike shoes against a black-padded, red-trimmed gym
wall. That is commercial exercise-database photography, not open line art.

An Unlicense declaration on a repo covers the maintainer's own structuring work. It cannot
launder third-party photographs. This is the trap that catches every fitness-app tutorial on
the internet, and it would fail the "provenance record per media item" requirement in
`.forge/GOAL.md` on its own terms: there is no author to record.

**Verdict on the data: SAFE TO BUNDLE.** Unlicense, public domain dedication, no attribution
required, genuinely good 873-exercise text dataset (name, instructions, primary and
secondary muscles, equipment, level, mechanic, force). Strip the `images` arrays on import,
and add a schema constraint that rejects any media row whose `author` is null so this can
never creep back in.

**Verdict on the images: NOT SAFE.** Not bundle, not hotlink, not at all.

The same verdict applies to every downstream mirror: `JahelCuadrado/ExerciseGymGifsDB`
(408 MB, 1,323 exercises, **no licence file at all**) and `omercotkd/exercises-gifs`
(368 MB, MIT-labelled, README says verbatim *"I do not own any of the content in this
repository. All rights belong to the original creators and dataset owner"*). An MIT file on
someone else's assets launders nothing.

### 2.7 The ones to refuse, and why

- **MuscleWiki.** Terms, verbatim: *"Content that cannot be redistributed without prior
  written consent of MuscleWiki includes... All image assets (.svg, .png, .jpg, .jpeg)."*
  Videos may be shared only *"with MuscleWiki branding and links to musclewiki.com, and only
  for non-profit or academic use."* Plainly stated by them. **No.**
- **ExRx.net.** Commercial subscription site that licenses its media, and named in
  free-exercise-db issue #13 as a likely source of the infringing images there. **No.**
- **ExerciseDB / RapidAPI.** `exercisedb.dev` currently returns Vercel
  `DEPLOYMENT_NOT_FOUND` with an expired cert; homepage moved to `ascendapi.com`. The GitHub
  repo is AGPL-3.0, which **covers the API server code only**. The 5,000+ GIFs sit behind a
  paid plan on `cdn.exercisedb.dev` with no open licence anywhere. **No.**
- **unDraw.** Not CC0, despite the reputation. Custom licence, fetched live: *"This license
  does not include the right to compile assets, vectors or images from unDraw to replicate a
  similar or competing service, in any form or distribute the assets in packs or otherwise."*
  Committing them to a repo is distributing them in a pack. **No.**
- **Kenney.** CC0, but zero exercise or fitness demonstration assets. Out of scope.

### 2.8 Share-alike, precisely

This matters and is usually got wrong, so state it exactly.

**CC BY-SA's copyleft attaches to the image and to adaptations of the image. It does not
attach to your application code.** Under CC BY-SA 4.0, ShareAlike (section 3(b)) triggers
only when you Share *Adapted Material*. An unmodified image sitting next to independent code
is a **Collection**, and the licence explicitly says inclusion in a Collection does not
produce Adapted Material. The app's licence is whatever you choose.

**But** if you crop, recolour, trace, re-encode into a sprite sheet, or composite a CC BY-SA
image, that output *is* Adapted Material and must ship under CC BY-SA 4.0 or a compatible
licence. Recolouring Everkinetic SVGs for dark mode is a modification. You would owe CC BY-SA
on the recoloured SVGs, not on the app. Practical consequence: **do the dark-mode treatment
in CSS (`filter: invert()`, `currentColor` on a sanitised SVG) rather than by editing the
files**, and you never create a derivative at all.

**And the thing that actually sets the risk level:** CC obligations trigger on
*distribution*. A private single-user app that never leaves the Mac mini distributes nothing.
If the git repo is private, no CC obligation is ever triggered. If the repo is public, the
repo itself is the distribution event and every attribution line becomes mandatory. Write
`ATTRIBUTIONS.md` now regardless: it costs one file and it is the difference between
compliant and not on the day the repo flips public.

None of this rescues free-exercise-db's images. Infringement is infringement whether the repo
is public or private.

### 2.9 What to bundle, and how big

| Set | Files | Size | Licence |
|---|---|---|---|
| Everkinetic `dist/svg/`, filtered to the catalogue | ~40 | ~0.8 MB | CC BY-SA 4.0 |
| CDC Growing Stronger GIFs, all 22 | 22 | 439 KB | Public domain |
| Commons gap fillers (see 2.4) | ~14 | ~2.5 MB after re-encode | CC BY-SA 4.0 / CC BY 3.0 / PD |
| free-exercise-db `dist/exercises.json`, images stripped | 1 | ~1 MB | Unlicense |
| wger 400x400 thumbnails, named-author only, gaps only | ~6 | ~0.4 MB | CC BY-SA 4.0 |
| **Total bundled** | **~83** | **~5 MB** | |

Five megabytes for the whole media layer, no network at workout time, no rights you do not
hold. That is the answer to the media problem.

---

## 3. Authoritative written sources for the cue text

Rule for the whole app: **paraphrase and cite**. Numbers (150 min/week, 8 to 12 reps, 2 to 3
sets, 10 to 30 s holds) are facts and not copyrightable, so implement and footnote them
freely. What you cannot take is the wording, the tables as laid out, and the photographs.

### 3.1 The licence shape, before the sources

Three findings that change how the cue text gets written.

**NHS text is OGL v3.0, but every NHS exercise photo is excluded.** The licence lives in
`https://www.nhs.uk/our-policies/terms-and-conditions/` section 3 (page last reviewed
**12 January 2021**). Note `https://www.nhs.uk/our-policies/copyright/` is a **404**.
Section 3.3: *"Copyright and database rights in NHS Website Content are released
free-of-charge under the current version of the Open Government Licence."* Section 3.5
excludes *"information owned by third parties which we are not authorised to licence on to
you... Many images on the NHS website are included as these are licensed by stock sites."*
The published exclusion list is
`https://assets.nhs.uk/prod/documents/Excluded_images_and_videos.csv` (606 rows, page last
reviewed **17 April 2024**), and it contains **all seven photos on the NHS strength
exercises page** plus the balance, sitting and flexibility photos and the "Basic warm-up"
video. The page also warns it may not be complete.

**Shortening NHS text flips the attribution rule.** Section 3.6: copy unchanged and you
attribute *"Information from the NHS website"* with a link and an OGL notice. Adapt it, and
adaptation explicitly includes *"Any change to wording that serves to change its meaning or
impact"* and *"Taking wording out of a context that is important to its meaning"*, and you
must use *"Contains public sector information licensed under the Open Government Licence
v3.0."* and *"You must not attribute the content to the NHS website or cite the NHS
specifically as the source."* Since this app wants short cue sets, it will be adapting.
**So the app cites the NHS as a further-reading link, and labels its own cue text with the
generic OGL string.** Getting this backwards is the most likely compliance mistake in the
whole build.

**ACSM's consumer brochures grant reproduction only "in its entirety without alteration."**
Excellent as a reference for writing treadmill and bike cues, useless as a copy-paste source.

### 3.2 The best-covering document found

**Royal Berkshire NHS Foundation Trust, "Strength and conditioning exercise class"**,
RBFT Orthopaedic Physiotherapy, **July 2025**, next review July 2027.
`https://www.royalberkshire.nhs.uk/media/u3rjel1a/strength-and-conditioning-exercise-class_jul25.pdf`

This single PDF carries real written cues for squat, split squat, single-leg squat, lunges
(4 variants), step-up, single-leg deadlift, press-ups, **plank** (plus arm slides and leg
lift progressions), **side plank** (bent-leg and straight-leg), **bridging**, **bird dog**,
**superman**, **dead bug**, **mountain climbers**, burpees, donkey kicks and Nordic
hamstrings. It is the only English-language source found that covers dead bug and mountain
climber at all. Copyright RBFT, so paraphrase-only, but as a technique reference for a
physiotherapy-grade cue set it is the best thing on this list.

### 3.3 Per-family citations

| # | Family | Primary | Secondary | Third |
|---|---|---|---|---|
| 1 | **Treadmill walk / run, incline, warm-up** | **ACSM, "Selecting and Effectively Using a Home Treadmill"** (Bracko, (c) 2011) `prescriptiontogetactive.com/static/pdfs/selecting-and-effectively-using-a-home-treadmill.pdf`: posture, stride, belt position, handrail warning, mount and dismount | NHS **Walking for health** (15 Dec 2022, OGL): brisk = ~3 mph, "you can still talk but cannot sing" | ODPHP **PAG 2nd ed.** 2018 (public domain) |
| 2 | **Stationary bike: seat, cadence, resistance** | **ACSM, "Selecting and Effectively Using a Stationary Bicycle"** ((c) 2011) `prescriptiontogetactive.com/static/pdfs/selecting-and-effectively-using-a-stationary-bicycle.pdf`: saddle level with floor, saddle and handlebar height, resistance mechanisms, upright vs semi-recumbent | MedlinePlus **Exercise and Physical Fitness** (15 Sep 2025, public domain) | CDC **Older Adult Activity** (4 Dec 2025) |
| 3 | **Bodyweight squat** | **RBFT** (Jul 2025) | **Growing Stronger** "Squats" ((c) 2002 Tufts, reference only) | NHS **Strength exercises** mini-squats (28 Feb 2024, OGL) for the regression |
| 4 | **Lunge, reverse lunge, split squat** | **RBFT** (Jul 2025): 90 degree front knee, no bend at the waist | Manger Bouger **"Les fentes"** (09/06/2022) | RNOH **Functional Fitness Pack** (Feb 2022, review expired) |
| 5 | **Push-up + regressions** | **RBFT** (Jul 2025): press-ups, elbows tucked | NHS **Strength exercises** wall press-up (28 Feb 2024, OGL) and NHS **Strength and Flex** standing press-up (19 Aug 2026) | **Growing Stronger** "Wall Push-ups" |
| 6 | **Plank, side plank** | **RBFT** (Jul 2025), full cues for both, both regressions | Manger Bouger **"La planche"** (09/06/2022) | UC Davis **Fundamental Core** (date unverifiable, weak backup) |
| 7 | **Glute bridge / hip thrust** | **RBFT** (Jul 2025): "Squeeze your bottom muscles and hamstrings and raise your hips to make a straight line between your shoulders and hips (do not arch your back)" | Manger Bouger **"Les relevés de bassin"** (09/06/2022) | RNOH (Feb 2022) |
| 8 | **Bird dog, dead bug** | **RBFT** (Jul 2025), distinct cues for each | Manger Bouger **"Le pointeur"** (09/06/2022) | UC Davis **Fundamental Core** (date unverifiable) |
| 9 | **Superman / prone back extension** | **Growing Stronger** "Floor Back Extension" | **RBFT** quadruped superman (Jul 2025) | Manger Bouger **"Le superman"** (09/06/2022), with its low-back caveat |
| 10 | **Mountain climber, high knees, jumping jack** | **RBFT** (Jul 2025) for mountain climbers | NHS **How to warm up before exercising** (24 Jun 2026, OGL): march on the spot, heel digs, knee lifts | **No authoritative source exists for jumping jacks.** Write original copy. |
| 11 | **Calf raise, wall sit** | NHS **Strength exercises** calf raises (28 Feb 2024, OGL) | **Growing Stronger** "Toe Stands" | **No authoritative source exists for wall sit.** Write original copy. |
| 12 | **Active recovery walking** | NHS **Walking for health** (15 Dec 2022, OGL) | **ACSM, "Starting a Walking Program"** | NIA **Three Types of Exercise** (14 Jan 2025) |
| 13 | **Warm-up, cool-down, mobility** | NHS **How to warm up before exercising** (24 Jun 2026) and **How to stretch after exercising** (16 Mar 2026), both OGL | **Growing Stronger** 4 named stretches | HAS obesity référentiel: static stretch 10 to 30 s, 2 to 4 reps |
| -- | **Intensity / effort** | **CDC "How to Measure Physical Activity Intensity"** (4 Dec 2025), **public domain and reproducible** | **ODPHP PAG 2nd ed.** pp. 58, 60, 109 (public domain) | Zourdos 2016 for RIR, cite only |
| -- | **Dose** | **ODPHP PAG 2nd ed.** 2018 p. 61 (public domain) | NHS **How to improve your strength and flexibility** (21 Jul 2026, OGL) | ACSM 2026 Resistance Training Position Stand, PMCID **PMC12965823**, CC BY-NC-ND |

### 3.4 Source notes worth carrying forward

- **ODPHP is the most permissive federal source.** Copyright policy
  (`https://odphp.health.gov/copyright-policy`, last updated 19 Nov 2025): *"is in the public
  domain. This means it may be freely distributed and copied, but please include a link to
  our website and acknowledge ODPHP as the source."* No no-modification clause, unlike CDC.
  Full PAG PDF: `https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf`
  (15.4 MB, 118 pp., 2018). The CDC mirror of that PDF is dead (403).
- **CDC material is public domain with four conditions**
  (`https://www.cdc.gov/other/agencymaterials.html`, last reviewed 1 May 2023): attribute
  "Source: CDC", add a prominent non-endorsement disclaimer, **do not change the substantive
  content**, and state it is free on the agency site. The CDC logo may not be used.
- **Dead URLs, do not cite:** `nhs.uk/live-well/exercise/gym-free-exercises/`,
  `/how-to-run-correctly/`, `/running-tips-for-beginners/` all now redirect to
  `/live-well/exercise/`. CDC's entire walking section including "Step It Up!" is 404, even
  on `archive.cdc.gov`. Go4Life (NIA) is DNS-dead.
- **University extension services are a dead end.** Penn State, UGA and Colorado State were
  all checked. Dose and principles only, no per-movement cues.
- **WHO 2020 guidelines** (`https://www.who.int/publications/i/item/9789240015128`,
  25 November 2020, ISBN 9789240015128, CC BY-NC-SA 3.0 IGO) are dose only, and the NC clause
  blocks commercial verbatim reuse.
- **French sources, secondary.** The only openly licensed one is
  `sports.gouv.fr` under **Licence Ouverte / Etalab 2.0**, and it is signposting, not
  prescription. **Manger Bouger "Exercices de renforcement musculaire"**
  (published 09/06/2022, modified 11/05/2023) has real per-movement cues for 13 movements
  including bird dog, superman, plank, lunges, squats and glute bridge, but its mentions
  légales forbid commercial use and its images are stock. **HAS** guides
  (`Consultation et prescription médicale d'activité physique à des fins de santé chez
  l'adulte`, validated by the Collège **13 July 2022**, 78 pp.) are dose, not technique, and
  are reuse-whole-only, not Etalab. **ANSES 2016** is
  *"Actualisation des repères du PNNS: Révisions des repères relatifs à l'activité physique
  et à la sédentarité"*, saisine 2012-SA-0155, cover date février 2016,
  `https://www.anses.fr/fr/system/files/NUT2012SA0155Ra.pdf`, CC BY-NC-ND.
  **INSEP has nothing openly citable on technique**: its catalogue sells at 13 to 45 EUR a
  title and its open channel, *Réflexions Sport*, covers elite performance research.
- **Unverified, do not cite without a browser check:** US Army **FM 7-22** and
  **ATP 7-22.02** would be public domain with rich written drill cues (squat bender, rear
  lunge, mountain climber, push-up), but `armypubs.army.mil` blocked every attempt. Also
  unverified: the ODPHP PAG suggested-citation string (no citation block on any ODPHP page)
  and the UC Davis "Fundamental Core" title, date and copyright line.

### 3.5 The effort scale: use CDC, not Borg

**The Borg scales are licence gated.** BorgPerception AB
(`https://borgperception.se/`) is the exclusive worldwide licensed distributor. Their FAQ,
verbatim: *"To be able to use a Borg scale you need to obtain a license and pay applicable
fee."* And: *"BorgPerception AB has copyright and trademark for the different authorized
Borg Scales and the instructions that go with them... There are many so called 'modified
Borg scales' that are forgeries and we cannot give permission or encourage the usage of
them."* They have an explicit "IT COMPANIES / SYSTEM PROVIDERS" licence category, priced on
request. So the app cannot ship Borg's 6-20 or CR10 anchor words, and renaming the anchors
to dodge it is called out as a forgery on their own site.

Citations if referenced: Borg GA, *Med Sci Sports Exerc* 1982;14(5):377-381,
DOI **10.1249/00005768-198205000-00012**, PMID 7154893.

**OMNI-RES is also not free.** Robertson et al., *Med Sci Sports Exerc* 2003;35(2):333-341,
DOI **10.1249/01.MSS.0000048831.15016.2A**, closed, and the pictorial artwork is copyrighted.

**Zourdos RIR is copyright NSCA / Wolters Kluwer.** *J Strength Cond Res*
2016;30(1):267-275, DOI **10.1519/JSC.0000000000001049**, PMID 26049792. Not open access.
Paraphrase, do not reproduce the table. RIR as a *concept*, "how many more reps could you
have done", is plain language and not a protected anchor set.

**The answer: a public-domain 0 to 10 effort scale exists.** CDC, "How to Measure Physical
Activity Intensity", `https://www.cdc.gov/physical-activity-basics/measuring/index.html`,
reviewed **4 December 2025**, verbatim:

> "People often rate physical activity intensity on a scale of 0 to 10, where 0 is the level
> of effort required to sit and 10 is maximal effort. Relatively moderate-intensity activity
> is a level of effort of 5 or 6... Relatively vigorous-intensity activity begins at a 7 or
> 8 on this scale."
> "As a rule of thumb, a person doing moderate-intensity aerobic activity can talk, but not
> sing, during the activity. A person doing vigorous-intensity activity cannot say more than
> a few words without pausing for a breath."

The same wording appears in PAG 2nd edition chapter 4 (PDF p. 58) and appendix 1 (p. 109),
with the physiological mapping (moderate = 40 to 59% of aerobic capacity reserve, vigorous =
60 to 84%) and the strength cue at p. 61: *"muscle-strengthening exercises should be
performed to the point at which it would be difficult to do another repetition."*

**Build the app's effort input on the CDC/PAG 0 to 10 scale**, reproducible verbatim with
attribution and a non-endorsement disclaimer, describe RIR in your own words citing Zourdos
2016, and ship neither Borg's anchors nor the OMNI artwork.

One inconsistency to resolve deliberately: ACSM's own free infographic bands moderate at
RPE 3-4 and vigorous at 5-7, which **contradicts** CDC/PAG's 5-6 and 7-8. Pick CDC/PAG,
because it is the one you are allowed to reproduce, and be consistent everywhere in the UI.
