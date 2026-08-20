# LeaseLock v1 Requirements

Status: Approved baseline for implementation  
Last updated: 20 August 2026

## 1. Product goal

LeaseLock is an event-seat reservation system. Customers can discover events, temporarily hold an available seat, and confirm or cancel a reservation. Administrators can manage events and inspect seat inventory. The backend and database are authoritative for availability, holds, reservations, permissions, and expiry.

## 2. v1 scope

### Included

- Email-and-password customer accounts
- Customer and administrator roles
- Event browsing and event details
- Assigned-seat inventory with section and price
- One grouped temporary hold of up to six seats per customer at a time
- Hold confirmation and reservation cancellation
- Customer reservation history and profile management
- Administrator event management and seat inspection
- Concurrency protection, idempotent writes, audit records, and operational health checks

### Excluded from v1

- Payments and refunds
- General-admission bookings
- Social login and multi-factor authentication
- Ticket transfers, waitlists, discount codes, and loyalty programs
- Customer-created events
- Email/SMS delivery and QR-code admission scanning

These exclusions may be added after the core reservation invariant is proven in production.

## 3. User roles

### Guest

A guest can:

- Register and sign in
- Browse published, non-cancelled events
- View event details and public seat availability

A guest cannot hold a seat, create a reservation, view customer data, or access administration routes.

### Customer

A customer can:

- Perform every guest action
- Select and hold up to six available seats together
- Release their own active hold
- Confirm their own valid hold
- View and cancel their own reservations
- View and update their own profile

A customer cannot inspect another customer's identity, hold, reservation, or profile.

### Administrator

An administrator can:

- Perform customer actions
- Create and edit events
- Change an event between `DRAFT`, `PUBLISHED`, and `CANCELLED`
- Configure and inspect event-seat inventory
- View aggregate operational statistics and active hold metadata
- Run the protected concurrency demonstration

An administrator cannot bypass reservation invariants. Administrative changes must be authorized and audited.

## 4. Event rules

- An event starts as `DRAFT` and is not publicly visible.
- A `PUBLISHED` event is publicly visible and can accept holds until its start time.
- A `CANCELLED` event cannot accept new holds or confirmations.
- An event requires a name, venue, description, start time, timezone, and at least one seat before publication.
- Seat identifiers must be unique within an event.
- An event's seat layout cannot be destructively changed after a reservation exists. Safe descriptive or price changes must not alter existing confirmed reservation snapshots.
- All stored timestamps use UTC; the interface presents them in the event's timezone.

## 5. Seat states

The API exposes a customer-safe view of these states:

- `AVAILABLE`: eligible for a new hold
- `HELD_BY_CURRENT_USER`: held by the requesting customer
- `HELD`: actively held by another customer; their identity is never exposed
- `RESERVED`: confirmed and unavailable
- `UNAVAILABLE`: disabled by an administrator or event state

The visual countdown is informational. Only the server decides whether a hold remains valid.

## 6. Hold rules

- A customer must be authenticated to create a hold.
- A customer may have only one active grouped hold across the system in v1.
- One grouped hold may contain between one and six seats from the same event.
- A grouped hold is atomic: it succeeds only when every requested seat is available. If any requested seat is unavailable, no new hold is created.
- A hold lasts five minutes from the server-recorded creation time.
- Creating a hold is atomic: at most one unexpired hold or confirmed reservation may exist for an event seat.
- If simultaneous requests target the same seat, exactly one may succeed; the others receive HTTP `409` with code `SEAT_ALREADY_HELD` or `SEAT_ALREADY_RESERVED`.
- An expired hold can never be confirmed and returns HTTP `410` with code `HOLD_EXPIRED`.
- A customer may release only their own hold.
- Holds are released automatically when they expire. Expired records may remain for auditing but no longer block the seat.
- Creating, confirming, and releasing holds requires an idempotency key. Repeating the same completed request must not create duplicate effects.
- Creating a new hold while the customer already has one returns HTTP `409` with code `ACTIVE_HOLD_EXISTS`.

## 7. Reservation rules

- A reservation can be created only by confirming an authenticated customer's own active grouped hold.
- One reservation contains every seat in the confirmed hold, up to six seats.
- Confirmation atomically expires the hold and creates exactly one reservation.
- Each reservation has a unique, non-guessable public reference.
- A reservation stores a snapshot of the event name, schedule, venue, seat label, section, and price at confirmation time.
- Reservation states are `CONFIRMED`, `CANCELLED`, and `EVENT_CANCELLED`.
- The same event seat can have at most one non-cancelled reservation.
- In v1, customers can cancel a confirmed reservation until two hours before the event starts.
- Cancellation after the cutoff returns HTTP `409` with code `CANCELLATION_WINDOW_CLOSED`.
- Cancellation is idempotent. Repeating it returns the already-cancelled reservation without creating another effect.
- Cancelling a reservation makes its seat available again unless the event has started or is cancelled.
- Cancelling an event changes its active reservations to `EVENT_CANCELLED` and invalidates its active holds.

## 8. Authentication and authorization rules

- Email addresses are normalized to lowercase and must be unique.
- Passwords require at least 8 characters and are stored only as modern salted password hashes.
- Authentication uses secure, HTTP-only, same-site cookies; authentication tokens are not stored in browser local storage.
- Login errors do not reveal whether an email address exists.
- Every protected operation verifies both authentication and resource ownership or role authorization on the server.
- Sessions can be revoked on logout and expire after a defined inactivity period.
- Repeated failed authentication and reservation requests are rate limited.

## 9. Core invariants

These rules must be enforced by database constraints and transactions, not only application checks:

1. One email belongs to at most one user.
2. One customer has at most one active grouped hold, containing no more than six seats.
3. One event seat has at most one active hold.
4. One event seat has at most one non-cancelled reservation.
5. Only the owner of a valid hold can confirm or release it.
6. Confirmation creates no more than one reservation, even when retried.
7. A seat can never be simultaneously available and actively held or reserved.

## 10. Required API behavior

- API base path: `/v1`
- JSON is used for request and response bodies.
- Success and error responses use consistent shapes.
- Errors include a stable machine-readable `code` and a safe human-readable `message`.
- Validation errors include field-level details without exposing internals.
- State-changing endpoints authenticate, authorize, validate, and audit the operation.
- List endpoints support pagination before production launch.
- Personally identifiable information and credentials are never written to application logs.

## 11. Acceptance criteria for the core journey

The core v1 journey is complete when:

1. A guest can register, sign in, and view a published event.
2. A customer can see current seat availability and hold an available seat.
3. A second customer cannot hold the same seat during the active hold.
4. The first customer can confirm the hold exactly once.
5. The confirmed seat appears in that customer's reservation history.
6. An authorized cancellation within the permitted window releases the seat.
7. Expired holds release seats without client-side authority.
8. Customers cannot access other customers' data, and non-admins cannot access admin operations.
9. Automated concurrency tests prove the single-winner invariant.
10. All critical actions are observable through safe audit records and operational logs.

## 12. Implementation order

1. Database and migrations
2. Authentication and role authorization
3. Event and seat inventory APIs
4. Transactional hold engine and expiry worker
5. Reservation confirmation and cancellation
6. Admin APIs and auditing
7. Automated security, integration, and concurrency tests
8. Production deployment and monitoring
