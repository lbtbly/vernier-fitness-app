# Apple Health into the app, through an iOS Shortcut

Research note, 2026-08-21. Platform baseline: **iOS 26** (Shortcuts User Guide version 9.0
is published for iOS 26; iOS 27 is in beta and its Shortcuts toolkit still carries the same
four Health actions). Target host: `lamberts-mac-mini`, macOS 26.6.

A PWA cannot read HealthKit. That is settled and this note does not revisit it. The only
mechanism is: the user builds a Shortcut, the Shortcut reads Health samples, the Shortcut
POSTs them to an authenticated idempotent HTTPS endpoint on the Mac mini.

## How to read the evidence marks

- **[APPLE]** Apple's own words. Quoted or paraphrased from support.apple.com,
  developer.apple.com, or a man page on this machine. URL given.
- **[BINARY]** Read out of Apple's own shipped data: an action-definition dump, a
  WorkflowKit localization table from an iOS build, a HealthKit SDK header, or a real
  `.shortcut` plist downloaded from Apple's iCloud shortcut API and parsed. Not Apple prose,
  but not community opinion either. This is the strongest evidence for exact parameter keys.
- **[TESTED]** Run on this Mac on 2026-08-21. Command and result recorded.
- **[COMMUNITY]** A named third party reporting observed behaviour. Weakest. Never used
  alone for an action name or a parameter name.

**No action name or parameter in this note is invented.** Where a name could not be verified,
it says so in place rather than guessing.

---

## 0. The six answers, up front

1. **Four Health actions exist**, and only four touch data: `Find Health Samples`,
   `Get Details of Health Sample`, `Log Health Sample`, `Log Workout`. Reading is
   Find + Get Details. **Workouts cannot be read.** `Find Health Samples` is declared for
   HealthKit Quantity and Category types only; `HKWorkout` is neither. Steps, distance,
   flights, exercise minutes, heart rate, resting heart rate, HRV, VO2 max and sleep with
   stages are all reachable. Individual workout sessions are not.
2. **JSON and POST are first-class.** `Get Contents of URL` with Method POST, a Headers
   dictionary, and Request Body set to JSON or File. The batching trick that actually scales
   is columnar: pull `Value`, `Unit`, `Start Date`, `End Date`, `Source`, `Type` off the
   sample list as six parallel arrays, with no `Repeat with Each` loop at all.
3. **Daily automation is possible but not dependable.** A `Time of Day` Personal Automation
   runs with `Ask Before Running` off and no notification. But **HealthKit encrypts its store
   when the device is locked**, Apple's own words, so an overnight run against a locked phone
   reads nothing. Exactly this setup, on iOS 27 with "Allow Running When Locked" on, is on
   record failing every night. Shortcuts also **throttle severely when the screen is off and
   the phone is not on cable power**. Design for "usually automatic, always visible when it
   isn't", and tell the owner about the cable.
4. **HMAC is achievable and still the wrong choice.** It cannot be built from arithmetic:
   Shortcuts has no XOR and no byte handling. But a real HMAC-SHA256 does run headlessly
   through an undocumented `data:text/html` trick, and one free App Store app offers it
   outright. Both leave the shared secret in plaintext inside the shortcut anyway, so signing
   buys far less than it looks like. The recommendation is a bearer token plus a two-pass
   keyed SHA-256 digest using the native `Generate Hash` action, plus a timestamp, a nonce,
   and per-sample dedup keys. Full reasoning in §4.
5. **A third party cannot produce an installable `.shortcut`.** Signing requires an Apple ID
   and a Mac. Worse for this project: **`--mode anyone` and "Copy iCloud Link" are the same
   operation**, and both upload the shortcut to Apple and publish a public record. A shortcut
   carrying the ingest token must never take that path, which rules out the one distribution
   channel the entire Shortcuts ecosystem actually uses. `--mode people-who-know-me` signs
   locally, offline, and works owner-Mac to owner-iPhone. **Ship the guide as the contract.**
   Keep secrets out of the file with import questions, then any channel becomes safe.
6. **Blood pressure is readable** as two HealthKit quantity types. Which is exactly why the
   endpoint must reject those type names by name, in code, with a test.

---

## 1. The Health actions that actually exist

### 1.1 The complete list

Read out of the Shortcuts ToolKit database shipped in an iOS 27 simulator runtime, and
cross-checked against an action-definition dump. Four Health actions handle data:

| Action name | Identifier | Direction | [BINARY] |
|---|---|---|---|
| `Find Health Samples` | `is.workflow.actions.filter.health.quantity` | read | ✓ |
| `Get Details of Health Sample` | `is.workflow.actions.properties.health.quantity` | read | ✓ |
| `Log Health Sample` | `is.workflow.actions.health.quantity.log` | write | ✓ |
| `Log Workout` | `is.workflow.actions.health.workout.log` | write | ✓ |

There is **no `Get Health Sample` action** and **no `Find Workouts` action**. Anything you
read claiming either is wrong. Two workout-control actions exist
(`is.workflow.actions.workout.start`, `is.workflow.actions.workout.end`) but they start and
stop a workout, they do not query one.

[APPLE] confirms `Find Health Samples` by name in the Find and Filter guide: "Find actions
include Find Photos, Find Reminders, Find Calendar Events, Find Music, **Find Health
Samples**, and Find Contacts."
<https://support.apple.com/guide/shortcuts/intro-to-find-and-filter-actions-apd3c845e881/9.0/ios/26>

[APPLE] confirms `Log Health Sample` by name in the complicated-shortcuts guide.
<https://support.apple.com/guide/shortcuts/about-actions-in-complicated-shortcuts-apd081d9d61f/9.0/ios/26>

Note on the label: in the editor the configured action reads **"Find All Health Samples
where …"** once no input is wired into it. Same action. [COMMUNITY]
<https://github.com/mm/heartbridge>

### 1.2 What Find Health Samples returns

Output is a list of health samples. Its magic-variable output is named **`Health Samples`**
and its default property is **`Value`**. [BINARY], from the action definition
(`WFContentItemClass: WFHKSampleContentItem`, `WFContentItemDefaultProperty: Value`).

The action declares its HealthKit access as **Read, Quantity** and **Read, Category**.
[BINARY] That is the load-bearing fact behind "workouts are not readable".

Apple's own note on the action: "If you only see some but not all of your data in the
results, make sure that 'Allow Shortcuts to read data' is set to on in the Health app."
[BINARY, action description string]

### 1.3 Filtering by sample type and date range

The filter lives in one parameter, `WFContentItemFilter`, a
`WFContentPredicateTableTemplate` holding a list of predicate rows. [BINARY, parsed from a
real published `.shortcut`]

Two rows are non-removable:

- **`Type`** row. Its value is an `Enumeration` carrying the picker label as a plain string,
  for example `"Heart Rate"` or `"Steps"`. This is the health type picker.
- **`Start Date`** row. Carries a date operator plus `Date` / `AnotherDate` / `Number` /
  `Unit` values depending on the operator chosen.

