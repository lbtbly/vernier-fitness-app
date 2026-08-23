# Amendments

Post-greenlight changes to the plan. Each records before, after, reason, author,
and the disclosure to the user. An amendment corrects a mis-specification or
completes a dead end. **None of these lowers a bar.**

A1 through A3 changed the plan and left the rubric untouched. **A4 is the first
amendment to reach `.forge/DOD.md`.** It rewrites one line, C6, and adds two
standing rules about how evidence is read. The count stands at 166, no line was
added or removed, no threshold moved, and every clause A4 touches came out
tighter than it went in.

**A5 is the second to reach `.forge/DOD.md`.** It rewrites F27, sweeps the same
fault out of C15, and adds a third standing rule. **A6 settles one contradiction
between two approved sheets in `.forge/DESIGN.md` section 2b and leaves section 4
exactly as approved.** The count still stands at 166 and no threshold moved.

---

## A1. Slice 5 cannot upsert. 2026-08-22, lead.

**Before**, `.forge/PLAN.md` line 307:

> decodes each value as `value * 10 ** unit`, upserts on `(grpid, type)` and advances the cursor to `max(modified)` only after the write commits

**After:**

> decodes each value as `value * 10 ** unit`, inserts with `ON CONFLICT DO NOTHING` against a unique index on `(source, external_key)` where the external key is `grpid:type`, or records a dedup decision when the row already exists, and advances the cursor to `max(modified)` only after the write commits

**Reason.** Slice 3 made the measurement table append-only with a
`BEFORE UPDATE OR DELETE` trigger rather than a convention, so a later slice
cannot quietly overwrite a corrected value. The verifier confirmed the
consequence on the live database: `UPDATE` raises `restrict_violation`, `DELETE`
raises it, and `INSERT ... ON CONFLICT DO UPDATE` raises it too, because the
upsert fires the same trigger. The plan's word "upserts" was written before that
trigger existed and is now impossible to execute.

This is the plan catching up to a stronger guarantee, not a weakened one. The
panel's named risk has a quiet half: "a re-import that overwrites a corrected
value... that's worse than not importing at all, because I won't know to check."
An upsert is precisely that failure. Insert-or-question is the behaviour the
brief asked for.

**Disclosure.** Told to the user when slice 3's verdict landed, before slice 5
was dispatched.

---

## A2. A raised import question has no way to be answered. 2026-08-22, lead.

**Before.** `import_question.state` permits `'answered'`. No code path sets it,
sets `answered_at`, or sets `answer`. A conflict raises a warning on Today that
can never be cleared.

**After.** The slice that ships the first real re-import owns the answer control,
which is **slice 5**, Withings. Its scope gains: a raised question presents both
values with their provenance, the owner picks one or edits, the choice writes a
correction row naming the question, and the question closes with `answered_at`
and the chosen value recorded.

**Reason.** Rubric line F26 is met and proven: a disagreeing re-import raises a
question holding both values and writes nothing. That is the line, and the
verifier ruled it correctly. But the feature behind the line is a dead end
without an answer path, and a permanent unclearable warning is its own version
of the failure the panel named: the app telling the owner something is wrong and
giving him nothing to do about it.

No rubric line is added, changed or softened. This completes work the plan
already implies within a slice that already exists.

**Disclosure.** Told to the user when slice 3's verdict landed.

---

## A3. The photo estimate needs a source, and the six-source list does not change. 2026-08-22, lead.

**Before.** Rubric line F22's gloss names "the photo and the model reply" as one
of the six provenance destinations. No value in the six-source list reaches it,
and slice 3 shipped `manual_entry` in that position.

**After.** A meal estimated from a photo stores `source='manual'`,
`confidence='estimated'`, and a `source_record` of kind `photo_estimate` whose
detail carries the photo reference, the model identifier, the returned range and
the owner's confirmed value. Graded by **F97** in slice 10, where it belongs. The
six permitted sources are unchanged and the database CHECK that enforces them is
unchanged.

**Reason.** The six sources answer "where did this come from", and a photo
estimate the owner confirmed came from the owner: he saw a range, he corrected
it, he saved it. The model's involvement is a confidence and a record, not an
origin, which is exactly the distinction slice 3 already drew when it made
`estimated` a confidence rather than a seventh source. Adding a seventh source
would put the same fact in two places and break the CHECK that keeps the list
closed.

