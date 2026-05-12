# Tidebook — Deployment Guide

This guide is written for the Seattle Aquarium IT department. No programming knowledge is required to deploy and operate Tidebook.

---

## Prerequisites

Install these on the server before proceeding:

- **Docker Engine** ≥ 24 — [docs.docker.com/engine/install](https://docs.docker.com/engine/install/)
- **Docker Compose** ≥ 2.20 (included with Docker Desktop, or install the plugin)
- **Git** — to pull updates
- A Linux server (Ubuntu 22.04 LTS or Rocky Linux 9 recommended)
- At minimum: 2 CPU cores, 4 GB RAM, 50 GB disk
- A domain name with DNS pointed at the server (e.g., `tidebook.seattleaquarium.org`)
- An SSL certificate (Let's Encrypt or your existing certificate)

---

## First-Time Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-org/tidebook.git /opt/tidebook
cd /opt/tidebook
```

### 2. Create the environment file

```bash
cp .env.example .env
nano .env   # edit all required values
```

See the **Environment Variables Reference** section below for every variable.

### 3. Generate required secrets

```bash
# PII encryption key (32 bytes = 64 hex characters)
openssl rand -hex 32

# JWT access secret
openssl rand -base64 64

# JWT refresh secret (must be different from access secret)
openssl rand -base64 64

# Strong Postgres password
openssl rand -base64 32
```

Paste each value into the corresponding variable in `.env`.

### 4. Place SSL certificates

```bash
mkdir -p /opt/tidebook/docker/certs
cp /path/to/your/fullchain.pem /opt/tidebook/docker/certs/cert.pem
cp /path/to/your/privkey.pem   /opt/tidebook/docker/certs/key.pem
```

Update `docker/nginx.conf` to enable HTTPS if not already done:
```nginx
listen 443 ssl;
ssl_certificate /etc/nginx/certs/cert.pem;
ssl_certificate_key /etc/nginx/certs/key.pem;
```

### 5. Create the uploads directory

```bash
mkdir -p /var/tidebook/uploads
```

### 6. Start the application

```bash
cd /opt/tidebook
docker compose -f docker/docker-compose.yml up -d
```

The entrypoint script runs `prisma migrate deploy` and the seed script automatically on first start. After ~30 seconds, the application is available at your domain.

### 7. Verify it's running

```bash
curl http://localhost/health
# Expected: {"status":"ok","database":"connected","acme":"mock"}
```

---

## Environment Variables Reference

Copy from `.env.example`. Every variable must be set in production.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string. Set automatically by Docker Compose from `POSTGRES_PASSWORD`. |
| `POSTGRES_PASSWORD` | ✅ | Postgres database password. Set in `.env`, used by Docker Compose. |
| `PII_ENCRYPTION_KEY` | ✅ | 64-character hex string (32 bytes). Encrypts names, emails, phone numbers. **Never change after data is stored without migrating existing records.** |
| `JWT_ACCESS_SECRET` | ✅ | Secret for signing 15-minute access tokens. Rotate to invalidate all sessions. |
| `JWT_REFRESH_SECRET` | ✅ | Secret for signing 7-day refresh tokens. Must differ from access secret. |
| `JWT_ACCESS_EXPIRES_IN` | — | Default: `15m`. Duration of access tokens. |
| `JWT_REFRESH_EXPIRES_IN` | — | Default: `7d`. Duration of refresh tokens. |
| `BCRYPT_ROUNDS` | — | Default: `12`. Cost factor for password hashing. Do not lower. |
| `SMTP_HOST` | ✅ | SMTP server hostname (e.g., `smtp.sendgrid.net`). |
| `SMTP_PORT` | ✅ | SMTP port (587 for TLS, 465 for SSL). |
| `SMTP_SECURE` | ✅ | `true` for port 465, `false` for 587 with STARTTLS. |
| `SMTP_USER` | ✅ | SMTP authentication username. |
| `SMTP_PASS` | ✅ | SMTP authentication password. |
| `EMAIL_FROM` | ✅ | From address for all automated emails (e.g., `Seattle Aquarium Education <education@seattleaquarium.org>`). Must match your DKIM domain. |
| `DKIM_DOMAIN` | ✅ | Your email domain (e.g., `seattleaquarium.org`). |
| `DKIM_SELECTOR` | ✅ | DKIM key selector (e.g., `education`). Must match your DNS TXT record. |
| `DKIM_PRIVATE_KEY` | ✅ | RSA private key for DKIM signing. Generate: `openssl genrsa 2048`. Paste as a single line with `\n` for newlines. |
| `UPLOAD_DIR` | ✅ | Filesystem path for scholarship document uploads. Must be outside the web root. Default: `/var/tidebook/uploads`. |
| `ACME_API_URL` | ✅ (prod) | ACME ticketing system API base URL. |
| `ACME_API_KEY` | ✅ (prod) | ACME API authentication key. |
| `ACME_USE_MOCK` | — | `true` to use the mock ACME adapter (for testing). Set `false` in production. |
| `CORS_ORIGINS` | ✅ | Comma-separated list of allowed frontend origins (e.g., `https://tidebook.seattleaquarium.org`). |
| `WEB_BASE_URL` | ✅ | Public URL of the web frontend. Used in email links. |
| `API_BASE_URL` | ✅ | Public URL of the API. |
| `LOG_LEVEL` | — | Default: `info`. Options: `error`, `warn`, `info`, `debug`. |
| `SEED_ADMIN_EMAIL` | ✅ | Email address for the initial admin user (first-run only). |
| `SEED_ADMIN_PASSWORD` | ✅ | Password for the initial admin user. Change after first login. |

---

## DNS Setup for Email Deliverability

Poor email deliverability means confirmations land in spam — a critical failure mode. Configure all three:

### SPF Record

Add a TXT record to your DNS allowing your sending server:

```
Type: TXT
Name: @  (or seattleaquarium.org.)
Value: v=spf1 include:yourmailprovider.com ~all
```

Replace `yourmailprovider.com` with your SMTP provider's SPF include (e.g., `include:sendgrid.net` or `include:amazonses.com`).

### DKIM Record

1. Generate a key pair:
   ```bash
   openssl genrsa -out dkim_private.pem 2048
   openssl rsa -in dkim_private.pem -pubout -out dkim_public.pem
   ```
2. Extract the public key value (base64 string without headers).
3. Add a DNS TXT record:
   ```
   Type: TXT
   Name: education._domainkey.seattleaquarium.org
   Value: v=DKIM1; k=rsa; p=<your-public-key-base64>
   ```
4. Paste the private key into `DKIM_PRIVATE_KEY` in `.env` (replace literal newlines with `\n`).

### DMARC Record

```
Type: TXT
Name: _dmarc.seattleaquarium.org
Value: v=DMARC1; p=quarantine; rua=mailto:it@seattleaquarium.org; pct=100
```

Start with `p=quarantine` and move to `p=reject` after confirming no legitimate mail is failing.

---

## Nightly Backup Setup

The backup script at `docker/backup.sh` runs `pg_dump` and stores compressed `.sql.gz` files.

### Option A: Host cron job (recommended)

```bash
# On the host server, run as root or a dedicated backup user:
chmod +x /opt/tidebook/docker/backup.sh

# Edit crontab:
crontab -e

# Add this line to run at 2 AM daily:
0 2 * * * PGPASSWORD=yourpassword DB_HOST=localhost DB_PORT=5432 DB_NAME=tidebook DB_USER=tidebook BACKUP_DIR=/opt/backups /opt/tidebook/docker/backup.sh >> /var/log/tidebook-backup.log 2>&1
```

### Option B: Docker scheduled container

Uncomment the `backup` service in `docker/docker-compose.yml` and create `/etc/cron.d/tidebook-backup` inside the container.

### Store backups off-server

Copy nightly backups to a separate storage location (NAS, network share, or cloud bucket):

```bash
# Example: rsync to a NAS
rsync -avz /opt/backups/ backup-user@nas.seattleaquarium.org:/tidebook-backups/
```

**Retention:** Backups are automatically deleted after 30 days by the script. Keep at least 30 days locally and 1 year off-server.

---

## How to Update

```bash
cd /opt/tidebook

# Pull latest code
git pull origin main

# Rebuild and restart (migrations run automatically on startup)
docker compose -f docker/docker-compose.yml up -d --build
```

Migrations are run by `prisma migrate deploy` in the entrypoint script — they are always forward-only and backward-compatible. If a migration fails, the container will not start. Restore from backup and investigate.

---

## Rotating Credentials

See `SECURITY.md → Secret Rotation Procedures` for step-by-step instructions for each credential type.

---

## Checking Application Health

```bash
# Overall health
curl https://tidebook.seattleaquarium.org/health

# View API logs
docker logs tidebook-api-1 --tail=100 --follow

# View database logs
docker logs tidebook-db-1 --tail=50

# Enter a running API container for debugging
docker exec -it tidebook-api-1 sh
```

---

## Firewall Configuration

Open only these ports:

| Port | Protocol | Description |
|------|----------|-------------|
| 80 | TCP | HTTP (redirects to HTTPS) |
| 443 | TCP | HTTPS |
| 22 | TCP | SSH (restrict to known IPs) |

Close all others, especially 4000 (API), 5432 (Postgres) — these should only be accessible within the Docker network.
