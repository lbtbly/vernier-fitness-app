# Google Calendar API for a single-user, self-hosted web app

Research note. Every fact below comes from an official Google page. URL and check
date are recorded per section and collected in the source table at the end.
All pages checked **2026-08-21**.

Rule followed while writing this: no scope string, endpoint, parameter, or error
code appears here unless it was read verbatim off a Google page. Where Google
does not document something, the note says so instead of guessing. Those gaps are
collected in "Open questions" at the end and belong in PREFLIGHT.

---

## 1. The minimal scopes

### The scope strings, verbatim

From `https://developers.google.com/workspace/calendar/api/auth` (page footer:
"Last updated 2026-07-22 UTC") and confirmed identical on
`https://developers.google.com/identity/protocols/oauth2/scopes`. Checked 2026-08-21.

| Scope | Google's description, verbatim |
|---|---|
| `https://www.googleapis.com/auth/calendar.app.created` | "Make secondary Google calendars, and see, create, change, and delete events on them." |
| `https://www.googleapis.com/auth/calendar.freebusy` | "View your availability in your calendars." |
| `https://www.googleapis.com/auth/calendar.events.freebusy` | "See the availability on Google calendars you have access to." |
| `https://www.googleapis.com/auth/calendar.readonly` | "See and download any calendar you can access using your Calendar." |
| `https://www.googleapis.com/auth/calendar.events.readonly` | "View events on all your calendars." |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | "See the list of Google calendars you're subscribed to." |
| `https://www.googleapis.com/auth/calendar.calendars` | "See and change the properties of Google calendars you have access to, and create secondary calendars." |
| `https://www.googleapis.com/auth/calendar.events` | "View and edit events on all your calendars." |
| `https://www.googleapis.com/auth/calendar` | "See, edit, share, and permanently delete all the calendars you can access using Google Calendar." |

**`calendar.app.created` exists.** It is listed on the Calendar auth page and it
appears in the authorization block of every write endpoint this app needs:
`calendars.insert`, `events.insert`, `events.patch`, `events.list`. It grants
creation of secondary calendars plus full event CRUD **on the calendars the app
itself created**, and nothing on any other calendar.

### Which scope authorizes which call

Read off the "Authorization" block of each reference page, checked 2026-08-21.

| Call | Scopes Google lists as sufficient |
|---|---|
| `freeBusy.query` | `calendar.readonly`, `calendar`, `calendar.events.freebusy`, `calendar.freebusy` |
| `calendarList.list` | `calendar.readonly`, `calendar`, `calendar.calendarlist`, `calendar.calendarlist.readonly` |
| `calendars.insert` | `calendar`, `calendar.app.created`, `calendar.calendars` |
| `events.insert` | `calendar`, `calendar.events`, `calendar.app.created`, `calendar.events.owned` |
| `events.patch` | `calendar`, `calendar.events`, `calendar.app.created`, `calendar.events.owned` |
| `events.list` | `calendar.readonly`, `calendar`, `calendar.events.readonly`, `calendar.events`, `calendar.app.created`, `calendar.events.freebusy`, `calendar.events.owned`, `calendar.events.owned.readonly`, `calendar.events.public.readonly` |

Note what is absent. `calendar.app.created` does **not** appear on
`freeBusy.query` or `calendarList.list`. Neither freebusy scope appears on
`calendarList.list`. The two capabilities need two separate grants.

### The smallest combination that does the job

**Two scopes, if the owner supplies calendar IDs by hand:**

```
https://www.googleapis.com/auth/calendar.freebusy
https://www.googleapis.com/auth/calendar.app.created
```

**Three scopes, if the app shows the owner a picker of their calendars:**

```
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/calendar.freebusy
https://www.googleapis.com/auth/calendar.app.created
```

Recommend the three-scope set. A picker is the difference between a product and a
config file, and `calendar.calendarlist.readonly` is the narrowest scope that
returns calendar IDs.

Choose `calendar.freebusy` over `calendar.events.freebusy`. Both authorize
`freeBusy.query`, but `calendar.events.freebusy` also authorizes `events.list`,
so it is strictly wider. Google's own instruction on the auth page:
"Generally, you should choose the most narrowly focused scope possible and avoid
requesting scopes that your app doesn't require."

Never request `calendar` or `calendar.events` for this app. Both grant write
access to every calendar the user can touch. Neither is needed.

### Sensitive or restricted

**Restricted: none of them.** Google's list of restricted scopes, published on
`https://support.google.com/cloud/answer/13807380` ("Requesting Minimum Scopes",
checked 2026-08-21), covers Gmail, Drive, Fit, and similar. No Calendar scope
appears on it. That matters because restricted scopes carry an extra burden:
"Every app that requests access to Google users' restricted data and has the
ability to access data from or through a third-party server must go through a
security assessment from Google-empanelled security assessors" using CASA, with
re-assessment "at least every 12 months"
(`https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification`,
checked 2026-08-21). None of that applies here. Google states plainly on the
minimum-scopes page: "Projects requesting only sensitive scopes do not need to
undergo a third-party security assessment."

**Sensitive: Google does not publish a per-scope table for Calendar.** This is the
honest answer and it is load-bearing, so read it carefully.

- The Calendar auth page lists scope and meaning only. There is no sensitivity
  column. Verified by reading the raw page 2026-08-21.
- `https://developers.google.com/identity/protocols/oauth2/scopes` states:
  "Sensitive scopes require review by Google and have a _sensitive_ indicator on
  the Google Cloud Console's OAuth consent screen configuration page."
- The sensitive-scope verification page states: "Examples of sensitive scopes
  include reading events stored in Google Calendar, storing a new contact in
  Google Contacts, or deleting a YouTube video. For more information about
  available scopes and their classifications, refer to the reference
  documentation of the API endpoints called by your app and any related
  authorization guide published for the API."
- The same page says the console is the authority: "Declare all scopes used by
  your app in the Cloud Console's Data Access page. Scopes you specify are grouped
  into sensitive or restricted categories" and "Added scopes are classified as
  non-sensitive, sensitive, or restricted."

So: reading Calendar events is a sensitive act by Google's own example, and the
classification of each of our three strings is readable in one place, the console
Data access page. **Plan for all three to be sensitive.** Confirm by pasting them
into `Google Auth Platform > Data access > Add or remove scopes` and reading the
category column. That confirmation is a PREFLIGHT line, not an assumption.

The consequence of "sensitive" is exactly one thing for this app: the unverified
app screen and the 100-user cap, both covered in section 3. Neither blocks a
single-user install.

---

## 2. The OAuth flow for a web server app

