# Ruling, slice 4

Architect, 2026-08-22, on the escalation ladder, after four failed verifications
on F27 and its neighbours. Forty of 166 lines were checked when this began;
thirty-eight are checked when it ends, because two lines lost a tick they had not
earned.

**The verdict in one line: the line was wrong and the build is not done, and both
have to be said, because fixing either alone leaves the next round to fail.**

Everything below is written against `.forge/DOD.md`, `.forge/DESIGN.md` sections
2b, 3 and 4, `.forge/wireframes/02-today.html` and `03-quick-log.html`,
`.forge/PLAN.md` slice 4, `.forge/DEFECTS.md` entries 42 to 66, and the
verifier's four transcripts under `.forge/evidence/slice-4/`.

What changed, in full, is listed at the end under "What I changed".

---

## Question 1. Is F27 measurable as written?

**No. Amended, in `.forge/AMENDMENTS.md` A5.**

### The fault

F27 fixed a budget, 715 px, over a sum, and enumerated five of the addends.
Everything drawn above the weight trend spends that budget. Five things were
named. So the line's truth was never a property of the shipped product; it was a
property of the row counts on the day the capture was taken.

Four verifications found four different unnamed addends, and the shape repeats
exactly:

| Round | The addend that grew | Where the trend ended |
|---|---|---|
| 1 | none: the fold was bought by shrinking tokens and dropping screen 02's adherence pills and its tone sentence | 700 |
| 2 | a second stale line, one source quiet past 36 hours | 742 |
| 3 | a second banner, one open import question | 758 |
| 4 | the just-logged card, one row per logged value, day card 223 to 681 | 1147 |

Each fix bounded the element in front of it and the next element grew. That is
not a builder failing four times at the same task. That is a line whose set is
open, and an open set cannot be closed by bounding its members one at a time,
because there is always another member.

### The direct answer to the question as put

*Can a screen whose content grows with the owner's own data satisfy a fixed-height
clause?*

Yes, on one condition, and the condition is the amendment. Every element that can
render inside the boundary must carry a maximum height fixed **by construction**
rather than by a count of rows: a fixed row count, a clamped line count, a
collapsed region with a constant closed height. Then the sum of the maxima is a
number, the number is compared to the budget once, and the clause is true of the
product rather than of the seed.

If any element above the trend takes its height from a count the data supplies,
the clause is satisfiable on some data and unsatisfiable on other data, and a
capture proves what the database held that afternoon. Defect 50 already made the
same point from the other end: the demonstration seed's dates are anchored to its
first run, so in a week this install has an eight-day trailing gap and the cards
the fold measurement rests on collapse into an empty state. Evidence that is not
reproducible tomorrow is not evidence.

### Why the set is still open going forward, which is the case for amending

The rubric itself is what opens it. **F55** puts the last successful ingest time
on Today in slice 6. **F133** puts one persistent in-app banner on Today per
failed scheduled job, archive run and integration in slice 13, which is three
more. A fifth and a sixth round of exactly this failure are already written into
the plan, and no per-element bound written today reaches them.

Only a boundedness clause does. That is the tightening: it governs elements no
line has been written for yet.

### Why adherence leaves the fold set

Because three approved artifacts put it below the fold and one rubric line put it
above, and the odd one out is the rubric line.

- `.forge/DESIGN.md` section 3, the layout constants that bind every screen:
  "Usable height above the fold is 715 px, and **Today's session row plus the
  weight trend** must both fit inside it."
- `.forge/DESIGN.md` line 75, the screen table: screen 02 "answers what do I do
  today and is my health improving, above the fold, with the trend leading and
  the stale sync named."
- `.forge/wireframes/02-today.html` frame 1, its own caption: "**Scrolls past the
  fold to adherence**, body signals and the last panel."

Nothing in `.forge/GOAL.md` or `.forge/BRIEF.md` asks for adherence above the
fold. The clause originated with me at plan time and it exceeds the design it
grades. That is a specification defect, and it is the ground an amendment is
permitted on.

