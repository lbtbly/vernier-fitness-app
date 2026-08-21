# Withings Public API: implementation research note

Checked 2026-08-21. Every fact below carries the URL it came from. Where the
docs are silent, the note says "not documented" instead of guessing.

## Sources and how they rank

| # | Source | URL | Checked |
|---|---|---|---|
| S1 | Agent reference (official, Withings-maintained) | https://developer.withings.com/llms.md | 2026-08-21 |
| S2 | OpenAPI 3.0 spec (S1 calls it "the authoritative source for all endpoint parameters, types, and response schemas") | https://developer.withings.com/openapi.yaml | 2026-08-21 |
| S3 | API reference (rendered S2) | https://developer.withings.com/api-reference | 2026-08-21 |
| S4 | Authorization URL and scopes | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/get-access/oauth-authorization-url | 2026-08-21 |
| S5 | Access and refresh tokens | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/get-access/access-and-refresh-tokens-no-recover | 2026-08-21 |
| S6 | OAuth web flow | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/get-access/oauth-web-flow | 2026-08-21 |
| S7 | Setup your environment (developer account, dashboard, cloud) | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/developer-account/create-your-accesses-no-medical-cloud | 2026-08-21 |
| S8 | Notifications overview (rate limit, retries, security) | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/data-api/notifications/notification-overview | 2026-08-21 |
| S9 | Subscribe to notifications (callback URL rules) | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/data-api/notifications/notification-subscribe | 2026-08-21 |
| S10 | Notification payload and categories (appli table) | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/data-api/notifications/notification-content | 2026-08-21 |
| S11 | Fetch data example | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/data-api/fetch-data-example | 2026-08-21 |
| S12 | How to compute the lastupdate | https://developer.withings.com/developer-guide/v3/tutorials/how-to-compute-lastupdate | 2026-08-21 |
| S13 | Available Health Data (per-device biomarker matrix) | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/data-api/all-available-health-data | 2026-08-21 |
| S14 | API plans (served in an iframe from static.withings.com) | https://developer.withings.com/developer-guide/v3/withings-solutions/withings-api-plans and https://static.withings.com/content/api/plans/plans.html | 2026-08-21 |
| S15 | Public API integration guide overview | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/public-health-data-api-overview | 2026-08-21 |
| S16 | Request signature (HMAC SHA-256, nonce) | https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/get-access/sign-your-requests | 2026-08-21 |

Not reachable: `www.withings.com` and `support.withings.com` both returned HTTP
403 behind a Cloudflare challenge on 2026-08-21. Consumer product and support
pages could not be read directly. Section 4 says what that costs us.

Where S1 and S2 disagree, this note follows S2 or the developer guide and flags
the conflict inline. Three real conflicts exist. They are called out in
sections 3, 5 and 6.

Base API host: `https://wbsapi.withings.net` (S1, S2, S7). One environment, the
EU Medical Cloud. There is no separate sandbox host (S7).

---

## 1. OAuth 2.0

### Authorize URL

`GET https://account.withings.com/oauth2_user/authorize2` (S1, S2, S4)

Query parameters, exactly as S2 marks them:

| Param | Required | Value |
|---|---|---|
| `response_type` | yes | constant string `code` |
| `client_id` | yes | your Client ID |
| `state` | yes | a value you define, returned on the callback |
| `scope` | yes | comma separated scope list |
| `redirect_uri` | yes | must be registered as `Callback Url` on your app; multiple URLs may be registered comma separated |
| `mode` | no | only value documented is `demo` |

Documented example (S4):

```
https://account.withings.com/oauth2_user/authorize2?response_type=code&client_id=YOUR_CLIENT_ID&scope=user.info,user.metrics,user.activity&redirect_uri=YOUR_REDIRECT_URI&state=YOUR_STATE
```

The authorization `code` is valid for 30 seconds (S1, S2, S4, S6).

### Token URL

`POST https://wbsapi.withings.net/v2/oauth2` with
`Content-Type: application/x-www-form-urlencoded` (S1, S2).

The `action=requesttoken` style is still current. S2, fetched 2026-08-21,
declares `action` a required property with the description "Must take the value
`requesttoken`" on every variant of the token request.

Two authentication styles are documented for this endpoint (S2): client secret,
or HMAC signature plus nonce. The Public API can use the client secret style.

**Exchange (client secret style)**, all six required (S2
`TokenRequestWithClientSecret`):

```
action=requesttoken
client_id=<CLIENT_ID>
client_secret=<CLIENT_SECRET>
grant_type=authorization_code
code=<AUTH_CODE>
redirect_uri=<SAME_URI_AS_STEP_1>
```

**Refresh (client secret style)**, all five required (S2
`TokenRequestRefreshWithClientSecret`):

```
action=requesttoken
client_id=<CLIENT_ID>
client_secret=<CLIENT_SECRET>
grant_type=refresh_token
refresh_token=<CURRENT_REFRESH_TOKEN>
```

The signature variants swap `client_secret` for `nonce` + `signature`
(S2 `TokenRequestWithSignature`, `TokenRequestRefreshWithSignature`; protocol in
S16). Not needed for this build.

Documented success body fields (S2): `userid`, `access_token`, `refresh_token`,
`expires_in`, `scope`, `csrf_token`, `token_type`.

### PKCE and state

