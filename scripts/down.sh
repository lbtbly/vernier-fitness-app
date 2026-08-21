#!/usr/bin/env bash
# Stops Vernier. Both named volumes survive, and so do the containers, so the
# ids are unchanged and up.sh starts the same ones again.
#
# There is deliberately no -v here and there never will be. Destroying
# vernier_pgdata is not an ordinary procedure; it is a decision someone takes
# by hand, with a backup in front of them.
#
# --remove goes further and removes the containers as well, which is what you
# want before changing the compose file itself. The volumes still survive.
set -euo pipefail
# shellcheck source=lib/compose.sh
source "$(cd "$(dirname "$0")" && pwd)/lib/compose.sh"

REMOVE=0
for arg in "$@"; do
  case "$arg" in
    --remove) REMOVE=1 ;;
    *) echo "down.sh: unknown argument $arg. The only flag is --remove." >&2; exit 2 ;;
  esac
done

if [ "$REMOVE" -eq 1 ]; then
  compose down
  echo "down.sh: containers removed. vernier_pgdata and vernier_storage are untouched."
else
  compose stop
  echo "down.sh: stopped. Containers, vernier_pgdata and vernier_storage are all untouched."
fi

compose ps --all --format 'table {{.Service}}\t{{.Status}}'
