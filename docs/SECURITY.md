# Tidebook — Security

## Overview

Tidebook processes personally identifiable information (PII) for school group contacts and, indirectly, for children (grade-level group data). This document describes the security architecture, data collection policies, and operational security procedures.

---

## What Data Is Collected and Why

### Booking contacts (adult PII)
| Field | Why collected |
|-------|---------------|
| Contact name | Identify the lead teacher for this booking |
| Contact email | Send confirmation, reminder, and follow-up emails |
| Contact phone | Emergency contact for day-of coordination |
| Organization name | Identify the school or group |

### Group-level metadata (no individual student data)
| Field | Why collected |
|-------|---------------|
| Student count | Capacity enforcement and ACME ticketing |
| Adult/chaperone count | Capacity enforcement and chaperone ratio verification |
| Grade level(s) | Class suitability matching |

### COPPA and FERPA compliance

**Tidebook does not collect any individual student data.** No student names, dates of birth, student ID numbers, or other personally identifying information about minors is collected at any point in the booking flow. Only group-level aggregate data is stored (headcount and grade range).

This is a deliberate design decision to minimize COPPA (Children's Online Privacy Protection Act) and FERPA (Family Educational Rights and Privacy Act) exposure. All contact data belongs to adult educators or administrators, not to students.

This decision is documented here and in `README.md` to make the data minimization rationale explicit and auditable.

---

## PII Encryption at Rest

All contact PII fields (name, email, phone, organization name) are encrypted using **AES-256-GCM** at the application layer before writing to PostgreSQL. Email addresses in the `EmailLog` table are also encrypted.

**Implementation:**
- Each field is independently encrypted with a random 16-byte IV
- The stored format is `iv_hex:tag_hex:ciphertext_hex`
- The encryption key is a 32-byte key stored in the `PII_ENCRYPTION_KEY` environment variable
- Decryption happens at the API response boundary (service layer), never at the database layer

**Why application-layer encryption, not just disk encryption?**
Disk encryption protects against physical media theft. Application-layer encryption protects against database credential compromise — an attacker with read access to the database sees only ciphertext. Combined with disk encryption, this provides defense in depth.

**Key rotation warning:** Rotating the `PII_ENCRYPTION_KEY` requires a data migration that re-encrypts all existing records. Do not simply change the key without running the migration — see "Key Rotation" below.

---

## Authentication and Authorization

### Staff accounts (JWT)
- 15-minute access tokens, 7-day refresh tokens stored as HttpOnly cookies
- Refresh token rotation on every use — replaying an old refresh token immediately fails
- `tokenVersion` field on every `User` record — every JWT carries the version at issuance; server validates it on every request. Incrementing this field (logout, password change, admin force-logout) immediately invalidates all outstanding tokens for that user
- Bcrypt with minimum cost factor 12 for password storage
- Account lockout after 5 failed login attempts (configurable); default 15-minute lockout
- Failed login attempts and lockout state stored in the database

### Connections Partners (JWT)
- Same JWT structure and tokenVersion revocation mechanism as staff accounts
- Separate login endpoint at `/api/v1/connections/auth/login`
- Password reset via email magic link only (no admin-set passwords after creation)

### Reschedule tokens
- Single-use 64-byte random tokens generated with `crypto.randomBytes`
- Stored as SHA-256 hash in the database — raw token never stored
- Expire a configurable number of days before the visit date (default: 48 hours before)
- Token validation endpoint rate-limited at 10 attempts/hour per token; returns 404 (not 429) on invalid/expired tokens to avoid confirming token existence

### Magic link tokens
- 64-byte random tokens, SHA-256 hashed in DB
- Expire after 15 minutes
- Single-use: deleted from DB on first use

---

## HTTP Security Headers

The following headers are set on every response via `helmet` middleware:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; …` |

---

## Input Validation and Injection Prevention

- All API inputs validated with **Zod schemas** server-side, regardless of client-side validation
- All database queries use **Prisma ORM with parameterized queries** — no raw SQL string interpolation
- File uploads restricted to PDF, JPEG, PNG by magic bytes (not just extension); max 5 MB; stored outside the web root; served only via authenticated endpoints
- CORS configured to allowlist only `CORS_ORIGINS` — no wildcard origins
- Honeypot field on the public booking form catches bot submissions silently

---

## Rate Limiting

| Endpoint type | Limit |
|---------------|-------|
| Public booking form | 10 requests/minute per IP |
| Auth login | 5 attempts/15 min per IP |
| Magic link requests | 3/hour per email address |
| Reschedule token validation | 10/hour per token |

Rate limit state is stored in-memory by default. Set `REDIS_URL` to use Redis for distributed deployments.

---

## Audit Logging

Every significant action is written to the `AuditLog` table:
- Booking state changes (created, confirmed, declined, cancelled, rescheduled)
- Admin actions (user created, template edited, season published, settings changed)
- Authentication events (login, logout, failed login, magic link used)

The audit log is **append-only** — no delete or update endpoints exist for `AuditLog` records. IP addresses are logged on all authentication events.

---

## Secret Rotation Procedures

### PII Encryption Key (`PII_ENCRYPTION_KEY`)

**When to rotate:** Only if the key is believed compromised. This is a disruptive operation.

**Procedure:**
1. Take a full database backup before starting
2. Write a migration script that:
   - Reads each PII-containing row
   - Decrypts with the old key
   - Re-encrypts with the new key
   - Writes the new ciphertext back
3. Update `.env` with the new key
4. Run the migration script while the application is stopped
5. Restart the application
6. Verify by loading a booking in the admin UI
7. Store the old key securely for 30 days in case of emergency rollback

### JWT Secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`)

