#!/usr/bin/env bash
# Daily PostgreSQL backup with 14-day rotation.
set -e
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
FILENAME="$BACKUP_DIR/aura_stack_$(date +%Y%m%d_%H%M%S).sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$FILENAME"
echo "Backup: $FILENAME ($(du -h "$FILENAME" | cut -f1))"
# Rotate: keep last 14 days
find "$BACKUP_DIR" -name "aura_stack_*.sql.gz" -mtime +14 -delete