This also satisfies the brief's rule that every AI estimate is badged as an
estimate and stays editable: the badge is the confidence, it survives every
later edit, and the record holds what the model actually returned.

**Disclosure.** Told to the user when slice 3's verdict landed.

---

## A4. C6 names its own boundary, and two rules sweep the class it exposed. 2026-08-22, architect.

Written on the escalation ladder, after slice 3 failed verification three times
on C6. This is the first amendment to edit `.forge/DOD.md`.

### Part 1. C6.

**Before**, `.forge/DOD.md` line 594:

> **C6.** Dates render as "21 Aug" or "Friday 21 August" and times as 24-hour
> Europe/Paris on every surface; units are kg, cm, km, kcal, g and the printed
> laboratory unit. No user-facing string is written inline in a component.
> Evidence: a string inventory listing every user-facing string with its key, and
> a timezone-shifted run producing identical rendered dates.

**After:**

> **C6.** Dates render as "21 Aug" or "Friday 21 August" and times as 24-hour
> Europe/Paris on every surface; units are kg, cm, km, kcal, g and the printed
> laboratory unit, and any other suffix is a catalogued count noun for a
> dimensionless metric, never a second unit for a metric named here. No string the
> product authored reaches a person without a catalogue key, wherever in the
> shipped tree it was written and however few words it is, including one
> hyphenated word: a component, a route handler, middleware, a database helper, a
> spoken attribute, an svg title, an svg description, an svg text node. Text the
> product did not author is outside the line, and the check that excuses it
> establishes that by provenance and fails every fragment whose provenance it
> cannot establish. Two catalogued strings placed adjacent are read by the screen
> line that owns that screen, not here. Evidence: a string inventory listing every
> string the product authored with its key, produced by a walk that prints the
> surfaces it covered and covers at least one stored value per source, and a
> timezone-shifted run across six zones producing identical rendered dates.

**Reason.** One clause of C6 could not be satisfied by any build, on any stack,
and that is the ground an amendment is permitted on.

"A string inventory listing every user-facing string with its key" read literally
covers text the product did not write. When a fetch never reaches the machine,
WebKit hands the quick log its own words, in wording and in a locale this product
does not control. There is no key to give that string and no key can be invented
for it. So the clause as written specifies "the product's copy is all catalogued"
and measures "all text on screen is the product's copy", which is false of every
web product ever shipped. That is a line measuring something other than what it
specifies, and it is why the shipped check carries an undocumented exemption:
`scripts/rendered-strings.mjs` excuses anything sitting in one slot, by position,
and a real inline string walked straight through it.

The verifier surfaced four constructs and asked for a ruling. Three are outside
the line and one is not, and saying which is which is the whole point of the
amendment.

1. **Text the platform authored.** Outside, on provenance. The exemption is now
   keyed to where the text came from rather than to where it landed, and the
   check must fail any fragment whose provenance it cannot establish. That is
   strictly tighter than the shipped behaviour, which excused a slot. The defect
   this caught, `HTTP ${response.status} at ${time24(...)}.` composed inline in
   `src/components/QuickLog.tsx`, is app-authored text in a platform slot, and it
   fails under the new wording exactly as it should have failed under the old.
2. **Two catalogued strings placed adjacent.** Outside C6, and named as owned by
   the screen line for that screen, C5, C7, C10 through C16, plus the copy floor
   in the standards skill. Every word of such a composition has a key and appears
   in the inventory, so the inventory is still the whole truth about the words
   the product says. C6's contract is over the vocabulary. Whether an arrangement
   reads well is a screen match, and it is graded there.
3. **A lowercase hyphenated phrase, "sign-in" or "day-to-day".** **Inside.**
   Refused as an exclusion. This one was floated and it is not a boundary, it is
   a bug: the token rule at `scripts/rendered-strings.mjs:259`,
   `/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+/`, swallows ordinary English that happens
   to carry a hyphen. Copy on a screen with no key is a FAIL whatever shape it
   has. The line now says "however few words it is, including one hyphenated
   word" so the argument cannot be made again from the text.
