#!/usr/bin/env bash
# Post the shipped 48-hour fixture batch to the ingest endpoint, signed, with no
# iPhone in the room.
#
#   INGEST_TOKEN=... INGEST_SECRET=... bash scripts/ingest-fixture.sh
#   INGEST_TOKEN=... INGEST_SECRET=... bash scripts/ingest-fixture.sh --url http://127.0.0.1:3101
#   INGEST_TOKEN=... INGEST_SECRET=... bash scripts/ingest-fixture.sh --nonce fixed-nonce-1
#   INGEST_TOKEN=... INGEST_SECRET=... bash scripts/ingest-fixture.sh --body other.json --report out.json
#
# F53. The whole path, taken the way the phone takes it: the same route, the
# same bearer token, the same two-pass digest, the same nonce, the same
# idempotency key, the same deduplication. Nothing here is a test hook and
# nothing here is a shortcut around a check.
#
# The digest is computed with shasum, which is the same four lines the ingest
# diagnostics screen prints, so a mismatch found by hand and a mismatch found
# here are the same mismatch. It is also a second, independent implementation of
# the contract: the server computes its digest in TypeScript with node crypto
# and this computes one in the shell, and a test that drives this is comparing
# two implementations rather than asking one of them about itself.
#
# THE FIXTURE'S DATES ARE FIXED ON PURPOSE. Its dedup keys are therefore stable
# for ever, which is what makes "run it ten times and the row count does not
# move" a thing anybody can check on any day rather than a claim about one
# afternoon. Use --nonce to reuse a nonce deliberately, which is how the replay
# refusal is demonstrated.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
FIXTURE="$ROOT/tests/fixtures/health-ingest-48h.json"

URL=${APP_URL:-https://lamberts-mac-mini.tailda76d6.ts.net}
NONCE=""
KEY_ID=${INGEST_KEY_ID:-k1}
IDEMPOTENCY=""
STAMP=""
FORCED_DIGEST=""
REPORT=""
BEARER=1

while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL=$2; shift 2 ;;
    --nonce) NONCE=$2; shift 2 ;;
    --key-id) KEY_ID=$2; shift 2 ;;
    --idempotency) IDEMPOTENCY=$2; shift 2 ;;
    # A deliberately old timestamp, for showing the skew refusal.
    --timestamp) STAMP=$2; shift 2 ;;
    # A batch other than the shipped one, for the refusals that need a bad body.
    --body) FIXTURE=$2; shift 2 ;;
    # A digest this script did not compute, for showing the digest refusal.
    --digest) FORCED_DIGEST=$2; shift 2 ;;
    # No Authorization header at all, for showing what an anonymous caller gets.
    --no-bearer) BEARER=0; shift ;;
    # Everything this run did and got, as one JSON object, for a caller that is
    # a test rather than a person.
    --report) REPORT=$2; shift 2 ;;
    *) echo "ingest-fixture: unknown argument $1" >&2; exit 2 ;;
  esac
done

if [ -z "${INGEST_TOKEN:+set}" ] || [ -z "${INGEST_SECRET:+set}" ]; then
  echo "ingest-fixture: set INGEST_TOKEN and INGEST_SECRET from the values Settings" >&2
  echo "                showed once when the ingest token was created." >&2
  exit 2
fi
[ -f "$FIXTURE" ] || { echo "ingest-fixture: no fixture at $FIXTURE" >&2; exit 2; }

# sha256, wherever this runs. macOS ships shasum, the container ships sha256sum,
# and neither of them is openssl, which this image deliberately does not carry.
sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | cut -d' ' -f1
  else
    sha256sum | cut -d' ' -f1
  fi
}

# ISO 8601 with a numeric offset, which is the only shape this endpoint reads.
# %z gives +0200, exactly what Format Date's yyyy-MM-dd'T'HH:mm:ssZ produces on
# the phone, so the fixture and the shortcut send the same shape.
[ -n "$STAMP" ] || STAMP=$(date +%Y-%m-%dT%H:%M:%S%z)
[ -n "$NONCE" ] || NONCE="$STAMP-$RANDOM$RANDOM-$RANDOM$RANDOM"
[ -n "$IDEMPOTENCY" ] || IDEMPOTENCY=$NONCE

