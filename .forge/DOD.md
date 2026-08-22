# Definition of done

One hundred and sixty-six lines. PASS exists only at one hundred percent of them
with evidence in `.forge/EVIDENCE.md`. A line marked **[OPERATOR]** needs a
credential or a device consent the run does not hold; each one is listed at the
greenlight and each one has a sibling line, named in the text, that proves the
same path with no external credential.

Screens referenced by number are the thirteen exported PNGs in `.forge/screens/`.
Interaction detail is the matching HTML file in `.forge/wireframes/`. Three
viewports means 393x852, 768 and 1280 CSS pixels wide, captured.

## How evidence is read

Two rules govern every line below. Both were added on 2026-08-22 by the
architect, after slice 3's third verdict exposed the two ways a line can be
marked with evidence that proves less than the line says. Both raise the bar on
lines already approved. Neither moves a threshold, and the count stands at one
hundred and sixty-six. Amendment A4 records the reasoning.

**A zero is evidence only beside the population it covered.** A search returning
nothing, a count of zero errors, or a walk reporting no defect closes a line only
when the same run prints what it walked and that population is not empty. A clean
walk over an empty database, an empty screen or an empty file list does not close
anything. It is a run with nothing in it, and it reads identically to a run that
found nothing wrong, which is what makes it dangerous.

**Evidence takes the path the product offers.** A line describing what a person
can do is proven along the route a shipped screen actually takes. A result
reached by a request no screen issues proves the layer underneath and not the
line. Where both are worth recording, the product path is the evidence and the
direct path is the note.

---

## Function

- [x] **F1.** Both containers reach running from a cold start on this Apple
  Silicon host and report healthy within 120 seconds, and both images are
  `linux/arm64`. Evidence: `docker compose up -d --build`, then
  `docker compose ps` and `docker image inspect --format '{{.Os}}/{{.Architecture}}'`
  for each image.
- [x] **F2.** The liveness endpoint returns HTTP 200 to an unauthenticated
  caller and its body contains no integration name, no record count, no date and
  no third-party version string. Evidence: the full response body, plus a grep of
  it against the list of integration names.
- [x] **F3.** The host listener answers on 127.0.0.1 and on no other address: a
  request to this machine's LAN address on the same port fails to connect within
  3 seconds. Evidence: `lsof -nP -iTCP -sTCP:LISTEN` filtered to the port, plus
  the failed `curl --max-time 3` against the LAN address.
- [ ] **F4.** The app answers over HTTPS at
  `https://lamberts-mac-mini.tailda76d6.ts.net` from a second device on the
  tailnet, through exactly one HTTPS proxy to 127.0.0.1 and zero Funnel entries.
  Evidence: the serve configuration listing and the response from the second
  device.
- [x] **F5.** The start, stop and status scripts each exit 0 twice in a row
  against an already-running stack and leave the container ids unchanged.
  Evidence: two consecutive runs of each with `docker compose ps -q` before and
  after.
- [x] **F6.** Schema migrations apply automatically on first boot and apply zero
  migrations on the second boot, printing the count both times. Evidence: both
  boot logs.
- [x] **F7.** The application origin and the passkey relying-party identifier are
  read from configuration: changing both in the environment file and restarting
  changes the origin the sign-in page reports, with no source file modified.
  Evidence: `git status` clean, the two rendered pages, and the two configuration
  values.
- [x] **F8.** Owner creation succeeds exactly once. A second creation request
  returns 409 and the owner row count is 1 before and after. Evidence: both
  responses and both counts.
- [x] **F9.** A passkey registers and then authenticates against relying-party
  identifier `tailda76d6.ts.net` in a WebKit session, and the stored credential
  holds its identifier, public key, counter, transports, device type and backed-up
  flag. Evidence: the two round trips captured and the stored row.
- [x] **F10.** The backup password verifies through Argon2id at memory 19456 KiB
  or more, 2 passes or more, parallelism 1, with a 16-byte per-owner nonce, read
  from the stored parameter columns rather than from source. Evidence: the row,
  plus a successful and a failed verification.
- [x] **F11.** The session cookie carries HttpOnly, Secure and SameSite=Strict
  with a maximum age under 24 hours, and its value differs before and after
  sign-in. Evidence: two `Set-Cookie` captures.
- [x] **F12.** A state-changing request without the anti-forgery token returns
  403 and writes nothing; the same request with the token succeeds. Evidence: both
  responses and a row count before and after the rejected request.
- [x] **F13.** Six failed sign-in attempts within 60 seconds return 429, and a
  seventh attempt with correct credentials still returns 429 until the window
  passes. Each of the seven appends exactly one row to the local audit log.
  Evidence: the seven responses and the seven audit rows.
- [x] **F14.** Every route the app serves, other than the sign-in page, the
  liveness endpoint and the static shell, returns 401 or redirects to sign-in when
  called without a session. Evidence: a script that enumerates the route table and
  prints one line per route with its status.
- [x] **F15.** A third-party credential entered through settings is unreadable in
  the database: selecting the row directly returns ciphertext, and the settings
  screen renders only state, scope and last successful sync. Evidence: the raw row
  and the rendered screen at 393 px.
- [x] **F16.** No credential value is reachable from the browser, from any API
  response or from any log line. Searching the rendered HTML, every API response
  body recorded during a full test run, the container logs and the git working
  tree for the four seeded credential values, the master key and the ingest token
  returns zero hits. Evidence: the search command and its empty output.
- [x] **F17.** With the master key absent the app refuses to start with a named
  error and creates no owner; with a master key that does not match existing
  ciphertext, decryption fails with a named error rather than returning an empty
  value. Evidence: both startup logs and the failed decryption.