It is replaced, not dropped. The new line says **adherence is never drawn above
the weight trend**, which is checkable, is the position screen 02 draws, and
forecloses the move the build actually made. The shipped Today hoists
`section.card adherence` above `section.card data-card=weight` — visible in the
verifier's own dumps at `reverify3/f27-anchors-both-engines.txt` and
`verify4/f27-what-still-grows.txt` — because under the old wording that reorder
was the cheapest way to pass. Under the new wording it is a FAIL.

### What the old clause cost, which is the rest of the case

Every one of F27's four rounds was paid out of another approved artifact:

1. Global design tokens shrunk, screen 02's adherence pills and its tone sentence
   dropped, to reach 700 px. Reverted.
2. Card gap taken from 12 px to a literal 8 px **globally**, silently changing
   screens 01 and 03, which C4 and C5 are ticked against. Defect 43. Reverted.
3. The same compression re-applied scoped to `.today`, **where it still ships**:
   card padding `8px 16px` and card margin-bottom `8px` against the 16 px and
   12 px section 3 fixes, leaking into the quick-log sheet because the sheet
   renders inside `div.today`. Defect 52, and it is why C5 is still open.
4. The adherence card hoisted above the weight card. Undeclared, unruled, still
   shipping.
5. The offline queue count folded behind a disclosure to bound the notice region,
   which is what failed C5 and F24. Defect 62, and question 2.

A line that can only be met by breaking other lines is mis-specified. The new
wording makes the borrowing itself a FAIL: *"The 715 is met at the card padding
and the card gap DESIGN.md section 3 fixes, measured on the shipped screen: a
fold bought by compressing them is a FAIL."* The old line had no such clause,
which is why five rounds of borrowing were rational play.

### That it comes out tighter, clause by clause

| | Before | After |
|---|---|---|
| Boundary | 715 px | 715 px, unchanged |
| Viewport | 393x852 | 393x852, unchanged |
| Scrolling | none | none, unchanged |
| Elements | 5 named | 4 named, plus adherence constrained by position |
| States | unstated, so one | every state the data can produce, five named in the evidence |
| Engines | unstated, so one | both |
| Elements above the trend | ungoverned | maximum fixed by construction, stated as a number |
| That maximum | unmeasured | measured at its smallest and its largest count |
| The sum | never taken | taken, and must fall inside 715 |
| Card geometry | ungoverned | section 3's values, and a squeezed fold is a FAIL |
| Later slices | re-argued each time | governed in advance |

One clause left the line. Nine entered. No threshold moved and the count stands
at 166.

### It is buildable, and here is the arithmetic

Off the verifier's own layout dump at 393x852: header 57, notice region 46, day
card 223, adherence 174, weight card opening at 532, the trend ending at 689
against the 715 fold. **Twenty-six pixels of slack**, which is why every round
died.

Move adherence below the weight card, where screen 02 draws it, and 182 px come
back. The trend ends near 507. That pays for:

- restoring section 3's card padding and card gap on Today, roughly 90 px;
- the offline banner returning as its own line, 46 px plus its 12 px margin;

and still leaves better than 100 px under the fold, into which slice 6's ingest
line and slice 13's failure banners go through the bounded notice region at no
additional height, because that region is already proven constant at 46 px from 1
to 999999 notices in both engines.

The 26 px of slack was the whole problem. The fix returns 182.

### The build is also not done, and this is what has to change

The amendment does not close slice 4. Four things do.

1. **The day card is bounded by construction.** A write changes a row; it does
   not append one. Its maximum is the row count screen 02 frame 3 draws. The four
   feelings are one row, as screen 03 frame 2 draws them, never four. See A6:
   this needed a design ruling because two approved sheets disagreed, and a
   builder may not improvise taste.
2. **Adherence returns below the weight card**, restoring screen 02's order.
3. **Today's cards return to 16 px padding and 12 px gap.** The `.today`
   compression goes, which also takes defect 52 with it and unblocks C5.
4. **The offline banner returns to section 4's definition.** Question 2.

---

## Question 2. The queue count against the bounded fold