Source: `https://developers.google.com/identity/protocols/oauth2/web-server`
(page footer: "Last updated 2026-08-07 UTC"). Checked 2026-08-21.

### Endpoints

| Purpose | Endpoint |
|---|---|
| Authorization | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token exchange and refresh | `https://oauth2.googleapis.com/token` |
| Revocation | `https://oauth2.googleapis.com/revoke` |

"This endpoint is accessible only over HTTPS. Plain HTTP connections are refused."

### Authorization request parameters

| Parameter | Google's status | What it does |
|---|---|---|
| `client_id` | Required | "The client ID for your application. You can find this value in the Cloud Console Clients page." |
| `redirect_uri` | Required | "The value must exactly match one of the authorized redirect URIs for the OAuth 2.0 client... Note that the http or https scheme, case, and trailing slash ('/') must all match." Mismatch returns `redirect_uri_mismatch`. |
| `response_type` | Required | "Set the parameter value to `code` for web server applications." |
| `scope` | Required | Space-delimited list. |
| `access_type` | Recommended | "Valid parameter values are `online`, which is the default value, and `offline`. Set the value to `offline` if your application needs to refresh access tokens when the user is not present at the browser. This value instructs the Google authorization server to return a refresh token and an access token the first time that your application exchanges an authorization code for tokens." |
| `state` | Recommended | "Specifies any string value that your application uses to maintain state between your authorization request and the authorization server's response." Google flags this as the CSRF control: "The OAuth client must prevent CSRF as called out in the OAuth2 Specification. One way to achieve this is by using the state parameter." |
| `include_granted_scopes` | Optional | Incremental authorization. |
| `enable_granular_consent` | Optional | "Defaults to `true`." No effect for clients created after 2019. |
| `login_hint` | Optional | Email address or `sub` identifier. |
| `prompt` | Optional | "A space-delimited, case-sensitive list of prompts... Possible values are: `none`, `consent`, `select_account`." |

Google's sample authorization URL, verbatim:

```
https://accounts.google.com/o/oauth2/v2/auth?
 scope=https%3A//www.googleapis.com/auth/drive.metadata.readonly%20https%3A//www.googleapis.com/auth/calendar.readonly&
 access_type=offline&
 include_granted_scopes=true&
 response_type=code&
 state=state_parameter_passthrough_value&
 redirect_uri=https%3A//developers.google.com/oauthplayground&
 client_id=client_id
```

### Getting a refresh token, and keeping it

Two facts, both from the page, and together they are the whole trick:

1. `access_type=offline` is what makes Google return a refresh token at all.
2. "Important Note - The refresh_token is only returned on the first
   authorization." If you lose it, a plain re-authorization will not give you
   another one. You must send `prompt=consent` to force re-consent and a new
   refresh token, or have the user revoke the grant first.

Google's own warning: "if your application loses the refresh token, the user will
need to repeat the OAuth 2.0 consent flow so that your application can obtain a
new refresh token."

So the connect flow ships with `access_type=offline` and `prompt=consent` on every
authorization, and the refresh token is persisted before the handler returns.

### Step 4: handle the response

"Before handling the OAuth 2.0 response on the server, you should confirm that the
`state` received from Google matches the `state` sent in the authorization
request."

Response shapes:

```
https://oauth2.example.com/auth?error=access_denied
https://oauth2.example.com/auth?code=4/P7q7W91a-oMsCeLvIaQm6bTrgtp7
```

Google adds a warning worth honoring: "If your response endpoint renders an HTML
page, any resources on that page will be able to see the authorization code in the
URL... we recommend that the server first handle the request, then redirect to
another URL that doesn't include the response parameters."

### Step 5: exchange the code

`POST https://oauth2.googleapis.com/token`, `Content-Type:
application/x-www-form-urlencoded`, body fields:

| Field | Value |
|---|---|
| `client_id` | "The client ID obtained from the Cloud Console Clients page." |
| `client_secret` | Listed as Optional. "The client secret obtained from the Cloud Console Clients page." |
| `code` | "The authorization code returned from the initial request." |
| `grant_type` | "must be set to `authorization_code`." |
| `redirect_uri` | "One of the redirect URIs listed for your project in the Cloud Console Clients page for the given `client_id`." |

Google's sample body:

```
code=4/P7q7W91a-oMsCeLvIaQm6bTrgtp7&
client_id=your_client_id&
redirect_uri=https%3A//developers.google.com/oauthplayground&
grant_type=authorization_code
```

