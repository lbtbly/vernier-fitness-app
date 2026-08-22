# Ruling on slice 3

Architect, 2026-08-22. Slice 3 reached the top of the escalation ladder after
three failed verifications, all on C6. Three questions were put. Answers first,
reasoning under each.

- **Question 1. No re-plan.** Build gap. The verifier's reasoning holds and I
  found one thing it understated and one closure it left open that I refuse.
- **Question 2. C6 is closable, after one amendment.** Recorded as **A4** in
  `.forge/AMENDMENTS.md`. One clause of C6 could not be satisfied by any build,
  which is the only ground the rules allow. Four constructs ruled: three outside
  the line, one refused and kept inside.
- **Question 3. Slice 3 owns F20.** Confirmed, no redirect.

---

## Question 1. Re-plan or build gap

**No re-plan. This is a build gap, and the verifier called it correctly against
its own interest.**

I checked the claim rather than adopting it, and the load-bearing fact is
stronger than the verifier put it.

**Neither checker is wired into anything.** `scripts/checks.sh` runs exactly two
things, `typecheck` at line 68 and `lint` at line 69. `package.json` carries
`strings` at line 21 and `strings:rendered` at line 22. A search of the whole
tree for either script name returns `package.json`, the two scripts themselves,
`docs/SUGGESTIONS.md`, and evidence files. No hook, no test, no gate, no commit
path calls either one.

That reframes all three failures. The story the run has been telling itself is
"three source-code scanners shipped, three beaten." The truer story is that all
three C6 defects were found by a human running a command by hand, and none by the
gate, because the gate has never once run a string check. Every argument about
whether a heuristic over source can be complete was downstream of a gate that
would have passed regardless of the answer.

**The union arithmetic supports the same conclusion.** `scripts/strings.mjs`
caught 8 of the 9 planted strings recorded in
`.forge/evidence/slice-3/reverify3/old-scanner-a.txt`, including the single word
"chip", the `aria-label` "Turnip lantern", the svg text node and both API refusal
details. `scripts/rendered-strings.mjs` caught the one it missed, the two-word
`awaiting setup` returned by `src/db/integrations.ts` and rendered raw, proven at
`.forge/evidence/slice-3/fix2/c6-defeat-attempt.txt`. Working the two exclusion
lists against each other, the union has exactly one hole: `aria-roledescription`
is absent from `SPOKEN_ATTRIBUTES` in `scripts/strings.mjs:106` and absent from
the `spoken` list in `scripts/rendered-strings.mjs:395`. That is the one true
inline string neither sees, and it is missing from both lists for the same
reason: there are two lists of the same thing and nothing keeps them equal.

**A line whose violations can be planted nine times and caught nine times is
measurable.** Re-planning slice 3 would produce the same slice, the same Closes
list and the same code, and would cost the run a dispatch to arrive back here. It
is not warranted. `.forge/PLAN.md` is unchanged.

### The verifier's five closures, judged

1. **Key the cause slot to provenance rather than to a sentence.** Agree, and
   confirmed at source. `CAUSE_SLOTS` at `scripts/rendered-strings.mjs:350`
   reduces `quickLog.errorBody` to its one non-empty literal segment, and
   `inCauseSlot` at line 354 passes any fragment containing that segment in
   order. So every fragment ending in "The sheet still saves: a write goes to
   this phone first and uploads when the Mac mini answers." is reported as a
   platform cause whatever fills the detail, and the run exits 0. The shipped
   defect walks through it by construction.
2. **Widen the svg subtree.** Agree, and this is bigger than slice 3.
   `readTheScreen` at `scripts/rendered-strings.mjs:391` excludes svg wholesale
   with `element.closest('script, style, noscript, template, svg')`. C8 requires
   every chart to carry a `<title>` and a `<desc>` inside its svg, and those are
   the strings VoiceOver actually speaks. As shipped, the closed-world check is
   blind to every word inside every chart in slices 4, 7, 9 and 12. Read `svg
   title`, `svg desc`, `svg text` and spoken attributes inside svg; keep `path`
   and `defs` out.