- [x] **F18.** The documented local recovery procedure restores access on a
  machine holding no passkey, using only host shell access, and it asks no secret
  question and sends no password by email. Evidence: the procedure run end to end
  with the resulting successful sign-in.
- [x] **F19.** Every stored measurement carries raw value, unit, timezone, source
  from the six permitted values, measurement time, import time, confidence, import
  version and a deduplication decision, all non-null. Evidence: the table
  definition and a rejected insert missing one field.
- [x] **F20.** Editing a stored value appends a correction and never overwrites:
  after three edits the original and all three corrections are readable, four rows
  in total. Evidence: the query result.
- [x] **F21.** Every value on screen carries a source chip, and one tap opens a
  sheet holding stored value and unit, measurement and import time in Europe/Paris,
  source, confidence, deduplication decision, and the correction history with the
  original struck through. Evidence: a capture of the sheet for a corrected value.
- [x] **F22.** A second tap from that sheet reaches the source for all six
  sources: the device sync batch, the phone payload, the lab page with the row
  highlighted, the photo and the model reply, the derivation, and the demonstration
  record. Evidence: six captures, one per source, all landing on the same screen
  shape.
- [x] **F23.** Waist, energy, fatigue, hunger, satiety and a free note each commit
  from Today in six taps or fewer. Evidence: a scripted interaction printing the
  tap count for each of the six.
- [ ] **F24.** With the origin unreachable, a quick-log write commits locally,
  shows a queued marker and the queue count, and replays exactly once when the
  origin returns: one row in the database and one idempotency key in the request
  log. Evidence: the capture, the row count and the request log.
- [x] **F25.** Demonstration data loads only when demonstration mode is on and
  stamps every row with source `demo`; with it off the seed refuses to run and the
  tables stay at zero rows. Evidence: both runs and both row counts.
- [x] **F26.** An import that disagrees with a stored correction raises a question
  holding both values and writes nothing until it is answered: the stored value is
  byte-identical before and after the import. Evidence: the question capture and
  the two row states.
- [ ] **F27.** At 393x852, Today shows the session row, the meals, what needs
  logging, the weight trend and adherence within the top 715 pixels with no
  scrolling. Evidence: a full-page capture with the fold marked.
- [x] **F28.** The weight chart draws daily readings as 2.1 px unconnected dots, a
  7-day average as a 2.6 px round-capped path, and the goal trajectory as a 1.5 px
  path dashed 5 5 with a corridor of plus or minus 0.5 kg. Evidence: the stroke
  widths and dash array read off the rendered markup.
- [x] **F29.** The 89.0 kg to 76.0 kg over nine months goal is visible on Today
  and editable from Health, and changing either the target weight or the target
  date redraws the trajectory within one page load. Evidence: before and after
  captures with the two goal values.
- [x] **F30.** Absence is drawn, never smoothed. A gap of three days or more
  breaks the line, hatches the missing range at 45 degrees and labels the dates; a
  rolling average whose window holds 5 or 6 of 7 days is dashed and states its
  count, and below 5 days it is not drawn. No interpolated, carried-forward or
  zero-filled point appears in the rendered path. Evidence: a capture over a seeded
  gap plus the path data showing the break.
- [x] **F31.** Weight and waist share one axis on Health, and a point on either
  reaches its source in two taps. Evidence: the capture and the two-tap walk.
- [x] **F32.** Activity, sleep, heart rate, recovery and VO2 max each render their
  value when present and render an empty state naming what is absent and what to do
  when not. Neither ever renders 0 for a missing value. Evidence: captures of both
  states for all five.
- [x] **F33.** Adherence renders as a count over its denominator for 7 and 28
  days, and both match a hand computation over the demonstration seed. Evidence:
  the capture and the hand computation.
- [x] **F34.** A source whose last successful sync is older than 36 hours shows a
  warn chip naming the age and the cause and hatches the affected range; the chip
  clears when a fresher sample lands. Evidence: captures at 35 and 37 hours and
  after a fresh sample.
- [x] **F35.** No daily body-composition reading is the headline number on any
  screen, and one sentence on Health states that hydration moves scale estimates.
  Evidence: the capture and the sentence.
- [ ] **F36.** In demonstration mode the whole Withings pipeline runs with no
  client identifier and no network: connect, historical import, incremental sync
  and status all complete and every imported row carries source `demo`. Evidence:
  the four steps captured with the network disabled, and the row source counts.
- [ ] **F37.** The authorization request carries response type, client
  identifier, state, scope `user.metrics` and redirect URI and carries no code
  challenge; a callback whose state does not match is refused; the token exchange
  and refresh post the request-token action form-encoded, and the rotated refresh
  token replaces the stored one inside the same transaction. Evidence: contract
  tests against recorded responses, one per clause.
- [ ] **F38.** The measure request sends the eight-code type allowlist and
  category 1 explicitly, loops on the continuation flag and offset to exhaustion
  under a bounded page cap, decodes each value as value times ten to the unit, and
  advances the cursor to the maximum modification time only after the write
  commits. Evidence: the recorded requests across a three-page fixture and the
  cursor value after a deliberate crash between fetch and commit.
- [ ] **F39.** A measure group containing a blood-pressure type is dropped whole,
  so its heart-rate measure is not harvested, and the storage layer rejects any
  insert whose type is outside the allowlist even when the fetch layer is bypassed.
  Evidence: two tests, one per layer, over a fixture group.
- [ ] **F40.** Running the same import twice produces the same row count, and a
  corrected group arriving with a newer modification time updates in place and
  appends a provenance entry rather than inserting a second row. Evidence: row
  counts across three runs and the provenance history for the corrected group.