Response fields: `access_token`, `expires_in` ("The remaining lifetime of the
access token in seconds"), `refresh_token` ("only present in this response if you
set the `access_type` parameter to `offline`"), `refresh_token_expires_in` ("This
value is only set when the user grants time-based access"), `scope`, `token_type`
("This value is always `Bearer`").

Google publishes no fixed access-token lifetime. Read `expires_in` and refresh on
it. The sample response shows `"expires_in": 3920`, which is a sample, not a
contract.

### The exact refresh request

`POST https://oauth2.googleapis.com/token`, form-encoded. Google's sample body,
verbatim:

```
client_id=your_client_id&
refresh_token=refresh_token&
grant_type=refresh_token
```

Fields per the page: `client_id`, `client_secret` (Optional),
`grant_type` ("must be set to `refresh_token`"), `refresh_token` ("The refresh
token returned from the authorization code exchange").

Sample success response:

```
{
  "access_token": "1/fFAGRNJru1FTz70BzhT3Zg",
  "expires_in": 3920,
  "scope": "https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/calendar.readonly",
  "token_type": "Bearer"
}
```

Note what is not in the refresh response: a new refresh token. Keep the one you
have.

Google also warns: "there are limits on the number of refresh tokens that will be
issued; one limit per client/user combination, and another per user across all
clients... If your application requests too many refresh tokens, it may run into
these limits, in which case older refresh tokens will stop working." A single-user
app that stores one token never approaches this. A buggy loop that re-runs consent
does.

### DPoP

The page documents an optional `DPoP` request header on both the code exchange and
the refresh: "A DPoP proof is a JWT that proves the possession of a private key...
If provided, the returned tokens are bound to this key." Google calls it
"recommended for increased security." It is genuinely optional and adds an EC
P-256 key to manage. Skip it for v1. Record it as a hardening option.

### PKCE

Careful here, because it is easy to overclaim.

The web-server page does **not** list `code_challenge` or `code_challenge_method`
among its parameters. Confirmed by searching the full rendered page text
2026-08-21: zero occurrences of "PKCE", "code_challenge", or "code_verifier".

Google documents PKCE on the installed-app page,
`https://developers.google.com/identity/protocols/oauth2/native-app`, checked
2026-08-21, against the same authorization endpoint
`https://accounts.google.com/o/oauth2/v2/auth`:

- "Google supports the Proof Key for Code Exchange (PKCE) protocol to make the
  installed app flow more secure."
- `code_verifier`: "a high-entropy cryptographic random string using the
  unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~", with a
  minimum length of 43 characters and a maximum length of 128 characters."
- `code_challenge` = `BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))` for `S256`,
  which Google marks recommended; `plain` sets challenge equal to verifier.
- `code_challenge_method`: "The value... defaults to `plain` if not present... The
  only supported values for this parameter are `S256` or `plain`."
- The token exchange then carries `code_verifier`.

**What to build:** the documented web-server flow, secured by `state` plus the
client secret, which is what Google prescribes for a confidential client. Adding
`code_challenge=S256` on top is defensible since it is the same endpoint, but it
is not documented for this client type, so do not treat it as a supported
guarantee. Do not omit `state` on the theory that PKCE replaces it.

### Redirect URI rules

Verbatim from the web-server page, and restated identically on
`https://support.google.com/cloud/answer/15549257` ("Manage OAuth Clients",
checked 2026-08-21):

- **Scheme:** "Redirect URIs must use the HTTPS scheme, not plain HTTP. Localhost
  URIs (including localhost IP address URIs) are exempt from this rule."
- **Host:** "Hosts cannot be raw IP addresses. Localhost IP addresses are exempted
  from this rule."
- **Domain:** "Host TLDs (Top Level Domains) must belong to the public suffix
  list." "Host domains cannot be 'googleusercontent.com'." No URL shortener
  domains unless the app owns them.
- **Userinfo:** not permitted.
- **Path:** no path traversal, "/.." or "\.." or their URL encoding.
- **Query:** "Redirect URIs cannot contain open redirects."
- **Fragment:** not permitted.
- **Characters:** no wildcards, no non-printable ASCII, no invalid percent
  encodings, no null characters.
- Timing: "It may take 5 minutes to a few hours for changes made to these settings
  to take effect."

**Does Google accept an https URI on a private hostname such as
`something.tailda76d6.ts.net`?**

Against the validation rules above, `https://something.tailda76d6.ts.net/oauth2callback`
passes every published check: it is https, the host is not a raw IP, and the
top-level domain is `.net`, which is on the public suffix list. Google's rules
never mention public routability, DNS resolvability from Google's side, or
private hostnames. The redirect is executed by the user's browser, not by Google's
servers, so an internally-resolvable host is not inherently a problem.

The real gate is elsewhere: **Authorized domains**. From
`https://support.google.com/cloud/answer/10311615` ("Manage OAuth App Branding",
checked 2026-08-21), verbatim:

> "All domains used in your project, whether in the branding page or client
> configuration pages must be pre-registered here."
>
> "To protect you and your users, Google restricts your OAuth 2.0 application to
> using Authorized Domains. If you have verified the domain with Google, you can
> use any Top Private Domain as an Authorized Domain."
>
> "Add your Authorized Domains before you add your redirect or origin URIs, your
> homepage URL, your terms of service URL, or your privacy policy URL."
>
> "If your app needs to go through verification, please go to the Google Search
> Console to check if your domains are verified."

You do not own `ts.net` and cannot prove ownership of it in Search Console.
Google's docs tie Search Console proof explicitly to the verification path, and do
not state whether an unverified domain can be registered as an authorized domain
for an app that will never seek verification. **That is a documented gap, not a
documented yes.** It is the single highest-risk unknown in this integration.

**Does Google accept a localhost URI?** Yes, explicitly. Localhost is exempt from
the https rule and localhost IPs are exempt from the raw-IP rule, and the exemption
is stated in the redirect-URI rules that apply to Web application clients. So
`http://localhost:PORT/oauth2callback` is a legal authorized redirect URI on a Web
application client.

**Recommendation.** Register both:

```
http://localhost:PORT/oauth2callback
https://something.tailda76d6.ts.net/oauth2callback
```

Build the connect flow to work against either, selected by config. Localhost is
the guaranteed path: the owner opens the connect page on the machine running the
app (or over an SSH tunnel), completes consent once, and the refresh token lands
in storage. The tailnet URI is the nicer path and probably works; treat it as
unproven until a human adds it in the console and sees it saved. Consent runs
once in the life of the install, so falling back to localhost costs the owner one
inconvenient minute, ever.

---

## 3. The publishing-status trap

This is the section that decides whether the integration is alive next week.

### Testing publishing status

Source: `https://support.google.com/cloud/answer/15549945` ("Manage App
Audience"), checked 2026-08-21. Verbatim:

> "Projects configured with a publishing status of **Testing** are limited to up
> to 100 test users listed in the OAuth consent screen. A test user consumes a
> project's test user quota once added to the project."
>
> "Google will display a warning message before allowing a specified test user to
> authorize scopes requested by your project's OAuth clients. The warning message
> confirms the user has test access to your project but should consider the risks
> associated with granting access to their data to an unverified app."
>
> **"Authorizations by a test user will expire seven days from the time of
> consent. If your OAuth client requests an offline access type and receives a
> refresh token, that token will also expire."**
>
> "The only exception to this behavior is if your app requests a subset of the
> following: name, email address, and user profile (through the userinfo.email,
> userinfo.profile, openid scopes or their OpenID Connect equivalents). For such
> requests, your users do not need to be in the trusted user list, they will not
> see a warning message, and their authorizations will not expire after 7 days.
> ... If your app requests any other OAuth scopes, then this exception does not
> apply."

Corroborated on `https://developers.google.com/identity/protocols/oauth2`
(checked 2026-08-21), verbatim: "A Google Cloud Platform project with an OAuth
consent screen configured for an external user type and a publishing status of
'Testing' is issued a refresh token expiring in 7 days."

And on
`https://developers.google.com/identity/protocols/oauth2/production-readiness/overview`
(checked 2026-08-21): Testing is "limited to a hard cap of 100 test users," and the
same page names "the 7-day refresh token expiration limit for apps in the Testing
status."

**The trap, stated plainly.** Any Calendar scope is outside the
openid/email/profile exception. So an app left in Testing gets a refresh token
that dies seven days after consent. The integration works all week, then throws
`invalid_grant` on a Monday with no code change and no user action. The fix is not
retry logic. The fix is publishing status.

The Testing warning screen exists too. The sensitive-scope verification page shows
it as "Figure 2. Tester warning screen" and notes: "Your app is still subject to a
tester warning screen... a user cap is in effect, and the refresh token lifetime
is limited."

### In production publishing status

From the same Manage App Audience page, verbatim:

> "Projects configured with a publishing status of **In production** are available
> to any user with a Google Account. A project's publishing status is considered
> In production after selecting the **Publish app** button. Your project's
> configuration may be subject to verification before its name and logo are
> displayed on an authorization screen or before it may request authorization of
> sensitive or restricted scopes."
>
> "Google will display an **Unverified apps** warning message if your project's
> OAuth clients request authorization of scopes considered sensitive or restricted
> before your project has completed verification for those scopes."

No seven-day rule is stated for production. Publishing is what removes it.

### Can an unverified production app still be used by its own owner?

Yes, and Google says so directly. From
`https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification`,
"Exceptions to verification requirements", verbatim:

> **"Personal use**
>
> One use case is if you are the only user of your app or if your app is used by
> only a few users, all of whom are known personally to you. You and your limited
> number of users might be comfortable with advancing through the unverified app
> screen and granting your personal accounts access to your app.
>
> Note: A user cap restricts the number of Google Accounts able to grant access to
> your unverified app."

And from `https://support.google.com/cloud/answer/7454865` ("Unverified apps",
checked 2026-08-21): "You don't need to go through verification for the following
kinds of apps: **Apps in development:** if your app is experimental or a test
build, you don't need to go through verification unless you decide to launch it to
the public."

So the owner clicks through the warning once, grants consent, and the refresh
token behaves like a production token.

### What the user actually sees

Google documents the screen but does not publish its verbatim on-screen wording in
these pages, so no exact string is quoted here. What is documented, verbatim from
the Unverified apps page:

> "An unverified app is an app or Apps Script that requests a sensitive or
> restricted OAuth scope, but hasn't gone through the Google verification process."
>
> "The app or script might display an 'unverified app' screen before it displays
> the consent screen."
>
> It appears when: "Your app uses sensitive or restricted scopes and you haven't
> configured them in your OAuth consent screen configuration page and requested
> verification"; or "Your app uses sensitive or restricted scopes that you haven't
> selected on the OAuth consent screen configuration page"; or you requested
> verification "but the verification is not yet complete."
>
> "When the scopes requested in your app code differ from the scopes requested in
> your OAuth consent screen configuration page, your users see an 'unverified app'
> screen. Make sure that scopes you request in your app are the same as what's in
> your OAuth consent screen."

That last line is an implementation requirement: the scope list in code and the
scope list on the Data access page must match exactly.

Google also notes the app may be surfaced in Security Checkup: "Security Checkup
might show your app as risky and unverified."

The production-readiness overview additionally states that in the unverified
published state, "the app's name and logo are not displayed on the consent
screen." The branding page confirms: "Without verification, only your application
domain will be visible to users."

### The user cap

From Manage App Audience, verbatim:

> "The user cap limits the number of users that can grant permission to your app
> when requesting unapproved sensitive or restricted scopes. **The user cap applies
> over the entire lifetime of the project, and it cannot be reset or changed.**"

| Applicable apps | Quota | Appeal |
|---|---|---|
| "Apps that present the unverified app screen to users" | "100 new users in total, after the app presents the unverified app screen" | "Request verification for your app" |

One user against a lifetime cap of 100 is not a constraint. But note "cannot be
reset": burning grants by repeatedly re-consenting across throwaway accounts is a
real way to damage a project. Consent once.

### What verification would require, if ever needed

From the sensitive-scope verification page, checked 2026-08-21. Sensitive-only, no
CASA:

1. Confirm no exception applies (personal use, development/testing, service-owned
   data, internal only, domain-wide installation).
2. Comply with the associated product branding requirements.
3. "Verify ownership of your project's authorized domains within the Google Search
   Console. Use a Google Account that's associated with your API Console project
   as an Owner or an Editor."
4. Homepage: "publicly accessible, and not just accessible to your site's
   logged-in users"; "The relevance of your home page to the app that's under
   review must be clear"; must describe functionality and cannot be only a login
   page; must link the privacy policy.
5. Privacy policy: "hosted within the same domain as your application's home
   page, and linked to on the OAuth consent screen"; must disclose "the manner in
   which your application accesses, uses, stores, or shares Google user data."
6. Brand verification first: Branding page, "Verify Branding" button, automated
   review "usually completes in a few minutes," then "Publish branding". Caveat:
   "Compliant verification results are valid for 7 days. If you don't publish
   within that timeframe, the status will change to Need to re-verify."
7. Then the OAuth Verification Center: "you must have a published branding status
   before you can request verification for data access." Declare all scopes via
   "Add or remove scopes."
8. "Prepare a detailed justification for each requested sensitive scope, as well
   as an explanation for why a narrower scope isn't sufficient."
9. "Prepare a video that fully demonstrates how a user initiates and grants access
   to the requested scopes and shows, in detail, the usage of the granted
   sensitive and restricted scopes in the app. Upload the video to YouTube Studio
   and set its Visibility as Unlisted." The video must show the consent flow in
   English, the app name on the consent screen, the client ID in the browser
   address bar, and the functionality behind each sensitive scope.
10. "The sensitive scope verification process typically takes 3-5 business days to
    complete."

Every one of those items assumes a public homepage on a domain you own and can
prove in Search Console. A tailnet-only app has neither. Verification is not the
path for this product.

### Decision

Publish the app to **In production** and leave it unverified. Add no test users.
The owner passes the unverified app screen once at connect time. Refresh tokens
then live under the ordinary rules in section 4, not the seven-day rule.

Do **not** ship with the project in Testing. That is the failure this note exists
to prevent.

---

## 4. Other causes of refresh-token invalidation

Source: `https://developers.google.com/identity/protocols/oauth2`, checked
2026-08-21. Google's framing: "You must write your code to anticipate the
possibility that a granted refresh token might no longer work." The documented
causes, verbatim:

1. "The user has revoked your app's access."
2. "The refresh token has not been used for six months."
3. "The user changed passwords and the refresh token contains Gmail scopes."
   (Not applicable here. No Gmail scopes.)
4. "The user account has exceeded a maximum number of granted (live) refresh
   tokens." Same page: "There is currently a limit of 100 refresh tokens per
   Google Account per OAuth 2.0 client ID."
5. "The user granted time-based access to your app and the access expired."
6. "If an admin set any of the services requested in your app's scopes to
   Restricted." (Workspace only.)
7. "For Google Cloud Platform APIs - the session length set by the admin could
   have been exceeded."

Plus, from section 3, the Testing-status seven-day expiry.

Two more that kill the integration without touching the token itself, both from
`https://support.google.com/cloud/answer/15549257`, checked 2026-08-21:

- **Unused client deletion.** "OAuth 2.0 clients that have been inactive for six
  months are automatically deleted." A client counts as unused if in six months it
  "has not been used for any credential or token request via the Google OAuth2.0
  endpoint" and "the client's settings have not been modified." Google sends "an
  email notification 30 days before an inactive client is scheduled for deletion"
  and one after. Consequences: "Calls to Google APIs using existing access tokens
  or refresh tokens associated with the deleted client will fail" and "Attempts to
  use the deleted client ID in authorization requests will result in a
  `deleted_client` error." Recoverable: "Deleted clients are typically recoverable
  at least 30 days following deletion" via the Deleted Credentials page. An app
  that refreshes tokens on a schedule stays alive on its own.
- **Disabled client secret.** "A disabled client secret will be rejected in OAuth
  flows."

And revocation is broader than it looks
(`https://developers.google.com/identity/protocols/oauth2/web-server`): "Revocation
removes all OAuth 2.0 scopes previously granted to a project, invalidating any
issued access or refresh tokens for all clients registered under that project." A
user tidying up their Google account permissions takes the whole project down, not
one scope.

### What a well-behaved client does on `invalid_grant`

Google's own guidance, verbatim from the web-server page:

> "**invalid_grant** ... When refreshing an access token or using incremental
> authorization, the token may have expired or has been invalidated. Authenticate
> the user again and ask for user consent to obtain new tokens. If you are
> continuing to see this error, ensure that your application has been configured
> correctly and that you are using the correct tokens and parameters in your
> request. Otherwise, the user account may have been deleted or disabled."

Translated into behavior for this app:

1. **Treat `invalid_grant` as permanent. Never retry it, never back off into it.**
   Backoff is for 403/429 and 5xx. Retrying a dead grant burns quota and hides the
   real state.
2. **Delete the stored refresh token.** Keeping a token you know is dead means
   every subsequent request fails the same way.
3. **Flip the integration to a `disconnected` state in the app's own store**, with
   a timestamp and the raw error body.
4. **Stop all background sync for that connection.** No polling loop against a
   revoked grant.
5. **Surface one clear reconnect affordance in the UI**, with plain language: the
   Google connection expired or was revoked, reconnect to restore calendar sync.
   Never a stack trace, never a silent empty calendar.
6. **Reconnect re-runs the full authorization with `access_type=offline` and
   `prompt=consent`**, because the first-authorization-only rule means a plain
   re-auth may return no refresh token at all.
7. **Log the distinguishing signal.** `deleted_client` means the OAuth client is
   gone and reconnecting will not help until the client is restored in the
   console. `invalid_client` means the secret is wrong or disabled. Those need a
   human, not a reconnect button.
8. **Fail closed on writes.** If the grant is dead, do not queue event writes for
   replay indefinitely. Surface them as unsynced.

Also handle `401 Invalid Credentials` from the Calendar API itself. From
`https://developers.google.com/workspace/calendar/api/guides/errors`, checked
2026-08-21: "The access token you're using is either expired or invalid."
Suggested actions: "Get a new access token using the long-lived refresh token. If
this fails, direct the user through the OAuth flow." So 401 means refresh once;
only the refresh failing with `invalid_grant` means disconnect.

---

## 5. The API calls the app will make

All endpoints from the Calendar API v3 reference under
`https://developers.google.com/workspace/calendar/api/v3/reference/`, checked
2026-08-21. Base: `https://www.googleapis.com/calendar/v3`.

### 5.1 List the owner's calendars (for the picker)

```
GET https://www.googleapis.com/calendar/v3/users/me/calendarList
```

Query parameters that matter: `maxResults` ("By default the value is 100
entries"), `minAccessRole` ("The minimum access role for the user in the returned
entries"), `pageToken`, `showDeleted`, `showHidden` ("The default is False"),
`syncToken`.

Response: `kind`, `etag`, `nextPageToken`, `nextSyncToken`, `items[]`.

Scopes: `calendar.readonly`, `calendar`, `calendar.calendarlist`,
`calendar.calendarlist.readonly`. Use `calendar.calendarlist.readonly`.

Take `items[].id` for the freebusy query.

### 5.2 Read busy periods

```
POST https://www.googleapis.com/calendar/v3/freeBusy
```

Request body:

```json
{
  "timeMin": "datetime",
  "timeMax": "datetime",
  "timeZone": "string",
  "groupExpansionMax": 0,
  "calendarExpansionMax": 0,
  "items": [ { "id": "string" } ]
}
```

Fields that matter:
- `timeMin` / `timeMax`: interval bounds, RFC3339.
- `timeZone`: "Optional. The default is UTC."
- `calendarExpansionMax`: "Maximal number of calendars for which FreeBusy
  information is to be provided. Optional. Maximum value is 50."
- `groupExpansionMax`: "Maximal number of calendar identifiers to be provided for
  a single group. Optional. An error is returned for a group with more members
  than this value. Maximum value is 100."
- `items[].id`: the calendar or group identifiers to query.

Response body:

```json
{
  "kind": "calendar#freeBusy",
  "timeMin": "datetime",
  "timeMax": "datetime",
  "groups": { "(key)": { "errors": [], "calendars": ["string"] } },
  "calendars": { "(key)": { "errors": [], "busy": [ { "start": "datetime", "end": "datetime" } ] } }
}
```

**Handle `calendars[id].errors` per calendar.** A failure on one calendar does not
fail the request. A calendar the user unshared comes back with an error entry and
an empty `busy` list, which is indistinguishable from "free" unless you read
`errors`. Getting this wrong means the app schedules over a real meeting.

Scopes: `calendar.readonly`, `calendar`, `calendar.events.freebusy`,
`calendar.freebusy`. Use `calendar.freebusy`.

Batch calendars into one call, up to `calendarExpansionMax`. One request per
window, not one per calendar.

### 5.3 List events with time bounds

```
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
```

Query parameters, verbatim descriptions:
- `timeMin`: "Lower bound (exclusive) for an event's end time to filter by...
  Must be an RFC3339 timestamp with mandatory time zone offset, for example,
  2011-06-03T10:00:00-07:00, 2011-06-03T10:00:00Z. Milliseconds may be provided
  but are ignored. If timeMax is set, timeMin must be smaller than timeMax."
- `timeMax`: "Upper bound (exclusive) for an event's start time to filter by...
  If timeMin is set, timeMax must be greater than timeMin."
- `singleEvents`: "Whether to expand recurring events into instances and only
  return single one-off events and instances of recurring events, but not the
  underlying recurring events themselves. Optional. The default is False."
- `orderBy`: `startTime` or `updated`. `startTime` is only valid with
  `singleEvents=true`.
- `maxResults`: default 250.
- `pageToken`, `showDeleted`, `updatedMin`, `q`, `eventTypes`, `timeZone`
  ("The default is the time zone of the calendar"), `maxAttendees`.

Response: `items[]`, `nextPageToken` ("Token used to access the next page of this
result"), `nextSyncToken` ("Token used at a later point in time to retrieve only
entries that have changed").

Scopes: the wide list in section 1. `calendar.app.created` suffices for the app's
own calendar. Reading events on the owner's other calendars would need
`calendar.readonly` or `calendar.events.readonly`, which this design deliberately
avoids by using freebusy instead.

Note the semantics: `timeMin` bounds end time, `timeMax` bounds start time. That
is what makes a window query return events that straddle its edges. Always send
`singleEvents=true` for a scheduling read, or recurring events come back as a
single master with an RRULE and no instances.

### 5.4 Create the dedicated calendar

```
POST https://www.googleapis.com/calendar/v3/calendars
```

Request body: only `summary` is required, "Title of the calendar." Writable
fields on the Calendars resource: `summary`, `description` ("Description of the
calendar. Optional."), `location` ("Geographic location of the calendar as
free-form text. Optional."), `timeZone`, `labelProperties`.

Response: a Calendars resource. Persist `id`. That id is the only handle to the
app's calendar and there is no way to rediscover it under `calendar.app.created`
alone, since `calendarList.list` needs a calendarlist scope.

Scopes: `calendar`, `calendar.app.created`, `calendar.calendars`. Use
`calendar.app.created` so the grant covers creation and every later write.

Google's warning on this endpoint: authenticate as the intended data owner and do
not use a service account, because the service account becomes the calendar's data
owner and ownership cannot be transferred afterwards. The `dataOwner` field is
described as "The email of the owner of the calendar. Set only for secondary
calendars. Read-only."

Create once, on first connect. Store the id. Never create a second one, and treat
a missing stored id plus a live grant as an error state, not a signal to recreate.

### 5.5 Insert an event

```
POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
```

Query parameters: `conferenceDataVersion` (0 or 1), `eventLabelVersion` (0 or 1),
`maxAttendees`, `sendUpdates` (`all`, `externalOnly`, `none`),
`supportsAttachments`.

Required body fields: `start`, `end`. Fields that matter here: `summary`,
`description`, `location`, `reminders` (with `overrides`), `recurrence` (RRULE,
EXRULE, RDATE, EXDATE lines), `transparency` (`opaque` or `transparent`),
`visibility` (`default`, `public`, `private`, `confidential`), `colorId`,
`attendees[]`, `extendedProperties` (`private` and `shared` objects), and `id`
("base32hex", 5 to 1024 characters).

Two design notes:

- **Set your own `id`.** A deterministic, app-derived event id makes insert
  idempotent and makes reconciliation trivial after a crash mid-write. The
  constraint is base32hex, 5 to 1024 characters, so derive it by hashing the
  app's own record id and encoding in base32hex.
- **Use `extendedProperties.private`** to stamp the app's record id and schema
  version on the event. It survives round-trips and is not visible to guests.
- Set `sendUpdates=none` for self-only workout blocks. There are no guests, and it
  keeps the call from generating notification traffic.

Scopes: `calendar`, `calendar.events`, `calendar.app.created`,
`calendar.events.owned`. Use `calendar.app.created`.

### 5.6 Patch an event

```
PATCH https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
```

Path parameters: `calendarId` ("use the 'primary' keyword" for the primary
calendar; here it is the app-created calendar id) and `eventId`.

Query parameters: `sendUpdates`, `conferenceDataVersion`, `supportsAttachments`,
`maxAttendees`.

Semantics: specified fields replace existing values, unspecified fields are left
alone, and array fields are overwritten whole rather than merged.

Google's cost note, verbatim and worth obeying: **"This method supports patch
semantics. Note that each patch request consumes three quota units; prefer using a
`get` followed by an `update`."**

So for anything but a one-field tweak, `get` then `update` is cheaper. For a
single-user app the quota is irrelevant in practice, but the pattern also avoids
the array-overwrite surprise.

Scopes: `calendar`, `calendar.events`, `calendar.app.created`,
`calendar.events.owned`. Use `calendar.app.created`.

### 5.7 Quota

Source: `https://developers.google.com/workspace/calendar/api/guides/quota`,
checked 2026-08-21. The page opens with a change notice: "As of May 1, 2026, the
usage limits for this API were updated. Google Cloud projects that made any use of
this API between November 2025 and April 2026 will continue with their previously
set usage quotas. Cloud projects created on or after May 1, 2026 are subject to the
new API quotas." A project created now gets the new numbers.

| Usage limit type | Limit |
|---|---|
| Per minute per project | 10,000 requests |
| Per minute per user per project | 600 requests |

Plus a daily billing threshold:

| Threshold limit type | Limit |
|---|---|
| Per day per project | 1,000,000 requests |

"This per day per project limit defines the maximum number of requests your Google
Cloud project can use within a 24-hour period before charges apply. Usage under
this threshold doesn't incur extra charges and your Google Cloud account isn't
billed. Full billing details will be shared later in 2026 with at least 90 days'
notice before any changes take effect. You cannot request an increase on this daily
threshold limit."

"Quotas are calculated per minute using a sliding window. A rapid burst of traffic
that exceeds your per-minute quota during one minute will result in rate limiting
during the next window."

The page also names two limit families beyond API quota: "General Google Calendar
usage limits" and "Operational limits: These limits might be limited at any time.
For example, if you attempt to write to a single calendar in quick succession." No
numeric per-calendar write limit is published. Do not batch-write hundreds of
events into the app calendar in a tight loop.

Errors, from the errors guide, checked 2026-08-21:
- `403 userRateLimitExceeded` ("User Rate Limit Exceeded", domain `usageLimits`)
- `403 rateLimitExceeded` ("The user has reached Google Calendar API's maximum
  request rate per calendar or per authenticated user"). Google's note:
  "rateLimitExceeded errors can return either 403 or 429 error codes - currently
  they are functionally similar and should be responded to in the same way, by
  using exponential backoff."
- `403 quotaExceeded` ("Calendar usage limits exceeded.")
- `400` is permanent: "Because this is a permanent error, do not retry."

Backoff formula, verbatim: wait time is
`min(((2^n)+random_number_milliseconds), maximum_backoff)`, "with n incremented by
1 for each iteration (request)," and "random_number_milliseconds is a random
number of milliseconds less than or equal to 1,000."

### 5.8 Incremental sync with sync tokens

Source: `https://developers.google.com/workspace/calendar/api/guides/sync`,
checked 2026-08-21.

**Initial full sync.** List the collection. "In the response to the list
operation, you will find a field called `nextSyncToken` representing a sync token.
You'll need to store the value of `nextSyncToken`. If the result set is too large
and the response gets paginated, then the `nextSyncToken` field is present only on
the very last page." Paginating is safe: "You don't need to worry about any new
entries appearing while you are paginating - they won't be missed."

**Incremental sync.** Repeat the list with `syncToken` set to the stored value.
"Keep in mind that the result will always contain deleted entries, so that the
clients get the chance to remove them from storage."

**Paginated incremental sync.** "you may find a `pageToken` instead of a
`syncToken` in the list result. In these cases you'll need to perform the exact
same list query as was used for retrieval of the first page in the incremental
sync (with the exact same `syncToken`), append the `pageToken` to it and paginate
through all the following requests until you find another `syncToken` on the last
page."

Google's example:

```
GET /calendars/primary/events?maxResults=10&singleEvents=true&syncToken=CPDAlvWDx70CEPDAlvWDx
GET /calendars/primary/events?maxResults=10&singleEvents=true&syncToken=CPDAlvWDx70CEPDAlvWDx&pageToken=CiAKGjBpNDd2Nmp2Zml2cXRwYjBpOXA
```

**What invalidates a sync token.** Verbatim: "Sometimes sync tokens are
invalidated by the server, for various reasons including token expiration or
changes in related ACLs. In such cases, the server will respond to an incremental
request with a response code `410`. This should trigger a full wipe of the
client's store and a new full sync."

So: token expiry, and ACL changes on the calendar. Both are outside the app's
control. A `410` handler that wipes and re-syncs is mandatory, not optional.

**Parameters that cannot accompany a sync token.** From the `events.list`
reference, verbatim: "There are several query parameters that cannot be specified
together with `nextSyncToken` to ensure consistency of the client state. These
are: `iCalUID`, `orderBy`, `privateExtendedProperty`, `q`,
`sharedExtendedProperty`, `timeMin`, `timeMax`, `updatedMin`." Also: "All events
deleted since the previous list request will always be in the result set and it is
not allowed to set `showDeleted` to False." And: "If the `syncToken` expires, the
server will respond with a `410 GONE` response code and the client should clear
its storage and perform a full synchronization without any `syncToken`."

The sync guide adds: "The set of query parameters that can be used on incremental
syncs is restricted. Each list request should use the same set of query
parameters, including the initial request... The response code for list queries
containing disallowed restrictions is `400`."

**The tension to design around.** `timeMin` and `timeMax` are on the forbidden
list, yet Google's own Java sample sets `timeMin` on the initial full sync only,
commenting: "Set the filters you want to use during the full sync. Sync tokens
aren't compatible with most filters, but you may want to limit your full sync to
only a certain date range." So the documented, sample-endorsed pattern is:
time-bound the **full** sync, then drop the bounds and carry only the `syncToken`
on incremental syncs.

Pick one strategy per collection and never mix:
- **Sync-token incremental** for the app's own dedicated calendar, where the
  volume is small and completeness matters.
- **Bounded polling** (`timeMin`/`timeMax`, no `syncToken`) for anything where a
  rolling window is the actual requirement.

`freeBusy.query` has no sync token. It is always a fresh windowed read.

---

## 6. What a human must do once, by hand

Every step below uses the current Google Cloud console navigation, taken verbatim
from Google's own guides. Console pages checked 2026-08-21. Note the consent
screen now lives under **Google Auth Platform**, not the old "OAuth consent
screen" page.

**Before you start:** have the Google account that owns the calendars signed in.
Pick the callback URL you will use (see step 9).

1. **Create the Cloud project.**
   In the Google Cloud console, go to **Menu > IAM & Admin > Create a Project**.
   In the **Project Name** field, enter a descriptive name. Optionally click
   **Edit** to set the **Project ID** (it "can't be changed after the project is
   created"). In the **Location** field click **Browse**, then **Select**. Click
   **Create**. The console navigates to the **Dashboard** and the project is
   created within a few minutes.

2. **Enable the Calendar API.**
   Go to **Menu > APIs & Services > Library > Google Workspace**. Click **Google
   Calendar API**. Click **Enable**.

3. **Start the OAuth consent configuration.**
   Go to **Menu > Google Auth Platform > Branding**. If the project has not been
   registered yet, click **Get Started**.

4. **App Information.**
   Enter an **App name**. Select a **User support email**. The dropdown offers
   only the signed-in user's address or a Google Group they manage. Click **Next**.

5. **Audience: user type.**
   Select **External**. (Internal is only available to projects inside a Google
   Cloud Organization, and would produce an `org_internal` authorization error for
   a personal Gmail account.) Click **Next**.

6. **Developer contact information.**
   Enter an email address. Google sends project notifications here, including the
   30-day unused-client deletion warning. Click **Next**.

7. **Agree and create.**
   Review the **Google API Services User Data Policy**, check agreement, click
   **Continue**, then click **Create**.

8. **Declare the scopes.**
   Go to **Google Auth Platform > Data access**, click **Add or remove scopes**.
   Add exactly these three, by pasting the full strings into the manual-entry box:
   ```
   https://www.googleapis.com/auth/calendar.calendarlist.readonly
   https://www.googleapis.com/auth/calendar.freebusy
   https://www.googleapis.com/auth/calendar.app.created
   ```
   **Write down which section each one lands in: Non-sensitive, Sensitive, or
   Restricted.** That is the answer to the classification question in section 1
   and it belongs in EVIDENCE.md. Click **Update**, then **Save**.
   This list must match the `scope` parameter in the app's authorization URL
   exactly, or users get the unverified app screen for the mismatch alone.

9. **Create the OAuth client.**
   Go to **Google Auth Platform > Clients**. Click **Create Client**. Click
   **Application type > Web application**. In the **Name** field type a name
   ("this name is only shown in the Google Cloud Console"). Under **Authorized
   redirect URIs**, click **Add URI** and add:
   ```
   http://localhost:PORT/oauth2callback
   ```
   Then click **Add URI** again and add the tailnet callback:
   ```
   https://something.tailda76d6.ts.net/oauth2callback
   ```
   Leave **Authorized JavaScript origins** empty. This is a server-side flow.
   Click **Create**.
   If the console rejects the `ts.net` URI, see step 10, then fall back to
   localhost only and record the rejection in EVIDENCE.md.

10. **If the tailnet URI is rejected: register the authorized domain.**
    Go to **Google Auth Platform > Branding > Authorized domains** and add the
    domain before retrying the redirect URI. Google's instruction: "Add your
    Authorized Domains before you add your redirect or origin URIs." If the domain
    cannot be added because ownership is unprovable, stop and use localhost. Do
    not spend the session fighting this.

11. **Copy the client ID and client secret now.**
    The client ID and secret are shown on creation. **The secret is shown once.**
    Google: "Your application's client secret will only be shown after you create
    the client. Store this information in a secure place... because it will not be
    visible or accessible again." Afterwards "the Google Cloud Console will only
    display the last four characters of the client secret." If lost, use **Add
    Secret** on the client details page to rotate (maximum two secrets per client).
    Put both values into the app's secret store. Never commit them.

12. **Publish the app to production.**
    Go to **Google Auth Platform > Audience** and click **Publish app**. This is
    the step that removes the seven-day refresh-token expiry. Do not skip it and do
    not add test users instead.

13. **Run the connect flow once.**
    Open the app's connect page in a browser on the machine running the app (or
    over a forwarded port if using the localhost callback). Sign in as the calendar
    owner. Advance through the unverified app screen. Grant the three scopes.
    Confirm the app stored a refresh token and created its dedicated calendar.
    Record the calendar id in EVIDENCE.md.

14. **Wait if the redirect fails.**
    "It may take 5 minutes to a few hours for changes made to these settings to
    take effect." A `redirect_uri_mismatch` immediately after adding a URI is
    usually propagation, not a typo. Check the exact string first: scheme, case,
    port, and trailing slash all have to match.

**Where the credentials come from:** the client ID and client secret both come
from **Google Auth Platform > Clients**, at the moment the Web application client
is created in step 9. Nothing else in this checklist produces a credential.

**One documentation conflict to be aware of.** The Workspace guide at
`https://developers.google.com/workspace/guides/create-credentials` ends its Web
application block with "Note that client secrets aren't used for Web
applications." That contradicts `https://support.google.com/cloud/answer/15549257`,
which classifies web server apps as private clients: "Private Clients: These apps,
like web server applications, can securely store the client secret because they
run on servers you control," and which documents the create-time-only secret
visibility for them. The Manage OAuth Clients page is the specific authority on
client configuration, and the web-server OAuth flow lists `client_secret` as a
token-request field sourced from the Clients page. Expect a secret. If none is
issued, the flow still works with `client_secret` omitted, since the web-server
page marks that field Optional. Both checked 2026-08-21.

---

## Open questions to settle at the greenlight

These are the only places this note stops short of a documented fact. Each needs a
human action, not more reading.

1. **Sensitivity of the three chosen scopes.** Google publishes no Calendar
   sensitivity table. Resolve by reading the category column on **Data access >
   Add or remove scopes** (step 8). Expected: all sensitive. Consequence either
   way is only the unverified app screen, which the personal-use exception covers.
2. **Whether `https://something.tailda76d6.ts.net/oauth2callback` is accepted as
   an authorized redirect URI.** It satisfies every published validation rule.
   The unknown is whether the Authorized domains requirement blocks a domain the
   owner cannot verify in Search Console. Google does not document the
   Testing/unverified case. Resolve by trying it (step 9), with localhost as the
   guaranteed fallback.
3. **PKCE on the web-server flow.** Documented for installed apps only, against
   the same authorization endpoint. Not documented for Web application clients.
   Build `state` plus client secret as the primary defense; treat PKCE as optional
   hardening, not a substitute.

## Design decisions this note locks in

- Three scopes, none of them `calendar` or `calendar.events`.
- Publishing status **In production**, unverified, no test users. The seven-day
  refresh-token expiry is the failure mode this prevents.
- `access_type=offline` plus `prompt=consent` on every authorization.
- Persist the refresh token and the app-created calendar id. Both are
  unrecoverable if lost: the token needs a fresh consent, the calendar id has no
  lookup path under `calendar.app.created` alone.
- `invalid_grant` disconnects and asks for a reconnect. It never retries.
- `410` on an incremental sync wipes local state and re-syncs.
- Read other people's availability through `freeBusy.query`, never through
  `events.list` on their calendars. That is what keeps the grant narrow.

---

## Sources

All checked 2026-08-21.

| Topic | URL |
|---|---|
| Calendar scope list ("Last updated 2026-07-22 UTC") | https://developers.google.com/workspace/calendar/api/auth |
| All Google OAuth scopes | https://developers.google.com/identity/protocols/oauth2/scopes |
| OAuth for web server apps ("Last updated 2026-08-07 UTC") | https://developers.google.com/identity/protocols/oauth2/web-server |
| OAuth overview, refresh token expiration | https://developers.google.com/identity/protocols/oauth2 |
| PKCE (installed apps) | https://developers.google.com/identity/protocols/oauth2/native-app |
| OAuth app state overview | https://developers.google.com/identity/protocols/oauth2/production-readiness/overview |
| Sensitive scope verification, exceptions | https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification |
| Restricted scope verification, CASA | https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification |
| Manage App Audience: publishing status, 7-day rule, user cap | https://support.google.com/cloud/answer/15549945 |
| Manage OAuth Clients: redirect URI rules, secret handling, unused client deletion | https://support.google.com/cloud/answer/15549257 |
| Manage OAuth App Branding: authorized domains | https://support.google.com/cloud/answer/10311615 |
| Unverified apps | https://support.google.com/cloud/answer/7454865 |
| Requesting minimum scopes, restricted scope table | https://support.google.com/cloud/answer/13807380 |
| OAuth app verification help center | https://support.google.com/cloud/answer/9110914 |
| freeBusy: query | https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query |
| Events: list | https://developers.google.com/workspace/calendar/api/v3/reference/events/list |
| Events: insert | https://developers.google.com/workspace/calendar/api/v3/reference/events/insert |
| Events: patch | https://developers.google.com/workspace/calendar/api/v3/reference/events/patch |
| Calendars: insert | https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert |
| Calendars resource | https://developers.google.com/workspace/calendar/api/v3/reference/calendars |
| CalendarList: list | https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list |
| Synchronize resources efficiently | https://developers.google.com/workspace/calendar/api/guides/sync |
| Usage limits | https://developers.google.com/workspace/calendar/api/guides/quota |
| Handle API errors | https://developers.google.com/workspace/calendar/api/guides/errors |
| Create a Google Cloud project | https://developers.google.com/workspace/guides/create-project |
| Enable Google Workspace APIs | https://developers.google.com/workspace/guides/enable-apis |
| Configure OAuth consent | https://developers.google.com/workspace/guides/configure-oauth-consent |
| Create access credentials | https://developers.google.com/workspace/guides/create-credentials |