- **PKCE: not documented.** `code_challenge`, `code_challenge_method` and
  `code_verifier` appear nowhere in S2 (383 KB spec, grepped 2026-08-21) nor in
  S4, S5 or S6. Do not send PKCE parameters.
- **`state`: supported and required.** S2 marks it `required: true` on the
  authorize call. S4: "The state parameter acts as a CSRF protection mechanism
  by allowing you to include a unique string with your request... By comparing
  the original state with the returned value, you can ensure that the response
  hasn't been tampered with." It is returned to the callback "and should be
  validated at this point" (S4).

### Demo and sandbox

No sandbox host. One base URL, the EU Medical Cloud, "no prerequisites, and free
access is provided" (S7). Two demo mechanisms:

1. **`mode=demo` on the authorize URL** (S1, S2, S4). "You will be redirected to
   the authorisation page and automatically logged in as a demo user" (S4). This
   is the one usable without a contract or request signing.
2. **`action=getdemoaccess` on `/v2/oauth2`** (S2). "This webservice gives your
   clientID access to a demo account containing dummy data." Required params:
   `action=getdemoaccess`, `client_id`, `nonce`, `signature`, `scope_oauth2`.
   Requires the HMAC signing protocol (S16), so it costs more to wire up than
   `mode=demo`.

### Scopes

Four scopes exist (S2, S4):

| Scope | Covers |
|---|---|
| `user.metrics` | Measure - Getmeas, Heart v2 Get/List, Measure v2 - Confirmuser, User v2 - Getgoals, Stetho v2 Get/List, and notification management |
| `user.activity` | Getactivity, Getintradayactivity, Getworkouts, Sleep v2 Get/Getsummary, and notification management |
| `user.info` | User v2 Get/Getdevice/Getgoals/Link/Unlink, plus Notify List/Subscribe |
| `user.sleepevents` | notifications for bed in, bed out, inflate done |

**Body composition is covered by `user.metrics`**, because `Measure - Getmeas` is
listed under it (S4). Request `user.metrics` alone unless device listing is
needed, in which case add `user.info`.

### Lifetimes (S1, S5)

| Token | Lifetime |
|---|---|
| authorization `code` | 30 seconds |
| `access_token` | 3 hours, `expires_in: 10800` |
| `refresh_token` | 1 year |
| superseded `refresh_token` | "Expires 8 hours after new issuance or once the new access_token is used" (S5) |

Refresh tokens rotate on every refresh. S5: "each time you request a new
access_token, you also receive a new refresh_token. Important: Always replace the
previous refresh_token with the new one. Failure to do so may result in losing
access once the old refresh_token expires."

The Public API has no recovery path for a dead refresh token.
`action=recoverauthorizationcode` exists but S2 states it "will only work for
partners having signed a contract with Withings... To generate a new
authorization code for standard end-user accounts, your user will have to
authorize your application to the Web Authorization Flow again." Losing the
refresh token means a manual re-consent.

### Response envelope and status codes

Every service returns HTTP 200 with a JSON envelope (S1, S2):

```json
{ "status": 0, "body": { } }
```

`status: 0` means success. Any non-zero status is an error (S1). S2 documents
only a `200` response per operation, so **HTTP status codes for API errors are
not documented**; read the envelope, never the HTTP code.

Withings deliberately withholds per-code meanings. S2, tag `response_status`:
"For security reasons Withings cannot share with partners the exact nature of the
API error status they may receive. Instead, we share families of errors."
Families and the prescribed reaction (S2):

- Timeout: retry.
- Authentication failed: check tokens are correct and properly set.
- Invalid params: check tokens and params.
- Not Implemented: the service does not exist.
- Unauthorized: you are not allowed to call this service.
- An error occurred: check tokens and params, then contact support.

Bands worth hard-coding (S2 status table):

| Status | Family |
|---|---|
| 0 | Operation was successful |
| 100..102 | Authentication failed |
| 200 | Authentication failed |
| 201..213, 216..218, 220..221, 223, 225, 227..230, 234..236, 238, 240..252, 254, 260..267, 271..272, 275..276, 283..288, 290, 293..295, 297, 300..304, 321, 323..353, 380..382, 400, 501..511, 523, 532, 3017..3019 | Invalid params |
| 214, 277, 2553, 2555 | Unauthorized |
| 401 | Authentication failed |
| 522 | Timeout |
| 524 | Bad state |
| 601 | Too many request |
| 2554 | Not implemented |
| everything else listed | An error occurred |

**Which status means the token is dead.** The docs give two answers and they do
not agree.

- S11 (fetch data example) says plainly: "Access tokens are short-lived, so check
  the expiry and refresh with the refresh token if needed, otherwise the Data API
  rejects the call with 401 Unauthorized." Envelope status `401` is in the
  "Authentication failed" family in S2. This is the one the guide names.
- S1 lists two specific codes not present in S2's table with those meanings:
  `342` "OAuth credentials are absent or incorrect" and `343` "OAuth access token
  absent or invalid". S2 classes 323..353 as "Invalid params". **Conflict.**
- S1 also states, in its recommended architecture: "Refresh the access token
  before it expires (every 3 hours) or on 343 error."

Implementation rule that satisfies both: treat status in
`{401, 100, 101, 102, 200, 342, 343}` as "token bad, refresh once, retry once,
then surface". Treat `601` as rate limited, back off. Treat `522` as retryable.
Everything else non-zero is a logged failure, not a retry loop. Refresh
proactively at roughly 2.5 hours rather than waiting for the error.