- [ ] **F41.** The response envelope is read before the HTTP status on every call.
  Statuses 401, 100, 101, 102, 200, 342 and 343 trigger exactly one refresh and one
  retry then surface a reconnect prompt; 601 backs off with jitter; 522 retries;
  status 100 with a present but empty measure list is treated as no data rather
  than as a failure. Evidence: one test per branch.
- [ ] **F42.** The integration status screen shows connected, expiring, revoked or
  demonstration, the last successful sync time and a test button, and shows no
  token, no client secret and no account identifier. Evidence: the capture and a
  search of the rendered markup for the seeded credential values.
- [ ] **F43.** With the Withings adapter unreachable, Today and Health still
  render every other source, name the stale Withings data by cause, and show no
  loading state for longer than 3 seconds. Evidence: a capture with the adapter
  blocked and a timing trace.
- [ ] **F44.** **[OPERATOR]** A real Withings authorization round trip completes,
  an initial historical import lands, and the status screen shows a real last-sync
  time. Evidence: three captures. Sibling: F36, which proves the same pipeline with
  no client identifier.
- [ ] **F45.** A well-formed batch with a matching digest, a timestamp inside 300
  seconds and an unseen nonce is accepted, and the response counts accepted and
  duplicate rows separately. Evidence: the request and the response.
- [ ] **F46.** The same batch sent again returns the stored response and writes no
  new row; a batch failing on digest, on timestamp age or on a reused nonce returns
  a distinct named error for each of the three. Evidence: four requests, four
  responses, and the row count unchanged across all four.
- [ ] **F47.** Rows deduplicate on a synthesised key behind a unique index: an
  overlapping 48-hour window sent three times leaves the row count unchanged after
  the first. Evidence: three row counts.
- [ ] **F48.** A batch containing any metric type matching "blood pressure"
  case-insensitively, or either HealthKit blood-pressure symbol, is rejected 422
  with a named forbidden-type error for the whole batch, and no row is written.
  Five string variants are asserted. Evidence: five responses and five row counts.
- [ ] **F49.** A series whose parallel arrays differ in length is rejected with a
  named length error identifying the series, before any write. Evidence: the
  response and the row count.
- [ ] **F50.** A timestamp with no numeric offset is rejected with a named format
  error, and a trailing `Z` is accepted only when the offset is genuinely zero.
  Evidence: three requests covering offset present, offset absent, and zero offset.
- [ ] **F51.** The ingest credential authorises ingest and nothing else, in both
  directions: presenting it where a session is expected reaches no authenticated
  route, and a valid session without it is refused at the ingest endpoint.
  Evidence: two responses.
- [ ] **F52.** The ingest credential is displayed exactly once at creation, stored
  as a hash, and revocable; a revoked credential is refused on the next request.
  Evidence: the creation capture, the stored row, and the request before and after
  revocation.
- [ ] **F53.** Every ingest response, success or failure, carries a plain-English
  message field, and a fixture batch plus a recorded command in the repository
  exercises the whole path with no iPhone present. Evidence: the fixture run and
  five error-path messages.
- [ ] **F54.** The ingest diagnostics screen prints a fixed canonical string, the
  digest the server computes for it with the live credential, and the command to
  reproduce it, so a mismatch is visible rather than silent. Evidence: the capture
  and a deliberately mismatched comparison.
- [ ] **F55.** Today shows the last successful ingest time and turns warn past 36
  hours, and the Shortcut guide lists every action by its verified name with no
  blood-pressure row and one sentence saying the absence is deliberate. Evidence:
  two captures and the guide.
- [ ] **F56.** **[OPERATOR]** A Shortcut running on `iphone181` posts a live
  48-hour batch and its notification reports the stored count. Evidence: a capture
  of the notification and the matching server row counts. Sibling: F53, which
  proves the same path from a fixture with no iPhone.
- [ ] **F57.** The manual lab form stores a panel covering at least fasting
  glucose, HbA1c, total cholesterol, HDL, LDL, non-HDL, triglycerides, ALT, AST,
  GGT, creatinine or eGFR, CRP and ferritin, each with result, unit, reference
  interval, date and confidence, all with source `manual`. Evidence: the stored
  panel.
- [ ] **F58.** Uploading a lab document extracts analyte, result, unit, reference
  interval, date and confidence per row and stores nothing until a row is
  explicitly accepted: abandoning the review leaves zero rows. Evidence: the
  extraction capture and the row count before and after abandonment.
- [ ] **F59.** Rows are accepted, edited or rejected one at a time behind an
  explicit save. Nothing saves on change and no control commits all rows at once:
  accepting row 3 of a twenty-two row panel stores row 3 and leaves the other
  twenty-one absent. Evidence: the row counts and a capture of the screen.
- [ ] **F60.** A lab document containing blood pressure produces a named refusal
  on the review screen that does not print the refused value, and no
  blood-pressure row exists anywhere afterwards. Evidence: the capture and a query
  across every table.
- [ ] **F61.** A converted value renders the printed original, the conversion
  factor and the stored value on one line, and the stored row keeps all three.
  Evidence: the capture and the row.
- [ ] **F62.** A row whose extraction confidence is below the stated threshold, or
  whose value is ambiguous, is flagged and cannot be saved without an explicit
  decision. Evidence: a fixture with a deliberately garbled digit, the flag, and
  the blocked save.
- [ ] **F63.** At the moment of validation the owner is asked whether to keep or
  delete the source document, and choosing delete removes the file from the volume.
  Evidence: the prompt capture and a directory listing before and after.