3. **Widen the spoken-attribute list.** Agree, and name the union gap:
   `aria-roledescription`. Add it and `aria-valuetext` to both checkers. Then put
   the list in one shared module imported by both, because the defect class
   across all three failures is a rule one checker holds and the other does not.
4. **Drop the `words.length < 3` rule.** Agree. Still in the tree at
   `scripts/strings.mjs:130`.
5. **Run both checks in the gate, failing on either.** Agree, with one
   distinction the gate's own header insists on. `checks.sh` runs per edit and
   its cost is why it is throttled. `strings` needs no stack and answers in a
   second, so it joins the per-edit run. `strings:rendered` launches WebKit and
   needs a live stack, so it joins the unthrottled `FORGE_CHECKS_FULL=1`
   per-dispatch gate only. **Wire it so a missing stack fails the gate rather
   than standing down.** The "could not run, its tooling is not installed yet"
   branch at `checks.sh:59` is right for a missing binary and wrong here: a
   missing stack is exactly the state in which the check would have found
   something.

### Two closures I add

6. **The rendered walk must refuse to pass on a vacuous walk.** `rowIds`,
   `ratingIds` and `sourceIds` come out of the database at
   `scripts/rendered-strings.mjs:473-475`, and the `/value/[id]` and
   `/source/[id]` loops walk once per row found. On an empty database they walk
   nothing and the script prints "every fragment on every surface resolves to a
   key" and exits 0. Given `DEMO_MODE`, below, an empty database is the default
   state of a fresh `scripts/up.sh`, not an edge case. Assert a floor: at least
   one stored value per source, at least one rating, at least one source record
   per kind claimed, and exit non-zero naming what was missing. C6's amended
   evidence clause now requires this, so it is graded and not advisory.
7. **One shared vocabulary module, not two lists.** `SPOKEN_ATTRIBUTES` exists
   twice with the same six entries and drifted from the truth in both places at
   once. The glue rule, the token shapes and the spoken list belong in one file
   both checkers import.

### One closure I refuse

The verifier left "a lowercase hyphenated phrase tiled as `machine identifier`"
open as a judgement call. It is not one. The token at
`scripts/rendered-strings.mjs:259`, `/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+/`,
swallows "sign-in", "check-in", "opt-out", "follow-up", "day-to-day", words this
product's copy will certainly use. Ruling it out of scope would let a real inline
string through, which is a softened line and is refused. Narrow the token: a
machine identifier is a value only where the check can point at what it
identifies, a value the check sent itself, a column value it read, or text inside
a `<code>`. Never a bare run of prose. A4 writes the refusal into C6 so the
argument cannot be made again from the text.

---

## Question 2. Is C6 written so it can be closed and stay closed

**Not as written. Yes after A4.** The amendment is recorded in
`.forge/AMENDMENTS.md` and `.forge/DOD.md` is edited. It is sharper on five
counts and looser on none.

### The provable mis-measurement

"Every user-facing string" has a decidable boundary for text the product
authored: the catalogue is a closed set and a fragment either resolves to it or
does not. It has no decidable boundary for text the product did not author. When
a fetch never reaches the machine, WebKit hands the error slot its own words, in
a wording and a locale this product does not control. No key exists for that
string and none can be invented.

So C6's evidence clause, read literally, specifies "the product's copy is all
catalogued" and measures "all text on screen is the product's copy", which is
false of every web product ever shipped. That is the narrow ground the rules
permit an amendment on, and it is the reason the shipped check already carries an
exemption the rubric never authorised, keyed to position rather than to
provenance. A real inline string walked through the unauthorised exemption. The
line's silence produced the hole.

### The four constructs, ruled

- **Platform-authored text.** Outside. Keyed to provenance, not position, and the
  check fails any fragment whose provenance it cannot establish. Strictly tighter
  than what ships today. The shipped defect,
  `` `HTTP ${response.status} at ${time24(new Date(), timeZone)}.` `` composed
  inline at `src/components/QuickLog.tsx:136`, is app-authored text in a platform
  slot and fails under the new wording as it should have failed under the old.