**Ruled: the count survives, section 4 is not amended, and F27's governed set was
never the problem. The adherence clause was.**

### The conflict, stated exactly

The builder folded the offline queue count into the collapsed notices region,
which is what bounded it. With one quiet source, which is this install's permanent
state, Today offline reads **"2 things are waiting on you"** in warn treatment,
and the queue count is readable only after one tap on the disclosure. Measured
false at 393, 768 and 1280, true after the tap, in
`verify4/f24-c5-queue-count-three-viewports.txt`.

Against that:

- `.forge/DESIGN.md` section 4: the offline state is "a one-line banner under the
  title **with the queue count**."
- `03-quick-log.html` frame 2: a neutral banner, "**Offline.** 3 entries saved on
  this phone."
- `02-today.html` frame 3: a neutral banner, "**Offline.** 2 entries saved on this
  phone. They upload when the Mac mini is reachable." Note that screen 02 frame 1
  draws the *stale source* banner in warn, `.banner.w`, and the offline banner in
  neutral, `.banner`. The design distinguishes them and the build merged them.
- F24: the write "shows a queued marker **and the queue count**."

### The ruling

**The offline line is not a notice, and it does not go in the notice region.**

That is the whole resolution and it is a distinction the design already draws. A
notice is something the owner must act on and their number is unbounded: stale
sources, open import questions, and later F55's ingest line and F133's failure
banners. Collapsing those behind one bounded summary is correct and the build's
bounded region is good work that stays.

An offline queue is none of that. It is one line with one number, always true
while offline, needing no action, clearing itself. It goes back under the title,
neutral, with the count on it, exactly as section 4 and both sheets draw it. Its
height is bounded by construction the same way the notice region's is: one line,
one number, at any count.

The merge is refused on three separate grounds, any one of which is sufficient:

1. **Colour.** DESIGN.md section 5 rule 3: "`--warn` means something needs
   attention or is out of date." A queue that uploads itself needs no attention.
   Both sheets draw it neutral. Painting it warn tells the owner something is
   wrong when nothing is, and that is the failure the panel named about this
   product specifically.
2. **The number.** Section 4 requires it on the line and F24 requires it visible.
   A count behind a tap is not shown.
3. **The copy.** "2 things are waiting on you" is not true. They are waiting on
   the network. The standards skill forbids invented urgency, and this sentence
   invents it in the one place the product had promised not to.

The panel's finding is satisfied literally: the owner sees that something of his
is unsent without hunting for it, on the line, with the number, in the treatment
that says "this is fine".

### Where the height comes from

This is why the two questions are one question. Under the old F27, adherence
occupied 182 px above the trend and there were 26 px of slack, so a 58 px banner
could not exist and the count had to be hidden. Under the amended F27 adherence
sits below the trend, the 182 px come back, and the banner costs 58 of them.

**Nothing had to be given up.** The conflict was not between section 4 and a
bounded fold. It was between section 4 and the adherence clause, and the
adherence clause was the one the design never contained.

Section 4 stands unamended. F27's governed set does not exclude the offline
banner; the banner is above the trend, so it is bounded by construction like
everything else there, and its maximum is one line at any count, which the builder
measures at 1 and at 999999 queued entries the way the notice region was measured.

---

## Question 3a. F23's first-ever waist

**F23's defect. Not a design gap, not out of scope. No amendment. F23 un-ticked
and assigned to the slice 4 re-dispatch.**

The premise of the question is the part to correct: **screen 03 does say what a
first entry should do.** `03-quick-log.html` frame 3, captioned "Reach and first
use", is exactly this state and draws three things:

- a dashed empty card, "**No waist measurement yet.** Tape at the navel,
  standing, breathing out. Same spot each time matters more than the exact
  number.";
- the stepper's value as `<div class="metric mut">-- <small>cm</small></div>` —
  the muted placeholder, **not a number, and specifically not zero**;
- the footer, "Fill what you have. **Blank fields stay blank, they are not stored
  as zero.**"

The build ships a stepper that steps from zero. That is the one thing the sheet
draws against. So this is not a decision anyone owes the builder; it is a screen
the builder did not match, and it lands on two lines:

