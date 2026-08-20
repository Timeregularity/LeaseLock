# LeaseLock Operations

## Production configuration

Set `NODE_ENV=production`, a strong `DATABASE_URL`, and the exact HTTPS `CLIENT_ORIGIN`. Development seed credentials must never be enabled in a public deployment. Secrets belong in the deployment platform's secret manager, not source control.

## Deployment

Build and start the complete local production stack:

```powershell
docker compose build api
docker compose run --rm api node server/db/migrate.js
docker compose up -d
```

The API and React application are served at `http://localhost:8080`. `/v1/health` is the liveness probe and `/v1/health/ready` verifies PostgreSQL readiness.

## Monitoring

Collect JSON stdout logs and alert on elevated HTTP 5xx rates, readiness failures, hold-expiry worker errors, waitlist-promotion errors, audit-write failures, database pool exhaustion, and p95 latency. Every response includes `X-Request-Id` for correlation.

Recommended initial objectives:

- Availability: 99.9%
- API p95 latency: below 500 ms
- Booking/seat double-allocation: zero
- Error rate: below 1%

## Backups

Create an encrypted PostgreSQL backup daily and retain at least 14 days. For a local demonstration:

```powershell
docker exec leaselock-postgres-1 pg_dump -U leaselock -d leaselock -Fc -f /tmp/leaselock.dump
docker cp leaselock-postgres-1:/tmp/leaselock.dump ./backups/leaselock.dump
```

Restores must be tested periodically in a separate database. Never restore over the active database without a verified maintenance and rollback plan.

## Incident basics

1. Check readiness and container status.
2. Correlate failures by request ID.
3. Preserve logs and audit records.
4. Stop unsafe write traffic if an allocation invariant is threatened.
5. Restore service or database from a verified point.
6. Document cause, impact, and prevention.

## Load test

With the API running, execute `npm run test:load`. Override `LOAD_TEST_URL`, `LOAD_TEST_REQUESTS`, and `LOAD_TEST_CONCURRENCY` as needed. Do not point this script at infrastructure without permission.