---

## 2. Measure retrieval

`POST https://wbsapi.withings.net/measure` with
`Authorization: Bearer <access_token>` and
`Content-Type: application/x-www-form-urlencoded` (S1, S2, S11).

Parameters (S2, operation `measure-getmeas`):

| Param | In | Required | Meaning |
|---|---|---|---|
| `action` | body | yes | constant `getmeas` |
| `meastype` | body | no | a single measure type integer |
| `meastypes` | body | no | list of measure types separated by commas, e.g. `meastypes=1,4,12` |
| `category` | body | no | `1` for real measures, `2` for user objectives |
| `startdate` | body | no | data start date as a unix timestamp |
| `enddate` | body | no | data end date as a unix timestamp |
| `lastupdate` | body | no | "Timestamp for requesting data that were updated or created after this date. Useful for data synchronization between systems. Use this instead of startdate + enddate." |
| `offset` | body | no | "When a first call returns `more:1` and `offset:XX`, set value `XX` in this parameter to retrieve next available rows." |
| `Authorization` | header | yes | `Bearer {access_token}` |

The default value of `category` is **not documented**. Send `category=1`
explicitly so objectives never leak into the measurement table.

Response body fields (S2): `updatetime` (server time the answer was generated),
`timezone`, `measuregrps[]`, `more`, `offset`.

### Pagination

`more` is "To know if there is more data to fetch or not"; `offset` is "Offset to
use to retrieve the next data" (S2). S1 states the loop rule: "When a response
body contains `more = 1`, additional data is available. Re-call the same endpoint
with the `offset` value from the response to fetch the next page. You MUST loop
until `more = 0` to retrieve complete data."

Keep every other parameter identical across pages of one logical query.

### Measurement date versus last-update date

Two different clocks live on a measure group (S2, `measuregrp_object`):

- `date`: "UNIX timestamp when measures were taken."
- `created`: "UNIX timestamp when measures were stored."
- `modified`: "UNIX timestamp when measures were last updated."

`startdate`/`enddate` filter on the measurement date. `lastupdate` filters on
created-or-modified. S2 on `lastupdate`: "requesting data that were updated or
created after this date... Use this instead of startdate + enddate."

S11 puts the same choice in operational terms: "Reusing the payload's
startdate/enddate targets that single measurement precisely... For ongoing sync,
we recommend lastupdate instead: pass the timestamp of your last successful fetch
and the Data API returns everything created or modified since, including any
updates you missed if a notification was lost."

### Plain statement

**An idempotent incremental poller must use `lastupdate`, never
`startdate`/`enddate`.** A weigh-in can be stored or corrected long after it was
taken: its `date` stays old while `modified` moves forward. A date-window poll
whose window has already passed will never see that row again, so the gap is
permanent. A `lastupdate` poll sees it on the next tick.

S12 gives the exact recipe: "Check the max(modified): Look at the maximum
modified timestamp you've already stored for this data type... use this
max(modified) as your lastupdate parameter. The API will then return all data
that has been created or modified after this timestamp."

Note a second conflict. S1 says "Store the `updatetime` from each response and use
it as `lastupdate` next time." S12 says store `max(modified)`. Follow S12:
`max(modified)` is derived from data you have actually committed, so a crash
between fetch and commit cannot skip rows, and it is immune to clock skew between
Withings' server time and your database.

Idempotency on the write side: upsert keyed on `(grpid, type)`. `grpid` is the
"Unique identifier of the measure group" (S2) and S2 adds "Every time a measure is
create/updated/deleted, the corresponding measure group is updated", so a
correction arrives as the same `grpid` with a newer `modified`.

---

## 3. Measurement type codes

The complete official table, verbatim from the `meastype` parameter description
in S2 (`measure-getmeas`), checked 2026-08-21. This is the full list the spec
publishes; there is no longer table elsewhere.

| Code | Description (as published) |
|---|---|
| 1 | Weight (kg) |
| 4 | Height (meter) |
| 5 | Fat Free Mass (kg) |
| 6 | Fat Ratio (%) |
| 8 | Fat Mass Weight (kg) |
| **9** | **Diastolic Blood Pressure (mmHg)** |
| **10** | **Systolic Blood Pressure (mmHg)** |
| 11 | Heart Pulse (bpm), only for BPM and scale devices |
| 12 | Temperature (celsius) |
| 54 | SP02 (%) |
| 71 | Body Temperature (celsius) |
| 73 | Skin Temperature (celsius) |
| 76 | Muscle Mass (kg) |
| 77 | Hydration (kg) |
| 88 | Bone Mass (kg) |
| 91 | Pulse Wave Velocity (m/s) |
| 123 | VO2 max, "a numerical measurement of your body's ability to consume oxygen (ml/min/kg)" |
| 130 | Atrial fibrillation result |
| 135 | QRS interval duration based on ECG signal |
| 136 | PR interval duration based on ECG signal |
| 137 | QT interval duration based on ECG signal |
| 138 | Corrected QT interval duration based on ECG signal |
| 139 | Atrial fibrillation result from PPG |
| 155 | Vascular age |
| 167 | Nerve Health Score Conductance 2 electrodes Feet |
| 168 | Extracellular Water in kg |
| 169 | Intracellular Water in kg |
| 170 | Visceral Fat (without unity) |
| 173 | Fat Free Mass for segments |
| 174 | Fat Mass for segments in mass unit |
| 175 | Muscle Mass for segments |
| 196 | Nerve Response Score (NRS) |
| 226 | Basal Metabolic Rate (BMR) |
| 227 | Metabolic Age |
| 229 | Electrochemical Skin Conductance (ESC) |