- **Two catalogued strings placed adjacent.** Outside C6, and named as owned by
  the screen line for that screen: C5, C7, C10 through C16, plus the copy floor
  in the standards skill. Every word of the composition has a key and appears in
  the inventory, so the inventory remains the whole truth about the words the
  product says. C6's contract is over the vocabulary; syntax is a screen match.
  This is not a loophole for novel copy: a composed sentence that reads wrong is
  a FAIL on the line that owns the screen, and A4 says so.
- **A lowercase hyphenated phrase.** **Inside.** Refused, per Question 1.
- **A count noun such as "steps" or "of 5".** Outside the unit clause, inside the
  inline clause, and constrained. Both already carry keys, so nothing is inline.
  The tightening: a suffix outside the enumeration must be a catalogued count
  noun for a dimensionless metric and never a second unit for a metric the
  enumeration names. "lbs" beside a weight was always a FAIL and now says so.

### Three tightenings that ride along

- **"in a component" is gone.** Defects 11 and 14 lived in `src/middleware.ts`
  and `src/db/integrations.ts`, neither a component. Under the approved words a
  verifier could have passed both. It refused, correctly, and the line now says
  what was enforced.
- **"however few words it is"** kills the two-word argument at the rubric level,
  independently of the fix at `scripts/strings.mjs:130`.
- **The evidence clause names its population.** The inventory counts only from a
  walk that prints its surfaces and covers at least one stored value per source.

Nothing was removed. The date clause, the time clause, the unit enumeration and
the timezone-shift requirement stand, and the timezone clause gained a number:
six zones, which is what already holds at hash `34a015c5047e40fd` including
`Pacific/Kiritimati`.

### The sweep

A4 also adds a section to the head of `.forge/DOD.md`, "How evidence is read",
with two standing rules binding all 166 lines. They exist because C6 and F20
failed the same way from two directions, and the failure is not about a
threshold.

**A zero is evidence only beside the population it covered.** Swept across the
rubric, the shape under C6's vacuous walk also sits under C8, C9, C18, D1 and D5,
each a zero or a capture set over a population the line never names. R7 already
carries the guard in its own words, "the run prints its counts", and is the model
the rule generalises.

**Evidence takes the path the product offers.** From F20, below. Written once
rather than as four edits to F20, F23, F24 and F26, because it is one property of
evidence and not four wordings.

No line added, none removed, no threshold moved. The count stands at 166.

---

## Question 3. Who owns F20

**Slice 3. Confirmed, no redirect.**

The bug is one line and I read all three files. `src/app/(shell)/value/[id]/page.tsx`
computes `current = views.at(-1)` at line 58, the chain head, and passes
`measurementId={current.id}` to `CorrectionForm` at line 208. `CorrectionForm.tsx:57`
posts that as `correctsId`. `src/app/api/log/route.ts:153` resolves it with
`readChain(correctsId)`, and `readChain` at `src/db/measurements.ts:286-293`
queries `where(eq(measurement.rootId, rootId))`. A correction row's `id` is never
any row's `root_id`, so `anchorChain` is empty, line 155 returns 404, and the
screen renders `correctionTargetGone`, which tells the owner a row sitting in the
table "was never stored". Through the product the owner gets one correction, then
a false statement.

The sharpest detail: **the data layer is already right and the route disagrees
with the function it calls.** `appendCorrection` at `src/db/measurements.ts:230`
does `readMeasurement(input.correctsId)` and then `readChain(anchor.rootId)`,
which is the correct two-step resolution. The route's own pre-flight lookup does
the one-step version twenty lines earlier and contradicts it. The fix is to make
the route resolve the anchor the way `appendCorrection` already does.

Ownership is not close. F20 is in slice 3's Closes list. `/value/[id]` shipped in
slice 3 as F21. The correction branch of `/api/log` shipped in slice 3 as F20.
No later slice touches this path; slice 5 owns re-import conflicts, which is a
different mechanism. Slice 3 fixes it.