4. **A count noun, "steps" or "of 5".** Outside the unit clause, inside the
   inline clause, and constrained. A step count and a 1-to-5 rating are
   dimensionless; they are not among kg, cm, km, kcal, g, and they are not
   alternatives to them. Both already carry keys, `units.step`, `units.point`,
   `unitNames.step`, `unitNames.point`, so nothing is inline. The tightening is
   the second half of the sentence: a suffix outside the enumeration must be a
   catalogued count noun for a dimensionless metric and may never be a second
   unit for a metric the enumeration names. "lbs" beside a weight was always a
   FAIL and now says so.

Three further tightenings ride along, each closing an argument the old text left
open:

- **"in a component" is gone.** Slice 3's second and third C6 failures lived in
  `src/middleware.ts` and `src/db/integrations.ts`, and neither is a component.
  Under the words as approved a verifier could have passed both. The verifier
  refused, correctly, and the line now says what was enforced.
- **"however few words it is"** kills the `words.length < 3` argument at the
  rubric level, independently of whether `scripts/strings.mjs:130` is fixed.
- **The evidence clause names its own population.** The inventory counts as
  evidence only from a walk that prints its surfaces and covers at least one
  stored value per source. The reason is in part 2.

Nothing was removed from the line. The date clause, the time clause, the unit
enumeration and the timezone-shift requirement are untouched, and the timezone
clause gained a number: six zones, which is what already holds at hash
`34a015c5047e40fd`.

### Part 2. The class C6 exposed, swept.

**Before.** `.forge/DOD.md` opened on the [OPERATOR] convention and the screen
and viewport definitions, and said nothing about how a zero or a walk is read.

**After.** A section, "How evidence is read", carrying two standing rules that
bind every one of the 166 lines:

> **A zero is evidence only beside the population it covered.** A search
> returning nothing, a count of zero errors, or a walk reporting no defect closes
> a line only when the same run prints what it walked and that population is not
> empty.

> **Evidence takes the path the product offers.** A line describing what a person
> can do is proven along the route a shipped screen actually takes. A result
> reached by a request no screen issues proves the layer underneath and not the
> line.

**Reason.** C6 and F20 failed the same way twice, from two directions, and
neither failure is about a threshold.

The first rule comes from C6. `scripts/rendered-strings.mjs` reads its walk list
out of the live database, at lines 473 to 475, and walks `/value/[id]` and
`/source/[id]` once per row it finds. `compose.yaml:57` reads
`DEMO_MODE: ${DEMO_MODE:-0}` and `.env.example` names no such variable, so
`scripts/up.sh` from a clean shell brings the stack up with an empty database. In
that state the two loops walk nothing, the check prints a shorter list, and it
exits 0 with the words "every fragment on every surface resolves to a key." A
green over almost nothing reads identically to a green over everything. Swept
across the rubric, the same shape sits under C8, C9, C18, D1 and D5, every one of
which is a zero or a capture set over a population the line does not name. R7
already carries the guard in its own words, "the run prints its counts", and is
the model the rule generalises.

The second rule comes from F20. It was marked on 2026-08-22 at 02:23 on three
corrections posted straight at `POST /api/log` with the root id. Through the
shipped screen the owner gets one correction and then a 404, because
`src/app/(shell)/value/[id]/page.tsx:208` hands `CorrectionForm` the chain head's
id and `src/app/api/log/route.ts:153` resolves it with `readChain()`, which keys
on `root_id`. The line said "editing a stored value", the evidence proved the
storage layer, and the gap between the two hid a defect through two verdicts. The
rule is written once here rather than as an edit to F20, F23, F24 and F26,
because it is one property of evidence and not four wordings.

**No line was added, removed or loosened. No threshold moved. The count stands at
166.**

**Author.** Architect, on the escalation ladder, after three FAILs on slice 3.

**Disclosure.** Told to the user with the slice 3 ruling in
`.forge/RULING-SLICE-3.md`, before slice 3 is re-dispatched. The user is owed two
sentences of it plainly: C6 now says in writing that the browser's own error text
is not the product's copy, which it always meant and never said, and it says in
writing that a hyphenated word and a two-word chip are the product's copy, which
closes the two arguments that let three builds through. Everything else about C6
is harder than it was yesterday.