Third conflict, recorded: S1's table stops at 140 and labels **140** "Vascular
Age", and omits 155, 167, 168, 169, 170, 173, 174, 175, 196, 226, 227, 229. S2
labels **155** "Vascular age" and has no 140. Follow S2, which S1 itself names as
authoritative. Do not rely on 140.

### The codes this product needs

| Metric | Code | Unit as published |
|---|---|---|
| Weight | **1** | kg |
| Fat ratio | **6** | % |
| Fat mass | **8** | kg ("Fat Mass Weight") |
| Fat-free mass | **5** | kg |
| Muscle mass | **76** | kg |
| Bone mass | **88** | kg |
| Hydration / body water | **77** | kg |
| Visceral fat | **170** | dimensionless, spec says "without unity" |
| Heart pulse | **11** | bpm, "only for BPM and scale devices" |
| BMI | **none** | **Not documented.** No BMI or body-mass-index code exists in S2. Derive it from 1 and 4 if you want it, and label it as derived. |

Related water codes for completeness: 168 extracellular water (kg), 169
intracellular water (kg). Neither is the same thing as 77.

### Blood pressure: hard exclusion list

**Codes 9 (Diastolic Blood Pressure, mmHg) and 10 (Systolic Blood Pressure,
mmHg) are blood pressure.** Those two, and only those two, in the measure type
table.

This product never stores, requests or displays blood pressure. That means:

1. Never put `9` or `10` in `meastype` or `meastypes`. Always send an explicit
   `meastypes` allowlist; never call `getmeas` with no type filter, because an
   unfiltered call returns whatever the account holds, including BPM rows.
2. The allowlist for this product is `meastypes=1,5,6,8,11,76,77,88`.
3. Drop the whole measure group, not just the offending measure, if a group
   arrives containing type 9 or 10. S2 explains why groups exist: "when measuring
   blood pressure you will have a measure group with a systole measure, a
   diastole measure, and a heartrate measure." A group holding 9 or 10 came from
   a blood pressure monitor, so its type 11 is a blood pressure device reading,
   not a scale reading. Harvesting it would be storing a fragment of a blood
   pressure record.
4. Related codes to also leave alone, since they belong to cardiac devices rather
   than the scale: 91 pulse wave velocity, 130 and 139 atrial fibrillation,
   135 to 138 ECG intervals, 155 vascular age.
5. On the notification side, never subscribe to `appli=4`. S10 names it "Blood
   pressure & heart rate" and lists types 9, 10, 11, 54 under it. We are not
   subscribing at all (section 5), which makes this moot, but it stays on the
   record.
6. A second safety net at the storage layer: reject any insert whose `type` is
   not in the allowlist, rather than filtering only at the fetch layer.

### Value and unit encoding

S2, `measure_object`:

- `value`: "Value for the measure in S.I. units (kilograms, meters etc...). Value
  should be multiplied by 10 to the power of `units` to get the real value."
- `unit`: "Power of ten to multiply the `value` field to get the real value.
  Formula: `value * 10^unit = real value`. Eg: `value = 20 and unit = -1 => real
  value = 2`."

Worked example, weight. A measure of

```json
{ "value": 76542, "type": 1, "unit": -3 }
```

decodes as `76542 * 10^-3 = 76.542`, so 76.542 kg. Another, fat ratio:

```json
{ "value": 2185, "type": 6, "unit": -2 }
```

decodes as `2185 * 10^-2 = 21.85`, so 21.85 %.

The exponent is per measure and is not stable across measures, devices or time.
Never hard-code a scale factor per type. Decode with `value * 10 ** unit` every
time, and decode in decimal, not binary floating point, if you plan to compare
for equality.

One exception is documented. For `meastype` 130 (atrial fibrillation result),
S2 says "the value is a classification integer and does not represent a physical
measurement", with values 0 to 13 mapping to Negative, Positive, Inconclusive and
so on. Out of scope here, but it means "value times ten to the unit" is not a
universal rule.

### Documented measure response shape

Assembled from the documented field set in S2 (`measure-getmeas` 200 response,
`measuregrp_object`, `measure_object`) using the example values S2 supplies, plus
the response example in S1. Every key below is a documented key.

```json
{
  "status": 0,
  "body": {
    "updatetime": 1728171131,
    "timezone": "Europe/Paris",
    "measuregrps": [
      {
        "grpid": 123456789,
        "attrib": 0,
        "date": 1594245600,
        "created": 1594246600,
        "modified": 1594257200,
        "category": 1,
        "deviceid": "892359876fd8805ac45bab078c4828692f0276b1",
        "hash_deviceid": "892359876fd8805ac45bab078c4828692f0276b1",
        "measures": [
          { "value": 76542, "type": 1,  "unit": -3 },
          { "value": 2185,  "type": 6,  "unit": -2 },
          { "value": 16725, "type": 8,  "unit": -3 },
          { "value": 59817, "type": 5,  "unit": -3 },
          { "value": 56430, "type": 76, "unit": -3 },
          { "value": 3387,  "type": 88, "unit": -3 },
          { "value": 41220, "type": 77, "unit": -3 },
          { "value": 62,    "type": 11, "unit": 0  }
        ],
        "model": "Body Comp",
        "model_id": 18,
        "comment": ""
      }
    ],
    "more": 0,
    "offset": 0
  }
}
```

