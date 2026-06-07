#!/usr/bin/env bash
set -euo pipefail

# Usage from project root:
# ./app/frontend/scripts/REBUILD_AND_DEPLOY_FRONTEND.sh /home/vexko/Vexko/app/frontend /var/www/vexko

FRONTEND_DIR="${1:-./app/frontend}"
DEST_DIR="${2:-/var/www/vexko}"

cd "$FRONTEND_DIR"
npm ci
npm run build

sudo rm -rf "$DEST_DIR"/*
sudo cp -r dist/* "$DEST_DIR/"
sudo chown -R www-data:www-data "$DEST_DIR"
sudo systemctl reload nginx || true

echo "Frontend rebuilt and deployed to $DEST_DIR"
