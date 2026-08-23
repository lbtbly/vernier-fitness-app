#!/usr/bin/env bash
# Worktree resolution, shared by the hooks. Sourced, never run.
#
# Every hook in this project cd'd to CLAUDE_PROJECT_DIR and stopped thinking.
# That was right while there was one tree. Slices 5 to 13 build in parallel in
# git worktrees, and under that layout the old behaviour is two holes at once:
#
#   checks.sh   graded MAIN while the builder edited a worktree, and reported
#               exit 0 for a tree it never looked at. That is the seventh
#               instance of this run's one recurring failure class, a check
#               that passes by not checking.
#   commit.sh   committed MAIN, found it clean, and exited. A worktree builder's
#               work was never checkpointed at all, against rule 5: work that is
#               not committed does not exist.
#
# So the tree is resolved, not assumed.

# The tree a path lives in. Prints nothing and returns 1 when the path is not
# inside a git worktree of any repository.
forge_tree_of() {
  local p=$1 d
  [ -n "$p" ] || return 1
  d=$p
  [ -d "$d" ] || d=$(dirname "$p")
  [ -d "$d" ] || return 1
  git -C "$d" rev-parse --show-toplevel 2>/dev/null
}

# The primary tree: the one the .git directory proper belongs to.
forge_primary_tree() {
  local root=${CLAUDE_PROJECT_DIR:-.}
  git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null \
    | sed 's#/\.git$##'
}

# Every worktree of this repository, one absolute path per line, primary first.
forge_trees() {
  local root=${CLAUDE_PROJECT_DIR:-.}
  git -C "$root" worktree list --porcelain 2>/dev/null \
    | awk '/^worktree /{print substr($0,10)}'
}

# True when the given tree is the primary one. The live stack on 127.0.0.1:3000
# serves the primary tree's code and nothing else, so any check that reaches the
# running product is meaningful there and meaningless anywhere else.
forge_is_primary() {
  local t=$1 p
  p=$(forge_primary_tree) || return 1
  [ -n "$t" ] && [ "$t" = "$p" ]
}