Notes on that shape:

- `attrib` is the attribution flag (S2): `0` captured by a device and known to
  belong to this user, `1` captured but ambiguous, `2` entered manually, `4`
  entered manually during user creation and may not be accurate, `5` blood
  pressure monitor auto, `7` confirmed, `8` same as 0, `15` performed in specific
  guided conditions. A poller that wants only trustworthy scale readings should
  keep `0` and `8`, and decide deliberately about `1` and `2`.
- `comment` is documented as "Deprecated. This property will always be empty."
- `algo` and `fm` exist on `measure_object` and are both documented as
  "Deprecated". Ignore them.
- `model` / `model_id`: **neither value for a Body Smart is documented.** The
  string "Body Smart" does not appear anywhere in S2 (383 KB spec, grepped
  2026-08-21). S2's scale entries are `Withings WBS01` id 1, `WS30` id 2,
  `Kid Scale` id 3, `Smart Body Analyzer` id 4, `Body+` id 5, `Body Cardio` id 6,
  `Body` id 7, `Body Pro` id 9, `Body Scan` id 10, `WBS10` id 11, `WBS11` id 12,
  `Body Comp` id 18. "Body Smart" is a device column in S13 only. The pair shown
  in the example above is a documented one, used to illustrate the field types.
  Read the real pair off the first live response, and never branch on a guessed
  `model_id`. Match on `deviceid` if you need to pin a device.

---

## 4. What a Body Smart actually produces

Source: S13, the "Available Health Data" per-device matrix, which is Withings'
own current documentation of which biomarker each device exposes through the API.
Parsed from the Scales table on 2026-08-21, reading the check icon in the
`Body Smart` column.

**Body Smart: yes.**

| Biomarker (S13 wording) | Pack | meastype |
|---|---|---|
| Weight | Basic | 1 |
| Fat Mass | Basic | 8 |
| Fat Free Mass | Basic | 5 |
| Muscle Mass | Basic | 76 |
| Bone Mass | Basic | 88 |
| Water Mass | Basic | 77 |
| Standing Heart Rate | Basic | 11 |

Fat Ratio (type 6) is not a separate row in S13. S13's row is "Fat Mass"; S2 and
S10 both list type 6 Fat Ratio alongside type 8 Fat Mass Weight for scales, and
S10 lists 6 under the `appli=1` body composition category. Request 6, and treat
its absence as tolerable rather than an error.

**Body Smart: no**, per the same table. Every one of these is unchecked in the
Body Smart column:

- Fat Free Mass Segmental, Fat Mass Segmental, Muscle Mass Segmental (Body Scan
  only)
- Intracellular Water, Extracellular Water (Body Scan only)
- Pulse Wave Velocity (Body Cardio, Body Comp, Body Pro 2, Body Scan, and EU
  purchases only)
- Vascular Age (Body Cardio, Body Comp, Body Pro 2, Body Scan)
- **Visceral Fat** (Body Comp, Body Pro 2, Body Scan)
- **Basal Metabolic Rate** (Body Comp, Body Pro 2, Body Scan)
- Nerve Response Score, Nerve Health Score

All seven Body Smart biomarkers sit in the **Basic Biomarker Pack**, which S14
says is what the free plan includes. Nothing this product needs requires a paid
plan.

**Caveat, recorded honestly.** The task asked for Withings' product or support
documentation. `www.withings.com/us/en/body-smart` and
`support.withings.com` both returned HTTP 403 behind a Cloudflare challenge to
every fetch attempt on 2026-08-21, so those pages were not read. Web search
surfaced official support article titles (for example "Body Smart - FAQ",
"Body Smart - Frequently asked questions regarding heart rate measurements")
whose snippets suggest the Withings app shows BMI, visceral fat and basal
metabolic rate for Body Smart owners. That is a snippet, not a page read, and it
does not contradict S13: those are values the Withings app computes and displays,
while S13 governs what the API returns per device. **Plan against S13's seven.
If visceral fat (170) or BMR (226) ever appear in real responses, that is a
bonus, not a contract.** A human with a browser can settle it in two minutes by
opening the Body Smart FAQ; until then it stays flagged.

---

## 5. Notifications and webhooks

### How subscription works

`POST https://wbsapi.withings.net/notify` (S2 `notify-subscribe`, S9).

| Param | Required | Value |
|---|---|---|
| `action` | yes | constant `subscribe` |
| `callbackurl` | yes | your callback URL |
| `appli` | yes | the notification category integer |
| `comment` | no | free text |
| `Authorization` header | yes | `Bearer {access_token}` |
| `signature`, `nonce`, `client_id` | conditional | S2: "DO NOT USE WITH FOLLOWING PARAMS: [access_token]". Only for the contracted `NO_ACCOUNT_ASSOCIATED` (appli 53) case. |

S2 adds: "you need to subscribe for each individual user." Companion operations
are `notify-get`, `notify-list`, `notify-update`, `notify-revoke`.

