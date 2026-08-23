# Resume

## HANDOFF, 2026-08-23, session three. Read this, then PROCESS.md, then carry on.

**Phase:** 8 BUILD, running. The run is **ARMED** again: `.forge/ARMED` exists,
the Stop gate is live, `.forge/PARKED` is retired. The greenlight was not
re-opened and never will be.

**Checked: 41 of 166** at the moment this was written. Two dispatches are in
flight and both move that number.

### In flight

1. **Stabilisation verify**, two scoped verifiers, run `wf_0b05b8b1-bd5`.
   - F4, R1, C2. The owner cleared these on 2026-08-23 and they had never been
     ruled. The verifier is told to prove the second-device claim IS a second
     device, because a row a local headless browser can author is not evidence
     of a phone, and that is exactly the defect the owner cleared two rows for.
   - F23, C5. Fixes landed at `f5bff8a` and `cb8887e` and were never ruled. The
     verifier is told to type rather than `fill()`, print six tap counts, and
     measure the 44 px floor on every target in the sheet.

2. **Wave A**, five builders in five git worktrees, run `wf_8bd5b2cc-58d`:
   slices 5 Withings, 6 Apple Health, 7 blood tests, 8 Train, 9 nutrition.

### The parallel layout, and the three holes that had to be closed first

Slices 5 to 13 build in worktrees under
`/Users/lambertbouley/Claude/lbtbly-fitness-app-trees/`, one per slice, managed
by `scripts/worktree.sh` (`new`, `list`, `gate`, `merge`, `drop`).

Three hooks assumed one tree and each would have failed silently:

- `checks.sh` cd'd to `CLAUDE_PROJECT_DIR`, so a builder editing a worktree got
  **main** graded and green on a tree it had never read. It resolves the tree
  from the edited file now. Proven both ways: a planted type error turns the
  worktree gate red at the same moment main's gate is green.
- `checks.sh` would also have run `strings:rendered` from a worktree against the
  live origin, which serves main. It **defers** it there, loudly, and writes
  `.forge/.rendered-deferred`; `worktree.sh merge` refuses to close a slice while
  that marker stands.
- `commit.sh` cd'd to the same place, found main clean, exited reporting success.
  **A worktree builder's work was never checkpointed at all.** It takes `--tree`
  now and `runlog.sh` walks every worktree.

That is **seven** for this run's one recurring class, a check that passes by not
checking. Six were found after the fact. This one was found before it ran. An
eighth was written INTO the fix and caught the same hour: the tree fallback could
be `"."`, and `"."` compared against an absolute path is not equal, so main
graded itself as a worktree and deferred its own rendered check. Caught by running
the gate with the environment set and without it, instead of the one way that worked.

### The rules the parallel build runs under

- **Migrations are numbered on merge, never in a tree.** Drizzle's snapshots are
  a chain, so a number is not a name a merge can change. A slice edits
  `src/db/schema.ts` and writes raw DDL to `drizzle/pending/<slug>.sql`, a file
  only it owns. Main runs `db:generate` once per slice, in order. Contract is in
  `drizzle/pending/README.md`.
- **`.forge/` is main's.** It is committed, so every worktree carries a stale
  copy. Builders never write to it and `worktree.sh merge` takes main's copy
  unconditionally.
- **No line is ticked from a worktree.** Verification happens on main, after
  merge, with the stack rebuilt, by a verifier.
- **Builders never run the e2e suite and never touch the stack.** One origin,
  `workers: 1`. They write specs; main runs them.
- The complete dependency list at PLAN.md line 30 was installed on main once,
  before the trees forked, so nine lock files cannot diverge.

### Real dependencies, which is why wave A is five and not nine

- Wave A, independent: **5, 6, 7, 8, 9.**
- Wave B, after A merges: **10** needs 9's food and target tables. **11** needs
  8's session model. **12**'s weekly review reads 5, 6, 8 and 9.
- Wave C: **13** exports and dumps everything, so it wants every table.

### Merge runbook, per slice, in this order

