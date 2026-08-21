# iOS PWA capability note

Target: one iPhone plus one Mac, one user. Served over HTTPS from a Tailscale
MagicDNS name, `https://lamberts-mac-mini.tailda76d6.ts.net`.

Every URL in this note was fetched and read on **2026-08-21**. Each fact carries
its source inline. The Sources table at the bottom repeats every URL with its
publication date and the checked date. Anything I could not source from Apple,
WebKit, a W3C/WHATWG spec, or MDN browser-compat-data is marked
**[UNVERIFIED]** and must be tested on the device before it is built on.

---

## Hard constraints for the build

1. **It must be added to the Home Screen.** In an iOS Safari tab, `Notification`
   is undefined, push is impossible, and storage is wiped after 7 days of no
   interaction. Installed, all three change. There is no way to trigger the
   install from JavaScript: no `beforeinstallprompt`, no `appinstalled`.
2. **Set `display: "standalone"` in the manifest** even though iOS 26 no longer
   requires it. It is still the gate on older iOS, and it is what makes the Mac
   web app drop its toolbar.
3. **Minimum iOS 18.4** if the workout screen needs Screen Wake Lock. Wake Lock
   landed on iOS only in 18.4 and only inside Home Screen web apps. Push needs
   16.4. Pick 18.4 as the floor and write it into PREFLIGHT.
4. **`navigator.vibrate` does not exist in any Safari.** No haptics. Audio plus
   visual only.
5. **SpeechSynthesis needs one user gesture per document.** Prime it inside the
   "Start workout" tap or every later utterance is silently dropped.
6. **There is no Background Sync, no Periodic Sync, no Background Fetch.** The
   only code that runs while the app is closed is a service worker woken by a
   push. Offline writes go to an IndexedDB outbox replayed on six explicit
   triggers.
7. **Never count down with an accumulating interval.** Store `startedAt` as an
   epoch millisecond value and recompute remaining time on every tick and every
   `visibilitychange`. Timers are throttled or suspended when backgrounded and
   the whole app can be terminated.
8. **`navigator.onLine` is worse than useless here.** The origin is only
   reachable on the tailnet. The phone can be on cellular, report `onLine ===
   true`, and reach nothing. Detect offline with a short-timeout reachability
   probe against your own origin.
9. **Pin the WebAuthn RP ID to `tailda76d6.ts.net`, not to the full hostname.**
   Both are legal. The tailnet domain survives renaming the Mac; the full
   hostname does not, and a changed RP ID makes every existing passkey
   permanently unusable. `ts.net` alone is illegal: it is on the Public Suffix
   List.
10. **Ship a 180x180 `apple-touch-icon` PNG.** When both are present,
    `apple-touch-icon` beats the manifest `icons`.
11. **Put the notification text in the push payload.** Off-tailnet the service
    worker can receive the push but cannot fetch your origin to fill it in.
12. **Renaming the Mac is a destructive act.** New origin means new storage jar,
    lost push subscription, and broken passkeys. Record it in PREFLIGHT.

---

## 1. Installability

### What iOS actually requires in 2026

As of iOS 26 and iPadOS 26 there is no installability bar at all. WebKit:

> "By default, every website added to the Home Screen opens as a web app. If the
> user prefers to add a bookmark for their browser, they can disable 'Open as
> Web App' when adding to Home Screen — even if the site is configured to be a
> web app."

> "Simply put, there are now zero requirements for 'installability' in Safari.
> Users can add any site to their Home Screen and open it as a web app on iOS26
> and iPadOS26."

([webkit.org/blog/17333](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
published 2025-09-15, checked 2026-08-21)

On iOS 16.4 through 18.x the rule was different and still matters if the phone
is not on 26 yet. WebKit:

> "Web developers have the option to create a manifest file (with its `display`
> member set to `standalone` or `fullscreen`) and serve it along with their
> website. If they do, that site becomes a Home Screen web app."

> "If there is no manifest file configured to request web app behavior (and no
> meta tag marking the site as web app capable), then that website will be saved
> as a Home Screen bookmark. Starting in iOS and iPadOS 16.4, Home Screen
> bookmarks will now open in the user's current default browser."

