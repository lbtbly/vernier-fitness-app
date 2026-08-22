# The checks, and the state they need

Two string checks guard C6, and neither one closes it alone. The union does.
Both run from the gate now, which is the part that was missing: for three
verifications `scripts/checks.sh` ran typecheck and lint and nothing else, so
every string defect this project has had was found by a person typing a command
by hand.

## The two checks

`npm run strings` reads the source. It prints the inventory, one line per key,
then parses every `.ts` and `.tsx` under `src/app`, `src/components`, `src/lib`
and `src/db` and fails on copy written inline: a JSX text node, a spoken
attribute, a literal in the `error` or `detail` position of `refuse()`, or a
string shaped like language rather than notation anywhere in those trees. It
needs no stack and answers in a second, so it runs on every edit.

`npm run strings:rendered` reads the screen. It walks the shipped product in
fifty states through WebKit, reads every fragment a person can see or hear, and
asserts each one resolves to a catalogue key, a value out of a column, a value
shape, or text WebKit itself produced. It needs a live stack and about a minute,
so it runs once per dispatch.

Neither is complete on its own and the limits are written at the head of each
file rather than discovered later.

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

On the live stack the same state comes from `DEMO_MODE=1`, which is named in
`.env.example` and defaults to 1 there. It was named nowhere at all until
2026-08-22, so `scripts/up.sh` from a clean shell brought Vernier up empty and
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
