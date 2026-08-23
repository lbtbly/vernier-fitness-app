set -uo pipefail
cd /Users/lambertbouley/Claude/lbtbly-fitness-app
S=http://127.0.0.1:3101
W=/private/tmp/claude-501/-Users-lambertbouley-Claude-lbtbly-fitness-app/38530ca4-7aaa-4639-b52a-4d9b5f218876/scratchpad
TOK=$(cat $W/tok.txt)
node scripts/route-table.mjs 2>/dev/null | awk '$3=="protected"{print $1" "$2}' > $W/protected.txt
echo "protected routes on disk: $(wc -l < $W/protected.txt)"
BAD=0
while read -r M U; do
  case "$U" in *"["*) U2=$(printf '%s' "$U" | sed 's/\[[^]]*\]/00000000-0000-0000-0000-000000000000/g');; *) U2="$U";; esac
  R=$(curl -sS -o /dev/null -w '%{http_code}' -X "$M" -H "Authorization: Bearer $TOK" -H 'content-type: application/json' -d '{}' "$S$U2")
  case "$R" in 401|403|307|405) ;; *) echo "REACHED: $M $U2 -> $R"; BAD=$((BAD+1));; esac
done < $W/protected.txt
echo "routes the ingest bearer reached with a non-refusal: $BAD"