In the editor, the date row's operators read **`is` / `is today` / `is between` / `is in the
last`**, and `is in the last` takes a number plus a unit from years / months / weeks / days.
[COMMUNITY] <https://matthewcassinelli.com/actions/find-health-samples/>

`+ Add Filter` adds more rows. Available filter fields are **Value, Start Date, End Date,
Duration, Source, Name**, with operators **is / is not / contains / does not contain /
begins with / ends with**. [COMMUNITY, same source] When more than one row exists, [APPLE]
says "the All or Any options become available."
<https://support.apple.com/guide/shortcuts/add-filter-parameters-apdbdab3433f/9.0/ios/26>

Since **iOS 16.3** the health type picker is searchable in the editor. [APPLE] "Find Health
Samples now supports searching for health types in the editor."
<https://support.apple.com/en-us/101583> This is what the user guide should tell the owner to
lean on, rather than hunting a category tree.

**Gotcha worth writing into the guide.** If a Health-sample variable precedes it, the action
silently reconfigures itself to filter *that input* instead of querying the library. Clear
the variable and set it back to "All Health Samples". [COMMUNITY]
<https://www.1thingaweek.com/week/405/solved-using-health-shortcuts-shortcut-app>

**Second gotcha.** With `is between`, the end date is exclusive: the day you name as the end
is not included. [COMMUNITY] <https://github.com/mm/heartbridge>

### 1.4 Sorting, limits, grouping, units

Real parameter keys, [BINARY] from a parsed `.shortcut`:

| Key | Editor label | Observed value |
|---|---|---|
| `WFContentItemSortProperty` | Sort by | `Start Date` |
| `WFContentItemSortOrder` | Order | `Oldest First` |
| `WFContentItemLimitEnabled` | Limit | boolean |
| `WFContentItemLimitNumber` | Get [n] Items | number |
| `WFHKSampleFilteringUnit` | Unit | `count` |
| `WFHKSampleFilteringFillMissing` | (fill empty buckets) | boolean |

[APPLE] on the generic mechanics: "Turn on Limit, then in the Get [x Items] row that appears,
tap the plus (+) or minus (–) button to select a maximum number of results", and for sorting,
"tap the Order parameter that appears, tap an option (Smallest First, for example)." Both
also accept an Ask Each Time or a Magic Variable.
<https://support.apple.com/guide/shortcuts/add-filter-parameters-apdbdab3433f/9.0/ios/26>

**Sort by** options: Value / Start Date / End Date / Duration / Source / Name / Random.
**Group by** options: Minute / Hour / Day / Week / Month / 3 Months / Year. [COMMUNITY]
<https://matthewcassinelli.com/actions/find-health-samples/>

Grouping is the single most useful volume control. "Grouping by day gives you a total for
each day in your sample range." [COMMUNITY]
<https://www.1thingaweek.com/week/405/solved-using-health-shortcuts-shortcut-app> A second
independent report describes steps "grouped by hour, including zero-step hours", which is the
`WFHKSampleFilteringFillMissing` toggle. [COMMUNITY]
<https://blog.maximeheckel.com/posts/build-personal-health-api-shortcuts-serverless/>

**Unverified and it matters:** what `Source` and `Unit` contain on a *grouped* result. The
endpoint must tolerate a null or empty source on grouped series. Flag for the builder to
check on device and record in EVIDENCE.md.

### 1.5 What a returned sample exposes

`Get Details of Health Sample` extracts one named detail from the sample or samples passed in.
Its picker offers exactly eight details:

**`Type`, `Value`, `Unit`, `Start Date`, `End Date`, `Duration`, `Source`, `Name`.**

[BINARY] via `WFContentItemPropertyName`, corroborated [COMMUNITY] twice:
<https://matthewcassinelli.com/actions/get-details-of-health-sample/> ("Extracts information
about a health sample including the type, value, unit, start date, end date, duration,
source, and name") and the MacStories-authored HealthKit reference
<https://github.com/viticci/shortcuts-playground-plugin> (`claude/skills/shortcuts-playground/HEALTHKIT.md`).

That set maps one-to-one onto the payload schema in §7. There is no sample UUID and no
HealthKit identifier exposed, so **the server must synthesize its own dedup key** from the
fields it does get. See §7.3.

Two traps in the values themselves, both [COMMUNITY] from the MacStories reference:

- **`Value` comes back in the action's displayed Health unit**, not the HealthKit SDK unit.
  Do not assume `Walking + Running Distance` is metres. Always transmit `Unit` next to
  `Value` and convert on the server, never in the Shortcut.
- **Sleep `Duration` displays clock-style** (`1:06:52`). Coerced through Math it behaves as
  seconds. Divide by 3600 for hours. Never divide by 60 and call it hours.

### 1.6 Reachability of every metric the spec asks for

The spec (GOAL.md §8) asks for steps, distance and flights; workouts and activity minutes;
useful heart rate, resting heart rate and recovery; VO2 max / cardio fitness; sleep and
available phases.

Labels marked **observed** were seen in a real Shortcuts editor and recorded in the MacStories
reference (`observed_find_samples_labels` / `observed_shortcuts_labels`). Labels marked
**derived** come from the HealthKit SDK symbol or the Health app display name and were *not*
observed in the Find Health Samples picker. The builder must search the picker, not trust a
derived label.

| Metric | Reachable | Find Health Samples label | HealthKit type | Confidence |
|---|---|---|---|---|
| Steps | yes | `Steps` | `HKQuantityTypeIdentifierStepCount` | **observed** |
| Walking + running distance | yes | `Walking + Running Distance` | `…DistanceWalkingRunning` | **observed** |
| Cycling distance | yes | `Cycling Distance` | `…DistanceCycling` | derived |
| Flights climbed | yes | `Flights Climbed` | `…FlightsClimbed` | **observed** |
| Exercise minutes | yes | `Exercise Minutes` | `…AppleExerciseTime` | **observed** |
| Active calories | yes | `Active Calories` | `…ActiveEnergyBurned` | **observed** |
| Heart rate | yes | `Heart Rate` | `…HeartRate` | **observed** |
| Resting heart rate | yes | `Resting Heart Rate` | `…RestingHeartRate` | derived |
| Heart rate variability | yes | `Heart Rate Variability` (SDNN, ms) | `…HeartRateVariabilitySDNN` | derived, but the string `Heart Rate Variability` is the HealthKit display title in an iOS 27 build [BINARY] |
| VO2 max | yes | search for both `VO2 Max` and `Cardio Fitness` | `…VO2Max` | derived, and the Health app renamed this metric to Cardio Fitness, so check both |
| Sleep | yes | `Sleep` | `HKCategoryTypeIdentifierSleepAnalysis` | **observed**. Not `Sleep Analysis`. |
| Sleep stages | yes | same `Sleep` type, stages appear in the returned samples | `asleepCore` / `asleepDeep` / `asleepREM` | [APPLE] |
| **Workouts, as sessions** | **NO** | n/a | `HKWorkout` | [BINARY], see §1.7 |
| Blood pressure | yes, and forbidden | see §6 | `…BloodPressureSystolic` / `…Diastolic` | see §6 |

Sleep stages are official: [APPLE] "Find Health Samples can now return sleep phases (core,
deep, REM) on iOS", shipped in iOS 16.2. <https://support.apple.com/en-us/101583>

Sleep window advice, [COMMUNITY] MacStories reference: do not filter last night's sleep with
`Start Date is today`. Sleep starts before midnight. Use an explicit range.

### 1.7 Workouts: the honest answer

`Find Health Samples` requests HealthKit read access for **Quantity** and **Category** types
and nothing else. [BINARY] `HKWorkout` is neither. There is no other reading action. So:

**Stock Shortcuts cannot enumerate workout sessions with their activity type, distance and
energy.** No amount of configuration changes this.

What the app can still have:

- **Activity minutes**, via `Exercise Minutes`. Covers "minutes d'activité" in the spec.
- **Active calories**, **distance**, **heart rate** over the workout window, as ordinary
  quantity samples. A session can be reconstructed approximately on the server by clustering
  a dense heart-rate run, but that is an inference and must be labelled one.
- **An Apple Watch Workout Personal Automation trigger** exists and fires at Start, End, or
  both, filtered by workout type. [APPLE]
  <https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/9.0/ios/26>
  Apple documents the trigger's options only. It does not document handing the workout to the
  shortcut, and no Health action can query it afterwards. Treat the trigger as *a signal that
  a workout of type X ended*, usable to fire an ingest run, not as a data source.
- Three Fitness App Intents exist in the iOS 27 toolkit
  (`com.apple.Fitness.WorkoutTotalDistanceIntent`, `…WorkoutExtremeStatIntent`,
  `…AwardedWorkoutIntent`). [BINARY] Whether they surface in the Shortcuts editor and what
  they return is **unverified**. Do not design on them.

**Consequence for the plan:** the training log in this app is fed by the app's own guided
sessions, not by Apple Health. Apple Health contributes the ambient metrics. Say that in the
product copy so the owner is not waiting for Apple Watch workouts that will never arrive.

---

## 2. Building a JSON body and POSTing it

### 2.1 Get Contents of URL

[APPLE], from the Shortcuts User Guide's own web-API chapter:

> tap Show More in the Get Contents of URL action. The following options for the types of API
> requests you can make become available: **GET … POST … PUT … PATCH … DELETE** …
>
> **Note:** When the Get Contents of URL action is switched to POST, PUT, or PATCH, a new
> parameter called **Request Body** is added. Request Body allows you to send **JSON, a Form,
> or a File** to the API as part of your request. This lets you enter new data manually or by
> using variables so you can send the data to the API for creating, replacing, or modifying
> an entry.

<https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/9.0/ios/26>

Exact parameter keys and editor labels, [BINARY] from the action definition:

| Key | Editor label | Values |
|---|---|---|
| `Advanced` | Advanced | expander; everything below hides behind it |
| `WFHTTPMethod` | Method | `GET` `POST` `PUT` `PATCH` `DELETE` |
| `ShowHeaders` | Headers | expander |
| `WFHTTPHeaders` | Headers | key/value dictionary |
| `WFHTTPBodyType` | Request Body | `JSON` `Form` `File` |
| `WFJSONValues` | JSON Values | key/value dictionary, value types Text / Number / Array / Dictionary / Boolean |
| `WFFormValues` | Form Values | key/value dictionary |
| `WFRequestVariable` | File | a single variable |
| `WFURL` | (the URL) | text |

Output is named **`Contents of URL`**.

Three things it does **not** give you:

- **No HTTP status code.** The action's declared output is the fetched data only. There is no
  status output and no response-headers output. `Get Headers of URL`
  (`is.workflow.actions.url.getheaders`) exists but performs its own separate HEAD request,
  so it cannot report the status of your POST. [BINARY]
- **No timeout control.**
- **No gzip.** `Base64 Encode` exists (`is.workflow.actions.base64encode`, modes Encode /
  Decode) but there is no compression action. [BINARY]

**Design consequence, and it is a real one.** The Shortcut cannot branch on a 401 versus a
200. So **the endpoint must answer with a JSON body on every outcome**, including errors, and
the Shortcut must parse that body to decide what to tell the user. Return
`{"ok":true,"accepted":n,"duplicates":n}` or `{"ok":false,"error":"…"}` with a
human-readable `message`, and always with a 2xx-or-not status for `curl` diagnostics but a
readable body for the Shortcut.

[APPLE] on rate limits, from the guide's API limitations page: "Using Repeat actions to make
a large number of requests in a short period of time may lead to usage overages … you may
need to … batch your processes to perform a limited amount of operations at a time." One
batched POST beats a loop of POSTs.
<https://support.apple.com/guide/shortcuts/api-limitations-apd891a6c84e/9.0/ios/26>

[APPLE] also, plainly: **OAuth 2 is not supported.** Same page. That kills any thought of a
proper token flow and is part of why §4 lands where it lands.

**Silent death is the failure mode.** Multiple community reports describe a Shortcut with a
large POST body thinking for several seconds and then "just dying without an error message or
anything". [COMMUNITY]
<https://talk.automators.fm/t/request-triggered-by-shortcuts-instant-error-but-runs-without-response/18420>
Combine that with the invisible status code and you get the design rule: **never infer
success from the absence of an error.** The shortcut must read the response body back and say
what happened.

### 2.2 Dictionaries and lists

Official action names, all [APPLE] from the guide:

- **`Dictionary`**: "Enter text, numbers, values, dictionaries, or lists into a Dictionary
  action to manually create a dictionary."
- **`Get Dictionary from Input`**: "turn text containing JSON or .plist data into a
  dictionary item."
- **`Get Dictionary Value`**: supports dotted key paths, e.g. `beverages.1.favorite`.
- **`Get Item from List`**, **`Repeat with Each`**, **`End Repeat`**, and the variables
  **`Repeat Index`** and **`Repeat Results`**.

<https://support.apple.com/guide/shortcuts/dictionaries-apd43b69f337/9.0/ios/26>
<https://support.apple.com/guide/shortcuts/handling-lists-apd9ba41d21b/9.0/ios/26>

[BINARY] adds `Set Dictionary Value` (`is.workflow.actions.setvalueforkey`, keys
`WFDictionaryKey`, `WFDictionary`, `WFDictionaryValue`), `Set Variable`
(`is.workflow.actions.setvariable`), `Add to Variable` (`is.workflow.actions.appendvariable`,
"Appends this action's input to the specified variable … This allows you to make a variable
hold multiple items"), and `Combine Text` (`is.workflow.actions.text.combine`).

**The `Dictionary` action's value types** are Text, Number, Array, Dictionary, Boolean, keyed
in the plist as `WFItemType` 0–4. The same five types are allowed in `WFJSONValues`. So
nesting objects and arrays natively is supported without string surgery.

### 2.3 The batching pattern that actually works

Naive approach: `Repeat with Each` over the samples, build a dictionary per sample, `Add to
Variable`. It reads well and it does not scale. Every iteration is an interpreter step.

**The pattern that scales is columnar, and it uses no loop at all.**

A magic variable that holds a *list* of health samples can be narrowed to one property, and
the result is a *list of that property*. In the plist this is a
`WFPropertyVariableAggrandizement` with a `PropertyName`. In the editor you insert the
`Health Samples` variable into a field, tap it, and choose the property. [BINARY], parsed out
of a real published shortcut which does exactly this with `Value` and `Type`.

Just as important: **most actions map over a list automatically.** In that same shortcut, one
`Format Date` action consumes a list of start dates and emits a list of formatted strings.
[BINARY]

So six actions produce six parallel arrays for a whole metric:

```
Health Samples ▸ Type     ->  ["Heart Rate", "Heart Rate", ...]
Health Samples ▸ Value    ->  ["62", "64", ...]
Health Samples ▸ Unit     ->  ["count/min", ...]
Health Samples ▸ Source   ->  ["Apple Watch", ...]
Start Date  -> Format Date ->  ["2026-08-20T07:14:03+0200", ...]
End Date    -> Format Date ->  ["2026-08-20T07:14:03+0200", ...]
```

Assigning a list variable to a dictionary key serialises it as a real JSON array. Verified:
the published shortcut does exactly this and its documented output is
`{"type": "...", "dates": [...], "values": [...]}`. [BINARY] + [COMMUNITY]
<https://github.com/mm/heartbridge>

That author states the motive plainly: the parallel-array design "avoids performance issues
that would arise from iterating through individual samples."

**Text coercion warning.** If a list is coerced to text it becomes newline-joined. [COMMUNITY]
<https://blog.maximeheckel.com/posts/build-personal-health-api-shortcuts-serverless/>
("every health sample in the Shortcuts app is in text format separated by `\n`"). Keep lists
as lists. Only use `Combine Text` when you deliberately want a joined string.

### 2.4 Date formatting

Action: **`Format Date`** (`is.workflow.actions.format.date`). Set `Date Format` to `Custom`
and a `Format String` field appears.

[APPLE]: "For custom format strings, Shortcuts uses the patterns defined by the **Unicode
Technical Standard #35**."
<https://support.apple.com/guide/shortcuts/custom-date-formats-apd8d9b19184/9.0/ios/26>

[APPLE] also lists ISO 8601 as a supported standard, "2016-06-01T14:41:36-08:00".
<https://support.apple.com/guide/shortcuts/technical-standards-apdfd459e13d/9.0/ios/26>

**Use this format string, exactly:**

```
yyyy-MM-dd'T'HH:mm:ssZ
```

Producing e.g. `2026-08-20T07:14:03+0200`.

`Format Date` has **no timezone parameter**; it formats in the device timezone. That is why
the pattern must end in `Z` (the numeric offset symbol in TR35), not a literal `'Z'`. Emitting
a local time labelled `Z` would silently shift every sample by two hours in Europe/Paris.
Write that warning into the guide.

Related actions, [APPLE] and [BINARY]: `Date` (`is.workflow.actions.date`), `Adjust Date`
(`is.workflow.actions.adjustdate`), `Get Time Between Dates`
(`is.workflow.actions.gettimebetweendates`). Apple documents the epoch conversion recipe:
"The Date action is set to 00:00:00 UTC Jan 1, 1970. Add the UNIX Time variable to the UTC
date … Next, use Format Date".
<https://support.apple.com/guide/shortcuts/format-date-timestamps-apdfb33b0e17/9.0/ios/26>
There is no epoch symbol in TR35, so **do not use a Unix timestamp anywhere in this design.**
ISO 8601 with a numeric offset costs one action and cannot be got wrong.

### 2.5 Practical size limits

Apple documents two things here, both load-bearing.

**One setting.** [APPLE] "Some shortcuts require access to large amounts of data. To enable
these shortcuts, you must turn on a special setting. Go to **Settings > Shortcuts >
Advanced**. Turn on **Allow Sharing Large Amounts of Data**."
<https://support.apple.com/guide/shortcuts/adjust-privacy-settings-apd961a4fc65/9.0/ios/26>
(It lives on the *basic* privacy page, not the *advanced* one. Easy to miss.) This goes in
PREFLIGHT.md as a named one-time human step.

**One memory ceiling and its escape hatch.** [APPLE], from the complicated-shortcuts page:

> Shortcuts dealing with high volumes of content or large file sizes may need to open in
> Shortcuts to finish.
>
> **Note:** If "Unable to Load" is displayed in the Shortcuts widget, the Shortcuts widget has
> run out of memory. As a workaround, add a **Continue Shortcut in App** action near the
> beginning of your shortcut. When the shortcut reaches the Continue Shortcut in App action,
> the Shortcuts app opens to finish the shortcut (which is no longer subject to the memory
> limitations of the widget environment).

<https://support.apple.com/guide/shortcuts/about-actions-in-complicated-shortcuts-apd081d9d61f/9.0/ios/26>

`Continue Shortcut in App` is `is.workflow.actions.handoff`, present in the iOS 27 toolkit.
[BINARY] **Do not put it in the daily automation.** It foregrounds the Shortcuts app on every
run, which trades away exactly the silence §3.3 buys. Keep it in the pocket for the Backfill
shortcut, which is run by hand anyway.

The number behind that memory limit: **30 MB in any extension context** (widget, Siri, Lock
Screen, Apple Watch, an app-provided action). Stated by an Apple Frameworks Engineer:
"SiriKit Intents Extensions have a 30MB memory limit … If your operation … requires more than
30MB, you might want to consider switching to in-app intent handling."
<https://developer.apple.com/forums/thread/655189> Foreground Shortcuts is not bound by it.

**The measured envelope**, all [COMMUNITY], gathered from the Automators forum and named
benchmarks:

| Constraint | Value |
|---|---|
| Memory, extension context | **30 MB** ([APPLE], above) |
| Memory, Shortcuts app foreground | ~200 MB, then execution halts |
| Output file size, foreground | ~50 MB |
| **`Repeat with Each` with accumulation** | **crashes between ~1,320 and ~2,200 iterations** |
| Accumulation scaling | ~n^1.2, superlinear but not quadratic |
| Coercion inside a loop | 36× penalty over hoisting it out |
| Automation running **inline actions** | **4 minutes**, then killed |
| Automation running a **saved shortcut** | not bound by the 4-minute cap |
| Siri-invoked shortcut | 15 seconds |
| `Get Contents of URL` timeout | unknown, and **not configurable** |
| Request body size cap | unknown; failure mode is silent death |

Sources: <https://talk.automators.fm/t/csv-to-markdown-table-shortcut/16372> (the crash
benchmark: 44,000 rows, and the same crash point on an M2 iPad **and** an M1 Mac, which points
at a Shortcuts-internal ceiling rather than device RAM),
<https://talk.automators.fm/t/tip-running-javascript-in-shortcuts-ios-macos/16575> (200 MB /
50 MB, updated Oct 2025), <https://talk.automators.fm/t/get-contents-from-url/17822> (timeout
not extendable).

**The crash threshold is the whole argument for the columnar design in §2.3.** A row-wise
`Repeat with Each` over two days of heart rate walks straight into it. The columnar pattern
uses zero iterations.

The one positive data point for volume: **8,429 heart-rate samples moved in a single shortcut
run** using exactly that columnar pattern, from the heartbridge author's own console output.
[COMMUNITY] <https://github.com/mm/heartbridge> Roughly a 400 KB body. Observed, not
documented, and the pattern is what made it possible.

Working rules for this build:

- Target a **48-hour window** on the daily run, not 24. Overlap is free because the server
  dedups, and it heals a missed day.
- **Group the high-frequency cumulative metrics by Hour** (steps, walking + running distance,
  flights climbed, active calories, exercise minutes). A day becomes 24 rows instead of
  hundreds.
- **Leave the sparse metrics ungrouped**: resting heart rate, HRV, VO2 max, sleep. They are
  a handful of samples per day.
- **Heart rate is the only bulky ungrouped metric.** Group it by Minute, or turn on Limit.
  Decide on device, record the observed row counts in EVIDENCE.md.
- Keep any single POST under a few thousand rows. Provide a separate **Backfill** shortcut
  with `Ask Each Time` dates so a large historical import is chunked by hand rather than
  attempted in one run.
- **No `Repeat with Each` anywhere in this shortcut.** Not as an optimisation, as a rule. The
  crash threshold above is close enough to a real two-day heart-rate window to matter, and the
  columnar pattern makes the loop unnecessary.
- One POST per run, not one per metric. [APPLE] on rate limiting says as much: "batch your
  processes to perform a limited amount of operations at a time."

---

## 3. Automation

### 3.1 What a Personal Automation is

[APPLE] "Personal automation provides a way to run actions based on events such as time of
day … After you create a new personal automation, when an event occurs you'll receive a
notification asking you to run the automation. You can also edit a personal automation to run
without asking. **Personal automation is specific to a device. The automation will be backed
up to iCloud but will not sync to other devices.**"
<https://support.apple.com/guide/shortcuts/intro-to-personal-automation-apd690170742/9.0/ios/26>

That last sentence matters for the guide: the automation must be created **on the iPhone**.
Building it on a Mac does not carry it over.

Creation path, [APPLE]: Shortcuts app → **Automation** tab → **+** → **Create Personal
Automation** → choose a trigger → set options → **Next** → **Add Action** → **Next** →
**Done**.
<https://support.apple.com/guide/shortcuts/create-a-new-personal-automation-apdfbdbd7123/9.0/ios/26>

### 3.2 The Time of Day trigger

[APPLE] "The **Time of Day** trigger has the following options: **Sunrise** … **Sunset** …
**Time of Day**: Triggers your automation at a specific time … **Repeat**: Select which day or
days you want your automation to run. **Daily** … **Weekly** … **Monthly**."
<https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/9.0/ios/26>

Granularity is **one trigger, one time**. Three runs a day means three automations, all
pointing at the same shortcut. That is the recommended shape here.

### 3.3 Running without confirmation

[APPLE], verbatim from the guide:

> **Enable an automation to run without asking.** Some personal automations can run without
> asking you for confirmation when they're triggered. … Turn off **Ask Before Running**, then
> tap **Don't Ask** to confirm your choice. Tap Done. **The automation will not notify you
> when it's triggered.**
>
> The following automations can be run automatically: **Time of Day**, Alarm, Sleep, Arrive,
> Leave, CarPlay, Email, Message, Transaction, Wi-Fi, Bluetooth, **Apple Watch Workout**,
> NFC, App, Airplane Mode, Do Not Disturb, Low Power Mode, Battery Level, Charger, Sound
> Recognition.
>
> **Note:** You also may need to set individual actions to run automatically.
>
> The following automation cannot be run automatically: Before I Commute.

<https://support.apple.com/guide/shortcuts/enable-or-disable-a-personal-automation-apd602971e63/9.0/ios/26>

So Time of Day qualifies, and the run is silent. Good. The "individual actions" note is the
warning that any action which would prompt still prompts. `Find Health Samples` prompts once
for Health access; after granting **Always Allow** it does not ask again. [APPLE]
<https://support.apple.com/guide/shortcuts/adjust-privacy-settings-apd961a4fc65/9.0/ios/26>

### 3.4 The reliability problem, and it is not small

**This is the fact that shapes the whole feature.** [APPLE], HealthKit documentation:

> The user's device stores all HealthKit data locally. For security, **the device encrypts the
> HealthKit store when the user locks the device. As a result, your app may not be able to
> read data from the store when it runs in the background.** However, your app can still write
> to the store, even when the phone is locked.

<https://developer.apple.com/documentation/healthkit/protecting-user-privacy>

Reads fail on a locked phone. Writes do not. Shortcuts is subject to the same store.

Independently corroborated by a developer who built exactly this pipeline: "The shortcut
cannot run in the background while the phone is locked" and Apple Health data requires an
unlocked phone. [COMMUNITY]
<https://blog.maximeheckel.com/posts/build-personal-health-api-shortcuts-serverless/>

There is a separate, orthogonal per-shortcut lock setting. iOS carries the string "**This
shortcut cannot run when the device is locked. You can change this in the Privacy tab of the
shortcut settings.**" [BINARY, WorkflowKit localization table from an iOS 27 build] It arrived
in iOS 16.3 as "the ability to disable a shortcut from being run while the device is locked".
[APPLE] <https://support.apple.com/en-us/101583>

**Do not confuse the two.** Allowing the shortcut to run while locked does not decrypt the
HealthKit store. It removes one gate; the HealthKit gate stays shut.

**This exact scenario is already on record, on iOS 27, and it failed.** A developer's issue
tracker carries a report of a Personal Automation, Time of Day 11:30 PM nightly, running a
Health export, with **"Allow Running When Locked" enabled** and all permissions granted. It
failed every night. The maintainer's reply: "health data cannot be accessed on iOS while the
phone is locked, **this is a hard limit set by Apple**." [COMMUNITY]
<https://github.com/CodyBontecou/health-md/issues/87> The reporter's own conclusion is the one
to internalise: an overnight schedule means the phone is almost always locked when it fires,
so this limit specifically destroys the most natural scheduling choice for a fitness app.

**The rule, stated cleanly.** Sindre Sorhus, asked directly whether non-UI actions still run
from an automation while locked, answered **"Yes"**, and that actions requiring UI cannot open
when locked with "no possible workaround". [COMMUNITY]
<https://github.com/sindresorhus/Actions/issues/203> So: **headless actions survive lock,
anything needing UI does not, and HealthKit reads are blocked on top of that by encryption.**

**Correction to a common claim.** "Low Power Mode suppresses automations" is **not supported by
evidence.** A targeted search turned up no credible report of LPM-as-a-state blocking an
automation from firing. The reports that look like it are about Low Power Mode *as a trigger*
breaking, which is a different thing. Do not put it in the docs.

**The real degradation is throttling, not a clean kill,** and it has a mitigation:

> "Shortcut execution becomes slow if the screen is off for more than **10 seconds** and the
> device is **not connected to power**. 'Wait 1' can take up to 5 minutes, for example."
>
> "Shortcuts do not slow down when the device is locked **if it's charging over cable**. It
> looks like they slow down if charging wirelessly even when Always On Display is on."

[COMMUNITY] <https://talk.automators.fm/t/19013> (gluebyte, consolidated October 2025)

So a throttled shortcut does not die, it grinds, and then trips a timeout. **Cable power is the
one reliable mitigation, and wireless charging does not count.** That is a concrete instruction
for the guide: the most dependable nightly run is one scheduled while the iPhone is on a cable.

Error strings for a killed run, worth recognising in a support doc: **"automation failed: took
too long to run"** [COMMUNITY] <https://discussions.apple.com/thread/254249430> and
`WFBackgroundShortcutRunnerErrorDomain error 1`.

**After a reboot, automations are deferred.** iOS posts "Automations will run once your iPhone
is unlocked". [COMMUNITY] <https://discussions.apple.com/thread/255473986> Deferral until first
unlock is Apple's stated design, and reporters describe a further multi-minute warm-up after
that.

**One caveat is specific enough to change the build.** An automation with **inline** actions
"runs only up to **4 minutes** on iOS/iPadOS if you manually add actions (including *Run
Shortcut*)", but "runs much longer if you **select an existing shortcut** to run". [COMMUNITY]
<https://talk.automators.fm/t/19013> So the automation must be one action long and must point
at a saved shortcut. Step 27 in §8 does this; the reason is here.

Do not conflate that 4 minutes with the other ceilings in circulation. They measure different
things: **~20 to 30 s** per third-party app intent, **15 s** for a Siri-invoked shortcut,
**10 min** for a HomeKit hub, which is a different execution context entirely. The widely-cited
30 s and 180 s figures trace to the intent timeout and to
`beginBackgroundTaskWithExpirationHandler`, and **neither is a Shortcuts automation watchdog.**
[COMMUNITY] Never invoke this shortcut from Siri.

**A silent-data-loss trap worth designing against.** In one fitness app, per-item HealthKit
errors did not set the top-level error, so a fully-failed locked run **still advanced the sync
checkpoint**, permanently skipping any activity that was only ever seen during a locked fire.
[COMMUNITY] <https://github.com/holmes1371/FitnessLoadTracker/issues/35> The windowed,
dedup-keyed design in §7 has no checkpoint to corrupt, which is a second reason to keep it.
**Never build a "last synced at" cursor that a failed run can move.**

**On authority.** Across ten Apple Developer Forums threads on automation reliability, several
with thousands of views, there is **not one Apple engineer reply**. Everything in this
subsection except the HealthKit encryption quote is third-party. Weigh it accordingly.

### 3.5 The design that follows

Do not promise hands-off. Build this instead:

1. **Three Time of Day automations** at times the phone is usually in hand: 08:30, 13:30,
   21:30 Europe/Paris. Each runs the same shortcut. `Ask Before Running` off.
2. **A 48-hour window** on every run. Any run that lands on an unlocked phone heals the two
   before it.
3. **A manual trigger that always works**: the shortcut on the Home Screen, in Control
   Centre, or on the Action button. One tap, phone by definition unlocked.
4. **The app makes silence visible.** A "last successful ingest" timestamp on the dashboard
   and an amber state past 36 hours. This is persona finding #1 exactly: the failure mode is
   silence, not error, and "I have to notice what isn't there" is the worst possible signal.
   The app must notice for him.
5. **An Apple Watch Workout automation, End**, as a bonus trigger. Right after a workout the
   phone is usually unlocked and in hand, and it is the moment the data matters most.
6. **Tell the owner about the cable.** If he wants a genuinely dependable overnight run, the
   phone has to be on a cable, not a wireless pad. That is one sentence in the guide and it is
   the difference between a run that grinds and one that completes.
7. **No sync cursor.** Every run re-reads a fixed 48-hour window and the server dedups. There
   is deliberately no "last synced" pointer for a failed locked run to advance past.

---

## 4. Authentication the Shortcut can actually perform

### 4.1 What Shortcuts has

Verified present in the iOS 27 Shortcuts toolkit database [BINARY]:

| Action | Identifier | Notes |
|---|---|---|
| `Generate Hash` | `is.workflow.actions.hash` | `WFHashType`: MD5, SHA1, **SHA256**, SHA512 |
| `Base64 Encode` | `is.workflow.actions.base64encode` | `WFEncodeMode`: Encode / Decode |
| `Random Number` | `is.workflow.actions.number.random` | `WFRandomNumberMinimum` / `Maximum` |
| `Combine Text` | `is.workflow.actions.text.combine` | custom separator |
| `Text` | `is.workflow.actions.gettext` | builds the canonical string |
| `URL` | `is.workflow.actions.url` | holds a literal URL, including a `data:` URL |
| `Get Contents of Webpage` | `is.workflow.actions.getwebpagecontents` | renders a page and returns its text. `UnsupportedEnvironments: MemoryConstrained` |
| `Run Script Over SSH` | `is.workflow.actions.runsshscript` | host, port, user, password or SSH key |
| `Run JavaScript on Webpage` | `is.workflow.actions.runjavascriptonwebpage` | see below |
| `Continue Shortcut in App` | `is.workflow.actions.handoff` | see §2.5 |

`Generate Hash` is corroborated live: the string `SHA256 (WFHashType)` appears in the
WorkflowKit localization table of an iOS 27 build. [BINARY]
<https://github.com/blacktop/ipsw-diffs> The parameter enum (MD5/SHA1/SHA256/SHA512) and the
description "Generates a MD5/SHA1 hash from the input" come from an Apple action-definition
dump. [BINARY] Three independent community references agree on the name and the enum.
[COMMUNITY] <https://matthewcassinelli.com/actions/generate-hash/> ·
<https://docs.jellycuts.com/Documentation/Shortcuts/hash.html> ·
<https://github.com/melon-lang/melon-lang>

**Apple's Shortcuts User Guide has no per-action reference.** There is no Apple page for
`Generate Hash` or `Base64 Encode`. The guide's 106 pages cover concepts, not an action
catalogue. That is why every action-level fact in this note carries [BINARY] or [COMMUNITY]
and never [APPLE].

**There is no UUID action.** Confirmed by absence from the full 1,206-entry toolkit ID list.
[BINARY] Nor is there a UUID token in the `Text` action: [APPLE] lists the special variables
as **Ask Each Time, Clipboard, Current Date, Shortcut Input**, and that is all.
<https://support.apple.com/guide/shortcuts/variable-types-apdd2b316022/9.0/ios/26>
Nonces must be assembled from `Random Number` plus the timestamp.

**`Random Number` is not documented as cryptographically secure.** Treat it as a uniqueness
source, not an unpredictability source. That is fine for the job it has here: see §4.3.

**There is no native "now as Unix epoch".** UTS #35 has no epoch specifier and `Format Date`
offers none. The stock recipe is `Date` set to 1970-01-01 plus `Get Time Between Dates` in
Seconds plus `Round Number`. Three actions to avoid, which is why §4.3 uses ISO 8601 with a
numeric offset throughout.

### 4.2 Can a Shortcut compute an HMAC? Yes, by a back door. Don't.

**Not from arithmetic.** HMAC needs `H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ m))`. Shortcuts has no XOR,
no AND, no shift, no byte indexing. `Calculate` offers Modulus, powers, roots, logs, factorial
and trig, and nothing bitwise. `Generate Hash` returns a **hex string**, not bytes, and
converting hex back to raw bytes needs bit regrouping that cannot be expressed. **That path is
closed.**

**But there is a working back door, and honesty requires naming it.** A `Text` action holding
an HTML document with a pure-JavaScript SHA-256/HMAC implementation, wrapped into a `URL`
action as `data:text/html,<the document>`, then fed to **`Get Contents of Webpage`**, executes
that JavaScript in an offscreen web view and returns the hex HMAC as text. No Safari, no share
sheet, no tap, no network, no third-party app.

Evidence: a shortcut doing exactly this was decoded from its iCloud link, ten actions, shared
2022. [COMMUNITY] <https://talk.automators.fm/t/feature-request-hmac256-and-other-crypto-functions/5182>
And an actively maintained project (last push 2026-04) implements an entire language
interpreter on the same primitive, which is strong evidence it still works.
[COMMUNITY] <https://github.com/melon-lang/melon-lang>
`Get Contents of Webpage` is confirmed present in the iOS 27 toolkit and its declared
interactivity does not open an app. [BINARY]

**Why it is still rejected here.** Not because it fails. Because:

- It is undocumented behaviour. Apple owes it nothing and can close it in a point release,
  and this is the path the owner's daily health data rides on.
- The secret and the message are interpolated raw into a JavaScript string literal. A quote or
  a backslash in the data breaks it or worse. Doing it safely means base64-encoding the
  payload first, which is more machinery again.
- `data:` URLs have length limits, and the payload here is not small.
- **It does not solve the actual problem.** The secret still sits in plaintext inside the
  shortcut. A proper HMAC over a secret anyone with the unlocked phone can read is
  cryptographic theatre. The two-pass digest in §4.3 has the same threat model and a tenth of
  the moving parts.

The other routes, each rejected with its reason:

- **`Run JavaScript on Webpage`.** [APPLE], verbatim: "The input to the Run JavaScript on
  Webpage action must be an active Safari webpage, which means you must run the shortcut from
  the share sheet."
  <https://support.apple.com/guide/shortcuts/intro-to-the-run-javascript-on-webpage-action-apd218e2187d/9.0/ios/26>
  It also prompts on first use per shortcut per webpage, needs
  `Settings > Shortcuts > Advanced > Allow Running Scripts`, and is scanned against malware
  definitions.
  <https://support.apple.com/guide/shortcuts/advanced-shortcuts-settings-apdfeb05586f/9.0/ios/26>
  **It cannot run in an unattended Personal Automation.** Definitively rejected.
- **`Run Shell Script`** does not exist on iPhone. macOS only. [COMMUNITY]
- **`Run Script Over SSH`** could shell out to `openssl dgst -hmac` on the Mac mini. It exists
  on iOS with key auth and runs without opening an app. [BINARY] But it puts SSH credentials
  on the phone, opens an SSH surface on the host, and dies off-tailnet. And if the server is
  reachable enough to SSH into, it is reachable enough to just POST to. Rejected on
  complexity, not capability.
- **`Open X-Callback URL`** foregrounds the target app by definition. Rejected.
- **Third-party app actions.** The free **Actions** app (Sindre Sorhus, no ads, no IAP) has
  `Transform Text with JavaScript` (JavaScriptCore, headless), `Sign JSON Web Token` (HS256,
  which *is* HMAC-SHA256), `Generate UUID`, `Generate Random Data` ("cryptographically
  secure"), `Convert Date to Unix Time`, and a `Keychain` action that would keep the token out
  of the shortcut body entirely. [OFFICIAL-vendor] <https://sindresorhus.com/actions>
  This is genuinely the most capable option and it deserves an honest hearing. It is rejected
  for one reason: it makes the owner's daily health pipeline depend on a free third-party App
  Store app remaining free, remaining compatible, and remaining published. For a single-owner
  self-hosted app whose whole premise is that the data stays on his machine, that is a
  dependency worth not having. **Record the decision so it can be revisited**, and note that
  the `Keychain` action alone would be a real security improvement if the owner ever accepts
  the dependency.

### 4.2b What every comparable integration actually does

Worth knowing before over-engineering this. Surveyed: **nobody signs Shortcuts requests.**

- **Home Assistant REST API**: `Authorization: Bearer TOKEN`, long-lived access token.
  [OFFICIAL] <https://developers.home-assistant.io/docs/api/rest/>
- **Home Assistant webhooks**: no auth at all. The webhook ID is the secret. "Treat a webhook
  ID like a password." [OFFICIAL]
  <https://www.home-assistant.io/docs/automation/trigger/#webhook-trigger>
- **n8n webhook node**: Basic auth, Header auth, JWT, or none. [OFFICIAL]
  <https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/>
- **Airtable**, **Notion**: `Authorization: Bearer <token>`. [OFFICIAL]

The scheme in §4.3 is already stricter than every one of those. It is stricter because
GOAL.md §8 asks for a signature, a timestamp and replay protection by name, not because the
threat model demands more than a bearer token behind Tailscale HTTPS would give.

### 4.3 The recommended scheme

A bearer token, plus a two-pass keyed SHA-256 digest over a canonical metadata string, plus
timestamp, nonce and idempotency. All of it buildable by hand in Shortcuts with actions named
above.

**Headers**

```
Authorization:      Bearer <ingest-token>
Content-Type:       application/json
X-Ingest-Key-Id:    <key id, e.g. k1>
X-Ingest-Timestamp: 2026-08-21T18:04:11+0200
X-Ingest-Nonce:     <timestamp>-<random>-<random>
X-Ingest-Digest:    <64 lowercase hex chars>
Idempotency-Key:    <same value as X-Ingest-Nonce>
```

**Canonical string.** Newline-joined, exactly these six fields, in this order, no trailing
newline:

```
v1
<key id>
<X-Ingest-Timestamp>
<X-Ingest-Nonce>
<window_start>
<window_end>
```

**Digest.** Two `Generate Hash` passes, both SHA256, lowercase hex:

```
inner  = SHA256( secret + "|" + canonical )
digest = SHA256( secret + "|" + inner )
```

Two passes, not one. A single `SHA256(secret ‖ message)` is open to a length-extension attack.
The second pass runs over a fixed-length input (the secret plus 64 hex characters), which
closes it. **This is not HMAC and the docs must not call it HMAC.** Call it a two-pass keyed
digest and note the reason.

**What the digest does and does not cover.** It covers the request's identity, its key, its
time, its nonce and its declared window. **It does not cover the body bytes**, because the
Shortcut never sees the bytes its JSON serialiser produces and therefore cannot hash them.
Body integrity comes from TLS, which is already mandatory here: Tailscale Serve HTTPS on
`lamberts-mac-mini.tailda76d6.ts.net`, never Funnel, never a LAN port. Write that trade-off
into `docs/security.md` rather than letting a reader assume more than is true.

A byte-exact variant is possible: build the whole JSON body by hand in a `Text` action, hash
that exact text, and POST it with Request Body set to **File** with the text variable in the
File slot. It buys body integrity at the cost of hand-rolled JSON escaping inside a Shortcut,
where a stray quote in a `Source` name silently produces malformed JSON. **Not recommended.**
Record the decision; do not build it.

**On the nonce and `Random Number`.** `Random Number` is not documented as a CSPRNG, so the
nonce is not unpredictable. It does not need to be. Its only job here is **uniqueness**, and
uniqueness is enforced server-side by the seen-nonce set, not by entropy. An attacker who can
guess the next nonce gains nothing: he would still need the token and a matching digest, and a
guessed nonce that is already in the seen-set is rejected on arrival. Say this in
`docs/security.md` so nobody later mistakes the nonce for a secret.

**Replay protection, server side:**

- Reject if `|now − X-Ingest-Timestamp| > 300s`.
- Reject if `X-Ingest-Nonce` has been seen. Keep nonces for 24 hours, indexed and swept.
- Reject if the digest does not match a recomputation over a canonical string the **server**
  builds from the parsed body's `key_id`, `window_start` and `window_end` and the headers.
  Never from a string the client supplies whole.
- Constant-time compare.

**Idempotency, two layers:**

- **Request level.** `Idempotency-Key` stored with the response. A repeat returns the stored
  response and writes nothing.
- **Row level, and this is the one that matters.** Health samples carry no UUID through
  Shortcuts, so the server computes
  `dedup_key = sha256(type ‖ '|' ‖ start ‖ '|' ‖ end ‖ '|' ‖ value ‖ '|' ‖ unit ‖ '|' ‖ source)`
  and puts a unique index on it. `INSERT … ON CONFLICT DO NOTHING`. Overlapping windows then
  cost nothing and a nervous owner can re-run the shortcut ten times safely.

**Token handling**, per the roles table in BRIEF.md: the ingest token is a separate credential
from the web session, shown once, stored encrypted, revocable, and it grants ingest and
nothing else. It lives in a `Text` action inside the Shortcut, so anyone holding the unlocked
phone can read it. That is acceptable and must be stated, not hidden. Rotation is: revoke in
the app, edit two `Text` actions in the Shortcut.

**Diagnostics, which the spec requires.** The setup screen shows a fixed canonical string, the
digest the server computes for it with the live secret, and a `curl` line. The owner runs the
Shortcut once in test mode and compares digests. That single screen turns every silent
mismatch into a visible one.

---

## 5. The `.shortcut` file question

### 5.1 What is inside one

**A signed `.shortcut` is not a plist. It is a container that holds one.** Structure, taken
apart byte by byte on this Mac:

```
AEA1 container, profile 0 = hkdf_sha256_hmac__none__ecdsa_p256   (SIGNED, NOT ENCRYPTED)
├── auth data: binary plist (certificate chain / Apple ID validation record)
└── payload: LZFSE-compressed Apple Archive ("AA01")
      └── one entry: "Shortcut.wflow"
            └── binary plist ("bplist00") -> WFWorkflowActions, ...