---

## A5. F27 closes its own set, and the class it exposed is swept. 2026-08-22, architect.

Written on the escalation ladder, after slice 4 failed verification four times on
F27. This is the second amendment to edit `.forge/DOD.md`.

### Part 1. F27.

**Before**, `.forge/DOD.md`:

> **F27.** At 393x852, Today shows the session row, the meals, what needs
> logging, the weight trend and adherence within the top 715 pixels with no
> scrolling. Evidence: a full-page capture with the fold marked.

**After:**

> **F27.** At 393x852 with no scrolling, a freshly loaded Today shows the session
> row, the meals, what needs logging and the weight trend within the top 715
> pixels, in every state the owner's own data can produce and not in one.
> Adherence is never drawn above the weight trend. Every element the page can draw
> above the weight trend carries a maximum height fixed by construction rather
> than by a count of rows — the notice region whatever it holds, the day card
> whatever was logged into it, and anything a later slice adds above the trend —
> each maximum stated as a number, measured at its smallest and its largest count,
> and the maxima sum inside 715. The 715 is met at the card padding and the card
> gap DESIGN.md section 3 fixes, measured on the shipped screen: a fold bought by
> compressing them is a FAIL. Evidence: full-page captures with the fold marked,
> in both engines, in at least these states — nothing raised; every source quiet;
> an open import question; offline with entries queued; and immediately after one
> quick log writing all six values F23 names — plus the measured height of each
> bounded element at its extreme count, the notice region at 1 and at 999999
> notices, and the two measured card values.

**Reason.** The old line fixes a budget over a sum and enumerates five of the
addends. Everything drawn above the weight trend spends the 715, but only five
things are named, so the line's truth is a property of the row counts on the day
the capture was taken and not a property of the shipped product. Four
verifications found four different unnamed addends, in order: a second stale line
when a source goes quiet past 36 hours, 742 px; a second banner when an import
question is open, 758 px; and the just-logged card inside the day card, which
draws one row per logged value and takes the day card from 223 px to 681 px,
1147 px. Each fix bounded the element in front of it and the next element grew.
That is not a builder failing four times. That is a line whose set is open.

The set is still open going forward, and the rubric itself is what opens it. F55
puts the last successful ingest time on Today in slice 6. F133 puts one persistent
in-app banner per failed job, archive run and integration on Today in slice 13,
which is three more. A fifth and a sixth round of the same failure are already
written into the plan. Only a boundedness clause closes that, and the boundedness
clause is the tightening: it governs elements no line has been written for yet.

**Adherence leaves the fold set, and two other approved artifacts are why.**
DESIGN.md section 3, the layout constants that bind every screen, says "Today's
session row plus the weight trend must both fit inside it". The screen table at
DESIGN.md line 75 says screen 02 "answers what do I do today and is my health
improving, above the fold, with the trend leading and the stale sync named".
`02-today.html` frame 1 captions itself "Scrolls past the fold to adherence, body
signals and the last panel". Three approved artifacts put adherence below the
fold and one rubric line put it above, and the one that is odd is F27. Nothing in
`.forge/GOAL.md` or `.forge/BRIEF.md` asks for it; the clause originated with the
architect at plan time and it is a specification defect, which is the ground an
amendment is permitted on.

It is replaced, not dropped. "Adherence is never drawn above the weight trend" is
a checkable clause, it is the position screen 02 draws, and it forecloses the move
the build actually made: the shipped Today hoists `section.card adherence` above
`section.card data-card=weight`, visible in the verifier's own layout dumps at
`.forge/evidence/slice-4/reverify3/f27-anchors-both-engines.txt` and
`verify4/f27-what-still-grows.txt`. Under the old wording that reorder was the
cheapest way to pass. Under the new wording it is a FAIL.

**What the old clause cost, which is the case for amending it.** Every one of
F27's four rounds was paid out of another approved artifact:

1. Global design tokens shrunk, and screen 02's adherence pills and its tone
   sentence dropped, to reach 700 px. Reverted.
2. The card gap taken from 12 px to a literal 8 px globally, silently changing
   screens 01 and 03, which C4 and C5 are ticked against. Defect 43. Reverted.