**Effect:** All active sessions are invalidated immediately. All logged-in users (staff and Connections Partners) must re-authenticate.

**Procedure:**
1. Generate new secrets: `openssl rand -base64 64`
2. Update `.env`
3. Restart the API container: `docker compose restart api`

### SMTP Credentials

1. Update credentials in your SMTP provider's dashboard
2. Update `SMTP_USER` and `SMTP_PASS` in `.env`
3. Restart the API: `docker compose restart api`
4. Send a test email from the Admin → Settings page to verify

### DKIM Private Key

1. Generate a new key pair (see `DEPLOYMENT.md`)
2. Update the DNS TXT record with the new public key (use a new selector, e.g., `education2`)
3. Update `DKIM_SELECTOR` and `DKIM_PRIVATE_KEY` in `.env`
4. Restart the API
5. Monitor email delivery for 24 hours before decommissioning the old DNS record

### ACME API Key

1. Rotate the key in the ACME admin portal
2. Update `ACME_API_KEY` in `.env`
3. Restart the API
4. Trigger a test ACME push from the admin booking detail page

### Database Password (`POSTGRES_PASSWORD`)

1. Enter the running database container:
   ```bash
   docker exec -it tidebook-db-1 psql -U tidebook -d tidebook
   ALTER USER tidebook PASSWORD 'new-strong-password';
   \q
   ```
2. Update `POSTGRES_PASSWORD` in `.env`
3. Restart all services: `docker compose restart`

---

## Incident Response

### Suspected credential compromise

1. **Immediately** rotate the compromised credential (see procedures above)
2. Review `AuditLog` for unauthorized actions since the suspected compromise date
3. Check `EmailLog` for unexpected outbound emails
4. Notify affected users if PII access is suspected
5. Document the incident and timeline

### Suspected data breach (database exposure)

1. Take the application offline immediately
2. Rotate `PII_ENCRYPTION_KEY` (following the migration procedure above)
3. Rotate all other credentials
4. Review access logs for the scope of exposure
5. Contact legal/compliance counsel — state breach notification laws may apply
6. Notify the Aquarium's IT security team

### Lost encryption key

If `PII_ENCRYPTION_KEY` is lost with no backup, stored PII cannot be recovered. The database must be treated as containing unreadable data. **This is why the key must be stored in a password manager separately from the server.**

See `BACKUP_AND_RECOVERY.md` for the encryption key backup procedure.

---

## Dependency Security

- `npm audit` runs as a required CI step — builds fail on high or critical vulnerabilities
- All packages pinned to exact versions via `.npmrc` `save-exact=true`
- Review `npm audit` output before every production deployment:
  ```bash
  npm audit --audit-level=high
  ```
- Apply security patches promptly. For minor/patch updates: `npm update` then test. For major updates: review changelog before upgrading.