- [ ] **F64.** Trends render for all thirteen named analytes, and a fourteenth
  analyte is added through the interface with no source file modified. Evidence:
  the thirteen charts, the added analyte, and `git status` clean.
- [ ] **F65.** A document whose pages carry fewer than 100 non-whitespace
  characters is detected as image-only, routed to optical recognition, and every
  recognised row arrives flagged for confirmation. Evidence: the detection count
  per page, the routing log and the flags.
- [ ] **F66.** The movement catalogue holds at least 30 movements, each with cue
  text and a bundled still or animation that renders with the network disabled.
  Evidence: the count, and a capture of five movement cards offline.
- [ ] **F67.** Every media record carries source URL, author or source name,
  verification date, licence or embedding mode, and its movement; a record with a
  null author is rejected at write. Evidence: the table definition, the full
  record listing, and the rejected insert.
- [ ] **F68.** Embedding is restricted to an allowlist held as data, not code: a
  URL outside it is refused in the editorial screen with a named reason, the
  embedded player is a privacy-enhanced iframe fetched by the browser, no element
  is drawn over it, and no downloaded video file exists in the repository.
  Evidence: the refusal capture, the player markup, and a repository scan for
  media file extensions.
- [ ] **F69.** The readiness gate asks the three screening inputs and the
  published symptom list, and neither PAR-Q+ text nor a derivative of it appears
  anywhere in the repository. Evidence: the gate capture and a repository search
  for the PAR-Q+ question strings.
- [ ] **F70.** Heart-rate guidance renders as ranges, never point targets, derived
  from Tanaka with a maximum of 181 at age 38, using percent heart-rate reserve
  when a resting heart rate is stored and percent maximum when it is not, and never
  both on one screen. The only in-session intensity control is the talk-test
  ceiling. No live heart-rate tracking, no five-zone dial, no readiness score and
  no injury-risk number exists anywhere in the app. Evidence: two captures, one per
  anchoring method, plus a repository search for the excluded terms.
- [ ] **F71.** A proposed session longer than 110 percent of the longest session in
  the past 30 days is flagged as a plain fact naming the percentage, with no risk
  number attached, and no acute-chronic workload ratio is computed or stored.
  Evidence: the flag capture and a repository search plus a schema search for the
  ratio.
- [ ] **F72.** A week of 3 to 5 sessions is proposed, 2 to 3 of them full body
  with at least 48 hours between sessions loading the same muscle, each row
  carrying the cause it was placed on in plain words naming the input it acted on.
  Sessions are accepted, edited or rejected one at a time and no control commits
  the whole week: rejecting one leaves the others untouched. Evidence: the capture,
  the spacing check over the generated week, and the row states after one
  rejection.
- [ ] **F73.** Progression advances a movement only when the owner exceeded the
  rep target by 2 or more on the last set in two consecutive sessions, is proposed
  and confirmed rather than applied, and the interface states that the size of the
  increment is convention rather than measured. Evidence: two proposals over seeded
  histories that do and do not meet the trigger, plus the stated sentence.
- [ ] **F74.** The session player runs with the network disabled, derives elapsed
  and remaining time from wall-clock timestamps, and after 60 seconds backgrounded
  shows the correct remaining time. Nothing interrupts an open session: no rating
  prompt, no permission prompt, no upsell, no in-app banner. Evidence: the offline
  run, the backgrounding capture, and a driven full session recording every dialog
  raised.
- [ ] **F75.** Last week's working load or duration for the open movement renders
  inside the set without navigation, and an easier variant, a harder variant and a
  movement substitution are each one tap away without ending the session.
  Evidence: four captures.
- [ ] **F76.** Voice cues are primed inside the session-start tap, every spoken
  cue has a visible equivalent on screen, and the mute control silences speech
  while leaving the visual cue. Evidence: the primed utterance in the tap handler,
  and captures with sound on and muted.
- [ ] **F77.** Resistance effort is captured as reps in reserve on the 1-to-10
  question and cardio effort on the public-domain 0-to-10 intensity scale; pain is
  captured against the rule of at most 5 of 10 during, subsided by the next
  morning, and no week-to-week increase; pain at the same site in two consecutive
  sessions reduces volume and never advances the movement. No licensed effort-scale
  anchor wording appears in the repository. Evidence: the capture, the two seeded
  histories with and without repeated pain, and the repository search.
- [ ] **F78.** The food table holds at least 2,298 rows carrying energy, protein,
  carbohydrate, fat and fibre, names its publisher and its table version on the
  data-sources screen, and stores a missing nutrient as null which renders as
  "unknown" and never as 0. Evidence: the row count, the screen, and a capture of a
  food with a null fibre value.
- [ ] **F79.** Energy computed from macronutrients where the published value is
  absent is stored with a computed marker, and the marker is visible one tap from
  the number. Evidence: the row and the capture.
- [ ] **F80.** Daily targets compute from the Mifflin-St Jeor equation with an
  activity level from the published 1.40 to 1.90 bands: for 38 years, male, 183 cm,
  89.0 kg the resting figure is 1849 kcal and the total at level 1.55 is 2866 kcal,
  both within 1 kcal. Evidence: the computed values and the capture.
- [ ] **F81.** A target below the estimated resting figure raises a caution
  naming it; a target below 1500 kcal is blocked until explicitly confirmed on a
  screen that recommends a professional; a planned loss above 0.89 kg per week is
  refused and the nearest compliant rate is offered. Evidence: three captures.
- [ ] **F82.** Every meal and recipe shows energy, protein, carbohydrate, fat and
  fibre with no decimal place on any macronutrient, energy rounded to the nearest
  10 when computed from ingredients and to the nearest 25 when estimated. Evidence:
  captures of one computed and one estimated meal.