3. The same compression re-applied scoped to `.today`, where it still ships:
   card padding `8px 16px` and card margin-bottom `8px` against the 16 px and
   12 px DESIGN.md section 3 fixes, and it leaks into the quick-log sheet because
   the sheet renders inside `div.today`. Defect 52, and it is why C5 is still open.
4. The adherence card hoisted above the weight card, departing from screen 02's
   order, undeclared and unruled.
5. The offline queue count folded behind a disclosure to bound the notice region,
   which is what failed C5 and F24. Defect 62.

A line that can only be met by breaking other lines is mis-specified. The new
wording makes borrowing itself a FAIL: "a fold bought by compressing them is a
FAIL" is a clause the old line did not have, and it is the reason the fix has to
be structural this time.

**Nothing was loosened.** The 715 stands, 393x852 stands, no scrolling stands,
and four of the five elements stand. Added: every state rather than one state;
both engines rather than one; five named states in the evidence; a maximum stated
as a number for every element above the trend; that maximum measured at its
extreme; the maxima summing inside the budget; adherence constrained by position;
and the card geometry the fold must be met at. The old line was true of one render
of one seed. The new one is a claim about the product.

**The arithmetic that shows it is buildable.** Off the verifier's own dumps at
393x852: header 57, notice region 46, day card 223, adherence 174, weight card
opening at 532 with the trend ending at 689 against the 715 fold, 26 px of slack.
Move adherence below the weight card, where screen 02 draws it, and 182 px come
back: the trend ends near 507. That pays for restoring DESIGN.md section 3's card
padding and card gap on Today, roughly 90 px, and for the offline banner returning
as its own line, 46 px plus its margin, and still leaves better than 100 px under
the fold for what slices 6 and 13 will add through the bounded notice region.

### Part 2. The class, swept.

The fault is a fixed budget over a set the line never closes. A third standing
rule now sits under "How evidence is read", binding on all 166 lines:

> **A fixed budget binds only over a closed set.** A line that fixes a number and
> a boundary — pixels above a fold, seconds to read, taps to commit — either names
> every element that spends the budget, or requires that every element which can
> spend it carries a maximum fixed by construction rather than by a count of rows,
> states that maximum as a number, and shows the maxima summing inside the budget.
> A budget met on one day's data is a measurement of the data. Where a later slice
> may put a new element inside the boundary, the boundedness clause governs it in
> advance, so the budget does not have to be re-argued once per slice.

**The sweep, and its test.** Every line carrying a fixed budget was read against
one question: could some build satisfy this in every state the product can reach,
without breaking another approved line? A line that passes is measurable and a
build that misses it is a build defect. A line that fails carries F27's fault.

- **F27.** Fails the test. Amended above.
- **C15.** Fails the test. "The calendar diff on it is readable end to end in four
  seconds" over a row list whose length is the size of the week's changes. No
  reader reads a forty-row diff end to end in four seconds and no build can make
  him. `11-weekly-review.html` frame 3 draws what the four seconds is actually
  for: "Three counts, then the dedicated calendar before and after, then every
  change as a line with its cause", captioned "Counts first, list second, reasons
  third". Amended, in Part 3.
- **F23.** Passes the test, so it is not amended. "Six taps or fewer" is
  unreachable for waist on an install with no waist ever measured, 60 taps to the
  30 cm floor and 197 to 99.0, because the stepper steps from zero. But
  `03-quick-log.html` frame 3 already draws that state: the value renders `--`,
  muted, not a number, above a dashed card reading "No waist measurement yet", and
  the footer says "Fill what you have. Blank fields stay blank, they are not
  stored as zero." A build that draws what the screen draws commits in six taps.
  The line is measurable and the build is not done. See the ruling, question 3.
- **F43** (no loading state longer than 3 seconds), **F74** (60 seconds
  backgrounded), **C11** (900 ms ring), **F13** (60 second window), **F119** and
  **F120** (the Sunday period): each budget is over a set the build closes itself,
  not over a sum of drawn elements. Not the class.
- **C18** and **D5**: per-element properties over a population the line names,
  thirteen screens and three viewports. Already covered by A4's first rule. Not
  the class.
- **F21, F22, F31, F97**: tap counts over paths the build fixes. Not the class.

Two instances found, two amended, one near-miss ruled a build defect and named.

