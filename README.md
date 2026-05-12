# Tidebook

Group registration and booking management system for the Seattle Aquarium's School and Public Programs department.

Replaces YouCanBookMe + Excel + Outlook with a single integrated system: public self-serve booking, daily capacity enforcement, self-serve reschedule/cancel, a Registrar admin dashboard, scholarship management, ACME payment integration, and automated email workflows.

---

## Quick Start (Docker)

**Prerequisites:** Docker ≥ 24, Docker Compose ≥ 2.20

```bash
git clone https://github.com/your-org/tidebook.git
cd tidebook

# Create env file and fill in values
cp .env.example .env

# Generate required secrets
openssl rand -hex 32      # → PII_ENCRYPTION_KEY
openssl rand -base64 64   # → JWT_ACCESS_SECRET
openssl rand -base64 64   # → JWT_REFRESH_SECRET
openssl rand -base64 32   # → POSTGRES_PASSWORD

# Create uploads directory
mkdir -p /var/tidebook/uploads

# Start all services (builds images, runs migrations, seeds DB)
docker compose -f docker/docker-compose.yml up -d

# Verify
curl http://localhost/health
# → {"status":"ok","database":"connected","acme":"mock"}
```

The app is now running at `http://localhost`. Admin login uses `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.

---

## Local Development (without Docker)

**Prerequisites:** Node.js ≥ 20, PostgreSQL 16 running locally

```bash
# Install all workspace dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env: set DATABASE_URL to your local Postgres instance

# Run database migrations and seed
cd apps/api
npx prisma migrate dev
npx prisma db seed

# Start API and web in watch mode (from repo root)
npm run dev
```

- API: `http://localhost:4000`
- Web: `http://localhost:5173`
- Prisma Studio: `npx prisma studio` (from `apps/api/`)

---

## Monorepo Structure

```
tidebook/
├── apps/
│   ├── api/                  # Express + TypeScript backend
│   │   ├── src/
│   │   │   ├── routes/       # Express routers (admin, public, auth, connections)
│   │   │   ├── services/     # Business logic (bookingService, capacityService, authService, emailService)
│   │   │   ├── adapters/     # ACME adapter (live + mock)
│   │   │   ├── middleware/   # JWT auth, role check, rate limiting, error handler
│   │   │   ├── utils/        # encryption, dates, logger, tokens
│   │   │   └── __tests__/
│   │   │       └── integration/   # Jest + Supertest integration tests
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       ├── migrations/
│   │       └── seed.ts
│   └── web/                  # React 18 + Vite + Tailwind frontend
│       └── src/
│           ├── pages/        # BookingFlow, Admin dashboard, Connections portal
│           ├── components/   # AvailabilityCalendar, BookingCard, etc.
│           ├── hooks/        # React Query hooks
│           └── lib/          # API client, auth context, form schemas
├── packages/
│   └── shared/               # Shared enums, error codes, constants (used by api + web)
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── nginx.conf
│   └── backup.sh             # Nightly pg_dump script
├── docs/                     # Architecture, deployment, security, runbook
├── e2e/                      # Playwright end-to-end tests
└── .github/workflows/ci.yml  # CI: lint, type-check, unit tests, integration tests, npm audit
```

---

## Running Tests

### Unit tests (frontend)

```bash
cd apps/web
npm run test           # Vitest watch mode
npm run test:run       # Single run (CI)
```

### Integration tests (backend)

Requires a running PostgreSQL instance. Set `DATABASE_URL` in `.env` or pass it inline.

```bash
cd apps/api
npm run test:integration        # All integration tests
npm run test:integration -- --testPathPattern=capacity-race   # Specific test file
```

The integration test suite includes:
- `bookings.test.ts` — full booking lifecycle, honeypot, capacity enforcement
- `auth.test.ts` — login, lockout, token rotation, tokenVersion revocation
- `admin.test.ts` — confirm/decline, scholarship review, DVL export, user management
- `capacity-race.test.ts` — concurrent booking race condition (verifies pg_advisory_xact_lock)

### End-to-end tests

Requires the full Docker stack running locally.

```bash
# Start the stack
docker compose -f docker/docker-compose.yml up -d

# Run Playwright tests
cd e2e
npm install
npx playwright test

# With UI (headed mode)
npx playwright test --headed
```

### All tests (CI equivalent)

```bash
# From repo root
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm audit --audit-level=high
```

---

## Environment Variables

See `.env.example` for the full list with descriptions. Required variables for production:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | Database password (used by Docker Compose) |
| `PII_ENCRYPTION_KEY` | 64-char hex string — encrypts all contact PII. **Never change without migration.** |
| `JWT_ACCESS_SECRET` | Signs 15-minute access tokens |
| `JWT_REFRESH_SECRET` | Signs 7-day refresh tokens (must differ from access secret) |
| `SMTP_HOST/PORT/USER/PASS` | Outbound email credentials |
| `EMAIL_FROM` | From address for automated emails |
| `DKIM_DOMAIN/SELECTOR/PRIVATE_KEY` | DKIM signing for email deliverability |
| `ACME_API_URL` / `ACME_API_KEY` | ACME ticketing system (production only) |
| `ACME_USE_MOCK` | `true` for dev/test — uses mock ACME adapter |
| `CORS_ORIGINS` | Allowed frontend origins |
| `WEB_BASE_URL` / `API_BASE_URL` | Public URLs used in email links |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Initial admin credentials (first run only) |

---

## Key Design Decisions

**PII encryption:** Contact names, emails, and phone numbers are encrypted with AES-256-GCM at the application layer before writing to PostgreSQL. An attacker with raw database access sees only ciphertext. The key lives in `PII_ENCRYPTION_KEY` — losing it means PII is permanently unreadable. Store it in a password manager immediately after setup.

**Capacity enforcement:** Bookings use a daily headcount model (not time-windowed). Pending bookings count against capacity. A `pg_advisory_xact_lock` per visit date prevents race conditions when two groups book the same day simultaneously.

**Session revocation:** Every `User` record has a `tokenVersion` integer. Every JWT carries this value at mint time. Incrementing it (logout, password change, admin force-logout) immediately invalidates all outstanding tokens for that user without a token blacklist.

**ACME integration:** Wrapped behind an `AcmeAdapter` interface. A failed ACME push does not cancel or revert the booking — it flags `internalNotes` for manual follow-up. The mock adapter is used in dev and all tests.

**No student data:** Tidebook collects no individual student information — only group-level headcounts and grade ranges. This minimizes COPPA and FERPA exposure by design.

See `docs/ARCHITECTURE.md` for the full ER diagram, API surface, and design rationale.

---

## Documentation

| File | Contents |
|------|----------|
| `docs/ARCHITECTURE.md` | System diagram, data model, API surface, design decisions |
| `docs/DEPLOYMENT.md` | Server setup, env var reference, DNS/DKIM, backup cron |
| `docs/SECURITY.md` | PII encryption, JWT revocation, rate limits, incident response |
| `docs/ACME_INTEGRATION.md` | Adapter pattern, payload schema, failure handling |
| `docs/BACKUP_AND_RECOVERY.md` | Backup procedures, restore steps, retention policy |
| `docs/RUNBOOK.md` | Day-to-day ops: seasons, classes, credentials, ACME retries |

---

## Deployment

See `docs/DEPLOYMENT.md` for the full guide. One-line update procedure:

```bash
cd /opt/tidebook
git pull origin main
docker compose -f docker/docker-compose.yml up -d --build
```

Migrations run automatically on container startup via `prisma migrate deploy`.
