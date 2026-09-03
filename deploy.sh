#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
sudo mkdir -p /var/www/portfolio-hub
sudo cp ./index.html /var/www/portfolio-hub/
sudo cp ./robots.txt /var/www/portfolio-hub/ 2>/dev/null || true
sudo cp ./sitemap.xml /var/www/portfolio-hub/ 2>/dev/null || true
sudo cp -r ./assets /var/www/portfolio-hub/ 2>/dev/null || true
sudo chown -R caddy:caddy /var/www/portfolio-hub
echo "Deployed portfolio-hub $(git rev-parse --short HEAD)"
