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
