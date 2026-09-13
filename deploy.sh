#!/usr/bin/env bash
#
# Deploy portfolio-hub into the Caddy-served webroot.
#
# Deliberately runs WITHOUT sudo. The webroot is owned by dev-1 with the caddy
# group, so this needs no elevated privileges, and the portfolio-admin service
# that calls it cannot escalate either (its unit sets NoNewPrivileges=true).
#
# If you ever get "Permission denied", ownership has drifted:
#   sudo chown -R dev-1:caddy /var/www/portfolio-hub
#   sudo find /var/www/portfolio-hub -type d -exec chmod 755 {} \;
#   sudo find /var/www/portfolio-hub -type f -exec chmod 644 {} \;
#
set -euo pipefail
cd "$(dirname "$0")"

WEBROOT="${PORTFOLIO_WEBROOT:-/var/www/portfolio-hub}"

if [ ! -w "$WEBROOT" ]; then
  echo "deploy: $WEBROOT is not writable by $(id -un)." >&2
  echo "deploy: apply the chown/chmod remediation in this script's header." >&2
  exit 1
fi

# Refresh from the remote when possible, but never let a network blip block a
# deploy whose files are already correct locally.
git pull --ff-only >/dev/null 2>&1 || echo "deploy: git pull skipped (offline or up to date)"

mkdir -p "$WEBROOT/case-studies" "$WEBROOT/assets"

install -m 0644 ./index.html "$WEBROOT/index.html"
[ -f ./robots.txt ] && install -m 0644 ./robots.txt "$WEBROOT/robots.txt"
[ -f ./sitemap.xml ] && install -m 0644 ./sitemap.xml "$WEBROOT/sitemap.xml"

if [ -d ./assets ]; then
  cp -r ./assets/. "$WEBROOT/assets/"
  find "$WEBROOT/assets" -type d -exec chmod 755 {} +
  find "$WEBROOT/assets" -type f -exec chmod 644 {} +
fi

for f in ./case-studies/*.html ./case-studies/*.css; do
  [ -e "$f" ] || continue
  install -m 0644 "$f" "$WEBROOT/case-studies/"
done

echo "Deployed portfolio-hub $(git rev-parse --short HEAD 2>/dev/null || echo '(no git)')"