Body composition is `appli=1`. S10 names it "Body & Weight", scope
`user.metrics`, triggered when "A new weight or body composition measurement was
recorded by a Withings scale", carrying types 1, 5, 6, 8, 71, 73, 76, 77, 88, 91.

Fourth conflict, recorded: S1's `appli` list ("1 Body metrics, 4 Sleep,
16 Blood pressure, 44 ECG, 46 Activity, 54 Afib") does not match S10, which is
the dedicated page. S10 says 1 Body & Weight, 2 Temperature, 4 Blood pressure &
heart rate, 16 Activity, 44 Sleep summary, 46 User profile change, 50/51/52 bed
events, 53 unassociated device, 54 ECG measurement, 55 ECG failed, 58 Glucose,
60 Survey answered, 61 Stethoscope, 62 HRV, 98/99/100 Live Sync bed polls. Follow
S10. S1 itself warns that `appli` and `meastype` are separate namespaces.

Notification delivery is an `application/x-www-form-urlencoded` POST carrying
`userid`, `appli`, `startdate`, `enddate`, and per category `date`, `deviceid`,
`action` (S10). Generic example from S10:

```
userid=12345
appli=1
startdate=1530576000
enddate=1530698753
```

### What the receiving URL must satisfy

S9, verbatim requirements:

- **HTTPS only.** "plain HTTP URLs are not accepted"
- **No IP addresses or localhost.** "must be a proper domain name"
- **Ports 80 or 443 only.** "non-standard ports are not supported in production"
- **Max 255 characters**
- **Must respond to HTTP HEAD requests.** "Withings sends a HEAD request to
  verify your URL is reachable before registering it. Make sure your server
  handles HEAD and returns a 2xx status code."

And the penalty, S9: "Applications in restricted mode. If your URL doesn't meet
these requirements (e.g. uses HTTP, localhost, or a non-standard port), your
application will be limited to 10 linked users. This is intended for development
and testing only."

For a single-user private app, a 10 linked-user cap is not a constraint. Worth
knowing rather than fearing.

Delivery reliability, S8:

- Per notification, 5 retry cycles over roughly 5 hours if your endpoint does not
  return HTTP < 400: T+0, +10 s, +1 min, +1 h, +4 h, two HTTP attempts per cycle,
  10 attempts total, later retries jittered.
- Per subscription, escalation: 4 consecutive failed notifications sends up to 4
  warning emails; 20 days of unresolved failures auto-cancels the subscription
  with a final notice email.
- "Missed notifications are not redelivered. Once your endpoint is back up,
  backfill via the Data API using `lastupdate`."
- "Typical delivery delay is under 2 minutes, but it can occasionally be longer.
  Withings does not commit to a real-time SLA on the standard plan."