```

[TESTED] Despite the name, **nothing in an Apple Encrypted Archive shortcut is encrypted.**
Profile 0 is ECDSA P-256 signing with no encryption. Anyone can read the contents. That
matters here: a shortcut carrying the ingest token protects it by not being distributed, not
by the container.

Apple's own UTI declarations in `Shortcuts.app/Contents/Info.plist` make the split explicit.
[APPLE, local]

| UTI | Extension | Conforms to |
|---|---|---|
| `com.apple.shortcut` | `.shortcut` | `public.data`, `public.content` |
| `com.apple.shortcuts.workflow-file` | `.wflow` | **`com.apple.property-list`**, `public.content` |

`.wflow` is the raw property list. `.shortcut` is the signed container around one. The archive
entry being named `Shortcut.wflow` closes the loop.

`WFWorkflowActions` is an array of dictionaries with exactly two keys each:

```
WFWorkflowActionIdentifier  ->  "is.workflow.actions.gettext"
WFWorkflowActionParameters  ->  { "WFTextActionText": "test" }
```

Other top-level keys: `WFWorkflowClientVersion`, `WFWorkflowMinimumClientVersion`,
`WFWorkflowMinimumClientVersionString`, `WFWorkflowIcon`, `WFWorkflowImportQuestions`,
`WFWorkflowTypes`, `WFWorkflowInputContentItemClasses`, `WFWorkflowOutputContentItemClasses`,
`WFQuickActionSurfaces`, `WFWorkflowHasOutputFallback`, `WFWorkflowHasShortcutInputVariables`.
[TESTED] + [COMMUNITY] <https://zachary7829.github.io/blog/shortcuts/fileformat>

Two details worth knowing. **There is no `WFWorkflowName` key**: the name lives in the
filename and in the iCloud record. And **the signer normalizes**: signing injected several
keys that were never written.

**Apple documents none of this.** No format page, no `WFWorkflowActions` reference, no MIME
type. Apple's sanctioned path for programmatic shortcuts is App Intents, which never touches
the file.

### 5.2 Signing: the definitive answer

**Signing is mandatory.** Apple's refusal string, read out of
`WorkflowKit.framework/Resources/Localizable.loctable` on this machine, verbatim:

> **"Importing unsigned shortcut files is not supported. Please use another sharing option."**

[APPLE, local] Corroborated at WWDC21 session 10232, *Meet Shortcuts for macOS*: "Shortcuts
files are signed with the identity of the person who sent them."
<https://developer.apple.com/videos/play/wwdc2021/10232/>

**The command**, from `man 1 shortcuts` on this machine, macOS 26.6:

```
shortcuts sign [--mode mode] --input input --output output
```

> `[--mode mode]` The signing mode. Either **"people-who-know-me"** or **"anyone"**.
>
> Specifying "people-who-know-me" will **sign locally**, but only your devices, or people who
> have your contact info in their contacts, will be able to import the shortcut.
>
> Specifying "anyone" will **notarize via iCloud**, and allow anyone to import the shortcut.

[APPLE] `people-who-know-me` is the default; omitting `--mode` produces a byte-identical
result. [TESTED]

**The two modes produce completely different auth data.** [TESTED]

- **`--mode anyone`** carries one key, `SigningCertificateChain`, three deep:
  a per-signing leaf under `Apple System Integration CA 4` under `Apple Root CA - G3`.
- **`--mode people-who-know-me`** carries four: `AppleIDValidationRecord` (a CMS blob wrapping
  an XML plist), `SigningPublicKey` (a 65-byte P-256 point), `AppleIDCertificateChain`
  (`CN=com.apple.idms.appleid.prd.<uuid>`), and `SigningPublicKeySignature`. That is the
  signer's Apple ID identity embedded in the file, exactly as Apple's UI warns.

**Network test.** Both modes run under a network-denying sandbox profile: [TESTED]

| Mode | Network denied | Result |
|---|---|---|
| `people-who-know-me` | yes | **succeeded**, 26,261 bytes |
| `anyone` | yes | **failed**: `The operation couldn't be completed. Operation not permitted` |

