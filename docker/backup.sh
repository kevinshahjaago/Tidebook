#!/bin/sh
# Nightly PostgreSQL backup script.
# Intended to run via cron inside the backup container, or on the host via:
#   0 2 * * * /path/to/backup.sh >> /var/log/tidebook-backup.log 2>&1

set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/tidebook_${TIMESTAMP}.sql.gz"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-tidebook}"
DB_USER="${DB_USER:-tidebook}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"

echo "[$(date)] Starting backup → ${FILENAME}"

pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip -9 > "${FILENAME}"

echo "[$(date)] Backup complete. Size: $(du -sh "${FILENAME}" | cut -f1)"

# Verify the backup is non-empty and readable
LINES=$(gzip -cd "${FILENAME}" | head -5 | wc -l)
if [ "${LINES}" -lt 1 ]; then
  echo "[$(date)] ERROR: Backup appears empty. Investigate immediately." >&2
  exit 1
fi
echo "[$(date)] Backup verified (readable)."

# Prune backups older than RETAIN_DAYS
echo "[$(date)] Pruning backups older than ${RETAIN_DAYS} days..."
find "${BACKUP_DIR}" -name "tidebook_*.sql.gz" -mtime "+${RETAIN_DAYS}" -delete
echo "[$(date)] Pruning complete."

echo "[$(date)] Backup job finished successfully."