- [ ] **F83.** Allergy, intolerance, exclusion and preference are four distinct
  stored rules: adding nuts as a preference and shellfish as an exclusion produces
  two different behaviours, and no query path resolves one as the other. Evidence:
  the schema, and a test asserting the two rules never share a code path.
- [ ] **F84.** No generated menu contains molluscs, crustaceans or other
  shellfish. Evidence: a generated four-week menu checked against the ingredient
  denylist, with the check output and zero matches.
- [ ] **F85.** Every dairy item in a generated menu offers a lactose-free
  alternative, and choosing it recomputes the meal's macronutrients. Evidence: the
  capture before and after a swap with both macro sets.
- [ ] **F86.** A week of breakfasts, weekday lunches and at-home dinners
  generates, each meal is accepted, edited or rejected one at a time, and the
  generator honours the configured maximum cooking time: two generations at 20 and
  60 minutes produce different menus and neither exceeds its limit. Evidence: both
  generated weeks with their per-recipe times.
- [ ] **F87.** Recipe nutrition computes from ingredient rows and stores a
  versioned per-serving snapshot carrying its provenance, its mass coverage and a
  separate fibre coverage; below 85 percent coverage the number renders as a range
  and states the shortfall; a changed ingredient-source hash raises a question
  rather than replacing the stored snapshot. Evidence: the snapshot row, the
  low-coverage capture, and the question raised after a seeded source change.
- [ ] **F88.** The shopping list consolidates the week into one list grouped by
  aisle, with adjustable quantities and check boxes that survive a page reload.
  Evidence: the capture, an adjusted quantity, and the state after reload.
- [ ] **F89.** Items supplied by the recipe box and items marked in stock render
  as visibly deducted, showing the original quantity struck through, rather than
  disappearing from the list. Evidence: the capture with both cases present.
- [ ] **F90.** Two recipe-box recipes of two portions each default into the week
  as four consumed meals, and each recipe asks separately whether the second
  portion is eaten the next day, moved to another meal, or frozen, with the answer
  stored per recipe. Evidence: the capture and the two stored answers.
- [ ] **F91.** A recipe imports from a pasted link, an uploaded document, a photo
  or manual entry, parsed locally from that single artifact, and the repository
  contains no stored recipe-box credential, no crawler and no scheduled fetch
  against that provider. Evidence: four successful imports and a repository search
  for the provider hostname across scheduled jobs and credential storage.
- [ ] **F92.** Two takeaway meals a week are proposed as dish types compatible
  with the stored targets and exclusions; the link opens a search page, no
  item-level link is constructed, no menu item or price is stored, and any
  nutrition figure is badged as an estimate or rendered "unknown". Evidence: the
  capture, the generated URL, and a query showing zero stored menu rows.
- [ ] **F93.** A meal photo is reduced to about 1092 pixels on its long edge and
  re-encoded on the device before upload, and the stored file carries no camera
  metadata and no location. Evidence: the uploaded dimensions and a metadata dump
  of the stored file showing zero tags.
- [ ] **F94.** The consent screen names the exact data categories sent for each
  kind of analysis before the first send, and photo analysis, menu generation,
  health explanations and calendar event titles each toggle independently; with a
  toggle off no outbound request is made for that category. Evidence: the capture
  and a request log recorded with each toggle off in turn.
- [ ] **F95.** In demonstration mode the whole photo flow runs with no API key and
  returns an estimate badged as demonstration. Evidence: the flow captured with the
  key absent.
- [ ] **F96.** An estimate renders as a range on a coarse grid, never a bare point,
  and nothing is stored until the owner confirms or corrects it: abandoning the
  screen leaves zero rows. Evidence: the capture and the row count.
- [ ] **F97.** After confirmation and after three subsequent edits the entry still
  carries its estimate origin and still reaches the photo and the model reply in
  two taps. Evidence: the stored row after each edit and the two-tap walk.
- [ ] **F98.** A monthly cost ceiling refuses the call when month-to-date plus the
  pre-flight token count would cross it; usage rows are written in the same
  transaction as the result; and the model identifier is read from configuration
  and validated once at boot so an unknown identifier fails at startup with a named
  error. Evidence: the refused call, the usage rows, and the failed boot.
- [ ] **F99.** With the model provider unreachable the Eat tab still renders the
  week, the meals and the shopping list, and the estimate control names the cause
  rather than hanging. Evidence: a capture with the provider blocked.
- [ ] **F100.** **[OPERATOR]** A real vision call returns an estimate for a real
  meal photo and the usage ledger records its input and output token counts.
  Evidence: the capture and the ledger row. Sibling: F95, which proves the same
  flow with no API key.
- [ ] **F101.** In demonstration mode the whole calendar flow runs with no client
  identifier: calendar picker, busy periods, dedicated calendar, diff and write all
  complete against a seeded calendar and every event is marked demonstration.
  Evidence: the five steps captured.
- [ ] **F102.** The authorization request carries exactly three scopes, the
  calendar-list read scope, the free-busy scope and the app-created-calendar scope,
  and neither the full calendar scope nor the all-events scope. The scope list in
  the request matches the list recorded in the integration document character for
  character. Evidence: the request URL and a test comparing both lists.
- [ ] **F103.** Authorization carries offline access and a forced consent prompt on
  every run, validates the returned state before touching the code, persists the
  refresh token before the handler returns, and redirects to a URL containing no
  authorization code. Evidence: the request, a rejected mismatched state, the
  stored token, and the final URL.
- [ ] **F104.** Availability is read only through the free-busy query: no event
  listing is issued against any calendar other than the app-created one, and a
  per-calendar error in the response is surfaced on screen rather than treated as
  free time. Evidence: a repository search over the request builders, and a capture
  of the surfaced error from a seeded unshared calendar.