### 5.2b The finding that decides this feature

**`shortcuts sign --mode anyone` uploads your shortcut to iCloud and publishes a public
record. The leaf certificate's Common Name *is* the iCloud share ID.** [TESTED]

Two signings 62 seconds apart minted two different leaf CNs. Fetching either CN unauthenticated
from `https://www.icloud.com/shortcuts/api/records/<cn>` returns a live record:

```
recordType: SharedShortcut          signingStatus: APPROVED
maliciousScanningContentVersion: 1
signingCertificateExpirationDate:   (about 13 months out, matching the cert)
fields.signedShortcut:  the AEA1 file, downloadable
fields.shortcut:        the UNSIGNED plist, also stored by Apple
```

So **`--mode anyone` and "Copy iCloud Link" are the same operation producing the same
artifact**, and Apple retains both the signed container and the raw plist.

**Consequence, and it is the sharp one.** The shortcut this project needs contains the ingest
token and the tailnet hostname. GOAL.md §2 says data stays on the Mac mini and the roles table
says the ingest token is shown once and stored encrypted. Therefore:

> **Never run `--mode anyone` on a token-bearing shortcut. Never use Copy iCloud Link on one.
> They are the same act, and the act is an upload to Apple.**

This also removes the option the whole Shortcuts ecosystem relies on. Every gallery, every
blog, every archive distributes iCloud links, because for ordinary shortcuts that is right.
For this one it is disqualifying.

