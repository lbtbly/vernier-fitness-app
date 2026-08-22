#!/usr/bin/env bash
cd /Users/lambertbouley/Claude/lbtbly-fitness-app
OUT=/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/b9d6a57d-5fec-4031-9628-8b7750465468/scratchpad/verify/watch-rows.txt
: > "$OUT"
for i in $(seq 1 400); do
  row=$(docker compose exec -T db sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -At -c \"select 'id=' || id || ' owner=' || owner_id || ' pubkey_bytes=' || octet_length(decode(translate(public_key,'-_','+/') || repeat('=', (4 - length(public_key) % 4) % 4),'base64')) || ' counter=' || counter || ' transports=' || array_to_string(transports,',') || ' device_type=' || device_type || ' backed_up=' || backed_up || ' label=' || label || ' created=' || created_at from webauthn_credential\"" 2>/dev/null)
  if [ -n "$row" ]; then
    echo "$(date -u +%H:%M:%S) $row" >> "$OUT"
  fi
  sig=$(docker compose exec -T db sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -At -c \"select signal || '=' || observed from device_observation where signal='passkey_registered'\"" 2>/dev/null)
  if [ -n "$sig" ]; then echo "$(date -u +%H:%M:%S) diagnostics $sig" >> "$OUT"; fi
done
