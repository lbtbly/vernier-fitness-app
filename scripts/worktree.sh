#!/usr/bin/env bash
# Parallel slice trees. Slices 5 to 13 are largely independent, so they are
# built at the same time in separate git worktrees and merged into main one at a
# time. This script is the whole discipline that makes that safe.
#
#   worktree.sh new <slug>       create the tree and its branch
#   worktree.sh list             every tree, its branch and whether it is dirty
#   worktree.sh gate <slug>      run the full gate inside that tree
#   worktree.sh merge <slug>     merge into main, number the migration, gate
#   worktree.sh drop <slug>      remove the tree once it is merged
#
# Three rules it enforces, because each of them has already cost this run a day
# somewhere else:
#
# 1. MIGRATIONS ARE NUMBERED ON MERGE, NEVER IN A TREE. Nine builders running
#    drizzle-kit generate all produce 0007, and drizzle's snapshots are a chain:
#    0008 is a diff against 0007's state, so renumbering afterwards is not a
#    rename, it is a corrupt chain. A builder edits src/db/schema.ts and writes
#    any raw DDL it needs into drizzle/pending/<slug>.sql, a file only its slice
#    owns. `merge` runs db:generate once, in order, on main.
#
# 2. .forge/ IS MAIN'S. It is committed, so every worktree carries a copy of
#    DOD.md, EVIDENCE.md and DEFECTS.md at the commit it forked from. A builder
#    writing to those would merge stale state over live state and un-tick lines
#    a verifier proved. `merge` takes main's copy of .forge/ unconditionally.
#
# 3. NO LINE IS TICKED FROM A WORKTREE. The live origin serves main, so a check
#    that reaches the running product measures main whatever tree it is run
#    from. checks.sh defers strings:rendered in a worktree and writes
#    .forge/.rendered-deferred; `merge` refuses to finish while that marker is
#    present and clears it only after the check has run on main with the slice
#    in. Verification happens on main, after merge, by a verifier.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib/trees.sh
. "$HERE/lib/trees.sh"

PRIMARY=$(forge_primary_tree)
[ -n "$PRIMARY" ] || { echo "worktree: not in a git repository" >&2; exit 1; }
TREES_DIR="${FORGE_TREES_DIR:-$(dirname "$PRIMARY")/$(basename "$PRIMARY")-trees}"