Hardening, S8: allowlist Withings source IPs, published as DNS TXT records
(`dig +short TXT ipblock-notify.withings.net` for the EU cloud,
`ipblock-notify.us.withingsmed.net` for the US Medical Cloud, updated "at least
one week before any change"), and append a secret query parameter to the
registered callback URL and verify it on every inbound POST.

### Is polling a supported alternative?

**Yes, explicitly and repeatedly, in Withings' own guides.**

- S11, step 3: "For ongoing sync, we recommend lastupdate instead: pass the
  timestamp of your last successful fetch and the Data API returns everything
  created or modified since."
- S12 exists solely to recommend the `lastupdate` system "over relying solely on
  startdate and enddate parameters from the notifications payload", and says it
  "gives you the flexibility to trigger updates on-demand, making it ideal for
  platforms that need real-time refresh capabilities, whether through a user
  interface or scheduled updates."
- S8's own recovery instruction for a missed webhook is a `lastupdate` fetch.
- S1 lists "Pattern 1: Polling (Pull)" as "Recommended for initial data load and
  periodic sync."

`Measure - Getmeas` has no webhook precondition. Nothing about body measurements
is delivered only over a webhook. The notification is a nudge, never the payload:
S11's flow is notification then `getmeas`, and both S11 and S12 tell you to
widen that `getmeas` to a `lastupdate` sweep anyway.

### What this app loses by polling

We are behind Tailscale, we will poll, and here is the honest ledger.

**Lost:**

1. **Latency.** Webhook delivery is typically under 2 minutes (S8). Polling
   latency equals the poll interval. At the 10-minute cadence S1 recommends, a
   weigh-in shows up on average 5 minutes and at worst 10 minutes late. For a
   personal weight and body composition tracker this is invisible.
2. **Request efficiency.** Every poll is a request whether or not data changed.
   Quantified in section 6; it is 0.1 % of the budget.
3. **Push-driven UX.** No server-side trigger to fan out into a phone push
   notification the moment a measurement lands. Any "you weighed in" prompt is
   bounded by the poll interval.
4. **Withings' own retry and escalation machinery.** We own retry, backoff and
   alerting for a failed sync. Modest work: the poller is a loop with a stored
   cursor.

**Not lost:**

1. **Completeness.** `lastupdate` returns everything created or modified since the
   cursor, so no measurement can be missed by polling that would not equally be
   missed by a dropped webhook. Polling is strictly the more complete of the two.
   Webhook-only integrations still need this exact poll as their backfill (S8).
2. **Corrections and late syncs.** Same reason. A revised measure group bumps
   `modified` and reappears.
3. **Any data field.** No measure type, group field or device attribution is
   webhook-exclusive.
4. **Historical backfill.** S6: "Once the user authorizes your application, you
   will have access not only to new data but also to all historical health data
   collected by the devices." Webhooks never carried that anyway.

**Also avoided by not subscribing:** the callback URL rules in S9 are
unsatisfiable behind Tailscale. A `*.ts.net` hostname is HTTPS on 443 and is a
proper domain name, but it does not resolve for Withings' servers, so the HEAD
reachability probe would fail and registration would not succeed. Exposing a
public HTTPS endpoint purely to receive webhooks would mean giving this private
app a public attack surface, which is a worse trade than a 10-minute delay.

**Decision: poll `Measure - Getmeas` with `lastupdate`. Do not subscribe. Do not
build a callback handler.**

---

## 6. Rate limits, error handling and published quotas

Published limits:

| Limit | Value | Source |
|---|---|---|
| Request rate, standard plan | **120 requests per minute across your application** | S8: "The standard Withings API enforces a 120 requests-per-minute limit across your application" |
| Request rate, Enterprise | "1,500+ requests/minute" | S14 |
| Active users, free plan | **1000 active users** | S14: "Basic biomarkers availability and 1000 active users limitation" |
| Active users, paid plans | "Unlimited users" | S14 |
| Linked users, restricted mode | **10** | S9 |
| Recommended per-user poll frequency | "Do not poll more than once every 10 minutes per user" | S1, Rate Limits & Best Practices |
| Rate-limit status code | **601, "Too many request"** | S2 status table, S1 |

Not documented, and not to be guessed:

- Any daily or monthly request quota.
- Any `Retry-After` header, `X-RateLimit-*` header, or documented backoff
  interval after a 601.
- The window shape of the 120/min limit (fixed window, sliding, or token bucket).
- Whether the 120/min limit is per application or per application per user. S8
  says "across your application", so budget as per application.
- The rate limit on the OAuth token endpoint specifically.
- HTTP status codes for errors. S2 documents only 200 responses.

Budget for this build. One user, one poll every 10 minutes, one page per poll in
the steady state: 6 requests per hour, 144 per day, 0.1 requests per minute
against a 120 per minute ceiling. Add a token refresh roughly every 2.5 hours,
about 10 per day. Initial historical backfill is a bounded `more`/`offset` loop.
There is no plausible way this integration approaches any published limit.

Error handling rules for the client:

1. Parse the envelope first, always. Never branch on HTTP status.
2. `status == 0` is the only success.
3. `status == 601`: exponential backoff with jitter, starting around 60 seconds.
   Retry interval after 601 is not documented, so pick a conservative one.
4. `status == 522` (Timeout family): retry, S2 says "The service encountered a
   timeout, please retry."
5. `status` in the Authentication failed family (`100..102`, `200`, `401`) or the
   token codes S1 names (`342`, `343`): refresh the access token once, retry the
   call once, then stop and surface a re-consent prompt.
6. `status == 100` deserves care: S1 documents it as "Request succeeded but no
   data found" while S2 puts 100..102 in "Authentication failed". **Conflict, and
   an ugly one**, because the two readings imply opposite actions. Resolve it by
   context rather than by code alone: if `body` is present and `measuregrps` is an
   empty array, treat it as no data; if `body` is absent or empty, treat it as an
   auth failure and refresh. Log every 100 with the full envelope until real
   traffic settles the question.
7. Any other non-zero status: log the full envelope, do not retry in a loop,
   surface it. S2's advice for the "An error occurred" family is to check tokens
   and params and then contact support, which is not something a retry loop can
   do.
8. Cap the pagination loop. `more`/`offset` has no documented page limit; a bug
   that never advances `offset` would otherwise spin.

---

## 7. One-time human setup checklist

Everything a person has to do by hand, once. Steps 1 to 8 happen before the first
build slice can authenticate. Nothing here recurs.

1. **Set up the Body Smart in the Withings mobile app first.** S6 is explicit that
   this precedes everything: create a Withings account if you do not have one,
   install and link the device, and let it sync. "all the health data generated by
   the devices will be synced to the user's account, which can later be accessed
   via the Withings API." No sync, no data, regardless of API correctness.

2. **Sign in to the Withings Developer Dashboard** at
   <https://developer.withings.com/dashboard/> (S7). S7 recommends a dedicated
   account: "While you can use your personal Withings account, we recommend
   creating a new account specifically for your organization using a shared
   professional email address." For a personal single-user app, the same account
   that owns the scale is simpler and is what "Want to access your own Withings
   data through your API" in S15 describes.

3. **Confirm the plan and environment.** S7: services are hosted on the EU
   Medical Cloud at `https://wbsapi.withings.net`, "This environment is the only
   one compatible with our WIFI/BLE devices. There are no prerequisites, and free
   access is provided." The free tier covers the Basic Biomarker Pack and up to
   1000 active users (S14), which covers every metric a Body Smart produces
   (section 4).

4. **Create the application in the dashboard.** S7: "Creating an application will
   provide you with the necessary `client_id` and `client_secret` to access
   Withings services." The dashboard is a JavaScript application behind sign-in,
   so **the exact form fields it presents are not documented** on any public page
   and could not be read on 2026-08-21. Expect at minimum a name, a description
   and a Callback URL field.

5. **Set the Callback URL.** This is the field the `redirect_uri` OAuth parameter
   must match. What the docs do say:
   - S2: "This URI must be set as `Callback Url` in your partner application. It
     is possible to use multiple URLs by separating them with a comma." Its three
     worked examples are all HTTPS: `https://mydomain.com/`,
     `https://mydomain.com/,https://mydomain2.com/`, and
     `https://mydomain.com/relative_path?args=value`. So HTTPS, an optional path,
     and a query string are all fine, and several URLs can be registered at once.
   - S5's own official JavaScript snippet sets `const REDIRECT_URI =
     'localhost:3000';`, which is Withings publishing a localhost redirect in its
     own sample code.
   - S9's hard rules (HTTPS only, a proper domain rather than an IP or localhost,
     ports 80 or 443, at most 255 characters, must answer HEAD with 2xx) are
     written for the **notification** `callbackurl`, not for the OAuth redirect.
   - **Whether the dashboard enforces HTTPS, or rejects a private hostname, on the
     OAuth Callback URL field is not documented.** S9's only stated consequence
     of a non-conforming URL is restricted mode, capping the application at 10
     linked users, which is irrelevant to a one-user app.
   - Practical suggestion, not from Withings docs: register a URL you can actually
     serve for the sixty seconds the consent flow takes. A Tailscale MagicDNS
     HTTPS hostname (`https://<host>.<tailnet>.ts.net/withings/callback`) is
     HTTPS on 443 with a real domain name and a real certificate, and it resolves
     for you, which is all the OAuth redirect needs since your own browser
     performs it. `http://localhost:PORT/callback` is the fallback and matches
     S5's sample. Register both, comma separated, and use whichever works.
   - Anything not registered will fail: `redirect_uri` must match, and it must be
     byte-identical in the authorize call and in the token exchange (S2 requires
     `redirect_uri` on the `authorization_code` grant too, described as "The URI
     you use in the first call").

6. **Approval or review: not documented.** No public Withings page describes a
   review, approval, waiting period, or production-promotion step for a Public API
   application. S7 states the opposite for this tier: "There are no prerequisites,
   and free access is provided." S15 confirms the Public API guide "applies if you
   do not have a contract with Withings". The only environment hint anywhere is
   the S7 team-roles table, which distinguishes "applications in dev, beta
   environments" from "dev, beta, and prod" by role; **what those environments
   mean, and whether promotion to prod requires anything, is not documented.**
   Plan for zero approval. If the dashboard demands one, that becomes a
   PREFLIGHT line, not a build blocker.

7. **Copy the client id and the client secret** from the application's page in the
   dashboard (S7: "Creating an application will provide you with the necessary
   `client_id` and `client_secret`"; S16 confirms the client secret is "found in
   your Withings Developer Dashboard"). Put both in the local secret store. Never
   in the repo. The secret is the only thing standing between a stolen refresh
   token and a full health history.

8. **Authorize once, in a browser.** Open
   `https://account.withings.com/oauth2_user/authorize2?response_type=code&client_id=<ID>&scope=user.metrics&redirect_uri=<REGISTERED_URI>&state=<RANDOM>`,
   sign in, accept. **Have the token exchange ready to fire before you click
   accept: the code lives 30 seconds** (S4). Verify the returned `state` matches
   what you sent before touching the code.

9. **Store the first token pair and never lose the refresh token.** Persist
   `userid`, `access_token`, `refresh_token` and the expiry. Every refresh returns
   a new refresh token that must replace the old one (S5); the superseded one dies
   8 hours after issuance or as soon as the new access token is used. Losing the
   chain means repeating step 8 by hand, because the Public API has no
   `recoverauthorizationcode` (S2, contracted partners only).

10. **Optional, before the scale is even linked:** append `&mode=demo` to the
    authorize URL in step 8 to be logged in automatically as a demo user with
    dummy data (S4), and build the whole pipeline against it.

Nothing else is recurring or manual. No webhook endpoint to expose, no DNS to
publish, no certificate to manage, no subscription to renew.

---

## Appendix: the one call this product makes

```
POST https://wbsapi.withings.net/measure
Authorization: Bearer <access_token>
Content-Type: application/x-www-form-urlencoded

action=getmeas
&meastypes=1,5,6,8,11,76,77,88
&category=1
&lastupdate=<max(modified) already committed>
```

Then loop on `more`/`offset` until `more == 0`, upsert on `(grpid, type)`, decode
each value as `value * 10 ** unit`, drop any group containing type 9 or 10, and
advance the cursor to the new `max(modified)` only after the write commits.

## Appendix: open questions for a human with a browser

1. Does the Developer Dashboard's Callback URL field accept a `*.ts.net` host, or
   a `http://localhost:PORT` URL? Not documented; two minutes to check in step 5.
2. Does the Withings Body Smart FAQ on `support.withings.com` claim visceral fat
   and BMR, and if so are they API-exposed or app-computed? S13 says not
   API-exposed for this model. Cloudflare blocked verification on 2026-08-21.
3. What `model` string and `model_id` does a Body Smart return? Neither is
   documented; "Body Smart" is absent from S2 entirely. Read both off the first
   real response and record them.
4. Does envelope `status = 100` mean "no data" (S1) or "authentication failed"
   (S2)? Settle it from real traffic; the client handles both today.