**And the verifier was right to flip the line back.** F20 says "editing a stored
value". The 2026-08-22 02:23 evidence at `.forge/EVIDENCE.md:78` posted the root
id three times, which no shipped screen does. That proved the append-only
storage, which is real and still holds, and did not prove the line. Under the
second standing rule the re-proof runs through `/value/[id]`, three times, and
the capture is the fourth row on screen.

---

## Two operational facts

### DEMO_MODE

Confirmed, and it is more load-bearing than a footnote. `compose.yaml:57` reads
`DEMO_MODE: ${DEMO_MODE:-0}`. `.env.example` names no such variable anywhere in
its 133 lines. So `scripts/up.sh` from a clean shell brings Vernier up with an
empty database, and the container has held demonstration data only because the
value was exported in a shell that no file records.

This is **a build fix, not a plan line**, and slice 3 owns it because slice 3
owns the seed and F25.

F25's own words are unaffected and it stays checked: it grades conditional
behaviour, proven both ways on a fresh scratch database, and it never claimed the
deployed instance runs seeded. What is affected is C6's strongest available
check, which reads its walk list out of that database and silently narrows to
nothing when it is empty, and every later slice whose captures assume a populated
app.

The fix has three parts and adds no human dependency, which is why **no
`.forge/PREFLIGHT.md` line is added**: `DEMO_MODE` is not needed to reach a live
URL, and putting it in the pre-flight would be the label-overstates error running
the other way. Name `DEMO_MODE` in `.env.example` with both values and what each
does; assert the population floor inside `scripts/rendered-strings.mjs` so it
cannot pass in the empty state; and record in `docs/` the one command that
produces the verification state, which is already
`DEMO_MODE=1 bash scripts/test-stack.sh reset`. If the builder instead makes the
operator set a value by hand, that **does** become a pre-flight line and I will
add it. Default it in the example file and nothing is owed.

### The two commits carrying planted attack strings

`c6618ea` and `b4240ed` carry them, `dff58a7` reverts them,
`git diff 86cd1aa -- src scripts` is empty and the tree is clean. Not rewriting
history was right.

**Nothing downstream cares, and I checked rather than assumed.** Exactly one
rubric line reads history: **R6**, "static analysis, type checking, dependency
audit and credential scanning each report zero unresolved findings against the
shipped tree and the full history". Its history clause is a credential and
dependency question. The planted strings are "Marmalade weather", "Turnip
lantern", "sync-pending", "awaiting setup", a wrong-password refusal and two
route sentences. Not one is a credential. Static analysis and type checking run
over a working tree, and the tree at `86cd1aa` is clean. D1 greps rendered
output, D4 greps shipped source, C6 reads the running product; none reads
history. R6 is unaffected.

One flag while R6's history clause is open, and it is not the planted strings.
`.forge/RESUME.md` records that the pre-repair configuration file "held real
credentials and was moved out of the repository". If that file was ever
committed, R6 fails on history and the remedy is expensive. Whoever dispatches
slice 14 should scan history for it early rather than at the final gate.

---

## What slice 3 is re-dispatched with

Not a re-plan. One builder dispatch, seven named closures, all of them code:

1. Resolve the correction anchor in `/api/log` the way `appendCorrection` already
   does, so a second correction through `/value/[id]` appends instead of 404s.
   Re-prove F20 through the screen, three edits, four rows.
2. Key the cause-slot exemption in `scripts/rendered-strings.mjs` to provenance,
   and fail any fragment whose provenance the check cannot establish.
3. Read inside svg: title, desc, text, and spoken attributes. C8 depends on it.
4. Add `aria-roledescription` and `aria-valuetext` to the spoken list, and put
   that list, the glue rule and the token shapes in one module both checkers
   import.
5. Narrow the `machine identifier` token so it cannot swallow a hyphenated
   English word in a prose run.
6. Delete `words.length < 3` at `scripts/strings.mjs:130`.
7. Assert the walk's population floor, and wire `strings` into the per-edit gate
   and `strings:rendered` into the per-dispatch gate, failing the gate when the
   stack it needs is absent. Name `DEMO_MODE` in `.env.example`.

The bar did not move. C6 is harder today than it was yesterday, and it now says
so in writing.