([webkit.org/blog/13878](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
published 2023-02-16, checked 2026-08-21)

**There is no install prompt API.** `Window.beforeinstallprompt` and
`Window.appinstalled` are `false` for both `safari` and `safari_ios` in MDN
browser-compat-data
([mdn/browser-compat-data api/Window.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Window.json),
checked 2026-08-21). The user taps Share → Add to Home Screen. You can only
detect the result, never cause it.

### Manifest fields Safari honours

Link it from `<head>` and serve it as `application/manifest+json`:

```html
<link rel="manifest" href="/manifest.webmanifest">
```

("To add a web app manifest to your website, simply add a link with
`rel="manifest"` to a JSON file in the head of your HTML."
[WWDC23 session 10120](https://developer.apple.com/videos/play/wwdc2023/10120/),
checked 2026-08-21.)

| Member | Safari behaviour | Source |
|---|---|---|
| `name` | The web app's name on the Home Screen, in place of `<title>`. The user can edit it at add time, and iOS combines that edited name with `id` to identify the install. | WWDC23 10120; webkit 13878 |
| `short_name` | Defined by the spec as the name for space-constrained contexts. Apple does not document distinct handling. Set it, but treat `name` as authoritative. | [W3C appmanifest](https://www.w3.org/TR/appmanifest/) |
| `id` | Supported since iOS/iPadOS 16.4. "a string (in the form of a URL) that acts as the unique identifier for the web application." Used for syncing Focus settings across devices and for distinguishing multiple installs of the same site. Falls back to `start_url` if absent. | webkit 13878; WWDC23 10120 |
| `start_url` | "The `start_url` is the URL that is loaded when the web app is first opened." Also the fallback identity when `id` is absent. | WWDC23 10120 |
| `scope` | "All web apps have an associated scope. Links within the scope open within the web app... The default scope is the host of the webpage used to create the web app... The scope is a subdirectory of the manifest URL... In Home Screen web apps on iOS, links outside the scope will open in Safari View Controller." | WWDC23 10120 |
| `display` | `standalone` → no browser UI on iOS, no toolbar on macOS. `fullscreen` also qualifies a site as web-app-capable. Required pre-iOS-26 to get a web app at all, and to get the Notification API. | webkit 13878; WWDC23 10120 |
| `theme_color` | Used as the web app's theme; on the Mac "the theme color for the site blends into the toolbar." On iOS it tints the status bar region in standalone. **[UNVERIFIED for iOS specifically — confirm on device.]** | WWDC23 10120 |
| `background_color` | Spec: the expected background colour while the app loads. | W3C appmanifest |
| `icons` | Supported "since iOS and iPadOS 15.4". Safari 26.0 adds SVG icons and `data:` URL icons. | webkit 13878; webkit 17333 |
| `screenshots` | Defined by the spec for richer install UI. Safari shows no install UI, so this has **no observable effect on iOS**. Harmless to include; do not spend time on it. | W3C appmanifest; no Apple documentation found |
| `display_override`, `shortcuts`, `categories`, `orientation` | Not documented by Apple as honoured on iOS. **[UNVERIFIED — do not depend on them.]** | — |

`display: standalone` versus `fullscreen`: WebKit treats both as marking a site
web-app-capable (webkit 13878, quoted above). Apple documents no behavioural
difference on iPhone, where a standalone web app already occupies the whole
screen below the status bar. **Use `standalone`.** `fullscreen` buys nothing
documented and is the less-tested path. **[UNVERIFIED that `fullscreen` hides
the status bar on iOS — it is not documented anywhere I could find.]**

### apple-touch-icon still wins

> "To provide the icon to be used for your website or web app, list the icons in
> the Manifest file — a capability that's been supported since iOS and iPadOS
> 15.4. Or you can use the long-supported technique of listing
> `apple-touch-icon`s in the HTML document head. **(If you do both,
> apple-touch-icon will take precedence over the Manifest-declared icons.)**"

(webkit 13878, checked 2026-08-21)

So the manifest icons are the fallback, not the primary, on iOS. Ship both and
keep them identical.

Apple's sizing rule and the resolution table:

> "To specify multiple icons for different device resolutions... add a `sizes`
> attribute to each link element"
>
> ```html
> <link rel="apple-touch-icon" href="touch-icon-iphone.png">
> <link rel="apple-touch-icon" sizes="152x152" href="touch-icon-ipad.png">
> <link rel="apple-touch-icon" sizes="180x180" href="touch-icon-iphone-retina.png">
> <link rel="apple-touch-icon" sizes="167x167" href="touch-icon-ipad-retina.png">
> ```
>
> "If there is no icon that matches the recommended size for the device, the
> smallest icon larger than the recommended size is used. If there are no icons
> larger than the recommended size, the largest icon is used."

([Apple, Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html),
updated 2016-12-12, checked 2026-08-21)

For an iPhone-only build, **180x180 is the size that matters.** Make it an
opaque PNG with square corners and no transparency — iOS applies its own mask.

If you ship no icons at all, iOS 16.4+ generates a monogram from the first
letter of the site name rather than a screenshot (webkit 13878).

Also from Apple's meta tag reference: `apple-mobile-web-app-title` "specif[ies] a
web application title for the launch icon. By default, the `<title>` tag is
used."

### Head block to ship

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Fitness">
<meta name="theme-color" content="#0b0b0f">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
```

### Status bar and safe areas

The three status bar styles, verbatim from Apple's meta tag reference:

> "If `content` is set to `default`, the status bar appears normal. If set to
> `black`, the status bar has a black background. If set to `black-translucent`,
> the status bar is black and translucent. If set to `default` or `black`, the
> web content is displayed below the status bar. If set to `black-translucent`,
> the web content is displayed on the entire screen, partially obscured by the
> status bar. The default value is `default`."
>
> "This meta tag has no effect unless you first specify full-screen mode as
> described in `apple-mobile-web-app-capable`."

([Apple, Supported Meta Tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html),
checked 2026-08-21)

`black-translucent` is what you want for an edge-to-edge app, and it is the
setting that makes `env(safe-area-inset-top)` matter: your content now runs under
the clock and the Dynamic Island, and you must pad it back.

`viewport-fit=cover` is the other half. WebKit:

> "To disable that behavior and cause the page to lay out to the full size of the
> screen, you can set `viewport-fit` to `cover`."

The four insets are `safe-area-inset-top`, `-right`, `-bottom`, `-left`, read
through `env()`. WebKit's recommended pattern combines a design minimum with the
inset using `max()`:

> ```css
> @supports(padding: max(0px)) {
>     .post {
>         padding-left: max(12px, env(safe-area-inset-left));
>         padding-right: max(12px, env(safe-area-inset-right));
>     }
> }
> ```

`constant()` was replaced by `env()` in iOS 11.2; do not ship `constant()`.

([webkit.org/blog/7929](https://webkit.org/blog/7929/designing-websites-for-iphone-x/),
published 2017-09-25, checked 2026-08-21)

Bottom tab bar, the whole rule:

```css
:root {
  --tabbar-h: 56px;
  /* On iPhone the home indicator is 34pt; env() gives 0 on devices without it. */
  --tabbar-pad: max(8px, env(safe-area-inset-bottom));
}

.tabbar {
  position: fixed;
  inset: auto 0 0 0;
  height: calc(var(--tabbar-h) + var(--tabbar-pad));
  padding-bottom: var(--tabbar-pad);
  padding-left: max(0px, env(safe-area-inset-left));
  padding-right: max(0px, env(safe-area-inset-right));
  box-sizing: border-box;
  /* Fixed elements must not scroll with rubber-banding content. */
  will-change: transform;
}

/* Scroll container clears the bar so the last row is reachable. */
.app-scroll {
  /* 100dvh, not 100vh: dvh tracks the collapsing/expanding viewport. */
  min-height: 100dvh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: calc(var(--tabbar-h) + var(--tabbar-pad));
  overscroll-behavior-y: contain;
}
```

`dvh` / `svh` / `lvh` are supported from Safari 15.4
([mdn/browser-compat-data css/types/length.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/types/length.json),
checked 2026-08-21). In a standalone web app there is no collapsing URL bar, so
`dvh` and `lvh` coincide, but `dvh` is still the right unit because it also
handles the on-screen keyboard case.

Detect standalone two ways and treat either as true:

```js
const standalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;
```

`window.navigator.standalone` is Apple's read-only boolean, documented in
Configuring Web Applications (checked 2026-08-21).

---

## 2. Web Push on iOS

### The floor

Apple, verbatim:

> "Add web push to Home Screen web apps in iOS 16.4 or later and Webpages in
> Safari 16 for macOS 13 or later."

> "You don't need to join the Apple Developer Program to send web push
> notifications."

([Apple, Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers),
checked 2026-08-21 via the documentation JSON endpoint)

### Home Screen first: yes, absolutely

WebKit: "A web app that has been added to the Home Screen can request permission
to receive push notifications" (webkit 13878).

MDN browser-compat-data is blunter about what happens if it is not:

> "The `Notification` interface is undefined, unless the page is a web app saved
> to the home screen. The app's manifest must have a non-default `display`
> value."

> `Notification.Notification` — "This constructor throws a `ReferenceError`
> exception, unless the page is a web app saved to the home screen."

(`api.Notification`: `safari_ios` = `16.4`, partial;
[mdn/browser-compat-data api/Notification.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Notification.json),
checked 2026-08-21)

This is why a naive `if ('Notification' in window)` check reports "push not
supported" in an iOS Safari tab and "supported" from the Home Screen icon, on the
same device, same iOS. That is the number one support question you will ask
yourself, and it is what the diagnostics screen exists to answer.

### The permission-request rule

Apple:

> "Ask the user for permission to send them push notifications. Provide a method
> for the user to grant permission with a gesture, such as clicking or tapping a
> button. **When the user completes the gesture, call the push subscription
> method immediately from the gesture's event handler code.**"

WebKit:

> "A web app that has been added to the Home Screen can request permission to
> receive push notifications **as long as that request is in response to direct
> user interaction** — such as tapping on a 'subscribe' button provided by the
> web app."

> "As with other privileged features of the web platform, requesting a push
> subscription requires an explicit user gesture."

(Apple push doc; webkit 13878;
[webkit.org/blog/12945 Meet Web Push](https://webkit.org/blog/12945/meet-web-push/),
published 2022-06-07 — all checked 2026-08-21)

In practice this means user activation is **transient**. Do not await anything
before `requestPermission()`:

```js
// WRONG - the await consumes the activation, the prompt never appears
btn.addEventListener('click', async () => {
  const reg = await navigator.serviceWorker.ready;   // activation spent
  await Notification.requestPermission();            // silently fails
});

// RIGHT - register the worker at boot, request permission first in the handler
const swReady = navigator.serviceWorker.register('/sw.js');  // at module load

btn.addEventListener('click', async () => {
  const perm = await Notification.requestPermission();  // first thing, sync call
  if (perm !== 'granted') return showWhyBlocked(perm);
  const reg = await swReady;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,                       // mandatory, see below
    applicationServerKey: VAPID_PUBLIC_KEY_U8,   // P-256 uncompressed, 65 bytes
  });
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sub),
  });
});
```

### VAPID

Required, and Apple points at the VAPID draft directly: "Prepare a
[Voluntary Application Server Identification (VAPID)] key pair for your server.
You use this to identify your server to the push notification services when you
send a push notification."
([draft-ietf-webpush-vapid-00](https://datatracker.ietf.org/doc/html/draft-ietf-webpush-vapid-00),
linked from the Apple doc, checked 2026-08-21)

Delivery follows RFC 8030 ("Set up your server to package and send a push
notification to a push service according to [RFC 8030]"). Payload encryption is
RFC 8291 `aes128gcm`; confirm at runtime with
`PushManager.supportedContentEncodings` (supported since Safari 16 / iOS 16.4,
per browser-compat-data).

Two operational points from Apple and WebKit:

- Allowlist `*.push.apple.com` egress from the server. "be sure to allow URLs from
  any subdomain of `push.apple.com`" (webkit 12945); "If your network
  infrastructure limits which URLs your server can access, allow access"
  (Apple push doc).
- "Your service should maintain TLS encrypted connections to APNs... your service
  must use the Server Name Indication (SNI) extension of TLS... APNs supports
  both HTTP/1.1 and HTTP/2.0." (Apple push doc)

**[UNVERIFIED]** The VAPID JWT `sub` claim: the common convention is a `mailto:`
or `https:` URI and Apple has historically rejected others. The Apple page I read
does not state it. Use `mailto:lambert.bouley@gmail.com` and verify by observing
a 403 response if it is wrong.

### The payload, and what the service worker does

Classic Web Push. Encrypt any JSON body you like with `aes128gcm` and handle it:

```js
// sw.js
self.addEventListener('push', (event) => {
  // The payload must be self-sufficient: off-tailnet, fetch() to our origin fails.
  const data = event.data ? event.data.json() : {};
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title ?? 'Fitness', {
      body: data.body ?? '',
      tag: data.tag ?? 'default',   // collapses duplicates
      data: { url: data.url ?? '/' },
      silent: false,                // iOS defaults to sound on; be explicit
    });
    if (typeof data.badge === 'number') {
      await self.navigator.setAppBadge(data.badge);
    }
    // Opportunistic: the push woke us, so drain the offline outbox.
    await flushOutbox().catch(() => {});
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hit = all.find((c) => c.url.includes(url));
    if (hit) return hit.focus();
    return clients.openWindow(url);
  })());
});
```

`silent` handling, from WWDC23 10120: "Following platform conventions, sound is
on by default on iOS and iPadOS, and sound is off by default on macOS. To
override the platform default, explicitly specify a `silent` value."

**Notification `actions` are not supported.** `Notification.actions`,
`Notification.badge` and `Notification.maxActions` are all `false` for `safari`
and mirrored `false` for `safari_ios` in browser-compat-data (checked
2026-08-21). No action buttons, no custom monochrome badge image on the
notification itself.

**A discrepancy to test.** browser-compat-data lists
`ServiceWorkerGlobalScope.notificationclick_event` as `false` for `safari_ios`,
while WebKit's own description of the feature has notifications from web apps
working "exactly like notifications from other apps" and Apple's flow depends on
activating them. Treat this as a browser-compat-data gap, but **verify
`notificationclick` on the actual iPhone before relying on deep-linking from a
notification.** If it does not fire, fall back to routing on the next app open
using a value written into IndexedDB by the `push` handler.

### Declarative Web Push (iOS 18.4+)

A second, simpler mechanism that needs no service worker at all:

> "Declarative Web Push is now available on iOS and iPadOS 18.4 for web apps
> added to the Home Screen."

> "This new approach to push notifications on the web doesn't require Service
> Workers... Declarative Web Push allows web developers to request a Web Push
> subscription and display user visible notifications without requiring an
> installed service worker."

Payload shape:

```json
{
  "web_push": 8030,
  "notification": {
    "title": "Leg day in 30 minutes",
    "lang": "en-US",
    "dir": "ltr",
    "body": "Squats, RDLs, calf raises.",
    "navigate": "https://lamberts-mac-mini.tailda76d6.ts.net/today",
    "silent": false,
    "app_badge": "1"
  }
}
```

`"web_push": 8030` is the opt-in marker. A non-empty `title` is required. If a
service worker *is* installed it still receives a `PushEvent` carrying the
proposed notification, and a notification it shows itself overrides the
declarative fallback; if it shows nothing, the declarative notification is used.
macOS got this in Safari 18.5.

([webkit.org/blog/16535 Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)
and [webkit.org/blog/16574](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/),
published 2025-03/2025-03-31, checked 2026-08-21)

**Recommendation for this build:** send the declarative shape *and* keep the
service worker `push` handler. You get a correct notification even if the worker
is evicted or fails, and the worker still gets its wake-up to drain the outbox.
This is the single best mitigation for the off-tailnet case.

### userVisibleOnly is a promise, and breaking it revokes push

Apple:

> "Safari doesn't support invisible push notifications. Present push
> notifications to the user immediately after your service worker receives them.
> **If you don't, Safari revokes the push notification permission for your
> site.**"

WebKit:

> "When a web application registers a push subscription, they promise that pushes
> will always be user visible... **Violations of the `userVisibleOnly` promise
> will result in a push subscription being revoked.**"

> "The Web Push API is not an invitation for silent background runtime, as that
> would both violate a user's trust and impact a user's battery life."

So: you may use a push to wake the worker and flush the outbox, but you must
*also* show a notification every single time. Do not send "silent housekeeping"
pushes. If you need to sync without bothering the user, do it on app open.

### Badging

`navigator.setAppBadge()` / `clearAppBadge()`, iOS 16.4 for Home Screen web apps,
macOS Safari 17 for installed web apps (browser-compat-data, checked
2026-08-21). WebKit:

> "Both `setAppBadge` and `clearAppBadge` change the count while the user has the
> web app open in the foreground or while the web app is handling push events in
> the background — even before permission to display the count has been granted."

> "Permission to display the badge on the app icon is granted in exactly the same
> way as other apps on iOS and iPadOS. Once a user gives permission to allow
> notifications, the icon on the Home Screen will immediately display the current
> badge count."

Quirk from browser-compat-data: "Passing `0` as an argument will clear the badge
instead of displaying an unnumbered dot."

### Known failure modes

| Symptom | Cause | What the user must do |
|---|---|---|
| `Notification is not defined`, or the Subscribe button does nothing | Running in an iOS Safari tab, not the installed web app | Share → Add to Home Screen, then open from the icon |
| Permission prompt never appears, `Notification.permission === 'default'` | The `requestPermission()` call was not synchronous in the tap handler; the transient user activation was spent by an `await` | Rebuild the call site (developer fix) |
| Permission prompt never appears, `Notification.permission === 'denied'` | The user tapped "Don't Allow" once. iOS never re-prompts. | Settings → Notifications → *app name* → Allow. If the app was never granted, the only reliable reset is deleting the Home Screen icon and re-adding it — which also wipes storage |
| Push worked, then stopped, permission still `granted` | `userVisibleOnly` violated: a push arrived and no notification was shown (an exception in the `push` handler counts) | Re-subscribe; fix the handler so it always shows something |
| Push stopped after the user deleted and re-added the icon | **Deleting the Home Screen web app destroys its storage partition and its push subscription.** Re-adding creates a brand-new subscription with a new endpoint. | Re-subscribe. The server must key subscriptions by user, not by endpoint, and must accept replacement |
| Server gets HTTP 410 from APNs | The device token expired, or the subscription was destroyed as above | Delete the stored subscription server-side; prompt to re-subscribe on next app open |
| Subscription silently rotated and pushes vanish | `ServiceWorkerGlobalScope.pushsubscriptionchange` is `false` on `safari_ios` (browser-compat-data, checked 2026-08-21). **You are never told.** | Re-read `pushManager.getSubscription()` on every app launch and re-POST it if the endpoint differs from the last one you sent |
| Two installs, one gets pushes | iOS supports multiple installs of the same web app; each has its own subscription. "iOS has supported multiple installs of the same web app since the very beginning." (webkit 13878) | Delete the extra icon, or handle multiple subscriptions per user |
| Notifications arrive but never make a sound / never appear | Focus mode, or badge/sound disabled in Settings. Not detectable from the web. | Check Settings → Notifications and the active Focus |

### What the diagnostics screen must check

One line per check, each with its own remedy text. Order matters: stop at the
first failure and show only its remedy, otherwise the user reads twelve red rows
and learns nothing.

```js
async function pushDiagnostics() {
  const rows = [];
  const add = (id, ok, detail, fix) => rows.push({ id, ok, detail, fix });

  // 1. Secure context
  add('secure', window.isSecureContext, location.origin,
      'The app must be served over HTTPS.');

  // 2. Installed to the Home Screen
  const standalone = matchMedia('(display-mode: standalone)').matches
                  || navigator.standalone === true;
  add('installed', standalone, standalone ? 'standalone' : 'browser tab',
      'Open this from the Home Screen icon, not from Safari. '
    + 'If there is no icon: Share, then Add to Home Screen.');

  // 3. Notification API present (the direct consequence of 2 on iOS)
  add('notif-api', 'Notification' in window, String('Notification' in window),
      'iOS only exposes notifications to installed web apps. See above. '
    + 'Also requires iOS 16.4 or newer.');

  // 4. iOS version (best effort; the UA string is the only signal available)
  const m = navigator.userAgent.match(/OS (\d+)[._](\d+)/);
  const ver = m ? Number(m[1]) + Number(m[2]) / 10 : null;
  add('ios-version', ver === null || ver >= 16.4, ver ? `iOS ${ver}` : 'unknown',
      'Web Push needs iOS 16.4. Screen Wake Lock needs iOS 18.4.');

  // 5. Permission state
  const perm = 'Notification' in window ? Notification.permission : 'unavailable';
  add('permission', perm === 'granted', perm,
      perm === 'denied'
        ? 'Settings, then Notifications, then this app, then Allow Notifications. '
        + 'iOS will not ask again from inside the app.'
        : 'Tap Enable notifications.');

  // 6. Service worker registered and active
  const reg = 'serviceWorker' in navigator
    ? await navigator.serviceWorker.getRegistration()
    : null;
  add('sw', !!reg?.active, reg ? (reg.active ? 'active' : reg.installing ? 'installing' : 'waiting') : 'none',
      'The service worker failed to install. Check that /sw.js is served as '
    + 'text/javascript from this exact origin, and that its scope covers /.');

  // 7. Push subscription exists locally
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  add('subscription', !!sub, sub ? tail(sub.endpoint) : 'none',
      'Not subscribed on this device. Tap Enable notifications.');

  // 8. VAPID key match - a rotated server key silently breaks delivery
  const localKey = sub ? b64u(sub.options.applicationServerKey) : null;
  add('vapid', localKey === VAPID_PUBLIC_KEY_B64URL, shorten(localKey),
      'The server key changed since this device subscribed. '
    + 'Unsubscribe and re-subscribe.');

  // 9-11. Server-side truth: does the server hold THIS endpoint, and what
  //       happened on the last send? One request, three answers.
  //       This is the check that distinguishes "the phone is fine, the server
  //       lost me" from "the phone never subscribed".
  const server = await probe('/api/push/status', { endpoint: sub?.endpoint });
  add('server-known', server?.known === true, server?.knownTail ?? 'unreachable',
      server ? 'The server does not have this subscription. Re-subscribe.'
             : 'Cannot reach the server. Is Tailscale connected on this iPhone?');
  add('last-send', server?.lastStatus === 201,
      `${server?.lastStatus} ${server?.lastApnsId ?? ''} ${server?.lastAt ?? ''}`,
      'APNs rejected the last push. 403 = VAPID/auth problem. '
    + '410 = subscription expired, re-subscribe. 413 = payload too large.');

  // 12. Badging works
  let badgeOk = true;
  try { await navigator.setAppBadge?.(1); await navigator.clearAppBadge?.(); }
  catch { badgeOk = false; }
  add('badge', badgeOk, String(badgeOk),
      'Badging is granted with notification permission. Check Settings, '
    + 'Notifications, this app, Badges.');

  // 13. Not machine-checkable - always show as an advisory row
  add('focus', null, 'not detectable',
      'A Focus mode can suppress notifications. Check Settings, then Focus.');

  return rows;
}
```

The two rows that earn their keep are 7-vs-9 (the phone thinks it is subscribed
but the server disagrees → the subscription rotated or the server lost it) and
10 (the server's last APNs status code, which turns "it doesn't work" into a
number you can act on: 403 auth, 410 expired, 413 too big, 429 throttled).
Those status codes come straight from Apple's table (Apple push doc, checked
2026-08-21):

| Code | Meaning |
|---|---|
| 201 | Success |
| 400 | Bad request |
| 403 | "There's an error with your authentication" |
| 404 | Invalid `:path` |
| 405 | Invalid `:method`. Only use `POST` |
| 410 | "The device token has expired" |
| 413 | "The notification payload is too large" |
| 429 | "Too many requests for the same destination" |
| 500 / 503 | APNs-side error / shutting down |

---

## 3. Service worker and storage on iOS

### What exists

| API | Safari | iOS Safari | Source |
|---|---|---|---|
| `navigator.serviceWorker` | 11.1 | 11.1 | browser-compat-data |
| Cache API | yes, covered by the storage policy | yes | webkit 14403 |
| IndexedDB | yes, covered by the storage policy | yes | webkit 14403 |
| `navigator.storage` (StorageManager) | 15.2 | 15.2 | browser-compat-data |
| `StorageManager.estimate()` | 17 | 17 | browser-compat-data |
| `StorageManager.persist()` / `persisted()` | 15.2 | 15.2 | browser-compat-data |
| `estimate().usageDetails` | **false** | false | browser-compat-data |
| `ServiceWorkerRegistration.sync` (Background Sync) | **false** | **false** | browser-compat-data |
| `ServiceWorkerRegistration.periodicSync` | **false** | **false** | browser-compat-data |
| `ServiceWorkerRegistration.backgroundFetch` | **false** | **false** | browser-compat-data |
| `navigationPreload` | 15.4 | 15.4 | browser-compat-data |

(all checked 2026-08-21)

### Quota

WebKit, verbatim, "Starting in Safari 17.0, and in WebKit apps for iOS 17,
iPadOS 17 and macOS Sonoma":

> - "For a browser app, the origin quota is up to 60% of the total disk space."
> - "For other apps, the origin quota is up to 15% of the total disk space."
> - "For a browser app, overall quota is up to 80% of the total disk space."
> - "For other apps, overall quota is up to 20% of the total disk space."

> **"When a web app is running standalone (as Home Screen Web App on iOS or Web
> App added to dock on macOS), it has the same origin quota and overall quota as
> when it is opened in a browser app."**

> "With this change, Safari 17.0 no longer prompts users about a website wanting
> to use more space."

> "Note that the quota is an upper limit of how much can be stored — there is no
> guarantee that a site can store that much, so error handling for
> `QuotaExceededError` is necessary. Also, to reduce fingerprinting risk...
> quota might change based on factors like existing usage and site visit
> frequency."

([webkit.org/blog/14403](https://webkit.org/blog/14403/updates-to-storage-policy/),
published 2023-08-10, checked 2026-08-21)

Practically: on a 256 GB iPhone the origin quota is in the tens of gigabytes.
Quota is not your constraint. Eviction is.

The policy covers "localStorage, Cache API, IndexedDB, Service Worker, and File
System. Other types like cookies and HTTP cache are currently not subject to the
policy below."

### Eviction and the 7-day rule

WebKit:

> "Eviction means automatic website data deletion that is not initiated by the
> user or website. It can happen under a few conditions: when exceeding the
> overall quota, when the system is under storage pressure, or when the site has
> not been interacted with by the user for some time (see Intelligent Tracking
> Prevention)."

> "WebKit normally evicts data on an origin basis: the data of an origin will be
> deleted as a whole. The ordering of origins to be deleted is decided using a
> least-recently-used policy. The last use time is the time of the last user
> interaction, or the time of the last storage operation."

> "Origin might be excluded from eviction if it has active page at the time of
> eviction, or its storage is in persistent mode. By default, all origins use a
> best-effort mode."

(webkit 14403, checked 2026-08-21)

The 7-day rule itself, from WebKit's tracking prevention policy page:

> "ITP deletes all cookies created in JavaScript and all other script-writeable
> storage after 7 days of no user interaction with the website."

The forms of storage listed as covered include IndexedDB, LocalStorage,
SessionStorage, media keys, and **"Service Worker registrations and cache."**

**And the exemption that decides this whole design:**

> "The first-party domain of home screen web applications is exempt from ITP's
> 7-day cap on all script-writeable storage, i.e. **ITP always skips that domain
> in its website data removal algorithm.**"

> "The website data of home screen web applications is kept isolated from Safari
> and thus will not be affected by ITP's classification of tracking behavior in
> Safari."

([webkit.org/tracking-prevention](https://webkit.org/tracking-prevention/),
checked 2026-08-21)

**So: installing to the Home Screen changes the 7-day rule completely.** In a
Safari tab, an app you do not open for a week loses its service worker, its
caches, and its IndexedDB. Installed, it does not. This is the single strongest
argument for the install, stronger than push.

Two things still bite even when installed:
- Overall-quota and storage-pressure eviction still apply. Rare on a phone with
  free space, not impossible.
- Deleting the Home Screen icon deletes the whole partition. There is no
  recovery. The server must be able to rebuild the device from scratch.

Still call `persist()` — WebKit grants it partly *because* you are installed:

> "WebKit currently grants a request based on heuristics like whether the website
> is opened as a Home Screen Web App."

```js
// Call once, after the first successful sign-in, from a user gesture path.
if (navigator.storage?.persist) {
  const already = await navigator.storage.persisted();
  if (!already) await navigator.storage.persist();
}
```

### The offline strategy

**Precache at `install` — the shell only, versioned by build hash:**

- The app shell HTML (`/index.html` or `/app-shell.html`)
- The JS and CSS bundles, hashed filenames
- Self-hosted font files (subset, `woff2`)
- The icon set
- An offline fallback page for navigations that miss

Nothing else. Never precache an API response: it goes stale silently and you
cannot tell whether the user is seeing today's plan or last Tuesday's.

**Runtime caching, three lanes:**

| Request | Strategy | Why |
|---|---|---|
| Navigations (`request.mode === 'navigate'`) | Serve the precached app shell directly (cache-first). No network race. | It is an SPA; the shell never changes without a new build hash. Removes the timeout-vs-blank-screen problem entirely |
| `GET /api/*` | Network-first with `AbortSignal.timeout(2500)`, fall back to the `api-v1` cache; always write through to the cache on success | Fresh when reachable, last-known when not. The 2.5s timeout matters because off-tailnet the socket hangs rather than failing fast |
| Meal photos, other images | Cache-first into `img-v1`, with a hand-rolled LRU capped at ~200 entries | Quota is generous but not infinite, and the Cache API has no eviction of its own |

**But the UI must not read from the Cache API.** Today's plan renders from
IndexedDB, always. The flow is: fetch → validate → write to IDB → the UI's
reactive read of IDB updates. The service worker cache is a transport fallback so
that the fetch itself can succeed offline; it is never the source of truth for a
screen. This means the "today's plan" view has one code path online and offline,
which is the only way it stays correct.

**Service worker hygiene:**

```js
// Serve /sw.js with: Cache-Control: no-cache, Content-Type: text/javascript
const SHELL = `shell-${BUILD_HASH}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)));
  // Do NOT skipWaiting() unconditionally - it can swap the bundle out from
  // under a running workout. Wait for the app to say it is safe.
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && !k.startsWith('api-') && !k.startsWith('img-'))
                          .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();  // sent by an "Update" tap
});
```

### Queuing a POST made offline, without Background Sync

There is no `sync` event and there never will be one soon: WebKit's standards
position on Background Sync raises battery-life and privacy concerns, and neither
`ServiceWorkerRegistration.sync` nor `periodicSync` is implemented
([WebKit/standards-positions issue 14](https://github.com/WebKit/standards-positions/issues/14);
browser-compat-data, both checked 2026-08-21). Periodic Background Sync
"was never specified or shipped in a browsing engine."

So the replay is client-driven. The design:

**Store.** One IndexedDB object store, `outbox`, keyed by a client-generated
UUID:

```js
{
  id: crypto.randomUUID(),   // also the Idempotency-Key
  url: '/api/workouts/1234/sets',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{"reps":8,"weight":80}',  // string, or a Blob for photo uploads
  createdAt: Date.now(),
  attempts: 0,
  nextAttemptAt: 0,
  lastError: null,
}
```

Photos go in as `Blob` values — IndexedDB stores Blobs natively; do not
base64-encode them, it inflates by a third and burns memory.

**Write path.** Every mutating action does the same three things regardless of
connectivity: apply optimistically to the local model, enqueue into `outbox`,
kick the flusher. The UI never branches on online/offline. That is what makes
offline behaviour trustworthy rather than a second, less-tested mode.

**Idempotency.** Send `Idempotency-Key: <id>`. The server stores seen keys for
30 days and returns the original response on a repeat. Without this, a request
that succeeded but whose response was lost gets replayed and double-logs the set.
This is not optional; the retry loop guarantees it will happen.

**Flush triggers — all six, because no single one is reliable:**

1. `window.addEventListener('online', flush)`
2. `document.addEventListener('visibilitychange')` when `visibilityState ===
   'visible'` — the main one, since iOS suspends and resumes constantly
3. `pageshow` (covers back-forward cache restores)
4. App boot
5. After any successful network request from the app (connectivity just proved
   itself)
6. **Inside the service worker's `push` handler.** A push wakes the worker while
   the app is closed. This is the only background execution iOS gives you, and
   draining the outbox there is legitimate as long as you also show the
   notification the push was for.

Plus a 20-30 s poll while the app is foregrounded and the outbox is non-empty.

**Flusher:**

```js
let flushing = false;

export async function flushOutbox() {
  if (flushing) return;            // in-process guard
  flushing = true;
  try {
    for (;;) {
      const item = await nextDue();          // oldest with nextAttemptAt <= now
      if (!item) return;
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { ...item.headers, 'Idempotency-Key': item.id },
          body: item.body,
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok || res.status === 409) {          // 409 = already applied
          await remove(item.id);
          continue;
        }
        if (res.status >= 400 && res.status < 500
            && res.status !== 408 && res.status !== 429) {
          // Permanently bad. Never retry; surface it.
          await park(item.id, `HTTP ${res.status}`);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);       // 5xx, 408, 429 -> back off
      } catch (err) {
        const n = item.attempts + 1;
        const delay = Math.min(2 ** n * 1000, 5 * 60_000) * (0.7 + Math.random() * 0.6);
        await defer(item.id, n, Date.now() + delay, String(err));
        return;                                      // stop the run; wait for a trigger
      }
    }
  } finally {
    flushing = false;
  }
}
```

Serialize strictly and stop the whole run on the first failure — parallel replay
reorders writes, and on a fitness log order is meaning.

**Detecting "offline" correctly here.** `navigator.onLine` answers "is there a
network interface", not "can I reach the Mac". With a Tailscale origin those
diverge constantly: cellular is up, Tailscale is off, `onLine` is `true`, every
request hangs then fails. Use a probe:

```js
export async function originReachable() {
  try {
    const res = await fetch('/healthz', {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch { return false; }
}
```

Show that as the connectivity indicator, not `navigator.onLine`. And say
"Can't reach the Mac — is Tailscale on?" rather than "You're offline", because
that is the actual remedy nine times out of ten.

**Never keep the queue only in memory.** iOS terminates backgrounded web apps
without warning and the app relaunches at `start_url`. Anything not in IndexedDB
at the moment of the write is gone.

---

## 4. WebAuthn passkeys, Safari on iOS and macOS

### Secure context

The spec is explicit:

> "the origin of the Relying Party MUST be a secure context."

([W3C Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/), checked
2026-08-21). `CredentialsContainer` is `[SecureContext]`, so on a non-secure
origin `navigator.credentials` is simply absent.
`navigator.credentials` is supported from Safari 13 / iOS 13
(browser-compat-data, checked 2026-08-21).

HTTPS with a certificate the device already trusts satisfies it. **[UNVERIFIED —
confirm against Tailscale's own documentation]** Tailscale's `tailscale cert` /
`tailscale serve` obtain a publicly trusted certificate for the MagicDNS name
under `ts.net`, so `https://lamberts-mac-mini.tailda76d6.ts.net` should be a
plain secure context in Safari with no profile to install. Verify by loading the
origin on the iPhone and checking `window.isSecureContext === true` and that
Safari shows no certificate warning. **Do not use a self-signed certificate**:
even after manually trusting it in iOS Settings, you are one iOS update away from
a broken passkey flow, and it is an extra human dependency that belongs in
PREFLIGHT if you take it on.

### How the RP ID must relate to the origin

The rule, from the WebAuthn Level 3 create() and get() algorithms: the caller's
`rp.id` must be "a registrable domain suffix of or is equal to" the origin's
effective domain, and a `SecurityError` is thrown otherwise. If `rp.id` is
omitted it defaults to the caller's origin's effective domain.

The algorithm it defers to is in the HTML Standard, and this is the part that
decides the Tailscale question. Verbatim, "To determine if a scalar value string
*hostSuffixString* is a registrable domain suffix of or is equal to a host
*originalHost*":

> 1. If *hostSuffixString* is the empty string, then return false.
> 2. Let *hostSuffix* be the result of parsing *hostSuffixString*.
> 3. If *hostSuffix* is failure, then return false.
> 4. If *hostSuffix* does not equal *originalHost*:
>    1. If *hostSuffix* or *originalHost* is not a domain, then return false.
>    2. If *hostSuffix*, prefixed by U+002E (.), does not match the end of
>       *originalHost*, then return false.
>    3. **If any of the following are true: *hostSuffix* equals *hostSuffix*'s
>       public suffix; or *hostSuffix*, prefixed by U+002E (.), matches the end
>       of *originalHost*'s public suffix — then return false.**
> 5. Return true.

([HTML Standard, 7.1.1 Origin](https://html.spec.whatwg.org/multipage/browsers.html),
checked 2026-08-21)

Note step 4 is skipped entirely when *hostSuffix* equals *originalHost*. **An
exact-hostname RP ID is always legal, public suffix or not.**

The spec ships a worked table. Two rows are the ones that matter here:

| hostSuffixString | originalHost | Outcome | Spec's note |
|---|---|---|---|
| `"com"` | `example.com` | ❌ | "At the time of writing, com is a public suffix." |
| `"amazonaws.com"` | `test.amazonaws.com` | ✅ | "At the time of writing, amazonaws.com is a registrable domain." |

### `ts.net` and the Public Suffix List

`ts.net` is on the PSL. Fetched from
[publicsuffix.org/list/public_suffix_list.dat](https://publicsuffix.org/list/public_suffix_list.dat)
on 2026-08-21, lines 15977-15980:

```
// Tailscale Inc. : https://www.tailscale.com
// Submitted by David Anderson <infra+public-suffix-list@tailscale.com>
ts.net
*.c.ts.net
```

Two rules. The wildcard `*.c.ts.net` only applies to hosts under `c.ts.net` and
does **not** apply to a tailnet named `tailda76d6.ts.net`. So for
`lamberts-mac-mini.tailda76d6.ts.net` the governing rule is `ts.net`, and:

- public suffix = `ts.net`
- registrable domain (eTLD+1) = `tailda76d6.ts.net`

Running the algorithm:

| Candidate `rp.id` | Legal? | Why |
|---|---|---|
| omitted | ✅ | Defaults to the effective domain, `lamberts-mac-mini.tailda76d6.ts.net` |
| `"lamberts-mac-mini.tailda76d6.ts.net"` | ✅ | Equals *originalHost*; step 4 never runs |
| `"tailda76d6.ts.net"` | ✅ | Exactly the `"amazonaws.com"` / `test.amazonaws.com` row. It is a suffix, it is not itself a public suffix, and `.tailda76d6.ts.net` does not match the end of `ts.net` |
| `"ts.net"` | ❌ **SecurityError** | Equals its own public suffix. Exactly the `"com"` / `example.com` row |

**So the worry is unfounded in the way people usually fear it, and real in a
different way.** Being under a public suffix does not block you — it only blocks
you from claiming the public suffix itself, which you would never want. Tailscale
put `ts.net` on the list precisely so that one tailnet cannot set cookies or
claim credentials for another, and that boundary works in your favour.

**[UNVERIFIED]** I found no WebKit source or Apple documentation describing a
Safari-specific deviation from the HTML algorithm for public suffixes. Safari
ships a PSL and the algorithm is normative, so it should behave as tabled above,
but **register one passkey on the device early in the build and confirm before
designing around it.** If `rp.id: "tailda76d6.ts.net"` throws, fall back to
omitting `rp.id` and accept the rename fragility.

### iCloud Keychain sync, Mac Touch ID to iPhone

A passkey created in Safari on the Mac with Touch ID is stored in iCloud Keychain
and is available on the iPhone. The requirements:

> "To use passkeys, iCloud Keychain and two-factor authentication must be turned
> on."

> "before you turn on iCloud Keychain, update your device to the latest iOS or
> iPadOS, the latest version of macOS... and make sure that you turned on
> two-factor authentication for your Apple Account."

> "Any Apple Account using iCloud Keychain requires two-factor authentication. If
> a user attempts to register a new passkey and does not have two-factor
> authentication set up, they will be automatically prompted to set up two-factor
> authentication."

([Apple, About the security of passkeys](https://support.apple.com/en-us/102195)
and [Set up iCloud Keychain](https://support.apple.com/en-us/109016), checked
2026-08-21)

Checklist for the one user: same Apple Account on both devices, iCloud Keychain
on in Settings → *name* → iCloud → Passwords and Keychain, two-factor
authentication on. That belongs in PREFLIGHT.

One structural point that is easy to miss: **the Home Screen web app has its own
cookie and storage partition, isolated from Safari, but passkeys do not live in
that partition** — they live in iCloud Keychain, which is system-wide. So a
passkey created in Safari on the Mac is usable from the installed web app on the
iPhone, provided the RP ID matches. This is exactly why passkeys are the right
auth mechanism here and cookies alone are not: on iOS, cookies are *not* copied
into the web app, and WWDC23 warns that email magic links "will open in the
default browser" and so "will not automatically sign users in to the web app."

Registration options that get you a syncing, discoverable, autofill-capable
passkey:

```js
const cred = await navigator.credentials.create({
  publicKey: {
    rp: { id: 'tailda76d6.ts.net', name: 'Fitness' },
    user: { id: userIdBytes, name: 'lambert', displayName: 'Lambert' },
    challenge: challengeBytes,
    pubKeyCredParams: [{ type: 'public-key', alg: -7 },     // ES256
                       { type: 'public-key', alg: -257 }],  // RS256
    authenticatorSelection: {
      residentKey: 'required',       // discoverable: required for conditional UI
      requireResidentKey: true,
      userVerification: 'preferred',
      // Deliberately NOT setting authenticatorAttachment: pinning it to
      // 'platform' would block signing in on the Mac by scanning a QR code
      // with the iPhone. Leave it open.
    },
    attestation: 'none',
  },
});
```

`residentKey: 'required'` is what makes the credential discoverable, which
conditional UI needs and which lets you drop the username field entirely.

### Conditional UI / autofill

| Feature | Safari | Source |
|---|---|---|
| `PublicKeyCredential.isConditionalMediationAvailable()` | 16 | browser-compat-data |
| `mediation: 'conditional'` on `get()` (autofill sign-in) | Safari 16.1, iOS 16 / iPadOS 16 / macOS Monterey, Big Sur, Ventura | Apple |
| `mediation: 'conditional'` on `create()` (passkey upgrade from a password) | Safari 18 | webkit 15443 |
| Related origin requests (one RP ID across several origins) | Safari 18 | webkit 15443 |
| `prf` extension | Safari 18 | webkit 15443 |
| `parseCreationOptionsFromJSON()`, `parseRequestOptionsFromJSON()`, `toJSON()` | 18.4 | browser-compat-data |
| `signalUnknownCredential()`, `signalAllAcceptedCredentials()`, `signalCurrentUserDetails()` | 26 | browser-compat-data |
| `getClientCapabilities()` | 17.4 | browser-compat-data |
| CTAP PIN/UV Auth Protocol 2, PRF for security keys | 26.4 | webkit 17862 |

(all checked 2026-08-21)

WebKit on the Safari 18 additions:

> "Safari 18 beta adds support for using `mediation=conditional` for web
> authentication credential creation. This allows websites to automatically
> upgrade existing password-based accounts to use passkeys."

> "WebKit for Safari 18 beta adds support for using passkeys across related
> origins. This lets websites use the same passkey across a limited number of
> domains which share a credential backend."

([webkit.org/blog/15443](https://webkit.org/blog/15443/news-from-wwdc24-webkit-in-safari-18-beta/),
published 2024-06-10, checked 2026-08-21)

Wiring:

```html
<input type="text" name="username" autocomplete="username webauthn">
```

```js
if (await PublicKeyCredential.isConditionalMediationAvailable?.()) {
  const ac = new AbortController();
  navigator.credentials.get({
    mediation: 'conditional',
    signal: ac.signal,
    publicKey: { challenge, rpId: 'tailda76d6.ts.net', userVerification: 'preferred' },
  }).then(onAssertion).catch(() => {});   // aborts are normal
}
```

Start the conditional request once at page load, keep the `AbortController` so a
subsequent modal `get()` can cancel it. Conditional requests are not tied to a
user gesture; modal ones are.

The `signal*` methods (Safari 26) are worth adopting since they exist: after the
server deletes a credential, call `signalUnknownCredential()` so the Passwords app
stops offering a passkey the server no longer honours. That is the difference
between an app that ages well and one that accumulates dead entries.

### What happens if the RP ID changes

A credential is bound to its RP ID. The authenticator will not surface it for a
different RP ID, `allowCredentials` will not match, and `get()` fails with
`NotAllowedError` / no credential found. **There is no migration path and no
rename tool.** Every passkey is dead and the user re-registers from scratch.

For this deployment the RP ID changes if:

- **The Mac is renamed** → MagicDNS name changes → the hostname changes. This
  kills an RP ID pinned to the full hostname. It does **not** kill an RP ID
  pinned to `tailda76d6.ts.net`.
- **The tailnet name changes** (switching to a custom tailnet name, or Tailscale
  reissuing the `tailXXXXX` label) → kills both.
- **You move to a real domain later** → kills both. Related origin requests
  (Safari 18+) let a *new* origin use an *existing* RP ID via a
  `/.well-known/webauthn` document on the RP ID's origin — useful for adding an
  origin, useless for changing the RP ID itself.

**Recommendation:** set `rp.id: "tailda76d6.ts.net"` explicitly. It is legal, it
is one level more stable than the hostname, and it costs nothing today.
Regardless, the app needs a working non-passkey recovery path — the fallback for
a single-user internal tool being a long-lived signed token or a one-time code
printed on the Mac — because a rename is a plausible event and being locked out
of your own fitness log by a hostname change is a bad afternoon.

Renaming also breaks two other things at once, since the origin changes: the
Home Screen web app's storage partition is keyed to the origin, so all local data
is orphaned, and the push subscription is invalidated. **Treat renaming the Mac
as a full reinstall.** Record it in `.forge/PREFLIGHT.md`.

---

## 5. Workout-screen APIs

### SpeechSynthesis — works, but must be primed by a gesture

Supported since Safari 7 across the board; `voiceschanged` since Safari 16
(browser-compat-data, checked 2026-08-21). It works in a standalone Home Screen
web app — it is the same engine, and nothing in WebKit gates it on display mode.

The gesture requirement is real and is in the engine. From WebKit's
`SpeechSynthesis.cpp`
([WebKit/WebKit main](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp),
checked 2026-08-21):

```cpp
    if (auto* document = dynamicDowncast<Document>(context)) {
#if PLATFORM(IOS_FAMILY)
        if (document->requiresUserGestureForAudioPlayback())
            m_restrictions = BehaviorRestrictionFlags::RequireUserGestureForSpeechStart;
#endif
```

```cpp
void SpeechSynthesis::speak(SpeechSynthesisUtterance& utterance)
{
    // Like Audio, we should require that the user interact to start a speech synthesis session.
#if PLATFORM(IOS_FAMILY)
    if (UserGestureIndicator::processingUserGesture())
        removeBehaviorRestriction(BehaviorRestrictionFlags::RequireUserGestureForSpeechStart);
    else if (userGestureRequiredForSpeechStart())
        return;
#endif
```

Read that carefully: on iOS, `speak()` **returns silently** if there is no
gesture — no exception, no error event, nothing to catch. And the restriction is
*removed* the first time `speak()` runs inside a gesture, permanently for that
document. So one prime unlocks the rest of the session:

```js
let primed = false;

export function primeSpeech() {          // call from the "Start workout" tap
  if (primed) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;                          // inaudible, still lifts the restriction
  speechSynthesis.speak(u);
  primed = true;
}

export function say(text, lang = 'fr-FR') {
  if (!primed) return;                   // don't pretend; show the cue visually
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = pickVoice(lang);
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
```

Voices: `getVoices()` often returns `[]` on the first synchronous call. Wait for
`voiceschanged`, then resolve once:

```js
function voicesReady() {
  return new Promise((res) => {
    const v = speechSynthesis.getVoices();
    if (v.length) return res(v);
    speechSynthesis.addEventListener('voiceschanged',
      () => res(speechSynthesis.getVoices()), { once: true });
  });
}
const pickVoice = (lang) =>
  cached.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
  ?? cached.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)))
  ?? null;
```

**[UNVERIFIED]** French and English voice availability. The spec only says
`getVoices()` returns the voices the platform has. iOS ships system voices for
its supported languages and French and English are both long-supported system
languages, so `fr-FR` and `en-US`/`en-GB` voices are expected to be present — but
I found no Apple document that guarantees a specific voice on a specific device.
**Enumerate on the actual iPhone, log the result, and store the chosen
`voiceURI`.** Never hardcode a voice name; they differ across iOS versions and
between the compact and enhanced downloads. If no matching voice is found, fall
back to leaving `u.voice` null and only setting `u.lang` — the system picks.

Also: speech is cut off when the screen locks or the app is backgrounded, and the
queue can get wedged. Call `speechSynthesis.cancel()` on `visibilitychange` to
hidden, and treat the utterance as lost rather than resuming it.

**Verdict: reliable, with the prime. Needs a visual fallback for every spoken
cue** — the user may have the ringer off, the Mac may be muted, and a silent
`speak()` gives you no signal.

### Screen Wake Lock — reliable only from iOS 18.4, and only installed

| | Version |
|---|---|
| macOS Safari | 16.4 |
| **iOS / iPadOS Safari** | **18.4** |

(`api.WakeLock`, `api.Navigator.wakeLock`, browser-compat-data, checked
2026-08-21)

WebKit, Safari 18.4:

> "The Screen Wake Lock API now also works in **Home Screen Web Apps on iOS and
> iPadOS 18.4.**"

(webkit 16574, checked 2026-08-21)

Two constraints in one sentence: iOS 18.4 minimum, and Home Screen web apps —
not Safari tabs.

The lock is released whenever the document becomes hidden, so re-acquire:

```js
let lock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return false;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
    return true;
  } catch { return false; }   // NotAllowedError when hidden, low battery, etc.
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && workoutActive && !lock) {
    acquireWakeLock();
  }
});
```

**Verdict: reliable on iOS 18.4+ installed; absent otherwise.** Set the floor at
18.4 rather than shipping the muted-looping-`<video>` hack, which drains battery,
occasionally shows a black flash, and is not documented anywhere as supported. If
`acquireWakeLock()` returns false, show a one-line banner ("Your screen may lock
during rest — tap to wake") rather than pretending.

### Timers when the screen locks or the app is backgrounded

There is no API that keeps a timer running. Backgrounded pages are throttled, and
an installed web app can be terminated outright by iOS with no callback. On
relaunch the app starts at `start_url`.

The only correct pattern is to store the wall-clock start and derive:

```js
// Persist to IDB on every state change, not just in memory.
const timer = { startedAt: Date.now(), durationMs: 90_000, id: crypto.randomUUID() };

function remainingMs() {
  return Math.max(0, timer.durationMs - (Date.now() - timer.startedAt));
}

// Recompute on resume, not just on tick.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    render(remainingMs());
    if (remainingMs() === 0 && !timer.fired) fireLateCue();
  }
});
window.addEventListener('pageshow', () => render(remainingMs()));
```

Use `Date.now()`, not `performance.now()` and not an accumulating counter —
`setInterval` callbacks are dropped while hidden, so a counter drifts by exactly
the time the user was away.

An audible end-of-rest cue **cannot** be scheduled to fire while backgrounded.
Three honest options: keep the wake lock so the app stays foreground (the design
this app should choose); accept the cue firing late on return and say so in the
UI ("rest ended 40s ago"); or schedule a Web Push from the server timed to the
rest interval, which does work in the background but costs a round trip and needs
the tailnet. For a single user doing a workout with the phone propped up, wake
lock plus a big on-screen countdown is the right answer.

### Vibration — does not exist

`Navigator.vibrate`: `safari` = **false**, `safari_ios` mirrors it
(browser-compat-data, checked 2026-08-21). The Vibration API is specified
([w3c.github.io/vibration](https://w3c.github.io/vibration/)) and MDN flags it as
"not Baseline because it does not work in some of the most widely-used browsers."

There is no haptic path from the web on iOS at all. Feature-detect and skip:

```js
if (navigator.vibrate) navigator.vibrate(200);   // never true on iOS
```

**Verdict: needs a fallback, and the fallback is the whole implementation.** Use
an audio cue plus a full-width colour flash on the countdown. Do not build UI
that assumes a buzz.

### Summary

| API | iOS status | Reliable? |
|---|---|---|
| SpeechSynthesis | Safari 7+, all modes | Yes, after a gesture prime. Visual fallback required |
| Screen Wake Lock | iOS 18.4+, Home Screen web apps only | Yes above the floor. Re-acquire on visibility |
| Background timers | Throttled or suspended; app may be killed | No. Derive from `Date.now()` |
| Backgrounded audio cue | Not schedulable | No. Wake lock, or accept a late cue |
| Vibration | Not implemented in any Safari | No. Audio plus visual |

---

## 6. Anything else that bites

### Standalone-mode navigation

**Scope decides whether a link leaves your app.** WWDC23:

> "All web apps have an associated scope. Links within the scope open within the
> web app. The default scope is the host of the webpage used to create the web
> app. You can further refine the scope using the web app manifest to limit it to
> a specific path on your site... Any links within the scope will stay within the
> web app and any links outside the scope will open in the default browser. **In
> Home Screen web apps on iOS, links outside the scope will open in Safari View
> Controller.**"

> **"Links loaded through `window.open` will always open in the web app
> regardless of scope."**

(WWDC23 10120, checked 2026-08-21)

That last line is the escape hatch: if something must stay in the app and you
cannot bring it into scope, use `window.open`.

**Storage is partitioned from Safari.** WWDC23: "Home Screen web apps have a
standalone, app-like experience on iOS, with **separate cookies and storage from
the browser.**" On the Mac, "Safari copies website cookies when it is added to
the Dock" — cookies only, one time, at add. "Since local storage is not copied
when a web app is created, users would have to re-authenticate." On iOS nothing
is copied at all.

Consequences to design around:
- Signing in in Safari does not sign you in in the installed app. Expect to
  authenticate once per install, per device.
- **Email magic links break.** WWDC23: "Since links from email will open in the
  default browser, this will not automatically sign users in to the web app that
  they already have. You may want to provide an alternative one-time code in the
  email that your user can easily enter into the sign-in flow." Passkeys avoid
  this entirely, which is another reason to lead with them.
- OAuth on a third-party domain stays in the web app "through heuristics"; if it
  does not, `window.open` forces it.

**No browser chrome means no back button.** Build your own. Safari 26.2 adds the
Navigation API — "The key feature is the `navigate` event, which fires for all
types of navigation — link clicks, form submissions, back-forward buttons, and
programmatic changes"
([webkit.org/blog/17640](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/),
checked 2026-08-21) — which makes SPA routing far cleaner if you can require
26.2. Below that, History API.

**The app relaunches at `start_url`.** iOS terminates backgrounded web apps.
Persist the current route, scroll position, and any in-progress workout to
IndexedDB on every meaningful change, and restore on boot. Users read this as
"the app forgot what I was doing", and it is the single most common complaint
about installed web apps on iOS.

**Set `Cache-Control: no-cache` on `/sw.js`** and serve it as `text/javascript`
from the app's origin with a scope covering `/`.

### No Background Sync, no Periodic Sync, no Background Fetch

All three are `false` in browser-compat-data for `safari` and `safari_ios`
(checked 2026-08-21). WebKit's standards position on Background Synchronization
raises battery-life and privacy concerns; Periodic Background Sync "was never
specified or shipped in a browsing engine due to a combination of low interest
from both developers and other browser engines, and high complexity due to an
unclear permission model"
([WebKit/standards-positions#14](https://github.com/WebKit/standards-positions/issues/14),
[WICG/background-sync periodicsync explainer](https://github.com/WICG/background-sync/blob/main/explainers/periodicsync-explainer.md),
checked 2026-08-21).

The one background execution hook you have is a service worker woken by a push,
covered in section 3.

### File input and camera capture for "photograph my meal"

`HTMLInputElement.capture`: `safari_ios` = **10**, `safari` (macOS) = **false**
(browser-compat-data, checked 2026-08-21). The same markup degrades to a plain
file picker on the Mac, which is the behaviour you want.

From the spec, the attribute is an enumerated attribute with keywords `user` and
`environment`, and:

> "If the `accept` attribute's value is set to a MIME type that has no associated
> capture control type, the user agent MUST act as if there was no `capture`
> attribute."

An absent or invalid value falls back to an implementation-specific state.

([W3C HTML Media Capture](https://www.w3.org/TR/html-media-capture/), checked
2026-08-21)

So always pair `capture` with `accept`.

**But for a meal-photo flow, ship two entry points, and only one uses `capture`:**

```html
<!-- Default: iOS shows Photo Library / Take Photo / Choose File -->
<input type="file" accept="image/*" id="meal-pick">

<!-- Dedicated button: goes straight to the rear camera -->
<input type="file" accept="image/*" capture="environment" id="meal-shoot">
```

`capture` **removes** the photo-library option and jumps straight to the camera.
That is right for "take a photo now" and wrong for "log the lunch I photographed
an hour ago", which is most of the time. Make the library-capable input the
default.

Two handling notes:
- **[UNVERIFIED]** iOS may deliver HEIC. With `accept="image/*"` it commonly
  transcodes to JPEG, but branch on `file.type` and handle `image/heic` /
  `image/heif` by re-encoding through the canvas anyway (which you are doing
  regardless, see below).
- **Downscale before you encode.** A 12 MP photo is roughly 48 MB as an RGBA
  bitmap. iOS will hand you a blank canvas rather than an out-of-memory error if
  you push it. Cap the longest edge at ~1600 px.

### EXIF stripping via canvas: yes, with two caveats

**It is the right approach.** A canvas holds pixels and nothing else, so
`toBlob()` serializes the bitmap and the output carries no EXIF, no GPS, no maker
notes, no timestamp. The HTML Standard defines `toBlob()` and `toDataURL()` as "a
serialization of this `canvas` element's bitmap as a file"
([HTML Standard, canvas](https://html.spec.whatwg.org/multipage/canvas.html),
checked 2026-08-21). You are stripping by re-encoding, not by parsing a metadata
format you would otherwise have to keep up with — which is exactly why it is the
robust option.

**Caveat 1: orientation.** `image-orientation`'s initial value is `from-image`
([CSS Images 3](https://drafts.csswg.org/css-images-3/#the-image-orientation),
checked 2026-08-21), so Safari applies the EXIF orientation when it renders the
image. If you draw from a source that has already had orientation applied, the
canvas pixels come out upright and dropping EXIF is safe. If you decode with
`createImageBitmap(file, { imageOrientation: 'none' })` you get the raw sensor
orientation, and stripping EXIF leaves the photo permanently sideways. Use the
default:

```js
async function stripAndDownscale(file, maxEdge = 1600, quality = 0.82) {
  // Default imageOrientation is 'from-image': orientation is baked into pixels.
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  // The canvas is origin-clean (the source was a File), so this cannot throw
  // SecurityError. Output has no EXIF and no GPS.
  return await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
}
```

**Caveat 2: origin-clean.** Both `toBlob()` and `toDataURL()` "throw a
SecurityError DOMException" if "this `canvas` element's bitmap's origin-clean flag
is set to false" (HTML Standard, checked 2026-08-21). A `File` from an input is
always origin-clean, so this path is safe; only a cross-origin `<img>` source
would taint it.

**One thing to grab before you strip.** Re-encoding also discards the capture
time. Read `file.lastModified` first if you want to date the meal by when it was
taken rather than when it was uploaded, and store just that number. Do not keep
the raw file "just in case" — that reintroduces the GPS coordinates you removed.

### Tailscale-specific gotchas

1. **The origin is unreachable off-tailnet.** Every fetch hangs then fails while
   `navigator.onLine` says `true`. Detect with a `/healthz` probe (section 3) and
   word the error as "Can't reach the Mac — is Tailscale on?".
2. **Push still arrives off-tailnet.** APNs delivers from Apple's infrastructure,
   not from your Mac. But the service worker cannot fetch your origin to fill in
   the notification. **Put the full notification text in the encrypted payload**,
   and prefer Declarative Web Push so a notification renders even if the worker
   fails.
3. **The Mac must be awake and serving.** A sleeping Mac is an offline origin.
   For a self-hosted single-user app this is the most common cause of "the app is
   broken". Surface the last successful sync time in the UI so the cause is
   visible.
4. **Everything on one origin.** Manifest, service worker, API, and assets all
   under `https://lamberts-mac-mini.tailda76d6.ts.net`. A cross-origin API would
   land in a different storage partition and complicate the RP ID story.
5. **Renaming the Mac is destructive.** New origin means: Home Screen web app
   data orphaned, push subscription invalidated, passkeys broken unless the RP ID
   was pinned to `tailda76d6.ts.net`. Put it in PREFLIGHT as a "do not do this
   casually" line.
6. **No self-signed certificates.** They break secure context assumptions,
   require a manual trust step on the iPhone, and add a human dependency. Use
   `tailscale cert` / `tailscale serve`.

---

## Sources

All fetched and read on **2026-08-21**.

| # | Source | URL | Published / updated |
|---|---|---|---|
| 1 | WebKit — WebKit Features in Safari 26.0 | https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ | 2025-09-15 |
| 2 | WebKit — Web Push for Web Apps on iOS and iPadOS | https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ | 2023-02-16 |
| 3 | WebKit — Meet Web Push | https://webkit.org/blog/12945/meet-web-push/ | 2022-06-07 |
| 4 | WebKit — Meet Declarative Web Push | https://webkit.org/blog/16535/meet-declarative-web-push/ | 2025-03 |
| 5 | WebKit — WebKit Features in Safari 18.4 | https://webkit.org/blog/16574/webkit-features-in-safari-18-4/ | 2025-03-31 |
| 6 | WebKit — WebKit Features in Safari 16.4 | https://webkit.org/blog/13966/webkit-features-in-safari-16-4/ | 2023-03-27 |
| 7 | WebKit — News from WWDC24: WebKit in Safari 18 beta | https://webkit.org/blog/15443/news-from-wwdc24-webkit-in-safari-18-beta/ | 2024-06-10 |
| 8 | WebKit — WebKit Features for Safari 26.2 | https://webkit.org/blog/17640/webkit-features-for-safari-26-2/ | 2025-12 |
| 9 | WebKit — WebKit Features for Safari 26.4 | https://webkit.org/blog/17862/webkit-features-for-safari-26-4/ | 2026-03 |
| 10 | WebKit — WebKit Features for Safari 26.6 | https://webkit.org/blog/18178/webkit-features-for-safari-26-6/ | 2026-07-27 |
| 11 | WebKit — Updates to Storage Policy | https://webkit.org/blog/14403/updates-to-storage-policy/ | 2023-08-10 |
| 12 | WebKit — Tracking Prevention in WebKit | https://webkit.org/tracking-prevention/ | living |
| 13 | WebKit — Designing Websites for iPhone X | https://webkit.org/blog/7929/designing-websites-for-iphone-x/ | 2017-09-25 |
| 14 | WebKit source — `SpeechSynthesis.cpp` | https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp | main |
| 15 | WebKit standards-positions — Web Background Synchronization | https://github.com/WebKit/standards-positions/issues/14 | living |
| 16 | Apple — Sending web push notifications in web apps and browsers | https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers | © 2026 |
| 17 | Apple — Configuring Web Applications | https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html | 2016-12-12 |
| 18 | Apple — Supported Meta Tags (Safari HTML Reference) | https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html | archive |
| 19 | Apple — WWDC23 session 10120, What's new in web apps | https://developer.apple.com/videos/play/wwdc2023/10120/ | 2023-06 |
| 20 | Apple — Supporting passkeys | https://developer.apple.com/documentation/authenticationservices/supporting-passkeys | © 2026 |
| 21 | Apple — About the security of passkeys | https://support.apple.com/en-us/102195 | living |
| 22 | Apple — Set up iCloud Keychain | https://support.apple.com/en-us/109016 | living |
| 23 | W3C — Web Authentication Level 3 | https://www.w3.org/TR/webauthn-3/ | living |
| 24 | W3C — Web Application Manifest | https://www.w3.org/TR/appmanifest/ | living |
| 25 | W3C — HTML Media Capture | https://www.w3.org/TR/html-media-capture/ | living |
| 26 | W3C — Push API | https://www.w3.org/TR/push-api/ | living |
| 27 | W3C — Vibration API | https://w3c.github.io/vibration/ | living |
| 28 | WHATWG — HTML Standard, 7.1.1 Origin (registrable domain suffix algorithm) | https://html.spec.whatwg.org/multipage/browsers.html | living |
| 29 | WHATWG — HTML Standard, canvas (`toBlob`, `toDataURL`, origin-clean) | https://html.spec.whatwg.org/multipage/canvas.html | living |
| 30 | CSS Images Module Level 3 — `image-orientation` | https://drafts.csswg.org/css-images-3/#the-image-orientation | living |
| 31 | Public Suffix List (`ts.net`, `*.c.ts.net` at lines 15977-15980) | https://publicsuffix.org/list/public_suffix_list.dat | living |
| 32 | IETF — VAPID, draft-ietf-webpush-vapid-00 | https://datatracker.ietf.org/doc/html/draft-ietf-webpush-vapid-00 | draft |
| 33 | IETF — RFC 8030, Generic Event Delivery Using HTTP Push | https://datatracker.ietf.org/doc/html/rfc8030 | 2016 |
| 34 | MDN browser-compat-data — `api/Notification.json` | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Notification.json | main |
| 35 | MDN browser-compat-data — `api/PushManager.json`, `api/PushSubscription.json` | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/PushManager.json | main |
| 36 | MDN browser-compat-data — `api/ServiceWorkerRegistration.json`, `api/ServiceWorkerGlobalScope.json` | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ServiceWorkerRegistration.json | main |
| 37 | MDN browser-compat-data — `api/Navigator.json` (vibrate, wakeLock, setAppBadge, credentials, storage) | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json | main |
| 38 | MDN browser-compat-data — `api/WakeLock.json` | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/WakeLock.json | main |
| 39 | MDN browser-compat-data — `api/PublicKeyCredential.json`, `api/CredentialsContainer.json` | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/PublicKeyCredential.json | main |
| 40 | MDN browser-compat-data — `api/HTMLInputElement.json` (`capture`) | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLInputElement.json | main |
| 41 | MDN browser-compat-data — `api/StorageManager.json`, `api/Window.json` | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/StorageManager.json | main |
| 42 | MDN browser-compat-data — `css/types/length.json` (`dvh`/`svh`/`lvh`) | https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/types/length.json | main |
| 43 | WICG — Periodic Background Sync explainer | https://github.com/WICG/background-sync/blob/main/explainers/periodicsync-explainer.md | living |

### Open items to verify on the device before building on them

1. `notificationclick` firing on iOS (browser-compat-data says `false`; WebKit's
   feature description implies otherwise). Blocks notification deep-linking.
2. `rp.id: "tailda76d6.ts.net"` accepted by Safari without `SecurityError`.
   Blocks the rename-resilience decision.
3. `fr-FR` and `en-*` voices present in `speechSynthesis.getVoices()`.
4. Tailscale's certificate is publicly trusted and `window.isSecureContext` is
   `true` on the iPhone with no manual profile.
5. `theme_color` behaviour on the iOS status bar in standalone.
6. Whether iOS delivers HEIC or transcoded JPEG from `<input accept="image/*">`
   on the target iOS version.
7. VAPID JWT `sub` claim format accepted by APNs (`mailto:` assumed).
