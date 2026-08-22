#!/usr/bin/env bash
cd /Users/lambertbouley/Claude/lbtbly-fitness-app
set -uo pipefail
NET=vernier_default
IMG=vernier-app:local
DB=$(docker compose exec -T app printenv DATABASE_URL | sed 's#/[^/]*$#/vernier_scratch#')

echo "=== F17 first half. no master key at all."
docker rm -f vernier-nokey >/dev/null 2>&1
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "drop database if exists vernier_scratch with (force)" >/dev/null; psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "create database vernier_scratch" >/dev/null'
echo "owner rows in the fresh scratch database before the attempt: $(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d vernier_scratch -At -c "select count(*) from information_schema.tables where table_name = '"'"'owner'"'"'"')  (0 means the schema does not even exist yet)"

docker run -d --name vernier-nokey --network "$NET" \
  -e APP_URL=http://127.0.0.1:3102 -e APP_NAME=Vernier \
  -e WEBAUTHN_RP_ID=localhost -e WEBAUTHN_RP_NAME=Vernier \
  -e DATABASE_URL="$DB" -p 127.0.0.1:3102:3000 "$IMG" >/dev/null

echo "polling 127.0.0.1:3102 for 12 seconds to see whether it ever answers anything"
served=0
for i in $(seq 1 120); do
  code=$(curl -s -o /dev/null -m 1 -w "%{http_code}" http://127.0.0.1:3102/healthz 2>/dev/null)
  if [ "$code" != "000" ] && [ -n "$code" ]; then echo "  it answered /healthz with $code at poll $i"; served=1; fi
  code2=$(curl -s -o /dev/null -m 1 -w "%{http_code}" http://127.0.0.1:3102/sign-in 2>/dev/null)
  if [ "$code2" != "000" ] && [ -n "$code2" ]; then echo "  it answered /sign-in with $code2 at poll $i"; served=1; fi
  sleep 0.1
done
echo "did it ever serve a request: $served"
echo "container state: $(docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}} restarts={{.RestartCount}}' vernier-nokey)"
echo "what it printed:"
docker logs vernier-nokey 2>&1 | sed 's/^/  /'
echo "owner rows created: $(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d vernier_scratch -At -c "select count(*) from information_schema.tables where table_name = '"'"'owner'"'"'"')  tables named owner"
docker rm -f vernier-nokey >/dev/null 2>&1