- **C5**, which requires the quick log to match screen 03. It is already open and
  this joins its list: the `--` value, the "No waist measurement yet" card and its
  instruction sentence all ship nowhere.
- **F23**, whose "six taps or fewer" is answered with 60 taps to the 30 cm floor
  and 197 to 99.0 on any install with no prior waist. Proven by the verifier on a
  scratch instance with zero rows, `verify4/f24-first-entry-refused-393.png`,
  defect 64.

**F23 is measurable as written and is not amended**, and the test that separates
it from F27 is worth stating because it is the test the sweep in A5 uses: *could
some build satisfy this line in every state the product can reach, without
breaking another approved line?* F23 passes — a build that draws what screen 03
frame 3 draws commits in six taps from `--`, breaking nothing. F27 failed — its
adherence clause could only be met by breaking C7. A line that passes the test and
fails in the build is a build defect. A line that fails the test is mis-specified.

**F23 is un-ticked.** It was marked on the owner's install, which has waist
history. A reachable state of the shipped product answers its clause with 60 taps.
A line with a live counterexample has no honest evidence, and this is the F20
precedent from slice 3, where the literal evidence existed and the product's own
path gave a different answer.

**One fix closes three things.** Defect 60 records that offline, with the snapshot
read failing, the stepper has no base and one tap queues a waist of 0.5 cm, which
the just-logged card reports as safe when the flush will certainly refuse it
against the 30-250 cm band. Same root cause: the stepper treats "no value" as
zero. Draw `--`, keep blank fields blank, and F23's tap count, C5's screen match
and F24's false reassurance all resolve together.

Assigned to the slice 4 re-dispatch rather than to the final pass. The re-dispatch
is already inside the quick-log sheet for C5 and F24, and the surface is open.

---

## Question 3b. F34's vacuous assertion

**Confirmed on the verdict, corrected on the classification.**

The fact is as reported. `tests/e2e/trend-scratch.spec.ts:167` reads
`expect(await page.locator('[data-notices]').count()).toBe(0)` on `/health`, and
`NoticeRegion` is rendered only by `src/app/(shell)/page.tsx`. The count is 0
whatever the staleness is. The assertion cannot fail. Its own comment says so:
"Health draws none of its own and draws none of this either."

**F34 stands ticked.** The verifier's reasoning is right and I re-checked the
neighbourhood rather than taking it: line 164, `.src.stale` count 0 on `/health`
at 35 hours, is a real assertion on a page that does render source chips, and it
is what carries F34's clearing clause. Every clause F34 states is carried by an
assertion that can fail. The line is not weakened and does not lose its tick.

**The correction is what to call it.** Not dead weight. It is an instance of the
class A4's first standing rule names: *a zero is evidence only beside the
population it covered.* A count of zero on a page that cannot render the subject
is a zero over an empty population, and it reads identically to a real check —
which is the exact property that makes it dangerous. A4 wrote that rule about
evidence. A spec assertion becomes evidence the moment the run prints it, so the
rule reaches it, and calling this dead weight understates it by one category.

Two actions, neither a rubric change:

1. **Delete line 167 or move it to Today**, where the region renders and where the
   assertion can fail.
2. **Sweep the suite for the class**, which A4 requires whenever one line reveals
   one: any assertion of a zero count, a not-visible, or an empty array on a
   surface that cannot render the subject. My own read gives three to start from
   and they are only a start: `quick-log.spec.ts:406`, `quick-log.spec.ts:850`,
   `passkey.spec.ts:77`. Each is either a real check or the same hollow one, and
   the sweep says which, in writing, per assertion.

Eleven more slices of coverage get built on this suite. A hollow assertion costs
nothing to write and cannot be distinguished from a real one by reading a green
run, which is how it survives to the final pass.

---

## What I changed

**`.forge/DOD.md`.** Four edits. The count stands at **166**, no line added, none
removed, no threshold moved.