- [ ] **F105.** Every write targets the stored app-created calendar identifier: no
  request path contains the primary keyword or any other calendar identifier, and a
  missing stored identifier alongside a live grant surfaces as an error rather than
  creating a second calendar. Evidence: the recorded request paths and the error
  capture.
- [ ] **F106.** Event identifiers are derived deterministically from the app's own
  record, so re-applying the same confirmed plan produces no duplicate: the event
  count is identical before and after the second apply. Evidence: both counts.
- [ ] **F107.** Nothing writes before the diff is confirmed. The diff shows counts
  first in the order added, moved, removed; the dedicated calendar before and after
  as two columns; rows grouped by verb each naming the cause in plain words;
  per-row confirmation with additions and moves selected by default and removals
  unselected by default; and a footer stating the number of changes that will
  apply. Evidence: the capture and an event count taken while the diff is open.
- [ ] **F108.** Undo on the diff screen restores exactly the before column, and
  the permanent write log keeps undo available for every past write: a write from
  two sessions earlier undoes successfully. Evidence: three event listings, before,
  after and after undo, plus the older undo.
- [ ] **F109.** An invalid-grant response deletes the stored refresh token, sets
  the integration to disconnected with a timestamp and the raw error body, stops
  background synchronisation, and shows one reconnect action. It is never retried.
  Evidence: the stored state, the capture, and a request log showing exactly one
  attempt.
- [ ] **F110.** No outbound write reaches a third party outside a confirmed diff.
  Every outbound write call site is enumerated, each is reachable only from a
  confirmation handler, and driving each one with the confirmation step skipped
  writes nothing. Evidence: the enumerated call-site list and one skipped-confirm
  test per call site with its zero-write assertion.
- [ ] **F111.** With the calendar provider unreachable the training week still
  proposes from the last stored availability and names the stale calendar by cause.
  Evidence: a capture with the provider blocked.
- [ ] **F112.** **[OPERATOR]** A real authorization round trip completes, the
  dedicated calendar is created, one confirmed diff writes one event to it, and undo
  removes it. Evidence: four captures from the live calendar. Sibling: F101, which
  proves the same flow with no client identifier.
- [ ] **F113.** A script generates the push key pair into the environment file,
  the app refuses to send push when it is absent, and only the public half is ever
  present in anything the browser receives. Evidence: the script run, the refused
  send, and a search of the served markup and bundles for the private half.
- [ ] **F114.** Subscription runs inside the tap handler with no awaited call
  before the permission request, and the diagnostics screen reports secure context,
  installed state, notification availability, platform version, permission,
  worker state, local subscription, key match, server-side knowledge of this
  endpoint, and the last delivery status code, each as its own row with its own
  remedy, stopping at the first failure. Evidence: the handler source and captures
  of the screen in a passing and a failing state.
- [ ] **F115.** The worker shows a notification on every push it receives, a send
  that would show none is refused at the source, and the payload also carries the
  declarative shape with a non-empty title. Evidence: the refused send, and a
  payload capture showing both shapes.
- [ ] **F116.** A 404 or 410 from the push service deletes the stored subscription;
  400, 403, 413 and 429 do not. The app re-reads its subscription on every launch
  and re-posts it when the endpoint differs from the last one sent. Evidence: six
  status responses with the row state after each, plus the rotated-endpoint test.
- [ ] **F117.** Reminders for session, measurements, menu confirmation and missing
  data are enabled per category, group into one notification per window, are
  suppressed during the configured quiet hours, and each carries an action that
  closes the item. Evidence: the settings capture, a grouped notification, a
  suppressed one, and the item state after the action.
- [ ] **F118.** The weekly review renders in a local preview with no mail transport
  configured, holding weight and waist, adherence, activity, sleep, training,
  nutrition, what went well, what was hard, and the proposal for next week.
  Evidence: the rendered preview with all nine sections.
- [ ] **F119.** The Sunday 20:00 Europe/Paris run claims its period in the run
  ledger before doing any work, with the period computed in Paris local time: five
  ticks inside one period, and a tick on each side of the October clock change,
  produce exactly one ledger row and one plan per period. Evidence: the ledger rows
  and the plan counts.
- [ ] **F120.** A container down across the scheduled window fires the run exactly
  once on next boot and no more, and a run still marked running past its timeout is
  marked failed at startup rather than blocking its period. Evidence: the ledger
  after a simulated outage and after a simulated crash mid-run.
- [ ] **F121.** The weekly review reads the week back and proposes the next one as
  a confirmable diff, carries no score, applies no colour to a missed session, and
  contains no guilt wording. Evidence: the capture and a copy check against the
  denylist with zero matches.
- [ ] **F122.** **[OPERATOR]** A real push arrives on `iphone181` from the Home
  Screen app and opens the route named in its payload. Evidence: two captures.
  Sibling: F115, which proves the send path and payload shape with no device.
- [ ] **F123.** **[OPERATOR]** A real weekly review sends through the configured
  mail adapter and arrives. Evidence: the sent record and the received message.
  Sibling: F118, which proves the same render with no mail transport.
- [ ] **F124.** The daily archive is authenticated and self-describing: it holds a
  database dump, the media and document volume, and a version manifest, encrypted
  with a chunk-framed authenticated cipher, produced using only software already
  present on this Mac. Evidence: the archive listing after decryption, and a
  process trace showing no external encryption binary invoked.
- [ ] **F125.** Integrity fails loudly on corruption: a truncated archive, an
  archive with two chunks swapped, and an archive with one byte flipped each exit
  non-zero with a named error. Evidence: three runs with their exit codes and
  messages.
