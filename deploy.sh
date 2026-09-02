#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
sudo mkdir -p /var/www/portfolio-hub
sudo cp -r ./index.html /var/www/portfolio-hub/
sudo chown -R caddy:caddy /var/www/portfolio-hub
echo "Deployed portfolio-hub $(git rev-parse --short HEAD)"
