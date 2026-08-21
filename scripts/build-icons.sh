#!/usr/bin/env bash
# Rasterises Vernier's mark to the PNGs iOS and the manifest ask for.
#
# The source of truth is public/icons/vernier-mark.svg, drawn to the Name and
# mark section of .forge/DESIGN.md. Rubric line D2 checksums these against the
# framework defaults, so nothing here may fall back to a stock icon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/public/icons/vernier-mark.svg"
OUT="$ROOT/public/icons"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "build-icons: headless Chrome is not at $CHROME. Install it or point CHROME at another copy." >&2
  exit 1
fi
if [ ! -f "$SVG" ]; then
  echo "build-icons: the mark is missing at $SVG." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

render() {
  size="$1"
  target="$2"
  {
    printf '<!doctype html><meta charset="utf-8">'
    printf '<style>html,body{margin:0;padding:0;background:#0A0A0B}'
    printf 'svg{display:block;width:%spx;height:%spx}</style>' "$size" "$size"
    cat "$SVG"
  } > "$WORK/icon.html"

  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 \
    --default-background-color=FF0A0A0B \
    --window-size="$size,$size" \
    --screenshot="$target" \
    "file://$WORK/icon.html" >/dev/null 2>&1

  echo "  $(basename "$target")  $(wc -c < "$target" | tr -d ' ') bytes"
}

echo "build-icons: rendering from $(basename "$SVG")"
render 180 "$OUT/apple-touch-icon-180.png"
render 192 "$OUT/icon-192.png"
render 512 "$OUT/icon-512.png"
render 32  "$OUT/favicon-32.png"
echo "build-icons: done"