1. **F27 rewritten.** A5 part 1. Before and after in full there.
2. **C15 rewritten.** A5 part 3, the sweep for F27's fault. "Readable end to end
   in four seconds" over a row list of unbounded length could not be satisfied by
   any build at forty rows; screen 11 frame 3 draws what the four seconds is
   actually for, "Counts first, list second, reasons third". The four seconds now
   has to be proven at the largest diff the confirm screen can produce as well as
   at a two-row diff, and the row list has to state its own length before it is
   scrolled. Tighter on both halves.
3. **A third standing rule** added under "How evidence is read", binding on all
   166: *a fixed budget binds only over a closed set.* This is the sweep made
   permanent, so slices 5 to 14 do not re-argue it.
4. **Two ticks removed**, which is the verifier's ledger and not the rubric:
   - **F23**, above.
   - **C7**, because Today does not match screen 02 in two respects the C7 spec
     never looked at, having counted accented actions and origin-chip colours: the
     adherence card ships above the weight card where screen 02 draws it below,
     and `.today` computes card padding `8px 16px` and margin-bottom `8px` against
     section 3's 16 px and 12 px. Both departures exist only to pay the old F27
     and both become unnecessary under the new one. This is A4's second standing
     rule applied to a screen line: the evidence proved less than the line says.

**`.forge/AMENDMENTS.md`.** Two amendments, each with before, after, reason,
author and disclosure.

- **A5**, the rubric: F27, the sweep, C15, the third standing rule, and the two
  verification-state corrections recorded as not-amendments.
- **A6**, the design: where a just-logged entry lives on Today, settled in
  DESIGN.md section 2b, which is the section that settles contradictions between
  sheets. Screen 02 frame 3 is authoritative for placement, a row in the day card;
  screen 03 frame 2 is authoritative for contents, the entry, its time, its
  `Queued` chip, Undo and Edit. The day card does not grow with what was logged.
  The four feelings are one row, never four. Section 4 is untouched and the
  offline banner goes back to it.

**`.forge/DESIGN.md`.** One paragraph added to section 2b, per A6, plus the
sentence that an offline queue is not a notice and is never drawn in `--warn`.

**`.forge/PLAN.md`.** Slice 4 revised.

- Its fold paragraph now states the amended F27 rather than the old one.
- **C9 moved from slice 4 to slice 8.** C9 names four surfaces and one is the
  session player, which slice 8 builds, so it could not close in slice 4 and the
  verifier correctly refused to pass it on a partial walk, twice. The Closes lists
  still partition DOD.md exactly: slice 4 closes eleven lines, slice 8 closes
  fourteen. Slice 8's paragraph also picks up the verifier's narrowing, that the
  quick-log surface must be walked as a write and not only as an open-and-close.
- The three slice 3 lines this slice regressed, C5, F24 and F23, are named in
  slice 4's prose as repairs without moving into its Closes list, because they
  belong to slice 3's contract and a line is closed once.

**Not changed.** `.forge/DESIGN.md` section 4. `.forge/PREFLIGHT.md`. Every other
rubric line, threshold and tick. No product code was written; nothing outside
`.forge/` was touched.

---

## What the re-dispatch has to produce

In order, because the first one is what makes the rest fit.

1. Adherence below the weight card. Screen 02's order restored.
2. `.today`'s card compression deleted. 16 px padding, 12 px gap, and the
   quick-log sheet stops inheriting it, which is defect 52 and C5.
3. The day card bounded per A6: a write changes a row, the four feelings are one
   row, Undo and Edit ship, and the card's maximum height is a stated number.
4. The offline banner back under the title: neutral, one line, with the count,
   screen 02 frame 3's own copy. F24 and C5.
5. The waist stepper starts at `--`, with screen 03 frame 3's empty card and its
   instruction sentence. F23, C5, and defect 60's false reassurance.
6. `trend-scratch.spec.ts:167` deleted or moved, and the suite swept for the class.
7. F27's evidence: both engines, five states, per-element maxima at their
   extremes, the sum, and the two measured card values.

Three of those seven are the fold. Four are lines the fold broke on its way past
them. That ratio is the finding.