# The window comes out of the body being sent, because the server recomputes the
# canonical string from the body it parsed. A window read from anywhere else
# would be a digest over something the server never saw.
WINDOW_START=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('window_start',''))" "$FIXTURE")
WINDOW_END=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('window_end',''))" "$FIXTURE")

CANONICAL=$(printf 'v1\n%s\n%s\n%s\n%s\n%s' "$KEY_ID" "$STAMP" "$NONCE" "$WINDOW_START" "$WINDOW_END")
INNER=$(printf '%s' "${INGEST_SECRET}|$CANONICAL" | sha256)
DIGEST=$(printf '%s' "${INGEST_SECRET}|$INNER" | sha256)
[ -z "$FORCED_DIGEST" ] || DIGEST=$FORCED_DIGEST

# The nonce in the body has to be the nonce in the header: the server builds its
# canonical string from the header, and the body's copy is what a fixture reader
# sees. python3 rewrites it rather than sed, so a nonce with a plus in it cannot
# break the JSON.
BODY=$(python3 -c "
import json,sys
batch=json.load(open(sys.argv[1]))
if isinstance(batch, dict) and 'nonce' in batch:
    batch['nonce']=sys.argv[2]
sys.stdout.write(json.dumps(batch))
" "$FIXTURE" "$NONCE")

echo "ingest-fixture: POST $URL/api/ingest/health"
echo "ingest-fixture: key $KEY_ID, nonce $NONCE"
echo "ingest-fixture: canonical string, six lines:"
printf '%s\n' "$CANONICAL" | sed 's/^/    /'
echo "ingest-fixture: digest $DIGEST"

# The array below expands as `${AUTH[@]+"${AUTH[@]}"}`, and scripts/recovery.sh
# already writes it that way for the same reason. Under `set -u` on bash 3.2,
# which is the bash on this Mac and the bash the suite reaches, expanding an
# empty array is an unbound variable and the script dies before it sends
# anything. --no-bearer is the one mode that empties it, so the single
# demonstration that flag exists for could never run: F51 asked this endpoint
# for its answer to a caller with no Authorization header at all and got a dead
# shell instead of a 401.
#
# --fail is deliberately NOT set. Every outcome of this endpoint carries a body
# with a message in it, and the message is the point: swallowing it on a non-2xx
# would hide the one thing this script exists to show.
AUTH=(-H "Authorization: Bearer ${INGEST_TOKEN}")
[ "$BEARER" -eq 1 ] || AUTH=()

HTTP=$(curl -sS -o /tmp/ingest-fixture-body.json -w '%{http_code}' \
  -X POST "$URL/api/ingest/health" \
  ${AUTH[@]+"${AUTH[@]}"} \
  -H 'Content-Type: application/json' \
  -H "X-Ingest-Key-Id: $KEY_ID" \
  -H "X-Ingest-Timestamp: $STAMP" \
  -H "X-Ingest-Nonce: $NONCE" \
  -H "X-Ingest-Digest: $DIGEST" \
  -H "Idempotency-Key: $IDEMPOTENCY" \
  --data-binary "$BODY")

echo "ingest-fixture: HTTP $HTTP"
python3 -m json.tool < /tmp/ingest-fixture-body.json 2>/dev/null || cat /tmp/ingest-fixture-body.json
echo

if [ -n "$REPORT" ]; then
  python3 -c "
import json,sys
raw=open(sys.argv[2]).read()
try:
    body=json.loads(raw)
except Exception:
    body={'raw': raw}
json.dump({'status': int(sys.argv[3]), 'nonce': sys.argv[4], 'digest': sys.argv[5], 'body': body},
          open(sys.argv[1], 'w'))
" "$REPORT" /tmp/ingest-fixture-body.json "$HTTP" "$NONCE" "$DIGEST"
fi
rm -f /tmp/ingest-fixture-body.json
