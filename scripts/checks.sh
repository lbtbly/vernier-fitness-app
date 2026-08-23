#!/usr/bin/env bash
# PostToolUse on edits. Fast feedback only; exit 2 shows stderr to Claude.
#
# A manifest exists before its dependencies do, and a half-installed tree names
# scripts whose binaries are not there yet. That window produces "command not
# found", which is a setup state and not a defect, and blocking on it stalls the
# very install that would clear it. So: a check that RAN and found problems
# blocks. A check that could not run says so and stands down. The bar does not
# move, it just waits for its tools.
#
# AND IT RUNS ON EVERY EDIT, WHICH IS THE MOST EXPENSIVE THING IN THE HARNESS.
# A full tsc plus an uncached `eslint .` over the whole tree, per Edit or Write,
# with the failure fed back into the builder's context. A sixty-edit slice paid
# it sixty times, and a builder two edits from finishing a rename was pulled off
# to fix a state it was about to fix anyway. That is most of why building looked
# slow while the verifier looked cheap.
#
# So the gate MOVES, it does not soften. Per edit it is a throttled early
# warning: skip when the last full pass went green under DEBOUNCE seconds ago.
# Per dispatch it is absolute: runlog.sh runs this unthrottled on SubagentStop,
# before commit.sh, so a slice can never end dirty and no red tree is committed.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
# shellcheck source=lib/trees.sh
. "$HERE/lib/trees.sh" 2>/dev/null || true

# WHICH TREE. Slices 5 to 13 build in parallel git worktrees, and this hook used
# to cd to CLAUDE_PROJECT_DIR unconditionally: a builder editing a worktree got
# MAIN graded, green, on a tree it had not touched. That is the same defect as
# the lint step that was named and never defined. So the tree is read off the
# edit itself.
#
# FORGE_TREE wins, for a direct invocation that knows where it is. Otherwise the
# payload's file_path names the tree, because that is the file that just
# changed. Only when neither says anything does it fall back to the project
# directory.
TREE=""
if [ -n "${FORGE_TREE:-}" ]; then
  TREE=$FORGE_TREE
else
  INPUT=""
  [ -t 0 ] || IFS= read -r -d '' -t 2 INPUT 2>/dev/null || true
  if [ -n "$INPUT" ] && command -v python3 >/dev/null 2>&1; then
    FP=$(printf '%s' "$INPUT" | python3 -c \
      'import json,sys;d=json.load(sys.stdin).get("tool_input",{});print(d.get("file_path") or d.get("notebook_path") or "")' 2>/dev/null)
    [ -n "$FP" ] && TREE=$(forge_tree_of "$FP" 2>/dev/null || true)
  fi
fi
[ -n "$TREE" ] || TREE=${CLAUDE_PROJECT_DIR:-.}
cd "$TREE" 2>/dev/null || exit 0
# ABSOLUTE, before anything compares it. The fallback above can be ".", and a
# "." tested against the primary tree's absolute path is not equal, so main
# graded itself as a worktree and DEFERRED its own rendered check. That is this
# run's failure class committed inside the fix for this run's failure class,
# eight minutes after it was written. It was caught by running the gate both
# ways rather than the one way that worked.
TREE=$(pwd)
[ -f package.json ] || exit 0
PM=npm; [ -f pnpm-lock.yaml ] && PM=pnpm
has() { python3 -c "import json;print('$1' in json.load(open('package.json')).get('scripts',{}))" 2>/dev/null | grep -q True; }

STAMP=.forge/.checks-stamp
DEBOUNCE=${FORGE_CHECKS_DEBOUNCE:-20}
# FORGE_CHECKS_FULL=1 is the per-dispatch gate: never throttled, never skipped.
if [ "${FORGE_CHECKS_FULL:-0}" != "1" ] && [ -f "$STAMP" ]; then
  NOW=$(date +%s)
  THEN=$(cat "$STAMP" 2>/dev/null)
  case "$THEN" in ''|*[!0-9]*) THEN=0 ;; esac
  [ $(( NOW - THEN )) -lt "$DEBOUNCE" ] && exit 0
fi

RAN=0
script_of() { python3 -c "import json;print(json.load(open('package.json')).get('scripts',{}).get('$1',''))" 2>/dev/null; }
# An uncached eslint walks the whole tree on every call. --cache turns the
# second call into a diff of the first, which is the single cheapest win here.
# Only offered to a script that is actually eslint: another linter would take
# the flag as a file path and fail a check that had nothing wrong with it.
LINT_ARGS=""
case "$(script_of lint)" in
  *eslint*) LINT_ARGS="-- --cache --cache-location node_modules/.cache/eslint" ;;
esac

run() {
  # A step this file NAMES and package.json does not define is a hole in the
  # gate, not an absence to route around. `lint` was named here from slice 1 and
  # never defined, so `has lint` was false on every run of this project's life,
  # this function returned 0, and four verifications recorded "gate exit 0" for
  # a gate that ran three of its four steps. Reporting success for a check that
  # did not run is the same defect as a test that passes by not testing, which
  # this run has now hit four separate times. So it fails, and it says which one.
  if ! has "$1"; then
    echo "checks: this gate names \"$1\" and package.json defines no such script." >&2
    echo "        A step that cannot run is not a step that passed. Define it or" >&2
    echo "        stop naming it here; there is no third answer." >&2
    return 2
  fi
  # shellcheck disable=SC2086
  if OUT=$($PM run -s "$1" $2 2>&1); then
    RAN=$(( RAN + 1 ))
    # The roster, printed by the gate that ran it, so "gate exit 0" in a
    # verification's evidence names its steps instead of implying them. Only on
    # the per-dispatch run: the per-edit one is a hook and says nothing when it
    # is happy.
    [ "${FORGE_CHECKS_FULL:-0}" = "1" ] && echo "checks: $1 ran and passed"
    return 0
  fi
  RC=$?
  # Ask the PROCESS, not the prose. 127 is the shell's "binary not found",
  # which is what a half-installed tree produces; a check that ran and failed
  # exits 1. The message cannot carry this distinction: "Cannot find module" is
  # the literal wording of TS2307, the most common real TypeScript error there
  # is, and it is exactly what a builder importing a not-yet-created file
  # produces. Reading that as "tooling missing" turns the gate off at the
  # moment it matters most.
  if [ "$RC" -eq 127 ] || [ ! -d node_modules ]; then
    echo "checks: $1 could not run, its tooling is not installed yet" >&2
    return 0
  fi
  echo "$1 failed:" >&2
  printf '%s\n' "$OUT" | tail -20 >&2
  return 2
}

