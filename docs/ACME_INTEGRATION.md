# Tidebook — ACME Integration

ACME is the Seattle Aquarium's payment and ticketing system. Tidebook does not process payments directly — it sends booking data to ACME after a booking is confirmed and stores the returned order number for reconciliation.

---

## How It Works

The integration uses an **adapter pattern**. The core booking logic calls `pushToAcme(bookingId)` — it has no knowledge of whether ACME is a live API, a mock, or a future replacement. Swapping the ACME provider requires only implementing the `AcmeAdapter` interface in `apps/api/src/adapters/acmeAdapter.ts`.

### Trigger conditions

A push to ACME is attempted:
1. Automatically after a booking is **confirmed** (either auto-confirmed for paid bookings or manually confirmed by a Registrar)
2. Manually by a Registrar from the booking detail page ("Retry ACME Push" button)
3. Via the admin API: `POST /api/v1/admin/bookings/:id/acme-retry`

### Push payload

```json
{
  "groupName": "Lincoln Elementary",
  "visitDate": "2026-04-15",
  "arrivalTime": "09:00",
  "groupSize": 30,
  "ticketType": "SCHOOL",
  "paymentStatus": "PAID",
  "orderReference": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

| Field | Type | Source |
|-------|------|--------|
| `groupName` | string | Decrypted `Booking.organizationName` |
| `visitDate` | string (YYYY-MM-DD) | `Booking.visitDate` |
| `arrivalTime` | string (HH:MM) | `Booking.arrivalTimeSlot` |
| `groupSize` | integer | `studentCount + adultCount` |
| `ticketType` | string | `Booking.groupType` (e.g., `SCHOOL`, `CONNECTIONS`) |
| `paymentStatus` | string | `Booking.paymentMethod` (e.g., `PAID`, `INVOICE`, `SCHOLARSHIP`) |
| `orderReference` | UUID | `Booking.id` — unique idempotency key |

### Expected response

```json
{
  "orderNumber": "ACM-2026-00421",
  "status": "confirmed"
}
```

The `orderNumber` is stored in `Booking.acmeOrderNumber` and displayed in the admin booking detail view and the Daily Visit Log export.

---

## Failure Handling

If the ACME push fails (network error, non-2xx response, timeout):

1. The error is logged to the structured log with the booking ID and error message
2. `Booking.internalNotes` is updated with a system-generated flag:
   ```
   [SYSTEM] ACME push failed at 2026-04-15T10:30:00Z. Manual entry required.
   <error message>
   ```
3. The booking remains confirmed — ACME failure does **not** roll back the booking
4. The Registrar sees the flag in the booking detail view and can either retry via the button or enter the order manually

**ACME failures are operational exceptions, not booking failures.** The booking is valid regardless of whether ACME received it.

---

## Development / Test Configuration

Set `ACME_USE_MOCK=true` in `.env` to use the mock adapter. The mock:
- Accepts any payload
- Returns a fake order number (`MOCK-<timestamp>`)
- Adds a 50ms delay to simulate network latency
- Never makes real HTTP calls

This is the default for development and all test environments.

---

## Testing the Live Connection

```bash
# From inside the running API container:
docker exec -it tidebook-api-1 sh

# Trigger a push for a specific booking ID
node -e "
const { retryAcmePush } = require('./dist/adapters/acmeAdapter');
retryAcmePush('your-booking-id-here').then(() => console.log('Done'));
"
```

Or use the admin UI: navigate to any confirmed booking → "Retry ACME Push".

---

## Updating ACME Credentials

1. Get the new API key from the ACME admin portal
2. Update `ACME_API_URL` and `ACME_API_KEY` in `.env`
3. Restart the API container:
   ```bash
   docker compose restart api
   ```
4. Confirm the health check shows ACME as connected:
   ```bash
   curl https://tidebook.seattleaquarium.org/health
   # "acme": "connected"
   ```

---

## Updating the ACME Adapter

If the ACME API changes (new endpoint, new auth method, different payload shape):

1. Open `apps/api/src/adapters/acmeAdapter.ts`
2. Modify only the `LiveAcmeAdapter` class — specifically the `pushBooking` method
3. The `AcmePayload` and `AcmeResponse` interfaces may need updating if the payload shape changes
4. Update `ACME_INTEGRATION.md` (this file) to reflect the new payload
5. The mock adapter and all booking logic are unaffected

No other files need to change. This is the value of the adapter pattern.

---

## Checking ACME Push Status for a Booking

In the admin UI:
- Open a booking detail page
- If `acmeOrderNumber` is populated, the push succeeded
- If `internalNotes` contains `[SYSTEM] ACME push failed`, manual intervention is needed

Via the API:
```http
GET /api/v1/admin/bookings/:id
Authorization: Bearer <token>
```
Look for `acmeOrderNumber` (null = not pushed, or push failed) and `internalNotes` for failure details.
