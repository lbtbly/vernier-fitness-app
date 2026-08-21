#!/usr/bin/env bash
# Puts exactly one HTTPS proxy in front of Vernier: the tailnet name on 443,
# forwarding to 127.0.0.1:3000. Never Funnel. Running it twice changes nothing.
#
# Serve is the network barrier and never the authentication. Funnel would put
# this on the public internet, which is a different product.
set -euo pipefail

PORT=3000
TARGET="http://127.0.0.1:${PORT}"

# The Tailscale binary is not on PATH under the Mac App Store build.
TS="$(command -v tailscale || true)"
if [ -z "$TS" ] && [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
  TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
fi
if [ -z "$TS" ]; then
  echo "tailscale-serve: no tailscale binary. Looked on PATH and at" >&2
  echo "  /Applications/Tailscale.app/Contents/MacOS/Tailscale" >&2
  echo "Install Tailscale, sign in, and run this again." >&2
  exit 1
fi

if ! "$TS" status >/dev/null 2>&1; then
  echo "tailscale-serve: tailscale is installed but not connected. Sign in and try again." >&2
  exit 1
fi

DNS_NAME="$("$TS" status --json | sed -n 's/.*"DNSName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
DNS_NAME="${DNS_NAME%.}"
if [ -z "$DNS_NAME" ]; then
  echo "tailscale-serve: could not read this node's DNS name from tailscale status." >&2
  exit 1
fi

CONFIG="$("$TS" serve status --json 2>/dev/null || echo '{}')"

# Funnel is checked first and refused loudly. An AllowFunnel entry here would
# mean the whole record is on the public internet.
if printf '%s' "$CONFIG" | grep -q '"AllowFunnel"'; then
  if printf '%s' "$CONFIG" | grep -q '"AllowFunnel"[[:space:]]*:[[:space:]]*{[^}]*true'; then
    echo "tailscale-serve: a Funnel entry exists and this script will not touch it." >&2
    echo "Remove it with: $TS funnel reset" >&2
    exit 1
  fi
fi

# Already exactly what we want? Say so and stop. This is the second run.
if printf '%s' "$CONFIG" | grep -q "\"${TARGET}\"" \
   && printf '%s' "$CONFIG" | grep -q "\"${DNS_NAME}:443\""; then
  echo "tailscale-serve: already serving https://${DNS_NAME} to ${TARGET}. Nothing changed."
else
  "$TS" serve --bg --https=443 "$TARGET"
  echo "tailscale-serve: serving https://${DNS_NAME} to ${TARGET}."
fi

echo
"$TS" serve status

echo
FUNNEL="$("$TS" funnel status 2>&1 || true)"
printf 'funnel: %s\n' "$FUNNEL"
