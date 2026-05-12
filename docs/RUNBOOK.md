# Tidebook — Operations Runbook

This document covers day-to-day operational tasks for the Seattle Aquarium registrar team and IT staff.

---

## Opening a New Season

A season controls which dates the public booking form shows as available. Without a published season, the calendar shows all dates as unavailable.

### Steps

1. Log in to the admin dashboard at `https://tidebook.seattleaquarium.org/admin`
2. Navigate to **Settings → Seasons**
3. Click **New Season**
4. Fill in:
   - **Name** — e.g., `2026–2027 School Year`
   - **Start date / End date** — the range of dates the public can book (e.g., Sep 1, 2026 – Jun 30, 2027)
   - **Registration opens** — when the booking form becomes live (e.g., Aug 1, 2026 at 9:00 AM)
   - **Registration closes** — when new bookings stop being accepted
   - **Default daily capacity** — the headcount cap per day. Default is 300. Override individual dates under **Capacity → Daily Overrides**.
5. Click **Save** — the season is saved but not yet visible to the public
6. Review the settings, then click **Publish Season**

Once published, the booking calendar goes live on the registration-opens date. The season cannot be deleted while it has associated bookings, but it can be unpublished to stop new submissions.

### Setting a Date as Unavailable (Blackout)

1. Navigate to **Capacity → Daily Overrides**
2. Click the date to block
3. Toggle **Blackout day** — optionally add a note (not shown publicly)
4. Click **Save**

Existing bookings on that date are not affected. The date will no longer appear as available for new submissions.

---

## Adding or Editing a Class Offering

Class offerings appear in step 4 of the public booking flow.

### Add a new class

1. Navigate to **Classes → Class Offerings**
2. Click **New Class**
3. Fill in:
   - **Name** — shown publicly (e.g., "Puget Sound Ecology")
   - **Description** — shown to group leaders during booking
   - **Grade range** — minimum and maximum grade level (e.g., Grades 3–5)
   - **Duration** — in minutes (e.g., 60)
   - **Capacity** — maximum students per session
   - **Resource requirements** — internal note for staff (e.g., "Needs touch tank room")
4. Click **Save**
5. Toggle **Active** to make it visible in the public booking form

### Edit an existing class

1. Navigate to **Classes → Class Offerings**
2. Click the class name
3. Edit any fields, then click **Save**

Changes take effect immediately. Changing the capacity does not retroactively affect existing bookings.

### Deactivating a class

Set **Active = off**. The class will no longer appear to new bookers but remains visible on existing bookings. Use this to retire classes at end of season without deleting their booking history.

---

## Rotating API Credentials

For step-by-step procedures for each credential type, see `SECURITY.md → Secret Rotation Procedures`. This section covers the operational sequence.

### Rotating the ACME API Key

1. Get the new API key from the ACME admin portal
2. SSH into the server: `ssh admin@tidebook.seattleaquarium.org`
3. Edit the env file:
   ```bash
   nano /opt/tidebook/.env
   # Update: ACME_API_KEY=<new-key>
   ```
4. Restart only the API container (no downtime for the database):
   ```bash
   cd /opt/tidebook
   docker compose -f docker/docker-compose.yml restart api
   ```
5. Verify the integration is live:
   ```bash
   curl https://tidebook.seattleaquarium.org/health
   # Look for: "acme": "connected"
   ```
6. In the admin UI, open any confirmed booking and click **Retry ACME Push** to confirm end-to-end connectivity

### Rotating JWT Secrets

> **Warning:** This immediately logs out all staff and Connections Partners. Coordinate with the team before doing this during business hours.

```bash
# Generate new secrets
openssl rand -base64 64   # for JWT_ACCESS_SECRET
openssl rand -base64 64   # for JWT_REFRESH_SECRET

# Update .env, then restart
docker compose -f docker/docker-compose.yml restart api
```

All users will see a "Session expired" message and need to log in again.

### Rotating SMTP Credentials

1. Update credentials in your SMTP provider dashboard
2. Update `SMTP_USER` and `SMTP_PASS` in `/opt/tidebook/.env`
3. Restart the API: `docker compose -f docker/docker-compose.yml restart api`
4. Send a test email from **Admin → Settings → Email → Send Test Email**

---

## Forcing a User Logout

Use this when a staff member leaves, loses their device, or you suspect their account is compromised.

### Via the admin UI

1. Navigate to **Settings → Users**
2. Find the user and click their name
3. Click **Force Logout** — this immediately increments their `tokenVersion`, invalidating all active sessions
4. Optionally, click **Deactivate** to prevent new logins

### Via the API (if the admin UI is unavailable)