### 5.2c Can a third party sign? No.

- `anyone` is a server-side Apple operation by construction. [APPLE], the Mac guide: "When you
  sign a shortcut, Apple receives a copy for validation."
  <https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac>
  No `Apple System Integration CA 4` signature exists without Apple issuing it. Proven by the
  network test above.
- `people-who-know-me` signs offline, but only with an Apple ID identity certificate already
  provisioned by iCloud sign-in, and produces a file only the signer's own devices and
  contacts can open.
- The CLI is macOS only. There is no iOS signer.
- [COMMUNITY] `libshortcutsign` implements **contact signing only**, and only after you dump
  your own Apple ID validation record. It cannot mint an `anyone` signature.
  <https://github.com/0xilis/libshortcutsign>
- [COMMUNITY] `shortcut-signing-server` is a Mac wrapper whose README requires being logged
  into macOS via UI or VNC. An automated client of Apple's notarization, not a replacement.
  <https://github.com/scaxyz/shortcut-signing-server>
- MDM offers nothing. There are no Shortcuts payloads.

**A Mac signed into iCloud is a hard dependency for producing any distributable shortcut.**

### 5.3 What iOS does with an unsigned or privately-signed file

**Unsigned: refused, with a modal alert and no override.** Alert bodies shipping in
WorkflowKit today [APPLE, local]:

