#!/usr/bin/env bash
# SubagentStop journal. Append-only black box.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
INPUT=$(cat)
AGENT=$(printf '%s' "$INPUT" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("agent_type") or d.get("agent_id") or "agent")' 2>/dev/null)
# The log records stops and nothing else: no starts, no durations, no phase.
# "Does the harness spend longer verifying than building" then costs a forensic
# reconstruction over three and a half thousand events, which is a question a
# run should be able to answer at a glance. The elapsed time since the previous
# stop turns the stream into a measurement.
NOW=$(date +%s)
LASTF=.forge/.runlog-last
PREV=$(cat "$LASTF" 2>/dev/null)
case "$PREV" in ''|*[!0-9]*) PREV=$NOW ;; esac
ELAPSED=$(( NOW - PREV ))
[ "$ELAPSED" -lt 0 ] && ELAPSED=0
printf '%s\n' "$NOW" > "$LASTF" 2>/dev/null
printf '%s | %s | stopped | %ss\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${AGENT:-agent}" "$ELAPSED" >> .forge/RUNLOG.md

# The per-dispatch gate. checks.sh throttles itself on PostToolUse so a builder
# mid-refactor is not pulled off every edit; here it runs unthrottled, so a
# slice can never END dirty without the log saying so. The bar did not move: it
# is enforced once per dispatch instead of once per keystroke.
#
# A red result does NOT block the checkpoint. Rule 5 says work that is not
# committed does not exist, and a builder whose typecheck is red mid-slice is
# exactly the one who must not lose an hour to a crash. So the commit happens
# and carries the word, and the log carries it too.
#
# EVERY TREE, not just this one. Slices 5 to 13 build in parallel worktrees and
# a SubagentStop payload does not say which tree the subagent was in. Rather
# than guess, gate and checkpoint all of them: a stop is the natural boundary
# for whichever builder just finished, and the trees that did not change cost a
# clean `git status` each. Gating only main was reporting green for work it had
# never read.
# shellcheck source=lib/trees.sh
. "$HERE/lib/trees.sh" 2>/dev/null || true
PRIMARY=$(forge_primary_tree 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-.}")
TREES=$(forge_trees 2>/dev/null)
[ -n "$TREES" ] || TREES=$PRIMARY

CHECKS=ok
for T in $TREES; do
  [ -d "$T" ] || continue
  TC=ok
  FORGE_TREE="$T" FORGE_CHECKS_FULL=1 "$HERE/checks.sh" </dev/null >/dev/null 2>&1 || TC=red
  if [ "$TC" = red ]; then
    CHECKS=red
    printf '%s | checks | red | %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$T" >> "$PRIMARY/.forge/RUNLOG.md"
  fi
done

command -v node >/dev/null 2>&1 && node "$HERE/progress.mjs" >/dev/null 2>&1
# Throttled safety commit. A subagent finishing is the most frequent natural
# boundary in a run; run one had 1126 of them, so this must never commit per
# stop. commit.sh holds the window.
num() { case "$1" in ''|*[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }
LEFT=$(num "$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || true)")
DONE=$(num "$(grep -c '^- \[x\]' .forge/DOD.md 2>/dev/null || true)")
if [ $(( DONE + LEFT )) -gt 0 ]; then
  MSG="forge: checkpoint, $DONE of $(( DONE + LEFT )) lines"
else
  MSG="forge: checkpoint"
fi
[ "$CHECKS" = red ] && MSG="$MSG, checks red"
for T in $TREES; do
  [ -d "$T" ] || continue
  if [ "$T" = "$PRIMARY" ]; then
    "$HERE/commit.sh" --tree "$T" "$MSG" >/dev/null 2>&1
  else
    # A worktree's message names its branch, so the history says which slice a
    # checkpoint belongs to without anyone reading the diff.
    BR=$(git -C "$T" rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)
    "$HERE/commit.sh" --tree "$T" "forge: checkpoint on $BR" >/dev/null 2>&1
  fi
done
exit 0
