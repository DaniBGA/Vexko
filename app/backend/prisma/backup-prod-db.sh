#!/usr/bin/env bash
set -euo pipefail

# Usage: ./backup-prod-db.sh [DB_PATH] [BACKUP_DIR]
# Defaults: DB_PATH=./prisma/prisma/prod.db  BACKUP_DIR=./backups

DB_PATH="${1:-./prisma/prisma/prod.db}"
BACKUP_DIR="${2:-./backups}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/prod.db.$TIMESTAMP"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 not found in PATH" >&2
  exit 2
fi

sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"
echo "Backup saved to $BACKUP_PATH"
