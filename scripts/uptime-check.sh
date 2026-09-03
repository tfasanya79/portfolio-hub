#!/usr/bin/env bash
# Lightweight uptime checker for portfolio tools.
# Writes a public status.json that the portfolio page polls client side.
set -uo pipefail

declare -A TARGETS=(
  [subnet-calculator]="https://timfas.com/subnet-calculator/"
  [passcheck]="https://timfas.com/passcheck/"
  [inspect]="https://timfas.com/inspect/"
  [cert-check]="https://timfas.com/cert-check/"
  [acl-gen]="https://timfas.com/acl-gen/"
  [cv-builder]="https://timfas.com/cv-builder/"
)

OUT="/var/www/portfolio-hub/status.json"
TMP=$(mktemp)

echo "{" >> "$TMP"
echo "  \"checked_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$TMP"
echo "  \"tools\": {" >> "$TMP"

first=1
for name in "${!TARGETS[@]}"; do
  url="${TARGETS[$name]}"
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url")
  if [ "$code" -ge 200 ] && [ "$code" -lt 400 ]; then
    status="up"
  else
    status="down"
  fi
  if [ $first -eq 0 ]; then echo "," >> "$TMP"; fi
  first=0
  printf '    "%s": {"status": "%s", "code": %s}' "$name" "$status" "$code" >> "$TMP"
done

echo "" >> "$TMP"
echo "  }" >> "$TMP"
echo "}" >> "$TMP"

sudo cp "$TMP" "$OUT"
sudo chown caddy:caddy "$OUT"
sudo chmod 644 "$OUT"
rm -f "$TMP"
