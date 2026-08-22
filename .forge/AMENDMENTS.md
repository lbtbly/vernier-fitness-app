# Amendments

Post-greenlight changes to the plan. Each records before, after, reason, author,
and the disclosure to the user. An amendment corrects a mis-specification or
completes a dead end. **None of these lowers a bar.**

A1 through A3 changed the plan and left the rubric untouched. **A4 is the first
amendment to reach `.forge/DOD.md`.** It rewrites one line, C6, and adds two
standing rules about how evidence is read. The count stands at 166, no line was
added or removed, no threshold moved, and every clause A4 touches came out
tighter than it went in.

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