- `Importing unsigned shortcut files is not supported. Please use another sharing option.`
- `Failed to verify this shortcut`
- `This shortcut cannot be opened because it was shared by someone who is not in your contacts.`
- `The shortcut "%@" was received from someone you know, but it cannot be opened because
  Private Sharing is disabled in your Shortcuts settings.`

Titles: `Shortcut Cannot Be Opened`, `"%@" Can't Be Imported`, `Import Failed`. Matched in the
wild [COMMUNITY] <https://discussions.apple.com/thread/253452250>

**"Allow Untrusted Shortcuts" is dead.** iOS 13 and 14 only, removed in iOS 15, absent from
iOS 15 through 26. Apple's versioned guide proves it: the anchor `apdfeb05586f` resolves to
"Enable shared shortcuts" in the 3.x and 4.x editions and to "Advanced Shortcuts settings"
from iOS 15 onward. The iOS 14 page is still live and still says "Turn on Allow Untrusted
Shortcuts. **Note:** If you don't see the Allow Untrusted Shortcuts setting, run a shortcut and
then go back to Settings."
<https://support.apple.com/guide/shortcuts/enable-shared-shortcuts-apdfeb05586f/3.2/ios>
The current page at that anchor lists only **Allow Running Scripts**. Scanning all 42 Shortcuts
localization tables on macOS 26.6, the strings `Add Untrusted Shortcut` and `Sharing Security`
are **absent**. [APPLE, local]

**So the question "is it realistic to ask the user to enable it" is moot. There is no toggle.**

**What replaced it: Private Sharing**, and its scope is narrower than it looks. [APPLE]

> You can receive shortcuts directly from people in your contacts through AirDrop, Messages,
> and more … **WARNING: Apple cannot verify the authenticity or behavior of shortcuts shared
> privately.** … go to Settings > Shortcuts. **Turn on Private Sharing.**

<https://support.apple.com/guide/shortcuts/adjust-privacy-settings-apd961a4fc65/9.0/ios/26>

It gates **only** contact-signed (`people-who-know-me`) files. It is off by default. It does
nothing for unsigned files and is **not needed** for `anyone`-signed files or iCloud links.

**Version timeline**, for the record:

| iOS | State |
|---|---|
| 12 | Free file import. `shortcuts://import-shortcut?url=…` was documented. That page is gone. |
| 13 | File import disabled. `Allow Untrusted Shortcuts` introduced. |
| 14 | Same, and *sharing* also required the toggle. |
| 15 | Toggle removed. Signing and notarization replace it. File sharing returns. Private Sharing appears. |
| 16, 17, 18, 26 | No change. The `share-shortcuts` and `adjust-privacy-settings` pages are byte-identical across the 15.0 through 26.0 editions. |

### 5.4 The decision for this build

Five options, judged against this project's constraint that the token never leaves the Mac.

| Option | Works? | Leaks the token to Apple? | Verdict |
|---|---|---|---|
| Unsigned `.shortcut` download | **No.** iOS refuses it. | n/a | Never, and GOAL.md §8 forbids faking it. |
| `--mode anyone` signed file | Yes | **Yes.** Uploads and publishes. | **Forbidden.** |
| Copy iCloud Link | Yes | **Yes.** Same operation. | **Forbidden.** |
| `--mode people-who-know-me`, signed on the Mac mini | Yes, verified offline | No | **Offer it, as a convenience.** |
| Step-by-step build guide in the app | Always | No | **This is the contract.** |

**Ship the guide. Optionally offer the locally-signed file. Never touch iCloud.**

**The better move, and it should be taken: keep the secret out of the file.** Apple documents
**import questions**, which prompt the installer for values when a shortcut is added.
<https://support.apple.com/guide/shortcuts/add-import-questions-to-shared-shortcuts-apdf330fd3a0/9.0/ios>
A shortcut whose base URL and ingest token are import questions contains no secret at all. That
changes the table above completely: a token-free shortcut is safe to distribute by any channel,
and it survives token rotation without being rebuilt. **Design the shortcut this way from the
start**, and treat the "paste the token into a Text action" instructions in §8 as the fallback
for a hand-built copy.

Constraints if the signed file is built:

- **The signing step runs on the macOS host, not in the container.** `/usr/bin/shortcuts` does
  not exist on `linux/aarch64`. That is a host-side helper the app shells out to, and therefore
  a **PREFLIGHT.md line**, per the operator's rule that every host dependency is named at the
  greenlight or does not exist.
- The Mac must be signed into iCloud with a current Apple ID validation record. It expires
  (thirty days suggested). The app must handle `shortcuts sign` failing and fall back to the
  guide without drama.
- The iPhone needs **Settings > Shortcuts > Private Sharing** on. PREFLIGHT line.
- The generated file is served only over the authenticated session and never cached.
- **A guard in the helper must refuse `--mode anyone`.** Not a comment. A check.

If any of that wobbles during the build, **cut the file and keep the guide.** The guide alone
clears the bar.

**On URL schemes.** Apple documents no import scheme in the current guide: only `shortcuts://`,
`create-shortcut`, `open-shortcut`, `run-shortcut`, `gallery`, and the x-callback variants.
<https://support.apple.com/guide/shortcuts/intro-to-url-schemes-apd621a1ad7a/9.0/ios/26>
`shortcuts://x-callback-url/import-shortcut?url=…` does still work on iOS as undocumented
behaviour [COMMUNITY], and `import-workflow` is legacy with **zero hits** in the macOS 26.6
dyld shared cache [TESTED]. It does not matter either way: **the file the scheme points at must
still be Apple-signed**, so the scheme solves nothing this project needs.

**What the galleries actually do**, as a sanity check on the above: RoutineHub 302-redirects to
`www.icloud.com/shortcuts/<hex>` and hosts no files; ShareShortcuts redirects to the same;
the MacStories Shortcuts Archive is 434 entries, every one an iCloud URL, zero hosted files.
[COMMUNITY] **Nobody hosts `.shortcut` files as the primary path.** That is the strongest
available signal about what works, and it is precisely the path this project cannot take.

## 6. Blood pressure

**Can Shortcuts read it? Yes.** HealthKit exposes `HKQuantityTypeIdentifierBloodPressureSystolic`
and `HKQuantityTypeIdentifierBloodPressureDiastolic`, both quantity types in mmHg, and
`Find Health Samples` reads quantity types. [BINARY, HealthKit SDK headers, iPhoneOS 26.2]
`HKCorrelationTypeIdentifierBloodPressure` is the correlation that pairs them; correlations
are not readable through Shortcuts, but the two components are.

The exact picker labels are **derived, not observed**: `Systolic Blood Pressure` and
`Diastolic Blood Pressure` from the SDK symbols. Do not rely on those strings alone.

**What the app does about it.** GOAL.md §2 is absolute and the curator's interview sharpened
it: "I don't want a hide BP toggle sitting on top of a BP value that's actually in the
database." A UI filter is not a boundary.

So:

1. **The guide never asks for it.** The list of metrics the owner is told to add contains no
   blood pressure row. The guide says so explicitly, in one line, so the absence reads as a
   decision rather than an oversight.
2. **The endpoint rejects it by name.** A denylist matched case-insensitively against the
   `type` field, after trimming, covering at minimum: `systolic blood pressure`,
   `diastolic blood pressure`, `blood pressure`, `blood pressure systolic`,
   `blood pressure diastolic`, and any string containing `blood pressure`. Belt and braces:
   also reject the HealthKit symbols in case a future Shortcuts version emits them.
3. **Rejection is a 422 for the whole batch, not a silent drop.** Returned as
   `{"ok":false,"error":"forbidden_type","message":"Blood pressure is never accepted by this
   app. Remove that metric from the Shortcut."}` Silently dropping it would leave the owner
   believing it was stored. Persona finding: smoothing over a gap is the same bug as the gap.
4. **The schema has no column for it**, so even a bypassed check has nowhere to land.
5. **A test asserts all five of those**, and it is a rubric line, not a nice-to-have.

---

## 7. Proposed payload schema

Versioned, batched, columnar, with the canonical per-sample form defined and the compact form
being what the Shortcut actually sends.

### 7.1 The wire format the Shortcut sends

One POST, one window, N metric series. Every series carries six parallel arrays of equal
length. This is the form the columnar pattern in §2.3 produces naturally, and it is the form
that survives a real 48-hour window.