### Part 3. C15.

**Before**, `.forge/DOD.md`:

> **C15.** Weekly review matches screen 11 at three viewports, and the calendar
> diff on it is readable end to end in four seconds. Evidence: three captures plus
> a timed read.

**After:**

> **C15.** Weekly review matches screen 11 at three viewports. On the calendar
> diff the three counts and the before-and-after columns state what will change,
> and a reader reaches that answer in four seconds or less at the largest diff the
> confirm screen can produce as well as at a two-row diff; the row list below them
> states its own length as a number before it is scrolled. Evidence: three
> captures, both timed reads each with its row count, and the stated length.

**Reason.** Same fault, caught by the sweep rather than by a fifth failed
verification, which is the point of sweeping. The four seconds stands and it now
has to be proven at the worst case as well as the easy one, which the old line
never required: a timed read on a two-row diff would have closed it. The row list
gains a requirement it did not have, that it states its own length before it is
scrolled, so a tired reader on a Sunday night knows how much is below him. Tighter
on both halves.

### Not an amendment: two verification-state corrections.

Neither of these edits a line. Both change an `[x]` to a `[ ]`, which is the
verifier's ledger and not the rubric, on the F20 precedent from slice 3.

**F23 un-ticked.** A reachable state of the shipped product answers its clause
with 60 taps, proven by the verifier on a scratch instance with zero rows,
`.forge/evidence/slice-4/verify4/f24-first-entry-refused-393.png`, defect 64. A
line with a live counterexample has no evidence.

**C7 un-ticked.** Today does not match screen 02 in two respects the C7 spec never
looked at, because it counted accented actions and origin-chip colours. The card
order is wrong: adherence ships above the weight card where screen 02 draws it
below, in the verifier's own dumps. And the card geometry is wrong: `.today`
computes card padding `8px 16px` and card margin-bottom `8px` against the 16 px
and 12 px DESIGN.md section 3 fixes and `02-today.html` draws, defect 52. Both
departures exist only to pay the old F27 and both become unnecessary under the new
one. This is A4's second standing rule applied to a screen line: the evidence
proved less than the line says.

**Author.** Architect, on the escalation ladder, after four FAILs on slice 4.

**Disclosure.** Told to the user with the slice 4 ruling in
`.forge/RULING-SLICE-4.md`, before slice 4 is re-dispatched. Plainly, in three
sentences: adherence no longer has to sit above the fold, because the design never
put it there and the rubric line that said so was mine and was wrong, and in its
place F27 now forbids adherence above the trend and forbids the fold being bought
by squeezing the cards. Everything above the weight trend must now have a stated
maximum height that data cannot move, measured at its extreme, in five named
states and two engines, which is a harder line than the one that failed four
times. Two lines lost their tick, F23 and C7, because their evidence proved less
than they say.

---

## A6. Where a just-logged entry lives on Today. 2026-08-22, architect.

This amends `.forge/DESIGN.md` section 2b, which exists to settle contradictions
between sheets and which says that section wins. It does not touch section 4.

**Before.** Two approved sheets draw the same moment differently and neither
defers to the other. `02-today.html` frame 3 draws queued entries as rows inside
the day card, three rows in that state as in every other, with no separate card.
`03-quick-log.html` frame 2 draws a separate "Just logged" card carrying three
rows and the Undo and Edit controls, above a "What happens next" card, on a Today
that draws no day card and no weight card at all.

**After**, added to section 2b:

> **A just-logged entry is a row in the day card, not a card of its own.**
> `02-today.html` frame 3 is authoritative for where it sits, because it is the
> sheet that draws Today. `03-quick-log.html` frame 2 is authoritative for what it
> carries: the entry, its local time, its `Queued` chip, and the Undo and Edit
> controls for as long as it sits in the queue. The day card's height does not
> grow with the number of entries logged: a write changes a row, it does not
> append one, and the card's maximum is the row count `02-today.html` draws. The
> "What happens next" card sits below the weight card, not above it. The four
> feelings are one row, as `03-quick-log.html` frame 2 draws them, never four.

