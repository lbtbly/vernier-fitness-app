#!/usr/bin/env bash
# Put the French language data where optical recognition reads it, once.
#
#   scripts/fetch-tessdata.sh            download, verify, install into the volume
#   scripts/fetch-tessdata.sh --download download and verify, touch no volume
#   scripts/fetch-tessdata.sh --verify   read it back out of the volume and hash it
#
# WHY THE APP WILL NOT DO THIS ITSELF. tesseract.js downloads language data from
# a CDN by default. A health product that quietly reaches the internet while
# reading a medical document is not what this brief describes, so
# src/lib/lab-ocr.ts sets langPath at the storage volume, turns caching off, and
# REPORTS a missing file instead of fetching one. That refusal is the honest
# behaviour and it is also why the file has to arrive some other way. This is
# that way, and it is one command.
#
# WHY IT IS NOT IN THE IMAGE. /app/storage is a named volume. Anything the image
# carries at that path is shadowed the moment the volume mounts, and a volume
# that already holds the owner's laboratory PDFs is never re-seeded from an
# image. The volume is where the file has to land, so the volume is what this
# writes to, through a throwaway container rather than through the running app.
#
# Publisher: the Tesseract OCR project, tessdata_fast, Apache-2.0. The fast
# variant is the integerised LSTM model: 1.13 MB against 3.97 MB for best and
# 14.2 MB for the legacy set, and the research note recorded the same size on
# 2026-08-21.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)

LANGUAGE=fra
URL="https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${LANGUAGE}.traineddata"
DEST="$ROOT/var/tessdata/${LANGUAGE}.traineddata"
VOLUME=vernier_storage
# The image the preflight already requires, so this pulls nothing.
HELPER=node:24-slim

# Measured on 2026-08-23 against the file the URL above served. A mismatch means
# the project republished the model under the same name, which is a decision for
# a person and not a thing to install quietly.
EXPECT_BYTES=1130365
EXPECT_SHA=ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca

verify_local() {
  [ -f "$DEST" ] || { echo "fetch-tessdata: no copy at $DEST" >&2; return 1; }
  BYTES=$(wc -c < "$DEST" | tr -d ' ')
  if [ "$BYTES" != "$EXPECT_BYTES" ]; then
    echo "fetch-tessdata: expected $EXPECT_BYTES bytes, found $BYTES" >&2
    return 1
  fi
  SHA=$(shasum -a 256 "$DEST" | cut -d' ' -f1)
  if [ "$SHA" != "$EXPECT_SHA" ]; then
    echo "fetch-tessdata: sha256 is $SHA, expected $EXPECT_SHA" >&2
    return 1
  fi
  echo "fetch-tessdata: local copy verified, $BYTES bytes, sha256 $SHA"
}

# Read back out of the volume, hashed there, so the answer is about the bytes
# the app will open and not about the bytes this machine downloaded.
verify_volume() {
  docker run --rm -v "${VOLUME}:/vol:ro" "$HELPER" \
    node -e '
      const { createHash } = require("node:crypto");
      const { readFileSync, statSync } = require("node:fs");
      const path = "/vol/tessdata/'"${LANGUAGE}"'.traineddata";
      try {
        const bytes = readFileSync(path);
        const sha = createHash("sha256").update(bytes).digest("hex");
        process.stdout.write(`${statSync(path).size} ${sha}\n`);
      } catch (error) {
        process.stderr.write(`${path} is not on the volume: ${error.code}\n`);
        process.exit(1);
      }
    '
}

if [ "${1:-}" = "--verify" ]; then
  echo "fetch-tessdata: reading $VOLUME"
  OUT=$(verify_volume)
  echo "fetch-tessdata: on the volume: $OUT"
  case "$OUT" in
    "$EXPECT_BYTES $EXPECT_SHA") echo "fetch-tessdata: matches the published model." ;;
    *) echo "fetch-tessdata: expected $EXPECT_BYTES $EXPECT_SHA" >&2; exit 1 ;;
  esac
  exit 0
fi

mkdir -p "$ROOT/var/tessdata"
if [ -f "$DEST" ] && verify_local >/dev/null 2>&1; then
  echo "fetch-tessdata: already downloaded, not fetching again"
else
  curl -fsSL --max-time 300 -o "$DEST" "$URL"
fi
verify_local

# The half that touches nothing but this directory. It is here so the download
# and the hash can be proven from a git worktree, where writing into the shared
# storage volume is somebody else's call.
if [ "${1:-}" = "--download" ]; then
  echo "fetch-tessdata: downloaded only. Run without --download to install into $VOLUME."
  exit 0
fi

# Into the volume, as uid 1000, which is the `node` user the app runs as and the
# owner Docker gives /app/storage in the image.
docker run --rm -v "${VOLUME}:/vol" -v "$ROOT/var/tessdata:/src:ro" "$HELPER" \
  sh -c "mkdir -p /vol/tessdata && cp /src/${LANGUAGE}.traineddata /vol/tessdata/${LANGUAGE}.traineddata && chown -R 1000:1000 /vol/tessdata"

echo "fetch-tessdata: installed into $VOLUME at /app/storage/tessdata/${LANGUAGE}.traineddata"
"$HERE/fetch-tessdata.sh" --verify
