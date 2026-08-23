# Process changes, 2026-08-23

Set by the owner after slice 4. **The bar is unchanged and is not negotiable:**
166 lines, PASS at one hundred percent, no line softened, amendments only ever
tighter. That is where the value has come from. What changes is the process
around it, which had grown heavier than the bar requires.

## 1. Scoped re-verify. Never re-rule a ticked line.

A re-verify after a FAIL rules **exactly three things**: the defect list, the
slice's own `Closes:` ids, and any line still `- [ ]`. Nothing else.

A line already `[x]` is not re-ruled, not "re-confirmed because the fix touched
code underneath it", and not swept for regression line by line. The suite and
the gate carry regression between slices; **the final full-scope verification
before ship proves all 166 again on the finished product**, which is where one
hundred percent is established, once, end to end.

This is forge's own rule. The lead drifted from it by adding "these ticked lines
sit under changed code, re-confirm them" to dispatch after dispatch, and that
drift is most of the wall-clock this run has spent.

If a fix genuinely breaks a proven line, the gate, the suite, or the final pass
catches it. That is what they are for.

## 2. Parallelize independent slices.

Slices 5 to 13 are largely independent: Withings, Apple Health ingest, blood
tests, training, nutrition, HelloFresh and Uber Eats, Google Calendar, push and
email, backup and restore. Build them in parallel in git worktrees rather than
one at a time.

Rules that make it safe:
- One builder per worktree, never two agents in one tree.
- Slices sharing a file merge in sequence, and the second rebases.
- Every slice still gets its own verifier dispatch and its own verdict.
- Migrations are numbered on merge, not in the worktree, so two slices cannot
  both claim `0007`.

## 3. One verdict line per slice.

The owner gets a verdict, not a narration: the slice, PASS or FAIL, the count,
and only what needs his hand or changes his decisions. No blow-by-blow of what
each agent found interesting.

Exceptions that still get reported in full, because they are his to decide:
- Anything touching his real data.
- Anything he must do himself, and its ordering if that matters.
- Any amendment to the rubric, with before, after and reason.
- Any defect class worth carrying, stated once, not per instance.

## 4. What does not change

The rubric. The gate. The verifier being the only seat that ticks a box. The
escalation ladder. Evidence over assertion. The refusal to soften a line to
reach PASS. Parking a blocked line with a written reason rather than passing it.