run typecheck || exit 2
run lint "$LINT_ARGS" || exit 2

# C6, both halves. Neither check was wired into anything for three
# verifications: package.json named them, nothing called them, and every string
# defect this project has had was found by a person running a command by hand.
# A rubric line whose check never runs in the gate is a line the gate does not
# hold.
#
# `strings` reads source, needs no stack and answers in a second, so it joins
# the per-edit run. `strings:rendered` launches WebKit against the live app and
# takes about a minute, so it joins the per-dispatch gate only. Neither rules
# alone; the union is what closes the line.
run strings || exit 2

# And the copy the service worker answers with, which no import can reach.
# public/sw.js is generated from the catalogue by scripts/build-sw.mjs, so a
# string edited in strings.ts and not written through leaves the worker saying
# yesterday's words to a phone with no signal. Cheap, no stack, runs per edit.
run sw:check || exit 2

# R2, and it is here because slice 7 found it the way this run finds everything:
# `compliance` was defined in package.json and called by nothing. That is the
# same defect as `strings`, which was defined and never called for three
# verifications and cost five, and as `lint`, which this file NAMED and
# package.json never defined. Three instances of one shape in one project.
#
# It walks every laboratory explanation template against a banned-phrase list
# and checks docs/product.md makes its five required claims. It needs no stack,
# no browser and no container and answers in well under a second, so it belongs
# in the per-edit run rather than only in the per-dispatch one. A regulatory
# line whose check runs once a day is a regulatory line nobody is holding.
run compliance || exit 2

# The stylesheet's structure, which no other step in this gate can see.
#
# A merge splice tore a rule in half and about seventy rules shipped nested
# under a selector that never matched. typecheck and lint do not read CSS, the
# two string checks read words rather than shape, and the build compiled it
# happily because nesting is valid and a dead rule is not an error. A brace
# count would have missed it too: comments and content strings carry braces, so
# the torn file counted balanced.
#
# It reads one file with no stack and no browser, so it belongs in the per-edit
# run beside strings and sw:check.
run css:check || exit 2

if [ "${FORGE_CHECKS_FULL:-0}" = "1" ]; then
  # strings:rendered launches a browser at the LIVE ORIGIN, and the live origin
  # serves the primary tree. Run from a worktree it would grade main's shipped
  # copy and report the answer as this tree's, which is the exact shape of every
  # check-that-passes-by-not-checking this run has hit. It does not run here.
  #
  # It is DEFERRED, not waived, and the deferral is written down where the merge
  # has to walk over it: scripts/worktree.sh refuses to close a slice whose
  # marker is still present, and clears it only after the check has run on main
  # with that slice merged in. A line is ticked by a verifier on main, after
  # that, and never from inside a worktree.
  if ! forge_is_primary "$TREE" 2>/dev/null; then
    mkdir -p .forge 2>/dev/null
    printf '%s | strings:rendered deferred to merge, tree %s\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TREE" >> .forge/.rendered-deferred 2>/dev/null
    echo "checks: strings:rendered DEFERRED. This is a worktree and the live origin" >&2
    echo "        serves main, so running it here would grade the wrong tree." >&2
    # COUNTED, not asserted. This line said "four checks ran, not five" as a
    # literal, and stayed saying it after `compliance` became the fifth. A gate
    # that hardcodes how many steps it has is a gate that will one day report a
    # number it did not run, which is the whole class this file exists to close.
    echo "        $RAN of ${RAN}+1 ran; strings:rendered is the one that did not." >&2
    echo "        Recorded in .forge/.rendered-deferred; the merge runs it on main" >&2
    echo "        before this slice can be verified." >&2
    [ -d .forge ] && date +%s > "$STAMP" 2>/dev/null
    exit 0
  fi
  # A missing stack FAILS here, and does not stand down.
  #
  # The rule above, that a check which could not run says so and steps aside, is
  # right for a binary that is not installed yet and wrong for this. An app that
  # does not answer is exactly the state in which the closed-world string check
  # would have found something, and passing the gate because the product was not
  # running is the same mistake as passing it because the database was empty.
  if ! curl -fsS --max-time 5 http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    echo "checks: strings:rendered needs the stack, and 127.0.0.1:3000 does not answer." >&2
    echo "        Bring it up with scripts/up.sh. A missing stack is not a pass." >&2
    exit 2
  fi
  run strings:rendered || exit 2
fi

# Green. Stamp it, so the next few edits inside the debounce window cost
# nothing. A red pass leaves the stamp alone: a broken tree is re-checked on
# every edit until it is not broken, which is when the feedback is worth
# paying for.
[ -d .forge ] && date +%s > "$STAMP" 2>/dev/null
exit 0