```json
{
  "schema": "health.ingest.v1",
  "source": "ios-shortcut",
  "key_id": "k1",
  "device": "iphone181",
  "window_start": "2026-08-19T00:00:00+0200",
  "window_end": "2026-08-21T18:00:00+0200",
  "generated_at": "2026-08-21T18:04:11+0200",
  "nonce": "2026-08-21T18:04:11+0200-482913756-119043882",
  "series": [
    {
      "metric": "steps",
      "grouping": "hour",
      "type":   ["Steps", "Steps"],
      "value":  ["412", "1180"],
      "unit":   ["count", "count"],
      "start":  ["2026-08-21T08:00:00+0200", "2026-08-21T09:00:00+0200"],
      "end":    ["2026-08-21T08:59:59+0200", "2026-08-21T09:59:59+0200"],
      "source": ["iPhone", "iPhone"]
    },
    {
      "metric": "sleep",
      "grouping": "none",
      "type":   ["Sleep", "Sleep"],
      "value":  ["Core", "REM"],
      "unit":   ["", ""],
      "start":  ["2026-08-20T23:41:00+0200", "2026-08-21T02:12:00+0200"],
      "end":    ["2026-08-21T02:12:00+0200", "2026-08-21T02:58:00+0200"],
      "source": ["Apple Watch", "Apple Watch"]
    }
  ]
}
```

Rules:

- `schema` is the version gate. Reject anything that is not `health.ingest.v1`.
- `metric` is the app's own stable slug, chosen by the owner in the guide from a fixed list.
  It is **not** the Shortcuts picker label, because that label is localised and can be renamed
  by Apple. `type` carries the picker label as it arrived, for provenance.
- All six arrays in a series **must be the same length**. Mismatch is a 422 naming the series.
  This is the schema's one real integrity check and it catches a mis-wired Shortcut instantly.
- Everything is a **string**. Shortcuts' JSON serialiser is not worth arguing with about
  numeric types, and the server parses with the unit in hand anyway. Reject non-strings.
- `unit` may be empty for category samples such as sleep. `source` may be empty on grouped
  series. Both are tolerated; neither is invented.
- All timestamps are ISO 8601 with a **numeric offset**. Reject a bare `Z` unless the offset
  is genuinely zero, and reject anything without an offset, because that is the silent
  two-hour bug from §2.4.
- Caps, enforced and returned as a clear error: 32 series, 5,000 rows per series, 20,000 rows
  per request, 8 MB body.

### 7.2 The canonical per-sample form the server stores

The endpoint expands each series into rows. This is the shape the spec asks for, one entry per
sample:

```json
{
  "metric": "steps",
  "type": "Steps",
  "value": 412,
  "value_raw": "412",
  "unit": "count",
  "start": "2026-08-21T06:00:00Z",
  "end": "2026-08-21T06:59:59Z",
  "source": "iPhone",
  "grouping": "hour",
  "origin": "apple_health",
  "dedup_key": "…64 hex…",
  "ingested_at": "2026-08-21T16:04:12Z",
  "batch_id": "…"
}
```

`value_raw` is kept alongside the parsed `value`. Persona table stakes #2: every value keeps
its origin **and its original**. A unit conversion later must be able to show what arrived.

The endpoint also accepts this expanded array directly, under `"samples": [...]`, for the test
`curl`, for fixtures, and for anything that is not a Shortcut. Same version, same validation,
same dedup. That keeps the E2E test honest without a Shortcut in the loop.

### 7.3 Dedup and idempotency

```
dedup_key = sha256(metric | type | start_utc | end_utc | value_raw | unit | source)
```

Unique index. `INSERT … ON CONFLICT DO NOTHING`. Response reports `accepted` and `duplicates`
separately so the owner can see that an overlapping window is working as designed rather than
failing.

### 7.4 The response, on every outcome

```json
{ "ok": true, "batch_id": "…", "accepted": 214, "duplicates": 96,
  "rejected": 0, "series": {"steps": {"accepted": 48, "duplicates": 24}},
  "message": "214 new samples stored." }
```

```json
{ "ok": false, "error": "stale_timestamp",
  "message": "That request was 41 minutes old. Check the iPhone clock and run it again." }
```

Always a body. Always a `message` in plain English. The Shortcut cannot read the status code,
so the message is the only thing the owner will ever see.

Error codes to define: `bad_schema`, `bad_token`, `bad_digest`, `stale_timestamp`,
`replayed_nonce`, `forbidden_type`, `length_mismatch`, `too_large`, `bad_timestamp_format`.

---

## 8. The exact Shortcuts steps the owner builds

One shortcut, named **Send Health to Dashboard**. Actions are listed in build order. Every
name below is verified in §1, §2 or §4.

### Part A: one block per metric, repeated

Build this block once, then duplicate it and change the type. Recommended metrics and
grouping:

| Metric slug | Picker label to search for | Group by |
|---|---|---|
| `steps` | Steps | Hour |
| `distance_walk_run` | Walking + Running Distance | Hour |
| `flights_climbed` | Flights Climbed | Hour |
| `active_calories` | Active Calories | Hour |
| `exercise_minutes` | Exercise Minutes | Hour |
| `heart_rate` | Heart Rate | Minute |
| `resting_heart_rate` | Resting Heart Rate | none |
| `hrv` | Heart Rate Variability | none |
| `vo2_max` | VO2 Max, or Cardio Fitness | none |
| `sleep` | Sleep | none |

Per metric:

1. **`Find Health Samples`**
   - Filter row 1: `Type` **is** `<picker label>`. Use the search field in the type picker.
   - Filter row 2: `Start Date` **is in the last** `2` `days`.
   - `Sort by` = `Start Date`, `Order` = `Oldest First`.
   - `Group by` = as in the table above. Leave the zero-fill toggle **off**.
   - `Limit` off, except `heart_rate`, where it is on with 2000.
   - Check the action reads "Find **All** Health Samples where". If it names a variable
     instead, clear it.
2. **`Get Details of Health Sample`** → Detail `Start Date`, input the `Health Samples`
   variable.
3. **`Format Date`** → `Date Format` = `Custom`, `Format String` = `yyyy-MM-dd'T'HH:mm:ssZ`.
4. **`Set Variable`** → name `startDates`.
5. **`Get Details of Health Sample`** → Detail `End Date`, input `Health Samples`.
6. **`Format Date`** → same custom format string.
7. **`Set Variable`** → name `endDates`.
8. **`Dictionary`** with six keys. For the four that read straight off the samples, insert the
   `Health Samples` variable into the value field, tap it, and pick the property:
   - `metric` → Text → the slug, typed literally, e.g. `steps`
   - `grouping` → Text → `hour` or `none`
   - `type` → Array → `Health Samples` ▸ **Type**
   - `value` → Array → `Health Samples` ▸ **Value**
   - `unit` → Array → `Health Samples` ▸ **Unit**
   - `source` → Array → `Health Samples` ▸ **Source**
   - `start` → Array → `startDates`
   - `end` → Array → `endDates`
9. **`Add to Variable`** → name `series`.

Repeat 1–9 per metric. Ten metrics is ninety actions. Tedious to build once, then it is done.
The guide should say that out loud so the owner does not think he has gone wrong.

### Part B: the envelope, once

10. **`Date`** → Current Date. **`Format Date`** → Custom → `yyyy-MM-dd'T'HH:mm:ssZ`.
    **`Set Variable`** → `now`.
11. **`Date`** → Current Date → **`Adjust Date`** → Subtract `2` `Days` → **`Format Date`**
    (same custom format) → **`Set Variable`** → `windowStart`.
12. **`Random Number`** min `100000000` max `999999999` → **`Set Variable`** → `r1`.
    Repeat for `r2`.
13. **`Text`** → `[now]-[r1]-[r2]` → **`Set Variable`** → `nonce`.

### Part C: the digest

14. **`Text`**, six lines, no trailing newline, variables inserted where shown:

    ```
    v1
    k1
    [now]
    [nonce]
    [windowStart]
    [now]
    ```

    **`Set Variable`** → `canonical`.
15. **`Text`** → `<secret>|[canonical]`. The secret is pasted from the app's setup screen.
16. **`Generate Hash`** → Type `SHA256`. **`Set Variable`** → `inner`.
17. **`Text`** → `<secret>|[inner]`.
18. **`Generate Hash`** → Type `SHA256`. **`Set Variable`** → `digest`.

### Part D: the request

19. **`Dictionary`**:
    - `schema` → Text → `health.ingest.v1`
    - `source` → Text → `ios-shortcut`
    - `key_id` → Text → `k1`
    - `device` → Text → `iphone181`
    - `window_start` → Text → `windowStart`
    - `window_end` → Text → `now`
    - `generated_at` → Text → `now`
    - `nonce` → Text → `nonce`
    - `series` → Array → leave empty here
20. **`Set Dictionary Value`** → Key `series`, Value the `series` variable, Dictionary the
    dictionary from step 19.
21. **`Get Contents of URL`**
    - URL: `https://lamberts-mac-mini.tailda76d6.ts.net/api/ingest/health`
    - Tap **Show More**. Method: **POST**.
    - **Headers**: `Authorization` = `Bearer <token>`, `Content-Type` = `application/json`,
      `X-Ingest-Key-Id` = `k1`, `X-Ingest-Timestamp` = `now`, `X-Ingest-Nonce` = `nonce`,
      `X-Ingest-Digest` = `digest`, `Idempotency-Key` = `nonce`.
    - **Request Body**: **File**, with the dictionary from step 20 in the File slot.
      (`JSON` also works if you re-enter every key by hand in JSON Values. File is fewer taps
      and the dictionary is already built. Verify on device which one your server sees as
      valid JSON, and record it in EVIDENCE.md.)
22. **`Get Dictionary Value`** → Key `message`, input `Contents of URL`.
23. **`Show Notification`** → the `Dictionary Value`. This is the whole feedback loop, and it
    is why the endpoint always returns a `message`.

### Part E: automation and settings

24. Settings → Shortcuts → Advanced → **Allow Sharing Large Amounts of Data** on.
25. Health app → Sources → Shortcuts → **Allow Shortcuts to read data** on for every metric in
    the table.
26. Run the shortcut once by hand. Grant Health access with **Always Allow**. Confirm the
    notification says samples were stored.
27. Shortcuts → **Automation** → **+** → **Create Personal Automation** → **Time of Day** →
    08:30, **Daily** → Next → **Run Shortcut**, pick this one → Next → Done.
    **The automation must contain exactly one action, `Run Shortcut`.** Do not paste the
    ninety actions into the automation itself. An automation running inline actions is capped
    at about four minutes; one that calls a saved shortcut is not. See §3.4.
28. Open the automation, turn **Ask Before Running** off, tap **Don't Ask**, Done.
29. Repeat 27 and 28 for 13:30 and 21:30.
30. Add the shortcut to the Home Screen so a manual run is always one tap away.
31. Do **not** add it to Siri. A Siri-invoked shortcut gets about fifteen seconds.

---

## 9. What the endpoint must implement

Checklist form, so it can become rubric lines.