usage() { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
say() { printf 'worktree: %s\n' "$*"; }
die() { printf 'worktree: %s\n' "$*" >&2; exit 1; }

path_of() { printf '%s/%s' "$TREES_DIR" "$1"; }
branch_of() { printf 'slice/%s' "$1"; }

cmd_new() {
  local slug=${1:-}; [ -n "$slug" ] || die "new needs a slug"
  local path branch
  path=$(path_of "$slug"); branch=$(branch_of "$slug")
  [ -e "$path" ] && die "$path already exists"

  mkdir -p "$TREES_DIR"
  git -C "$PRIMARY" worktree add -b "$branch" "$path" HEAD >/dev/null
  say "created $branch at $path"

  # node_modules is 543 MB and this machine has had 13 GiB free. An APFS clone
  # shares every block until something writes to it, so nine trees cost roughly
  # one tree's disk. A symlink was the other option and is worse: eslint's cache
  # lives under node_modules and nine trees sharing one cache is a check that
  # reports yesterday's answer.
  if [ -d "$PRIMARY/node_modules" ]; then
    cp -c -R "$PRIMARY/node_modules" "$path/node_modules" 2>/dev/null \
      || cp -R "$PRIMARY/node_modules" "$path/node_modules"
    say "node_modules cloned"
  fi
  mkdir -p "$path/drizzle/pending"
  printf '%s\n' "$path"
}

cmd_list() {
  git -C "$PRIMARY" worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | while read -r t; do
    local_branch=$(git -C "$t" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
    dirty=clean
    [ -n "$(git -C "$t" status --porcelain 2>/dev/null)" ] && dirty=DIRTY
    ahead=$(git -C "$t" rev-list --count main.."$local_branch" 2>/dev/null || echo 0)
    printf '%-52s %-22s %-6s %s ahead of main\n' "$t" "$local_branch" "$dirty" "$ahead"
  done
}

cmd_gate() {
  local slug=${1:-}; [ -n "$slug" ] || die "gate needs a slug"
  local path; path=$(path_of "$slug")
  [ -d "$path" ] || die "no tree at $path"
  FORGE_TREE="$path" FORGE_CHECKS_FULL=1 "$HERE/checks.sh" </dev/null
}

cmd_merge() {
  local slug=${1:-}; [ -n "$slug" ] || die "merge needs a slug"
  local path branch
  path=$(path_of "$slug"); branch=$(branch_of "$slug")
  [ -d "$path" ] || die "no tree at $path"

  # .forge/ is main's, and the gate writes two machine-local files into whatever
  # tree it runs in: .checks-stamp and .rendered-deferred. Those are state, not
  # work, and holding a merge on them would mean hand-cleaning five trees every
  # round. Reset them here and judge dirt on everything else.
  git -C "$path" checkout -- .forge/ 2>/dev/null || true
  DIRT=$(git -C "$path" status --porcelain | grep -v '^.. \.forge/' || true)
  [ -z "$DIRT" ] || die "$branch has uncommitted work outside .forge/; commit it first:
$DIRT"
  MAINDIRT=$(git -C "$PRIMARY" status --porcelain | grep -v '^.. \.forge/' || true)
  [ -z "$MAINDIRT" ] || die "main is dirty outside .forge/; commit or stash it first:
$MAINDIRT"
  # Main's own .forge/ churn is the verifier's evidence and progress files. Commit
  # it rather than merging on top of an index that has it half-staged.
  if [ -n "$(git -C "$PRIMARY" status --porcelain)" ]; then
    git -C "$PRIMARY" add -A .forge >/dev/null 2>&1 || true
    git -C "$PRIMARY" commit -q -m "forge: state before merging $branch" >/dev/null 2>&1 || true
  fi

  # The tree's own gate must be green before its code is allowed near main.
  say "gating $branch in its own tree"
  FORGE_TREE="$path" FORGE_CHECKS_FULL=1 "$HERE/checks.sh" </dev/null || die "$branch is red in its own tree; not merging"

  say "merging $branch into main"
  if ! git -C "$PRIMARY" merge --no-ff --no-commit "$branch" >/dev/null 2>&1; then
    # .forge/ is main's, always. Anything else that conflicts is a real
    # conflict and a person resolves it.
    if git -C "$PRIMARY" diff --name-only --diff-filter=U | grep -q '^\.forge/'; then
      git -C "$PRIMARY" diff --name-only --diff-filter=U | grep '^\.forge/' | while read -r f; do
        git -C "$PRIMARY" checkout --ours -- "$f" && git -C "$PRIMARY" add -- "$f"
      done
      say ".forge/ conflicts resolved in main's favour"
    fi
    if [ -n "$(git -C "$PRIMARY" diff --name-only --diff-filter=U)" ]; then
      echo "worktree: unresolved conflicts, resolve them then rerun:" >&2
      git -C "$PRIMARY" diff --name-only --diff-filter=U >&2
      exit 3
    fi
  fi
  # Whatever the merge did to .forge/, main's copy wins. The verifier's ticks
  # and the evidence log only ever move forward.
  git -C "$PRIMARY" checkout HEAD -- .forge/ 2>/dev/null || true
  # The two gate artifacts are machine-local and must never ride a merge onto
  # main. .rendered-deferred especially: main clears it only after
  # strings:rendered has actually run there, and a copy arriving from a branch
  # would make that clearing meaningless.
  git -C "$PRIMARY" rm -q --cached --ignore-unmatch \
    .forge/.rendered-deferred .forge/.checks-stamp >/dev/null 2>&1 || true
  git -C "$PRIMARY" add -A >/dev/null

  say "merged into the index. Next, in this order, by hand:"
  cat <<'NEXT'
  1. npm run db:generate          numbers this slice's migration on main
  2. append drizzle/pending/<slug>.sql to the generated migration, then
     delete the pending file
  3. scripts/up.sh                rebuild and boot, so the live origin serves
                                  this slice
  4. FORGE_CHECKS_FULL=1 scripts/checks.sh   five checks, strings:rendered
                                             included, on main with the slice in
  5. rm .forge/.rendered-deferred            only after step 4 exits 0
  6. git commit                   one commit per slice
  7. dispatch this slice's verifier
NEXT
}

cmd_drop() {
  local slug=${1:-}; [ -n "$slug" ] || die "drop needs a slug"
  local path branch
  path=$(path_of "$slug"); branch=$(branch_of "$slug")
  [ -d "$path" ] || die "no tree at $path"
  [ -z "$(git -C "$path" status --porcelain)" ] || die "$branch has uncommitted work"
  local unmerged
  unmerged=$(git -C "$PRIMARY" rev-list --count "main..$branch" 2>/dev/null || echo 0)
  [ "$unmerged" = "0" ] || die "$branch has $unmerged commit(s) main does not have"
  git -C "$PRIMARY" worktree remove "$path"
  git -C "$PRIMARY" branch -d "$branch" >/dev/null 2>&1 || true
  say "dropped $branch"
}

case "${1:-}" in
  new)   shift; cmd_new "$@" ;;
  list)  shift; cmd_list "$@" ;;
  gate)  shift; cmd_gate "$@" ;;
  merge) shift; cmd_merge "$@" ;;
  drop)  shift; cmd_drop "$@" ;;
  ''|-h|--help) usage 0 ;;
  *) die "unknown command: $1" ;;
esac
