# Tidebook — Backup and Recovery

## What Needs to Be Backed Up

| Item | Location | Backup method |
|------|----------|---------------|
| PostgreSQL database | Docker volume `pgdata` | `pg_dump` nightly cron |
| Scholarship document uploads | `/var/tidebook/uploads` (or S3) | rsync / S3 versioning |
| Environment file (`.env`) | `/opt/tidebook/.env` | Password manager (off-server) |
| Application code | Git repository | GitHub / remote origin |

**The `.env` file is the most critical single item.** It contains the `PII_ENCRYPTION_KEY` — without it, all stored contact PII is permanently unreadable. Store it in your organization's password manager (e.g., 1Password, Bitwarden) immediately after setup.

---

## Nightly Backup Procedure

The script `docker/backup.sh` is designed to run via cron. It:
1. Runs `pg_dump` against the running Postgres container
2. Compresses output with `gzip -9`
3. Saves to `/opt/backups/tidebook_YYYYMMDD_HHMMSS.sql.gz`
4. Verifies the dump is non-empty and readable
5. Deletes files older than 30 days

### Setting up the cron job (host server)

```bash
chmod +x /opt/tidebook/docker/backup.sh

crontab -e
# Add:
0 2 * * * PGPASSWORD=yourpassword DB_HOST=localhost DB_PORT=5432 DB_NAME=tidebook DB_USER=tidebook BACKUP_DIR=/opt/backups /opt/tidebook/docker/backup.sh >> /var/log/tidebook-backup.log 2>&1
```

### Copying backups off-server

Run this after the main backup (e.g., at 2:30 AM):

```bash
30 2 * * * rsync -avz /opt/backups/ backup@nas.seattleaquarium.org:/tidebook-backups/ >> /var/log/tidebook-rsync.log 2>&1
```

### Backup verification (weekly automated check)

The CI pipeline includes a weekly job that restores the most recent backup to a test database and runs a smoke query. See `.github/workflows/ci.yml` for the `backup-verify` job.

To manually verify a backup:

```bash
# Create a test database
docker exec -it tidebook-db-1 psql -U tidebook -c "CREATE DATABASE tidebook_verify;"

# Restore
gzip -cd /opt/backups/tidebook_20260415_020000.sql.gz | \
  docker exec -i tidebook-db-1 psql -U tidebook -d tidebook_verify

# Smoke test
docker exec -it tidebook-db-1 psql -U tidebook -d tidebook_verify \
  -c "SELECT COUNT(*) FROM \"Booking\";"

# Clean up
docker exec -it tidebook-db-1 psql -U tidebook -c "DROP DATABASE tidebook_verify;"
```

---

## Full Restore Procedure

**Estimated recovery time (RTO): 30–60 minutes** (depending on database size and network speed)

> ⚠️ This procedure restores the database from a backup. All changes made after the backup was taken will be lost. Ensure you understand the scope before proceeding.

### Step 1: Stop the application

```bash
cd /opt/tidebook
docker compose -f docker/docker-compose.yml down
```

### Step 2: Choose the backup to restore

```bash
ls -lth /opt/backups/tidebook_*.sql.gz | head -10
# Pick the most recent backup, or the last known-good backup before an incident
```

### Step 3: Restore the backup

```bash
# Start only the database container
docker compose -f docker/docker-compose.yml up -d db

# Wait for Postgres to be ready
sleep 10

# Drop and recreate the database
docker exec -it tidebook-db-1 psql -U tidebook -c "DROP DATABASE tidebook;"
docker exec -it tidebook-db-1 psql -U tidebook -c "CREATE DATABASE tidebook;"

# Restore
gzip -cd /opt/backups/tidebook_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i tidebook-db-1 psql -U tidebook -d tidebook
```

### Step 4: Verify the restore

```bash
docker exec -it tidebook-db-1 psql -U tidebook -d tidebook \
  -c "SELECT COUNT(*) FROM \"Booking\"; SELECT COUNT(*) FROM \"User\";"
```

### Step 5: Restart the application

```bash
docker compose -f docker/docker-compose.yml up -d
```

The entrypoint script will run `prisma migrate deploy` to apply any migrations that postdate the backup.

### Step 6: Verify the application

```bash
curl https://tidebook.seattleaquarium.org/health
# Visit /admin and confirm login works
```

---

## Uploaded File Recovery

If using local filesystem storage (`UPLOAD_DIR=/var/tidebook/uploads`):

```bash
# Files are in the Docker volume "uploads"
# To back up:
docker run --rm -v tidebook_uploads:/data -v /opt/backups:/backup \
  alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .

# To restore:
docker run --rm -v tidebook_uploads:/data -v /opt/backups:/backup \
  alpine tar xzf /backup/uploads_YYYYMMDD.tar.gz -C /data
```

If using S3-compatible storage, enable versioning on the bucket and use the provider's restore functionality.

---

## If the Encryption Key Is Lost

`PII_ENCRYPTION_KEY` is the AES-256 key used to encrypt all contact PII in the database. **If this key is lost:**

- All stored `contactName`, `contactEmail`, `contactPhone`, and `organizationName` fields become permanently unreadable
- The application cannot decrypt PII and will fail to serve booking details
- Existing bookings are not deleted — only the contact details become unreadable

**There is no recovery from a lost encryption key without the key itself.**

Mitigation:
1. Store the key in your organization's password manager immediately after setup
2. Store it in at least two separate locations (e.g., password manager + encrypted file on network share)
3. The key is a 64-character hex string — it can be memorized or printed as a QR code for disaster recovery

If the key is lost and the situation is unrecoverable, the database must be rebuilt from scratch. Existing booking data will need to be re-entered manually.

---

## Retention Policy

| Item | Retention |
|------|-----------|
| Database backups (local) | 30 days |
| Database backups (off-server) | 1 year minimum |
| Application-level completed bookings | Configurable via Admin → Settings → `data_retention_years` (default: 7 years) |
| Audit log entries | Indefinite (append-only, never purged) |
| Email logs | Indefinite (linked to bookings; purged with booking archival) |

Booking archival is a soft-delete with CSV export before purge — it is never an immediate hard delete. The process is initiated manually from the admin UI (future Phase 3 feature).