- `POST /api/ingest/health`, HTTPS only, bound to 127.0.0.1 and exposed through Tailscale
  Serve.
- Bearer token compared in constant time. Token hashed at rest. Revocation is immediate.
- Ingest token grants ingest only. It never authenticates a web session, and a web session
  never authorises ingest. A test asserts both directions.
- Timestamp skew ±300 s. Nonce store with 24 h retention and a unique index.
- Two-pass digest recomputed server-side from parsed fields. Constant-time compare.
- Strict schema validation. Unknown top-level keys rejected, not ignored.
- Array-length equality per series, checked before any write.
- Blood-pressure denylist, 422, tested. See §6.
- Row-level dedup key with a unique index; `accepted` and `duplicates` counted separately.
- Request-level `Idempotency-Key` with a stored response.
- Every row stores `origin = apple_health`, `value_raw`, and `batch_id`. Append-only.
- Structured error log with a batch id, readable from the diagnostics screen. No token, no
  secret, no digest in any log line.
- A `last_successful_ingest` timestamp the dashboard reads, amber past 36 hours.
- A test-mode `curl` and a fixture batch shipped in the repo, so the whole path is testable
  with no iPhone.

---

## 10. Open items for the builder to close on device

None of these block the design. All should land in EVIDENCE.md with a screenshot or an observed
value.

**First, one item that needs the owner, not the builder.** While verifying signing behaviour,
`shortcuts sign --mode anyone` was run twice against a throwaway two-action test shortcut.
Because that mode *is* an iCloud publish (§5.2b), it created **two public `SharedShortcut`
records named "Test"** under the owner's Apple ID. They hold no personal data, but they are
live and publicly fetchable. **They can only be removed with Stop Sharing in the Shortcuts
app**, and Apple's Share shortcuts page describes that flow. Clear them before the greenlight.

1. The exact Find Health Samples picker labels for **Resting Heart Rate**, **Heart Rate
   Variability**, **VO2 Max / Cardio Fitness**, and **Cycling Distance**. Derived, not
   observed. Search the picker.
2. What `Source` and `Unit` contain on a **grouped** series. Expect empty `Source`.
3. Whether `Request Body: File` with a Dictionary variable sends `application/json` on the
   wire, or whether the explicit `Content-Type` header is doing the work. Read it off the
   server's access log. Related and unresolved: one community report says a **Dictionary-typed
   row inside `JSON Values` gets ignored**, a second reason to prefer the File body with a
   fully-built dictionary variable. Confirm on device.
4. Whether `Generate Hash` over a `Text` variable hashes exactly the UTF-8 bytes with no
   trailing newline. The diagnostics screen in §4.3 answers this in one comparison.
5. Observed row counts per metric for a 48-hour window, so the caps in §7.1 come from
   measurement rather than guesswork.
6. Whether **import questions** can carry the base URL and the ingest token cleanly (§5.4). If
   they can, no secret ever enters the shortcut file and the distribution problem softens a
   long way. Build it this way first and confirm the prompt appears on install.
7. Whether `shortcuts sign --mode people-who-know-me` output actually imports on `iphone181`
   with Private Sharing on. If it does not, cut the file and keep the guide.
8. Whether a non-2xx response aborts the shortcut or lets it continue to the
   `Get Dictionary Value` step. Only the invisibility of the status code is confirmed. If a
   non-2xx aborts, the notification never fires and the owner sees nothing, leaving the
   `last_successful_ingest` staleness badge as the only signal. Test with a deliberate 401.
9. The `Get Contents of URL` timeout value. Known only to be non-configurable. Measure it
   against a deliberately slow test endpoint and size the batch under it.
10. **Does `Get Contents of URL` complete from a locked-phone automation?** Genuinely
    contested: one forum anecdote says no, while the "headless actions run when locked" rule
    and the entire webhook ecosystem say yes. Ten minutes of on-device testing settles it, and
    the answer decides whether a locked run can at least POST an empty result to prove
    liveness.
11. Whether the version numbers behind the crash and loop benchmarks still hold. They are
    iOS 16 and 17 era, and nothing published benchmarks `Repeat with Each` on iOS 26. The
    columnar design sidesteps this, which is another reason to keep it.

---

## Sources

Apple, official:

- Shortcuts User Guide, iOS 26 (version 9.0): <https://support.apple.com/guide/shortcuts/welcome/9.0/ios>
  - Intro to Find and Filter actions: `intro-to-find-and-filter-actions-apd3c845e881`
  - Add filter parameters: `add-filter-parameters-apdbdab3433f`
  - Request your first API: `request-your-first-api-apd58d46713f`
  - API limitations: `api-limitations-apd891a6c84e`
  - Using Dictionaries: `dictionaries-apd43b69f337`
  - Handling lists: `handling-lists-apd9ba41d21b`
  - Handling timestamps using Format Date: `format-date-timestamps-apdfb33b0e17`
  - Technical standards: `technical-standards-apdfd459e13d`
  - Custom date formats: `custom-date-formats-apd8d9b19184`
  - Intro to personal automation: `intro-to-personal-automation-apd690170742`
  - Create a new personal automation: `create-a-new-personal-automation-apdfbdbd7123`
  - Enable or disable a personal automation: `enable-or-disable-a-personal-automation-apd602971e63`
  - Event triggers: `event-triggers-apd932ff833f`
  - Share shortcuts: `share-shortcuts-apdf01f8c054`
  - Adjust basic privacy settings: `adjust-privacy-settings-apd961a4fc65` (this is where
    "Allow Sharing Large Amounts of Data" is documented, not on the Advanced page)
  - Advanced Privacy and security settings: `advanced-shortcuts-settings-apdfeb05586f`
  - About actions in complicated shortcuts: `about-actions-in-complicated-shortcuts-apd081d9d61f`
  - Intro to the Run JavaScript on Webpage action: `intro-to-the-run-javascript-on-webpage-action-apd218e2187d`
  - Variable types: `variable-types-apdd2b316022`
  - Intro to URL schemes: `intro-to-url-schemes-apd621a1ad7a`
- Apple Developer Forums thread 655189, answered by an Apple Frameworks Engineer, on the 30 MB
  Intents extension memory limit: <https://developer.apple.com/forums/thread/655189>
- What's new in Shortcuts: <https://support.apple.com/en-us/101583> (published 2024-01-10;
  stale past iOS 16.5, but the Health and Get Contents of URL entries it does carry are
  official)
- HealthKit, Protecting user privacy: <https://developer.apple.com/documentation/healthkit/protecting-user-privacy>
- HKHealthStore: <https://developer.apple.com/documentation/healthkit/hkhealthstore>
- `man 1 shortcuts`, macOS 26.6, read on this machine

Apple's own shipped data, parsed:

- Shortcuts action-definition dump (`Name`, `Parameters`, `RequiredResources`,
  `WFContentItemClass`): <https://github.com/pfgithub/scpl>
- iOS 27 Shortcuts ToolKit action ID list, 1,206 entries, and a HealthKit reference generated
  from the iPhoneOS 26.2 SDK headers plus ActionKit's `WFHealthKitConstants.plist`:
  <https://github.com/viticci/shortcuts-playground-plugin>
- WorkflowKit and HealthKit localization tables from iOS 27 builds:
  <https://github.com/blacktop/ipsw-diffs>
- A real published `.shortcut`, fetched from `https://www.icloud.com/shortcuts/api/records/…`
  and parsed with `plistlib`

Community, named:

- Matthew Cassinelli, action reference: <https://matthewcassinelli.com/actions/find-health-samples/>,
  `/get-details-of-health-sample/`, `/log-health-sample/`, `/log-workout/`
- heartbridge, a Shortcut-to-HTTP health exporter: <https://github.com/mm/heartbridge>
- Maxime Heckel, "Using Shortcuts and serverless to build a personal Apple Health API":
  <https://blog.maximeheckel.com/posts/build-personal-health-api-shortcuts-serverless/>
- 1 Thing A Week, "Using Health shortcuts in the Shortcuts app":
  <https://www.1thingaweek.com/week/405/solved-using-health-shortcuts-shortcut-app>
- Jellycuts action reference, machine-readable, 288 standard actions:
  <https://docs.jellycuts.com/Documentation/Shortcuts/hash.html> and siblings
- Automators forum, the load-bearing threads:
  - Crash and timing benchmark, 44,000 rows, M2 iPad and M1 Mac:
    <https://talk.automators.fm/t/csv-to-markdown-table-shortcut/16372>
  - Memory and output ceilings, updated Oct 2025:
    <https://talk.automators.fm/t/tip-running-javascript-in-shortcuts-ios-macos/16575>
  - HMAC-SHA256 feature request, with the decoded `data:text/html` shortcut:
    <https://talk.automators.fm/t/feature-request-hmac256-and-other-crypto-functions/5182>
  - Large POST body dies silently:
    <https://talk.automators.fm/t/request-triggered-by-shortcuts-instant-error-but-runs-without-response/18420>
  - `Get Contents of URL` timeout is not extendable:
    <https://talk.automators.fm/t/get-contents-from-url/17822>
  - gluebyte's consolidated table of Shortcuts execution limits, Oct 2025, the source for the
    4-minute inline cap and the screen-off throttling: <https://talk.automators.fm/t/19013>
- The locked-device reports, which corroborate Apple's HealthKit encryption note on exactly
  this use case:
  - health-md issue 87, a nightly Time of Day Health export failing on iOS 27 with "Allow
    Running When Locked" enabled: <https://github.com/CodyBontecou/health-md/issues/87>
  - Actions issue 203, Sindre Sorhus on headless versus UI actions while locked:
    <https://github.com/sindresorhus/Actions/issues/203>
  - FitnessLoadTracker issue 35, a failed locked run silently advancing a sync checkpoint:
    <https://github.com/holmes1371/FitnessLoadTracker/issues/35>
  - Apple Discussions 254249430 ("took too long to run") and 255473986 ("Automations will run
    once your iPhone is unlocked")
- melon-lang, a language interpreter built on `data:text/html` plus `Get Contents of Webpage`,
  last push 2026-04: <https://github.com/melon-lang/melon-lang>
- Actions by Sindre Sorhus, the free third-party action pack:
  <https://sindresorhus.com/actions>
- Zachary7829, the reverse-engineered `.shortcut` file format:
  <https://zachary7829.github.io/blog/shortcuts/fileformat>
- libshortcutsign, contact-mode signing only:
  <https://github.com/0xilis/libshortcutsign>
- shortcut-signing-server, a Mac wrapper around Apple's notarization:
  <https://github.com/scaxyz/shortcut-signing-server>
- WWDC21 session 10232, Meet Shortcuts for macOS:
  <https://developer.apple.com/videos/play/wwdc2021/10232/>
- Apple guide, Add import questions to shared shortcuts:
  <https://support.apple.com/guide/shortcuts/add-import-questions-to-shared-shortcuts-apdf330fd3a0/9.0/ios>
- Apple guide, Run shortcuts from the command line (macOS):
  <https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac>
- Apple guide, Enable shared shortcuts, iOS 14 edition, kept live and showing the retired
  Allow Untrusted Shortcuts toggle:
  <https://support.apple.com/guide/shortcuts/enable-shared-shortcuts-apdfeb05586f/3.2/ios>
