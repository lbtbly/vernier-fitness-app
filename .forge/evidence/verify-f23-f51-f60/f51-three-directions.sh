set -uo pipefail
cd /Users/lambertbouley/Claude/lbtbly-fitness-app
S=http://127.0.0.1:3101
W=/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/38530ca4-7aaa-4639-b52a-4d9b5f218876/scratchpad
TOK=$(cat $W/tok.txt); SEC=$(cat $W/sec.txt); KID=$(cat $W/kid.txt)
SESS=$(cat $W/sess.txt); CSRF=$(tail -1 $W/csrf-all.txt)
COOK="vernier_session=$SESS; vernier_csrf=$CSRF"
FIX=tests/fixtures/health-ingest-48h.json

send() { # $1 label, $2 nonce, then extra curl args
  local LABEL=$1 NONCE=$2; shift 2
  local STAMP WS WE CANON INNER DIG BODY
  STAMP=$(date +%Y-%m-%dT%H:%M:%S%z)
  WS=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['window_start'])" "$FIX")
  WE=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['window_end'])" "$FIX")
  CANON=$(printf 'v1\n%s\n%s\n%s\n%s\n%s' "$KID" "$STAMP" "$NONCE" "$WS" "$WE")
  INNER=$(printf '%s' "${SEC}|$CANON" | shasum -a 256 | cut -d' ' -f1)
  DIG=$(printf '%s' "${SEC}|$INNER" | shasum -a 256 | cut -d' ' -f1)
  BODY=$(python3 -c "import json,sys;b=json.load(open(sys.argv[1]));b['nonce']=sys.argv[2];sys.stdout.write(json.dumps(b))" "$FIX" "$NONCE")
  local CODE
  CODE=$(curl -sS -o $W/resp.json -w '%{http_code}' -X POST "$S/api/ingest/health" \
    -H 'Content-Type: application/json' -H "X-Ingest-Key-Id: $KID" -H "X-Ingest-Timestamp: $STAMP" \
    -H "X-Ingest-Nonce: $NONCE" -H "X-Ingest-Digest: $DIG" -H "Idempotency-Key: $NONCE" \
    "$@" --data-binary "$BODY")
  echo "--- $LABEL"
  echo "    HTTP $CODE"
  python3 -c "import json,sys;b=json.load(open('$W/resp.json'));print('    body:',json.dumps({k:b[k] for k in b if k in ('ok','error','message','stored','skipped','accepted','counts')})[:400])" 2>/dev/null || head -c 300 $W/resp.json
}

echo "== F51, all three directions at /api/ingest/health, on scratch =="
send "POSITIVE CONTROL: valid bearer, correct digest" "verify-ctl-$(uuidgen)" -H "Authorization: Bearer $TOK"
send "DIRECTION TWO: a valid owner session, NO bearer" "verify-sess-$(uuidgen)" -H "Cookie: $COOK" -H "x-vernier-csrf: $CSRF"
send "DIRECTION THREE: no Authorization header at all" "verify-anon-$(uuidgen)"
