#!/usr/bin/env bash
# Fetch the ANSES CIQUAL 2025 composition table, once, and verify it byte for
# byte before anything parses it.
#
#   scripts/fetch-ciqual.sh            download into var/ciqual/ and verify
#   scripts/fetch-ciqual.sh --verify   verify a copy that is already there
#
# THE BUILD NEVER RUNS THIS. drizzle/seed/foods.csv is committed, the Docker
# image carries it, and the container needs no network to have a food table.
# This script exists so the next CIQUAL release is one command and a diff rather
# than an archaeology project, and so the provenance chain from Anses to the row
# on screen is a thing somebody can re-run rather than a claim in a comment.
#
# Publisher: Agence nationale de securite sanitaire de l'alimentation, de
# l'environnement et du travail (Anses). Table Ciqual 2025, last updated
# 3 November 2025. Licence Ouverte / Open Licence 2.0 (Etalab), which permits
# redistribution inside this application with attribution. Vernier is not
# endorsed by or affiliated with Anses, and the data-sources screen says so.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)

URL="https://ciqual.anses.fr/cms/sites/default/files/inline-files/Table%20Ciqual%202025_FR_2025_11_03.xlsx"
DEST="$ROOT/var/ciqual/Table Ciqual 2025_FR_2025_11_03.xlsx"
# Measured on 2026-08-23 against the file the URL above served: 1,544,342 bytes,
# Last-Modified Fri, 05 Dec 2025 14:32:23 GMT. The research note recorded the
# same Content-Length on 2026-08-21. A mismatch here means the publisher moved
# the file under the same name, which is a decision for a person and not a
# thing to parse anyway.
EXPECT_BYTES=1544342
EXPECT_SHA=d2082938522d909119fbdc8772c028017163650dd81e31d13fdb8a8bd702f32e

verify() {
  [ -f "$DEST" ] || { echo "fetch-ciqual: no copy at $DEST" >&2; return 1; }
  BYTES=$(wc -c < "$DEST" | tr -d ' ')
  if [ "$BYTES" != "$EXPECT_BYTES" ]; then
    echo "fetch-ciqual: expected $EXPECT_BYTES bytes, found $BYTES" >&2
    return 1
  fi
  SHA=$(shasum -a 256 "$DEST" | cut -d' ' -f1)
  if [ "$SHA" != "$EXPECT_SHA" ]; then
    echo "fetch-ciqual: sha256 is $SHA, expected $EXPECT_SHA" >&2
    return 1
  fi
  echo "fetch-ciqual: verified $BYTES bytes, sha256 $SHA"
}

if [ "${1:-}" = "--verify" ]; then
  verify
  exit $?
fi

mkdir -p "$ROOT/var/ciqual"
curl -fsSL --max-time 300 -o "$DEST" "$URL"
verify
echo "fetch-ciqual: now run  node scripts/build-food-seed.mjs"