**Reason.** The build put a card inside `section.card.day` that draws one row per
logged value. Six values took the day card from 223 px to 681 px and the weight
trend to 1147 px against a 715 px fold. Bounding it is required by the amended
F27, and the bound cannot be invented by a builder, because two sheets disagree
about the element being bounded. So it is settled here, where sheet
contradictions are settled, and the settlement is the one both sheets already
support: screen 02's placement, screen 03's contents.

The bound is not arbitrary. Screen 02 frame 3 draws the day card with the same
three rows whether or not anything was just logged. Screen 03 frame 2 draws six
logged values as three rows, not six, by putting energy, fatigue, hunger and
satiety on one line. The build drew six. Matching the sheets is most of the fix.

Undo and Edit are not new work under this amendment. `03-quick-log.html` frame 2
draws them, C5 already requires them, and defect 10 recorded on 2026-08-22 that
`grep -rn -i undo` over `src/` and `public/` returns zero hits.

**Section 4 is not amended, and the offline banner returns to it.** Section 4
defines the offline state as "a one-line banner under the title with the queue
count". Screen 02 frame 3 and screen 03 frame 2 both draw it neutral with the
count on the line. The build folded it into the collapsed warn notice region,
where it reads "2 things are waiting on you" and no count is readable until the
disclosure is tapped, measured false at all three viewports. That is refused on
three grounds and the ruling gives them. The offline line is not a notice: notices
are things the owner must act on and their number is unbounded, while the offline
line is one line with one number that is always true while offline and needs no
action. It goes back under the title, neutral, with the count, and its height is
bounded by construction the same way the notice region's already is.

**Author.** Architect, on the escalation ladder, after four FAILs on slice 4.

**Disclosure.** Told to the user with the slice 4 ruling. The design gains one
paragraph settling where a just-logged entry sits, and section 4's offline banner
is unchanged and goes back on screen with its count visible.

---

## A7. The demonstration yields to measurement. 2026-08-23, architect.

**Before.** `.forge/PLAN.md` slice 3: "The demo seed loads only under
`DEMO_MODE=1` and stamps every row `demo`." Nothing says what the seed does once
a real source delivers the same metric, and nothing says how a day holding both
resolves on screen.

**After.** Slice 5 gains one rule at two layers. The seed writes a metric only
while that metric has no row with `seed = false`. And a day resolves to the
measured reading when there is one: `seed = false` first, then the later
`measured_at`, then the greater `id`, in one comparator used by every site that
resolves a day or a metric.

**Reason.** `decideDedup` at `src/lib/provenance.ts:313` ranks `withings` above
`demo` and stores the real row, and it writes down the demo value it beat as
`kept_over_duplicate`. The table refuses DELETE, so the seeded row stays. And
`dailySeries` at `src/lib/trend.ts:77` resolves the day by clock alone:

    if (!held || reading.measuredAt.getTime() > held.measuredAt.getTime()) byDay.set(on, reading);

The seed writes weight at a fixed 06:52 (`src/db/demo.ts:590`). So a real
weigh-in at 06:30 loses its own column to a fabrication, silently, and takes the
7-day average, the headline, the week change, the pace and the goal delta with
it, all of which are computed off the resolved series in `weight-summary.ts`.
Equal timestamps are nondeterministic, because the comparison is strict.

The write layer and the read layer answer the same question two ways. Five sites
resolve which row stands, and only the one that wrote the answer down knows
about rank. Full reasoning in `.forge/RULING-DEMO-COLLISION.md`.

No rubric line is added, removed, softened or moved between slices. The count
stands at one hundred and sixty-six. No row is deleted and the hatch past the
append-only trigger is not widened, which is part of why this option was chosen
over any that clears the demonstration series: it is safe before slice 13 ships
backup and restore.

**Two live holes the ruling exposed, carried into slice 5's dispatch.**
`decideDedup` step 3 looks only for a row whose source DIFFERS, so two `demo`
rows on one day store as `unique`, and A1's unique index does not cover it
because demo mode has no external key. And `readFreshness` groups by
`source_record.source` while the seed writes a Withings-shaped source record
every morning, so Withings can never read stale on this install, which is F43.

**Author.** Architect, asked by the lead after slice 5's builder found the
collision and fixed only the half inside the importer.

**Disclosure.** Told to the user with the slice 5 verdict, before he connects
the scale.