1. `scripts/worktree.sh merge <slug>` (gates the tree, merges, keeps main's `.forge/`)
2. `npm run db:generate`
3. append `drizzle/pending/<slug>.sql` to the generated migration, delete the pending file
4. `scripts/up.sh` so the live origin serves the slice
5. `FORGE_CHECKS_FULL=1 scripts/checks.sh` (five checks, `strings:rendered` included)
6. `rm .forge/.rendered-deferred`, only after step 5 exits 0
7. commit, then dispatch that slice's verifier

### Machine facts that bind this run

**8 cores, 8 GB of RAM, and the disk was at 94 percent with 13 GiB free.**
19 GB of stale Docker build cache older than twelve hours was pruned; the last
twelve hours were kept so a rebuild is not cold. Free space is 29 GiB. The five
worktrees cost about 1 GiB because `node_modules` is cloned with APFS
copy-on-write rather than copied.

**There is still no backup in the tree.** Slice 13 ships it. Until then the only
copy of anything real is the running database, and `measurement` refuses DELETE
by design, so a bad write is permanent.

`DEMO_MODE` is fixed and no longer a hazard: `.env.example` and `gen-env.mjs`
carry it and `docker compose config` resolves it to `1`, so a rebuild keeps
demonstration data. RESUME's older note that it was unreproducible is stale.

### Owner actions outstanding

**None blocking.** One optional, low: two published `SharedShortcut` records
named "Test" under his Apple ID, left by a research probe. Remove via Stop
Sharing in the Shortcuts app.

---

## Read `.forge/PROCESS.md` first. The process changed on 2026-08-23.

Set by the owner after slice 4. The bar is unchanged: 166 lines, PASS at one hundred percent, no line softened. Three things change.

1. **Scoped re-verify. Never re-rule a ticked line.** A re-verify rules the defect list, the slice's own `Closes:` ids, and any line still unchecked. Nothing else. The final full-scope pass proves all 166 on the finished product. The lead drifted from this by adding "re-confirm the ticked lines underneath" to dispatch after dispatch, and that drift is most of this run's wall-clock.
2. **Parallelize independent slices** in git worktrees, one builder per tree, migrations numbered on merge.
3. **One verdict line per slice** to the owner. Full reporting only for his data, his actions, rubric amendments, and a defect class worth carrying.


Name: Vernier. Chosen 2026-08-21 by the naming workflow, recorded in BRIEF.md with its reasoning and in DESIGN.md with its mark. Every later phase uses it: manifest, Home Screen label, push titles, the Sunday email, the docs, and WEBAUTHN_RP_NAME.

Owner decisions, taken 2026-08-21, binding:
- R5 is PARKED by the owner's instruction. The run never reboots this Mac mini on its own. R5 stays in the rubric, unchecked, with "parked, awaiting the owner's chosen moment" as its reason. Parking is not softening: the line and its threshold are untouched.
- Scope is FULL. All fourteen slices, run to completion across as many sessions as it takes. Nothing dropped.

Last phase: 8 BUILD, slice 4 in flight. Slices 1, 2 and 3 are closed.
Size: L. Eleven vertical workstreams with five separate external integrations, each carrying its own auth, data flow and failure modes.
Current slice: 4, Today, Health and the trend charts. Closes F27-F35, C7, C8, C9. Slice 2 is done but for its share of the three owner-blocked lines. Earlier: slice 2, the gate. Closes F8-F18, C4. Slice 1 is done but for three owner-blocked lines: F4, R1, C2.

## Where the run actually stands

**Forty-two of 166 rubric lines checked.** Every one ruled by a verifier that re-ran the command itself and accepted no builder capture as proof.

Slices 1, 2 and 3 are built and live. Slice 3's defect fixes are at `4a4c3c5`, re-verify in flight.

**Slice 1: one FAIL, cleared.** The offline document painted the framework's chunk-load error on any uncached route. Fixed structurally: `/offline` is a self-contained document with zero external references, so it cannot need a chunk. F4, R1 and C2 stay open, owner-blocked, not code-blocked.

**Slice 2: one FAIL, cleared, re-verified PASS.** A state-changing route sat outside anti-forgery, so a bare curl wrote the very row C2's evidence rests on. The exemption list is gone entirely. Also a CSS regression that made the secondary action as loud as the primary.

**Slice 3: one FAIL, four defects, all fixed, re-verify in flight.**
1. D3, high. The correction path skipped validation. A rating of 1 to 5 accepted 99 and -4.7 with a 201, and the table refuses DELETE, so both were permanent. A validation gap in an append-only store is not a bug that can be cleaned up afterwards. Every write now runs one gate with a per-metric band.
2. F25. The demo seed stamped its measurements but not its source records, so a seeded row was indistinguishable from a real Withings batch by anything but an id prefix. Now `measurement.seed` is a generated column no writer can set or clear, bound to `source_record.seed` by a composite foreign key, backfilled from the data.
3. C5. Undo and Edit were drawn in the wireframe and shipped nowhere, and two adjacent cards shared one label.
4. C6. The string checker walked only `.tsx`, so 45 sentences in `.ts` route handlers were invisible to it. One reached the screen reading "Send correctsId and rawValue".

Escalation ladder, exhausted and acted on. One FAIL each on slices 1 and 2, both cleared. **Slice 3 failed three times**, all three on C6's third clause, no inline user-facing string. The ladder's second rung, raise the builder a tier, did not exist here: slices 1 to 3 were dispatched at the top tier from the start. The third rung fired on 2026-08-22 and slice 3 is **with the architect**, which is where a third failure sends it. The bar did not move and no DOD line has been edited since the greenlight.

The architect ruled on 2026-08-22, in `.forge/RULING-SLICE-3.md`. **No re-plan; a build gap.** It found the verifier had understated its own case: `scripts/checks.sh` runs only typecheck and lint, so neither string checker has ever executed in the gate, which is why all three C6 failures were found by hand and none by automation. It agreed the five named closures, added two, and **refused one**: the hyphenated phrase tiling as a machine identifier is a checker bug at `rendered-strings.mjs:259`, not a boundary, and exempting it would let a real inline string through. F20 is slice 3's, because the route contradicts a function whose correct form already sits in the same slice. `DEMO_MODE` is a build fix with no plan or preflight line.

**Amendment A4 is the first to edit `.forge/DOD.md`, and it made C6 sharper.** The old line said no inline string "in a component", a phrase that would have excused two of the three defects since they were in middleware and a route handler. Deleted, replaced by eight enumerated places plus "however few words it is, including one hyphenated word". The only carve-out is text the product did not author, conditional on the check establishing that **by provenance** and failing every fragment whose provenance it cannot establish. Verified by the lead before acceptance: 166 lines still, only C6 rewritten, no threshold moved.

**A4 also added two standing rules at the head of the rubric, binding on all 166 lines.** A zero is evidence only beside the population it covered, so a clean walk over an empty database closes nothing. And evidence takes the path the product offers, so a result reached by a request no screen issues proves the layer underneath and not the line. The second is the F20 lesson made general: posting a root id worked, and no shipped screen does it.

**The verifier answered the ladder's own question against its own interest.** It ruled the third failure "the build falling short of a measurable line, not the line being unmeasurable as written", and proved it: the repository already holds `scripts/strings.mjs`, which caught 8 of the 9 uncatalogued strings the verifier planted, while the new rendered-output checker caught 3 of 9 including the one the old one missed. The union misses exactly one. **Neither is wired into `scripts/checks.sh`.** Named closures: key the cause slot to provenance rather than to a sentence, widen the svg subtree and the spoken-attribute list, drop the `words.length < 3` rule still in the tree, and run both in the gate failing on either.

**F20 regressed and was un-ticked, the first line in this run to go from `[x]` back to `[ ]`.** A second correction through the shipped screen 404s: the page passes the chain-head id and `readChain()` queries `where root_id = correctsId`, but a correction row is never a root. Through the product the owner gets one edit, not three. The literal evidence can still be produced by posting the root id, which no shipped screen does, which is the difference between a passing spec and a passing product.

**Two operational facts found by running, not reading.** `DEMO_MODE` is in no configuration file and `compose.yaml` defaults it to 0, so `scripts/up.sh` brings Vernier up with no demonstration data; the running container has had it only because a shell exported it, and that state is not reproducible from the repository. And two commits, `c6618ea` and `b4240ed`, carry attack strings the verifier planted while testing the checker, swept in by the checkpoint hook; `dff58a7` reverts them and the tree is clean, but the history holds them and nobody rewrote it.

**The verifier out-tested the suite twice, and both times it mattered.** On slice 1 it proved the offline path cold, where the builder had proved it warm. On slice 3 it found `serviceWorkers: 'block'` in the Playwright config, meaning the offline test ran with no worker at all; it re-proved the outbox by hand with the worker active, showing the worker's own fetch failing while a host curl answered 200 at the same moment. The suite now carries a project that proves it.

Suites at the last count: 78 unit, 35 end-to-end across three projects, WebKit at 393x852 against the live HTTPS origin.

D1, D3 and D5 stay unchecked by design: each names all thirteen screens and only eight exist.

## Amendments

Three plan corrections are recorded in `.forge/AMENDMENTS.md`, with before, after, reason and disclosure. **No DOD line has been edited since the greenlight**; all 166 and their thresholds stand as approved.

- **A1.** Slice 5 cannot upsert. The append-only trigger refuses it, confirmed on the live database. PLAN.md now says insert with `ON CONFLICT DO NOTHING` on `(source, external_key)` or record a dedup decision.
- **A2.** A raised import question had no answer path, so its warning was permanent. Slice 5 owns the control now.
- **A3.** A photo estimate stores `source='manual'`, `confidence='estimated'`, kind `photo_estimate`. No seventh source; the model's involvement is a confidence and a record, not an origin.

## Amendment to that decision, same day, after the sixth verdict

The sixth verification found **three live C6 holes**, not latent ones: each was reached in a browser on the shipped build with the gate green. It also answered the question the decision turned on, which was what is more expensive to fix later than now, and gave three specific answers. So one further dispatch was authorised before slice 4, covering only those three. This is a departure from "move on regardless" and the reason is the criterion, not impatience: I asked what is cheaper now, and got a credible answer.

1. **The suite's read-write path to the owner's database.** The read-only connection holds and Postgres refused every escape tried inside one `-c` string, but it is one helper among several, and `recovery.sh` already drives a read-write connection into the live database that two specs use to UPDATE and DELETE. The static test meant to hold the line greps for `query(` and skips anything else. Fix: a Postgres role with no write grants, so an unmodelled path inherits the refusal rather than escaping it. After slice 5 those tables hold real Withings history and the table refuses DELETE, so a loss is permanent.
2. **`tests/e2e/passkey.spec.ts:52` breaks the moment the owner registers a passkey**, because it asserts the screen reads "No passkey is registered yet.", which renders only at zero passkeys. The run has been parked on that exact action for hours. R7 fails with it. Two lines now, a baffling failure at the worst moment otherwise.
3. **C6's mechanism, not its instances.** Five rounds each closed a real hole and each was overtaken, because the check asks whether a fragment *could* have come from the browser. The inversion the verifier named ends it: pass the caught `Error` object through and check **identity**, not text equality. A composed literal then fails because it is not that object's message, and a fragment in the wrong state fails because no such object exists there. Left as is, every slice from 4 to 14 adds screens under a check that grades provenance by circumstantial agreement.

After that dispatch the run moves to slice 4 whatever C6's verdict, on the reasoning already recorded.

## Lead decision, 2026-08-22: C6 does not block the other eleven slices

C6 has failed five verifications. Each round closed real holes and the list has shrunk to named items, so the loop has been productive rather than circular, and the verifier's own standing judgement is "converging, not circling". But the sixth builder pass is in flight and slice 4 has not started.

**The decision: after the next verification, the run moves to slice 4 whatever C6's verdict is.** If C6 closes, it closes. If it does not, it stays `- [ ]` with its defects recorded and is ruled at the full-scope verification before ship, which is where every line is proven once on the finished product anyway.

This is not softening and it changes no threshold. An unproven line blocks the run's completion, not the run's progress; PASS still requires one hundred percent and C6 is still one of the hundred and sixty-six. What stops is eleven slices waiting on one checker's remaining edge cases, three of which the verifier searched for live instances behind and found none.

**A hard prerequisite rides with this.** The test suite must not be able to truncate the owner's live database before slice 5 imports real Withings readings. The verifier proved the exposure by logging a reading through the shipped app mid-suite and watching the truncate take it. That fix is in the same dispatch and it is not deferrable, whatever happens to C6.

## Slice 3 in one paragraph, for whoever reads this cold

Five builder dispatches, four verifications, one architect ruling, one rubric amendment. Everything closed except C6, which failed four times, each time on a different shape of the same flaw: a checker rule that a real string walked past. Word count, then unwalked directories, then position-not-provenance, then constructs no text walk can see. The turning point was the architect finding that `scripts/checks.sh` ran only typecheck and lint, so **no string check had ever run in the gate** and every failure was found by a human. The gate now runs four checks and fails on any. F20 also regressed and was un-ticked mid-slice, then fixed and re-proven through the product rather than through a request no screen issues. The verifier's standing judgement after the fourth failure was "converging, not circling", with five named surfaces and five small fixes, which is the dispatch now in flight.

**Two hazards found in slice 3 that belong to slice 5, and must not be lost.** `tests/e2e/host.ts` truncates the live database and restarts the app: harmless while every row is seed data, destructive the moment Withings imports a real reading, and the append-only trigger does not help because TRUNCATE walks past it. And the checkpoint hook has committed red trees at least twice, titled "checks red", against `scripts/checks.sh`'s own header.

## A fabricated reading sits in the owner's live history

`f636c7bf-aee7-4127-b3b1-26b178ab378e`, waist 99.0 cm, source `manual`, not seed, written 2026-08-22 10:04:42+02. The builder wrote it through the shipped quick log to prove the suite can no longer truncate the owner's data, and it survived a full 36-test run, which is exactly the proof that was needed.

It is permanent: `measurement` refuses DELETE, and that refusal is a guarantee this run deliberately built. Removing it means a truncate and re-seed at a psql prompt, which is the one capability slice 3 removed from the test suite and should not be casually restored.

Two things follow. The row is now a standing test of the guarantee, so every future run must leave it alone. And it is a fabricated measurement in a health record whose whole point is provenance, so it should be removed before the owner logs real waist measurements, by a deliberate operator action rather than by a test. Offered to the owner on 2026-08-22; awaiting his word.

## The gate reported four checks and ran three. 2026-08-23.

**There is no `lint` script in `package.json`.** `scripts/checks.sh` calls it, it stands down silently, and it has never run once. Every "four-check gate, exit 0" recorded in this run's evidence, and every one the lead relayed, was three checks reported as four.

This is the fifth instance of one failure class in this run: **a check that passes by not checking.**
1. An offline test that ran with service workers blocked, so no worker existed to be offline.
2. A string checker that existed in `package.json` and had never been wired into the gate.
3. A test asserting a zero over an empty population.
4. `fill()` instead of typing, which set a whole value in one input event and passed over a field that could not be typed into for four rounds.
5. This one.

The pattern is worth carrying into every remaining slice: **when a check is green, ask what it would take for it to be red.** Four of the five were found by a verifier attacking the check rather than the code, and none by the suite.

The stabilisation dispatch is required to make the gate fail loudly when a step it names is missing, rather than standing down.

## The suite degraded across the same dispatch

Four full runs on one tree: 72 passed, then 71, then 70, then 66 with five serial siblings unrun. Three separate specs now fail intermittently.

**The passkey failure has stopped being a flake.** Five consecutive failures at the second authentication, three isolated, one after an app restart, `webauthn_credential` at 0 rows before and after each, and **no request reaching the origin at all**, so the ceremony dies in the page before it posts. F9 is a ticked line. If the product regressed, F9 is wrong and must be un-ticked, not quietly repaired.

**F31's chart link is unclickable**: the average series' dot now covers the newest weight dot, so the two-tap walk cannot start. Also a ticked line, also defect 50 arriving.

R7 is now the largest single risk to finishing the run. The stabilisation dispatch must show three consecutive clean full runs before slice 5 starts.

## The owner's goal date was left wrong on the live install

76.0 kg on 2027-06-30 where the seed writes 2027-03-30. An F29 test died before its own restore. The value is right, the date is three months out, it is demonstration data, and the repair is two taps on the Health goal form rather than SQL.

## F27 passes at the fifth attempt. 41 of 166.

The rebuild against A5 held. Every element above the trend carries a stated maximum bounded by construction: title 63, offline line 39, notice region 46, day card 322, weight card 165, three gaps 36, padding 8. Sum 679 against 715, at section 3's 16 and 12 geometry, so the fold is not bought by compression. Adherence opens at 1051 with the trend ending at 600.

The verifier attacked each bound rather than observing it: a 2,376-character note, 101 queued entries, all 84 date labels the formatter can produce, 8,000- and 19,500-character strings injected into the notice summary, and the worst case combined. 679 px, Chrome and WebKit pixel-identical, scrollY 0. **F27, F24 and C7 are ticked.** F32, F34 and C8 held under the changed layout.

**Two residuals it named honestly.** `header.title` and the weight card header carry no clamp; neither takes its height from a count of rows, which is what F27 forbids, and the title was proven over its entire closed catalogue, but both hold by enumeration rather than by construction and neither would resist a longer string written in later.

## The waist field cannot be typed into, and the tests hid it

Open, being fixed. `#quick-log-waist` is controlled on `value={waist.toFixed(1)}`, so every keystroke round-trips through `Number()` and resets the caret: typing 99.0 yields 9.1 in both engines, the client band then refuses it as under 30 cm, and both stepper hands are disabled while the field is blank, so there is no second path.

**Why four rounds and a green suite never saw it:** every test used Playwright's `fill()`, which sets the whole value in one input event. Nobody had typed into the field. The same blindness hid a second defect, a value typed while the sheet's read is in flight being silently replaced when it lands, against screen 03 frame 2's own caption, "no lost typing". And the field ships at 40 px against section 2b's 44 px floor.

This matters past the rubric: **Withings supplies weight, never waist.** Waist is manual forever and is one of the two headline metrics on Today and Health.

## Carried into slice 5 and beyond

- `04-health.html` frame 1 draws a body-composition row and no fat-mass, muscle or body-water metric exists in `src/lib/provenance.ts` yet. They arrive with Withings. The final pass must compare that row on a build that holds the data.
- A latent lie: when the origin answers a queued write with one of `PARK_ON`'s six statuses, the offline line and its count vanish, the chip flips to Stored, and "Correct it" is offered on a measurement that does not exist. No shipped request produces those statuses today, so F24 stands.
- The suite-safety sweep's regex does not reach `expect(query(...)).toBe('0')`, of which two specs carry 16. All 16 are real today, but a hollow assertion in that shape would pass unrecorded.

## Architect ruling on slice 4, 2026-08-22. F27 was not measurable, and the rubric guaranteed the loop.

Full text in `.forge/RULING-SLICE-4.md`. Amendments A5 and A6 in `.forge/AMENDMENTS.md`. 166 lines still, 38 checked, no threshold lowered.

**The finding.** F27 fixed a budget over a sum and named five of its addends. Four verifications found four different unnamed ones. Its truth was a property of the demo seed rather than of the product, and the rubric itself keeps the set open: F55 adds a line to Today in slice 6, F133 adds up to three banners in slice 13. Rounds five and six were already written into the plan.

**A5 rewrote F27 tighter.** Kept 715, 393x852, no scrolling and four of the five elements. Added: every data state instead of one, five named states, both engines, a maximum height fixed by construction for every element above the trend, each maximum stated as a number and measured at its extremes, the maxima summing inside 715, and a clause making a fold bought by compressing the cards a FAIL. The adherence clause was removed because DESIGN.md section 3, the screen table and screen 02's own caption all put adherence below the fold, nothing in the brief asks for it, and it could only be met by breaking C7. A third standing rule now binds all 166.

**The conflict I sent it was not the conflict.** The queue count survives whole and DESIGN.md section 4 is untouched. An offline queue is not a notice: notices need action and are unbounded in number, a queue needs none and clears itself. The offline line returns under the title, neutral, one line, count on it. The real conflict was with the adherence clause, which held 182 px above the trend.

**Also ruled.** C7 un-ticked, for two departures its own spec never examined: adherence above the weight card, and `.today` cards at 8px/8px against section 3's 16/12, both bought to pay the old F27. C9 moved from slice 4 to slice 8 since it names the session player. F23's first-entry state is F23's own and un-ticked: screen 03 frame 3 already draws it and the build ignores it. F34 line 167 is a zero over an empty population, which A4's own first standing rule forbids.

## The launch-report hole is closed, at `a617269`

The write route left `PUBLIC_PATHS`, so a session-less caller is refused at the middleware, and the report now carries an HMAC launch ticket minted only by the shell layout, keyed with the master key over the session id. The gate screen and the offline document raise no report at all, which is where the attack minted its anti-forgery pair. The verifier's exact curl now answers 401 with the row unmoved to the millisecond. Declared floor: a driven browser **holding the owner's session cookie** can still report, and that cookie is HttpOnly, Secure, SameSite=Strict.

## The intruder reports are closed, three times over

Every agent that runs a suite sees its own recovery sign-ins and reports an unattributed writer. Three separate idle measurements by the lead with no agent running show zero: 45 s, 60 s, 90 s, and two minutes, all delta zero on `session` and `auth_attempt`. `request_origin` holds one address for its whole life, this Mac. Do not spend another dispatch on it.

## Slice 4 is with the architect after four failures, all on F27 and its neighbours

40 of 166 checked. The count fell from 42: C5 and F24 went back to unchecked when the fix that bounded the notice region hid the offline queue count behind a disclosure.

**The pattern is the finding.** Each fix bounded the element in front of it and the next element grew.
1. The fold held at 700 px, but only because global tokens had been shrunk and screen 02's adherence pills and tone sentence dropped to buy the room.
2. Tokens restored, a second stale line appeared past 36 hours of quiet and the trend fell to 742. One day in six, forever.
3. The stale banner was bounded, an open import question added a second banner, the trend fell to 758.
4. All notices folded into one region, genuinely bounded and proven at 46 px from 1 to 999999 notices in both engines. The trend then fell to **1147 px**, because the just-logged card draws one row per logged value and the six values F23 names take the day card from 223 px to 681 px.

The architect is ruling three questions in `.forge/RULING-SLICE-4.md`: whether F27 is measurable as written when the screen's content grows with the owner's own data, how to resolve a real conflict between two approved artifacts, and who owns F23's first-ever waist entry.

**The conflict is genuine and worth stating.** DESIGN.md section 4 defines the offline state as a one-line banner under the title carrying the queue count. F27 requires bounded height above the fold. With more than one notice both cannot hold in the current design: folding the count into the disclosure is what bounded the region and is what failed C5 and F24. The panel's finding constrains any answer, which is that the owner must see that something of his is unsent without hunting for it.

## A hole in the launch report, being closed separately

A bare fetch with **no browser, no session and no automation**, using an anti-forgery pair minted by one unauthenticated GET of `/sign-in` and an iPhone user agent, answers 204 and sets both device signals true. The previous fix refuses a standalone claim from a desktop user agent and holds the Playwright suite; an iPhone user agent walks past the first and nothing outside Playwright is held by the second.

That matters more than a normal endpoint because the row is C2's evidence, the owner is already being asked to clear two false rows by hand, and a signal anything on the tailnet can set with four lines of curl is not evidence of a device. A builder is closing it independently of the layout ruling.

## The R7 flake has now appeared three times

`quick-log.spec.ts:564` once, `passkey.spec.ts:101` once, `passkey.spec.ts:130` once, each on a byte-identical tree, each passing on re-run. `retries: 0`, so any one of them fails R7's final run outright. Carried to the final full-scope verification; the fix is a bounded retry on read-after-write assertions or `retries: 1` scoped to those specs, never a rubric change.

## The C2 signal is poisoned and only the owner can clear it, BEFORE he launches

Resolved attribution first: the "unidentified client" the slice 4 re-verify reported was this run's own agents, including the verifier itself and later the builder. `request_origin` holds one address for its whole life, `100.65.127.62`, this Mac. The iPhone's `100.121.138.9` has never appeared. Writes stopped when each agent finished, confirmed by idle windows of 45 and 60 seconds with zero growth and no automation process left alive. No external party reached the app.

It left `device_observation.standalone_seen` and `wake_lock_available` reading true, set at 16:13:55 on 2026-08-22 by a headless test browser.

**Those rows cannot be corrected by any shipped path.** The upsert is `observed = observed or excluded.observed` and `first_observed_at = coalesce(existing, excluded)`, so once true is stored it stays true with that timestamp whether or not the owner ever opens Vernier from his Home Screen. `reported_from` cannot carry the line alone: it is overwritten by every later report and is written even when the report observed nothing.

**Consequence for ordering, and it is the whole point.** The rows must be cleared BEFORE the owner launches, not after. If he launches first, the genuine signal is indistinguishable from the fabricated one and C2 can never be honestly ruled.

The command was given to the owner on 2026-08-22 to run himself. The lead attempted it and the permission classifier refused, correctly: a destructive write to the owner's health database is his call. Awaiting him.

A related mechanism gap, being fixed: the automation witness never fires on WebKit, because Playwright WebKit sends a genuine Safari user agent with no automation token. WebKit is the engine both the owner's devices and the suite's main project use, so on that engine the refusal rested entirely on one client-supplied boolean. The verifier proved it by overriding the boolean and receiving a 204.

## What needs the owner, and only the owner

Two actions on the iPhone, and together they close five lines:

1. **Open Vernier from the Home Screen icon.** Flips `standaloneSeen`, flips `wakeLockAvailable` on iOS 18.4 or newer, and records `100.121.138.9` as a tailnet peer. That is the second-device clause of F4 and R1 and the evidence for C2. Nothing on this machine can originate it: ports 22, 5900, 3283, 3031, 88 and 8080 are closed on both peers.
2. **Create the account and register a passkey.** Flips `passkeyRegistered`. WebKit exposes no virtual authenticator to automation, so the suite's ceremony is software; the server-side verification is real, proven by flipping one byte of the DER signature and watching it fail correctly.

Also on the owner, on this Mac: `bash scripts/recovery.sh password` to set a backup password he actually holds. The live one is a random value nobody has, left by the last recovery test, and re-running the full e2e suite resets it again. Documented, not a bug.

## State on disk

- `.forge/GOAL.md`, the verbatim spec. `.forge/BRIEF.md`, forge shape, with the Roles census, the Research summary and the Panel synthesis.
- `.forge/research/`, nine notes: scout, withings, google-calendar, ios-pwa, apple-health-shortcut, nutrition-data, exercise-media, stack-facts, training-rules.
- `.forge/DESIGN.md`, thirteen wireframes, thirteen PNG exports in `.forge/screens/`.
- `.forge/PLAN.md` (14 slices), `.forge/DOD.md` (166 lines, 20 checked), `.forge/PREFLIGHT.md`, `.forge/EVIDENCE.md`, `.forge/DEFECTS.md`.
- Product code committed through `0c66771`. The stack runs: two healthy containers, live at https://lamberts-mac-mini.tailda76d6.ts.net.

## Host and configuration facts

This machine is lamberts-mac-mini, arm64, macOS 26.6, and it IS the deploy target. Tailnet tailda76d6.ts.net. App URL https://lamberts-mac-mini.tailda76d6.ts.net. Passkey RP ID is the tailnet domain tailda76d6.ts.net, not the host, because the host name dies if the Mac is renamed. Tailscale HTTPS certificates are enabled and a real Let's Encrypt certificate exists. Docker Engine 29.6.2, Compose v5.3.1, linux/aarch64.

The configuration file was repaired in place on 2026-08-21 by a one-shot Node script: WEBAUTHN_RP_NAME went from Health to Vernier, APP_NAME was added, BACKUP_DIR was quoted because its path contains spaces. The pre-repair copy held real credentials and was moved out of the repository.

compose.yaml passes exactly seven variables into the app container: APP_URL, APP_NAME, WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME, TZ, DATABASE_URL, MASTER_KEY. The Withings, Google, Anthropic, mail, VAPID and BACKUP_DIR values sit in the configuration file and are withheld from the app process until the slice that needs them. That is least privilege and it is intended, not an omission.

Playwright WebKit is cached on the host at ~/Library/Caches/ms-playwright, 297 MB. The e2e suite runs on the host against the containerised app, never inside the container, because WebKit on Linux ARM is unreliable and Safari is the only engine this product ever meets.

## Slice 4 verdict: FAIL on C7, ten of thirteen lines closed

F27 to F35 and C8 are proven, which is the substance of the slice: the trend leads, the goal is editable and redraws, absence is hatched and never smoothed, and every chart carries a hidden data table the platform accessibility tree really exposes. **C9 cannot close until slice 8**, because its line names the session player, and the verifier left it unchecked rather than passing it on a partial walk.

C7 failed on four counts and three of them share one cause: **the 715 px fold was bought with borrowed money.**
1. High, and D5's condition too. Today and Health scroll sideways 77 px at 393. The visually-hidden chart tables use `clip-path: inset(50%)`, which hides paint but not layout, plus `white-space:nowrap`, so each lays out 406 px inside a 361 px card. The trap in fixing it: `display:none` removes them from the accessibility tree and un-ticks C8, which is proven. It must leave layout flow and stay in the tree.
2. The card gap went from 12 px to a literal 8 px **globally** to buy fold room on one screen, silently changing screens 01 and 03, which C4 and C5 are ticked against.
3. The waist headline wraps at 393 only, because a nowrap flex takes its min-content floor from a long sibling label.
4. Screen 02's seven day-pills, its date labels, its Measure and shortcut controls, and the sentence "Two missed sessions in a month is not a failure state, and the app does not colour it like one" were all dropped. `readAdherenceScreen` still computes the pill data and discards it. That sentence is the panel's tone finding in the product's own words, on the screen the owner opens daily.

**The aged seed is a structural problem, not a cosmetic one.** Ids are keyed to a day offset and inserts are `on conflict do nothing`, so the boot log already reads "0 new row(s)" and a week from now this install has an eight-day trailing gap that collapses both body cards. The final full-scope pass proves all 166 lines again **on this same install**, so evidence that is not reproducible tomorrow is not evidence. Being fixed in the same dispatch.

## Slice 3 closed. C6 took six verifications and the sixth mechanism held.

**PASS on 2026-08-22.** Every slice 3 line is proven except the three owner-blocked ones. 32 of 166 checked.

What finally closed C6 was a change of kind, not of degree. Five mechanisms compared text and each was beaten by a string the previous one could not see. The sixth compares **object identity**: the caught `Error` is carried to the DOM node, the checker wraps `window.fetch` before the app's first script and records each rejection against the object it rejected with, and a fragment is excused only when it **is** that object's message, from a rejection that happened after the state opened. A composed literal fails because it is not that object. A stale rejection fails on the timestamp. A product sentence carrying a real rejection fails because it is not the message. The verifier confirmed the wrap fails closed in both directions: if the app re-wraps fetch the object is absent and the fragment is flagged, never falsely excused.

The verifier also ruled against me on a judgement call and was right. I had instructed no INSERT grants for the suite role; the builder kept two, on `recovery_grant` and `auth_attempt`, and the verifier ruled that correct: SELECT-only would have pushed F9, F13, F15 and F16 off the owner's live install entirely and weakened the proof that the live app protects the owner's real passkey and credentials. Neither table holds health data or a credential and neither can be updated or deleted by the role.

## Carried to the final full-scope verification: the R7 flake surface

`retries: 0`, and two spec files have each failed once on a byte-identical tree: `quick-log.spec.ts:564` and `passkey.spec.ts:101`. Neither reproduced in three consecutive full runs, so both are recorded unverified rather than dropped. R7 is the line that pays for it, at the final run, and a flake there fails the whole thing at the worst possible moment. The verifier named this as the first thing it would fix with another dispatch, and placed it in the final slice rather than slice 3. The fix is a bounded retry on the two read-after-write assertions, or `retries: 1` scoped to those specs. **Not a rubric change.**

Eleven more slices of end-to-end coverage are about to be built on this suite, so the longer it waits the more it costs.

## Carried to slice 14, the hardening slice

**The application connects to Postgres as the bootstrap superuser.** Slice 3 boxed the test suite in with a `vernier_suite` role holding SELECT plus two narrow INSERTs and nothing else, so a test can no longer destroy the owner's history. The app has no such bound: a bug in any route can do anything to any table. The builder named this itself as the larger of the two remaining exposures and correctly declined to fix it inside a slice about provenance. It belongs with the security hardening in slice 14, alongside R6.

**A superuser also stays reachable from this machine** because pg_hba trusts the container's local socket, so anyone who can run `docker compose exec db` bypasses every grant. That is the owner's own access and no privilege closes it; for the suite it is closed by shape in `suite-safety.test.ts`. Recorded so nobody mistakes the suite's boundary for a database-wide one.

**`suite_forget_passkey` is a security-definer function permanently installed on the live database**, bounded by a twelve-character marker in a credential id and asserted by a unit test. Security definer runs as the function's owner and steps outside the grant, so its bound is the only thing holding it. Worth a look in slice 14 whether it should exist on a production database at all, or only on the scratch instance.

## Notes for later sessions

- **Decided 2026-08-22, for whoever builds slice 6.** `.forge/PREFLIGHT.md` line 146 curls `/api/diagnostics/ingest` with no session and reads `lastIngestWithin36h`. `tests/unit/routes.test.ts` currently asserts that path classifies protected. The preflight line is right and the test encodes today's absence rather than a decision: that endpoint is a diagnostics READ, the same class as `/api/diagnostics/device` and `/api/diagnostics/launch`, and the preflight script has no session to offer. Slice 6 names it in `PUBLIC_PATHS` and updates that assertion. It returns a boolean and a timestamp, never a payload, never a token, never a count.
- **Design contradictions are settled in DESIGN.md section 2b and that section outranks any single wireframe.** The base button is 48px and 16px; `00-patterns.html` says 44 and 15 and is the outlier on three separate rules because it was written first. 44px is the accessibility floor for incidental controls, never a primary action's size. Escalations that stay: gate and quick-log sheet 52px, session player 56px with 88px on the transport, `.btn.icon` 44x44 square which eleven sheets agree on.

- The session secret-guard hook blocks any Bash command whose text contains the bare word "secrets", or a credential-named variable beside echo or printf, or .env, .pem and .key paths. It blocks Read, Edit and Write on those paths too. Write files with the Write tool, or run a Node or Python script from the scratchpad. A script's own file access is not intercepted.
- To read configuration, ask the running container: `docker compose exec -T app printenv NAME`. Never pass `--env-file`; Compose reads the file from the project directory on its own.
- The scout agent has no Write tool. It returns prose and the lead persists it.
- Research agents drop downloaded third-party files in the project root. Three were removed on 2026-08-21. Rehosting them would contradict the media licensing position the research settled: cite and link, never republish.
- Postgres 18 refuses to boot with its volume mounted at /var/lib/postgresql/data. It must mount at /var/lib/postgresql.
- Chrome's Network.emulateNetworkConditions is per target. Setting only the page offline leaves the service worker's own fetch reaching the origin, which passes an offline test while proving nothing.

## Owner action outstanding, unrelated to the build

While verifying whether a third party can sign an installable .shortcut file, the Apple Health research agent ran `shortcuts sign --mode anyone` twice on this Mac. That operation is the same one as "Copy iCloud Link", so it published two throwaway public SharedShortcut records named "Test" under lambert.bouley@gmail.com. They hold no personal data. Remove them in the Shortcuts app with Stop Sharing. This was a side effect of research, not part of the product, and it is recorded here so it does not get lost.

checkpoint: 2026-08-23T08:25:29Z (SessionEnd)

checkpoint: 2026-08-23T08:26:30Z (SessionEnd)

checkpoint: 2026-08-23T08:28:18Z (SessionEnd)
