# Amendments

Post-greenlight changes to the plan. Each records before, after, reason, author,
and the disclosure to the user. An amendment corrects a mis-specification or
completes a dead end. **None of these lowers a bar.** No line of `.forge/DOD.md`
has been edited since the greenlight, and the 166 lines and their thresholds
stand exactly as approved.

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