```bash
curl -X POST https://tidebook.seattleaquarium.org/api/v1/admin/users/<user-id>/force-logout \
  -H "Authorization: Bearer <your-admin-token>"
```

The user will be logged out within seconds on their next request.

---

## Manually Retrying a Failed ACME Push

When ACME is unavailable or times out, bookings are flagged with a system note rather than being rejected. The booking remains valid; only the ACME order number is missing.

### Identifying bookings that need a retry

1. Navigate to **Bookings**
2. Filter by **Status: Confirmed**
3. Look for the orange **ACME Failed** badge — bookings without an ACME order number show this indicator
4. Or search `internalNotes` for `[SYSTEM] ACME push failed`

### Retrying via the admin UI

1. Open the booking detail page
2. Click **Retry ACME Push** (visible when `acmeOrderNumber` is empty)
3. If the retry succeeds, the order number is populated and the system note is cleared
4. If it fails again, the system note is updated with the new timestamp and error

### Retrying via the API

```bash
curl -X POST https://tidebook.seattleaquarium.org/api/v1/admin/bookings/<booking-id>/acme-retry \
  -H "Authorization: Bearer <your-admin-token>"
```

### If ACME is down for an extended period

Retry attempts are recorded with timestamps in `internalNotes`. Once ACME is back up:
1. Use the admin booking list filtered to confirmed bookings without an ACME order number
2. Retry each one individually, or ask IT to script a bulk retry using the API

There is no automatic retry queue in Phase 1 — retries are manual.

---

## Checking Email Delivery Status

### For a specific booking

1. Open the booking detail page in the admin UI
2. Scroll to **Email History**
3. Each row shows: trigger type, sent timestamp, recipient address (masked), and status (`SENT` or `FAILED`)
4. If status is `FAILED`, the `errorMessage` column shows the SMTP error

### Checking recent delivery failures

```bash
# View API logs for email errors (last 200 lines)
docker logs tidebook-api-1 --tail=200 | grep '"triggerType"'

# Or filter for failures specifically
docker logs tidebook-api-1 --tail=500 | grep 'email.*fail\|SMTP'
```

### Resending a confirmation email

There is no single-click resend in Phase 1. To resend:

1. Locate the booking in the admin UI
2. Note the contact email
3. Use the **Internal Notes** field to record that you are manually resending
4. Use your organization's email client to forward the confirmation manually

Or ask IT to trigger a resend via a direct API call if they have a test email endpoint available in the dev tools.

### Checking SMTP configuration

```bash
curl https://tidebook.seattleaquarium.org/health
# Look for: "smtp": "connected" (if health check includes SMTP probe)
```

If SMTP credentials are wrong or the provider is down, all outbound emails will fail silently (logged in `EmailLog` with `status: FAILED`). Update credentials per the SMTP rotation procedure above.

---

## Approving or Denying a Scholarship Application

1. Navigate to **Scholarships** in the admin sidebar
2. Filter by **Status: Submitted** or **Under Review**
3. Click the application to open it
4. Review the uploaded document (click to download), Title I status, enrollment count, and qualifying info
5. Enter the **Budget Allocated** (for approvals) or leave blank (for denials)
6. Click **Approve** or **Deny** and enter review notes
7. The booking contact receives an automated email based on the outcome

Scholarship status is tracked separately from booking status. An approved scholarship does not automatically confirm the booking — the Registrar still confirms via the booking detail page.

---

## Exporting the Daily Visit Log (DVL)

The DVL lists all confirmed bookings for a date range, used for daily operations and capacity reporting.

### From the admin UI

1. Navigate to **Reports → Daily Visit Log**
2. Set the date range
3. Click **Export CSV** to download

### Via the API

```bash
# JSON format
curl "https://tidebook.seattleaquarium.org/api/v1/admin/dvl?dateFrom=2026-04-01&dateTo=2026-04-30" \
  -H "Authorization: Bearer <your-token>"

# CSV format (opens in Excel)
curl "https://tidebook.seattleaquarium.org/api/v1/admin/dvl?dateFrom=2026-04-01&dateTo=2026-04-30&format=csv" \
  -H "Authorization: Bearer <your-token>" \
  -o dvl-april-2026.csv
```

The CSV includes: date, arrival time, group name, group type, student count, adult count, class sessions, payment method, and ACME order number.

---

## Checking Application Health

```bash
# Overall health check
curl https://tidebook.seattleaquarium.org/health

# Expected healthy response:
# {"status":"ok","database":"connected","acme":"connected"}

# View recent API logs
docker logs tidebook-api-1 --tail=100 --follow

# Check if containers are running
docker ps | grep tidebook
```

If a container is not running:

```bash
cd /opt/tidebook
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml ps
```
