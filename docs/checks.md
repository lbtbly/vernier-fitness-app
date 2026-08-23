# The checks, and the state they need

Two string checks guard C6, and neither one closes it alone. The union does.
Both run from the gate now, which is the part that was missing: for three
verifications `scripts/checks.sh` ran typecheck and lint and nothing else, so
every string defect this project has had was found by a person typing a command
by hand.

## The two checks

`npm run strings` reads the source. It prints the inventory, one line per key,
then parses every `.ts` and `.tsx` under `src/`, all of it, and fails on copy
written inline: a JSX text node, a spoken attribute, a literal in the `error` or
`detail` position of `refuse()`, a string shaped like language rather than
notation, or a `content:` declaration painting words from a stylesheet. It
walked four named directories once and the root of `src/` was in none of them,
which is where the middleware refusal shipped from, so there is no list of
directories any more. What is still outside the walk is printed on every run.
It needs no stack and answers in a second, so it runs on every edit.

`npm run strings:rendered` reads the screen. It walks the shipped product in
fifty states through WebKit, reads every fragment a person can see or hear
including what `content` paints on a `::before` or an `::after`, and asserts
each one resolves to a catalogue key, a value the owner or a device wrote into a
column, a value shape, or text WebKit itself produced in that run. It needs a
live stack and about a minute, so it runs once per dispatch.

Neither is complete on its own and the limits are written at the head of each
file rather than discovered later.

## Three things that are never an excuse

**Position.** `<code>`, `<kbd>`, `<samp>` and `<pre>` used to exempt any kebab,
snake or dotted run inside them, so `<code>sign-in</code>` from a helper
rendered at 45 px and both checks passed. Where a fragment landed says nothing
about who wrote it. There is no element exemption in either checker.

**A column.** The rendered check builds its data vocabulary `where not seed`.
The demonstration seed is the product writing, and reading its words back out of
`source_record.reference` excused `page 2, row 7` and `quick-log`, both composed
in `src/db/demo.ts` and both painted on a source screen with no key. The seed's
own words are catalogue keys.

**A marker.** A fragment marked `data-authored="platform"` is excused only when
WebKit produced that exact string in the same run. Mark a node and echo a
harvested string and both halves hold, which is a real defeat, so the same run
reads the shipped tree and fails any literal equal to a message the browser
handed it. The product never writes the browser's words down.

## The state the rendered check needs

It reads its list of surfaces out of the database: one `/value/[id]` per stored
row, one `/source/[id]` per source record. An empty database therefore narrows
the walk to nothing, and a green over nothing reads exactly like a green over
everything. So it asserts a floor first and refuses to run below it: at least
one stored value, at least one source record, at least one rating, and at least
one stored value standing in for each of the six permitted sources.

One command produces that state on a scratch database, without touching the
owner's installation:

```
DEMO_MODE=1 bash scripts/test-stack.sh reset
```

On the live stack the same state comes from `DEMO_MODE=1`, and it comes from the
bring-up rather than from a shell. `scripts/up.sh` runs
`node scripts/gen-env.mjs --settings` first, which adds any setting the owner's
environment file does not carry and leaves every key it already has alone. Ask
the running container what it got, never the file:

```
docker compose exec -T app printenv DEMO_MODE
```

It failed twice before that. The setting was named nowhere at all, and then it
was named only in `.env.example`, which is documentation: the owner's own file
had no `DEMO_MODE` line, `compose.yaml` reads `${DEMO_MODE:-0}`, and the default
won while `APP_URL`, `APP_NAME`, `WEBAUTHN_RP_ID` and `TZ` resolved correctly
from that same file. A clean `bash scripts/up.sh` brought Vernier up empty and
the walk passed over nothing.

## The gate

`scripts/checks.sh` runs typecheck, lint and `strings` on every edit, throttled
by a debounce window. With `FORGE_CHECKS_FULL=1` it runs unthrottled and adds
`strings:rendered`.

In the full run, a missing stack is a failure and not a stand-down. The usual
rule in that script is that a check which could not run says so and steps aside,
because a half-installed tree produces "command not found" and blocking on it
stalls the install that would clear it. That rule is right for a missing binary
and wrong for a missing stack: an unreachable app is exactly the state in which
this check would have found something.

## The compliance check, added in slice 7

`npm run compliance` is the third checker and it guards R2 rather than C6. It
renders every laboratory explanation the shipped code can produce, for every
analyte in the catalogue, and scans the result against a banned-phrase list
covering assessment of the reader, clinical instruction and urgency. One match
fails the run.

It grades the shipped renderer. `renderExplanation` in `src/lib/labs.ts` is the
function the screens call, and the script calls that same function with the same
catalogue subtree from `src/lib/strings.ts`. It does not read the templates as
text and it does not re-implement the wording: it renders them, the way a person
reads them, and scans the result. A checker that grades its own paraphrase of
the code is instance number two of this run's failure class.

Four other things it does, each one a lesson this run has already paid for:

- It prints the population it walked on every run, and it FAILS if the catalogue
  holds fewer analytes than the rubric names. A clean walk over an empty
  catalogue reads exactly like a clean walk over a full one.
- It asserts the positive half, by structure rather than by keyword: every
  explanation states a general reference range, names the laboratory's own
  interval as the one that belongs with the number, says the product stores
  rather than reads, invites a professional, and cites a public source with a
  URL. A banned-phrase list alone can only prove the absence of a fourth thing.
- It reads `docs/product.md` and fails if the intended-purpose statement stops
  making any of its five required claims.
- It carries four sentences that MUST be caught and fails if any of them comes
  back clean, so the check is watched refusing something on every single run.
  The same four are in `tests/unit/compliance.test.ts`.

It found something on the day it was written. `strings.labs.trendsNote` read
"One trend per analyte you have stored", and `you have` is on the list because
it is how a sentence starts telling somebody what is wrong with them. The phrase
was innocent and the rule is right to be blunt about it, so the copy moved
rather than the rule.

**It needs wiring into `scripts/checks.sh` on merge.** It was written in the
slice-7 worktree, where `scripts/checks.sh` is shared by five parallel builders
and by main's gate, so it is defined in `package.json` and called by nothing yet.
It belongs beside `strings` and `sw:check` in the per-edit run: it needs no
stack, no browser and no container, and it answers in well under a second.