- [ ] **F126.** Restore rebuilds the database into a scratch instance with row
  counts identical to the source, and the round trip runs inside the automated
  suite on temporary data. Evidence: both row-count sets and the passing test.
- [ ] **F127.** Archives land in the configured cloud-synced destination; with that
  path unavailable they land in the local fallback and the machine status screen
  raises an alert naming both the path and the cause. Evidence: a listing in each
  destination and the alert capture.
- [ ] **F128.** Retention is configurable and enforced: with retention set to 3, a
  fourth run leaves exactly three archives. Evidence: the directory listing after
  each of the four runs.
- [ ] **F129.** Database, media and document storage each live on a declared
  volume, no product data is written inside an image, and no script or document in
  the repository contains a command that removes volumes. Evidence: the volume
  declarations, a listing of the image's writable paths, and a repository search.
- [ ] **F130.** A full structured export and a full tabular export download from
  the interface and re-import into a scratch instance with identical row counts,
  and a readable report exports as a document. Evidence: both files, both row-count
  sets, and the report.
- [ ] **F131.** Permanent deletion removes every row for the chosen category behind
  a typed confirmation phrase, and a query afterwards returns zero. The retention
  period stated per data category in the privacy document matches the value the
  code enforces. Evidence: the capture, the zero-row query, and the two matching
  values per category.
- [ ] **F132.** The machine status screen shows container state, disk headroom,
  time of the last archive, time of the last restore check, and last successful sync
  per integration, turns warn at its stated thresholds, and reveals no credential.
  Evidence: the capture in a healthy and a degraded state, plus a search of the
  rendered markup for the seeded credential values.
- [ ] **F133.** A failure in any scheduled job, any archive run or any integration
  raises one notification and one persistent in-app banner naming the surface, the
  cause and one action, without the operator opening anything first. Evidence:
  three seeded failures, one per class, each with its notification and its banner.

---

## Craft

Every line here is measured against the approved screens in `.forge/screens/`,
their interaction detail in `.forge/wireframes/`, and the standards skill.

- [x] **C1.** The web app manifest is served with the manifest content type and a
  standalone display mode, and a 180x180 opaque touch icon is linked in the
  document head. Neither icon is a framework default. Evidence: the manifest
  response headers and body, the icon at its byte size, and its pixel dimensions.
- [ ] **C2.** **[OPERATOR]** The app opens from the iPhone Home Screen icon at the
  application origin with no browser chrome, and standalone display mode reports
  true in that session. Evidence: a device screenshot and the reported value.
  Sibling: C3, which proves the shell and worker with no device.
- [x] **C3.** A worker is active at the root scope, its script is served with a
  no-cache directive, and with the network disabled the shell renders an offline
  screen naming the cause and offering one action, not a browser error page.
  Evidence: the registration state, the response headers, and the offline capture.
- [x] **C4.** Sign-in matches screen 01 at three viewports: passkey first,
  password second, the one-time owner creation, and the host-unreachable state.
  Every interactive element shows a 2 px focus outline at 2 px offset. Evidence:
  three captures plus a keyboard-traversal capture.
- [ ] **C5.** Quick log matches screen 03 at three viewports, presented as a sheet
  with 44 px minimum targets, and the loading, empty, error, offline and stale
  states render with the geometry defined once on screen 00. Evidence: three
  captures plus five state captures overlaid on the screen-00 geometry.
- [x] **C6.** Dates render as "21 Aug" or "Friday 21 August" and times as 24-hour
  Europe/Paris on every surface; units are kg, cm, km, kcal, g and the printed
  laboratory unit, and any other suffix is a catalogued count noun for a
  dimensionless metric, never a second unit for a metric named here. No string the
  product authored reaches a person without a catalogue key, wherever in the
  shipped tree it was written and however few words it is, including one
  hyphenated word: a component, a route handler, middleware, a database helper, a
  spoken attribute, an svg title, an svg description, an svg text node. Text the
  product did not author is outside the line, and the check that excuses it
  establishes that by provenance and fails every fragment whose provenance it
  cannot establish. Two catalogued strings placed adjacent are read by the screen
  line that owns that screen, not here. Evidence: a string inventory listing every
  string the product authored with its key, produced by a walk that prints the
  surfaces it covered and covers at least one stored value per source, and a
  timezone-shifted run across six zones producing identical rendered dates.
- [x] **C7.** Today matches screen 02 and Health matches screen 04 at three
  viewports, with exactly one accented action per screen and origin badges rendered
  as neutral chrome rather than a semantic colour. Evidence: six captures plus a
  count of accented elements per screen.
- [x] **C8.** Every chart carries a visually hidden table of its date and value
  rows, a title and a description, and a screen reader reads the data rows rather
  than a single summary string. Evidence: the markup and a VoiceOver capture.
- [ ] **C9.** Zero console errors and zero failed network requests across Today,
  Health, the quick-log flow and the session player at three viewports. Evidence:
  the console and network logs from each run.
- [ ] **C10.** Labs review matches screen 05 at three viewports: per-row controls,
  the printed original beside every conversion, confidence per row, and the five
  states from screen 00. Evidence: three captures plus five state captures.
- [ ] **C11.** Training week matches screen 06 and the session player matches
  screen 07 at three viewports, with an 88 px set-done control, 56 px transport
  controls and a 64 px timer. The completion ring closes over 900 ms and is the
  only motion beyond the 120 to 200 ms fades and translates. Evidence: six
  captures, three measured control sizes, and a recording of the completion
  transition with its duration.
- [ ] **C12.** Nutrition week matches screen 08 and the shopping list matches
  screen 10 at three viewports, with energy and all four macronutrients including
  fibre on every meal row. Evidence: six captures.
- [ ] **C13.** Meal estimate matches screen 09 at three viewports: consent, then
  portions as ranges, then the saved entry with its estimate badge. Evidence: nine
  captures, three states at three viewports.
- [ ] **C14.** The training week and the calendar write render the same confirm
  component with different rows, matching the definition on screen 00 at three
  viewports. Evidence: six captures plus the shared component reference.
- [ ] **C15.** Weekly review matches screen 11 at three viewports, and the calendar
  diff on it is readable end to end in four seconds. Evidence: three captures plus
  a timed read.
- [ ] **C16.** Settings and integrations matches screen 12 at three viewports,
  carrying integration status with last successful sync and a test control, the AI
  consent switches, export, permanent delete, archive status and machine state.
  Evidence: three captures.
- [ ] **C17.** Contrast measured against each token's own ground clears AA on both
  themes: primary text at or above 18.5:1, secondary text at or above 7.4:1,
  tertiary text at or above 4.8:1, accent at or above 4.7:1, accent ink on accent at
  or above 5.2:1, every semantic colour at or above 4.6:1, and the daily chart
  reading at or above 3:1. Evidence: the measured table, both themes.
- [ ] **C18.** With a pseudo-locale expanding text by 40 percent, all thirteen
  screens render at 393 px with no clipped, truncated or overflowing string.
  Evidence: thirteen captures.

---

## Release

Done level: deployed and reachable, from this machine, over Tailscale Serve HTTPS.

- [ ] **R1.** The product is reachable at
  `https://lamberts-mac-mini.tailda76d6.ts.net` from a second device on the tailnet
  with a publicly trusted certificate and no manual trust step, the host listener
  answers only on 127.0.0.1, and no public exposure entry exists. The URL is
  recorded in `.forge/EVIDENCE.md`. Evidence: the second-device response, the
  certificate chain, the listener listing, and the serve configuration.
- [ ] **R2.** The intended-purpose statement in `docs/product.md` is written
  against MDCG 2025-4 and the June 2025 revision of MDCG 2019-11 Rule 11: it states
  what the product is for, states that it is not a medical device and performs no
  diagnosis, and every laboratory explanation template gives general reference-range
  context, cites a public source and invites a professional. Evidence: the
  statement, and a check over every explanation template against the banned-phrase
  list returning zero matches.
- [ ] **R3.** `docs/product.md` records the third-party terms position for the
  recipe-box and takeaway providers: neither has a public consumer interface, the
  only import is one artifact the owner already holds parsed locally, the takeaway
  link resolves to a search page, and no menu, price or credential is stored. Each
  claim names the terms page consulted and its verification date. Evidence: the
  section, plus the repository search results it cites.
- [ ] **R4.** Personal health data processed under the household exemption is
  covered by artifacts, not claims: a privacy notice written for a human naming a
  lawful basis per purpose, a stated retention period per data category, every
  processor that receives data named with what it receives, and a captured export
  and a captured permanent deletion completed in a real session. Evidence:
  `docs/privacy.md` plus both captures.
- [ ] **R5.** The stack returns to serving after a reboot of this Mac with no
  manual step, and the liveness endpoint answers 200 within 5 minutes of the
  desktop appearing. Evidence: the reboot, the timestamped first successful
  response, and the shell history showing no intervening command.
- [ ] **R6.** Static analysis, type checking, dependency audit and credential
  scanning each report zero unresolved findings against the shipped tree and the
  full history, or every exception is listed in `docs/security.md` with its reason
  and its date. Evidence: the four command outputs and the exception list.
- [ ] **R7.** The unit, integration and end-to-end suites pass, the end-to-end run
  includes a WebKit project at 393x852, and the run prints its counts. Evidence:
  the three outputs with pass counts and zero failures.
- [ ] **R8.** README plus the twelve documents the specification names all exist
  and are non-empty, each carrying the official URLs consulted and the date each was
  verified, and none carries a real credential value or a real health value.
  Evidence: the file listing with byte sizes, and a search across all of them for
  the seeded credential values and for the owner's real measurements.
- [ ] **R9.** `docs/progress.md` holds a matrix with one row per acceptance
  criterion in section 20 of the specification, each row naming the rubric line and
  the evidence that closes it, and every row marked met. Evidence: the matrix.
- [ ] **R10.** `docs/screenshots/` holds the final manual mobile review: one
  capture per approved screen at 393x852 taken against the live URL, plus the
  reviewer's written note per screen. Evidence: the directory listing and the
  notes.

### Disqualifiers

Any one of these failing is a FAIL for the whole run, regardless of the lines
above.

- [ ] **D1.** No placeholder copy ships. Searching the rendered output of all
  thirteen screens for lorem text, "TBD", "Coming soon", "Lorem", "example.com" and
  duplicated boilerplate returns zero matches. Evidence: the search output.
- [x] **D2.** The favicon and touch icon are the product's own artwork, not a
  framework default. Evidence: the icon bytes and their checksums against the
  framework defaults, which differ.
- [ ] **D3.** Every empty state and every error state on all thirteen screens is
  styled to the definitions on screen 00 and names what to do next in one sentence.
  Evidence: one capture per state per screen.
- [x] **D4.** Zero `TODO`, `FIXME`, `XXX` or `HACK` markers exist in shipped
  source. Evidence: the repository search output.
- [ ] **D5.** Every screen is verified at 393, 768 and 1280 CSS pixels wide with no
  horizontal scroll and no overlapping element. Evidence: thirty-nine captures.
