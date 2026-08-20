CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('CUSTOMER', 'ADMIN');
CREATE TYPE event_status AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');
CREATE TYPE hold_status AS ENUM ('ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED');
CREATE TYPE booking_status AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'WAITLISTED', 'CANCELLED', 'EVENT_CANCELLED', 'PAYMENT_FAILED');
CREATE TYPE payment_status AS ENUM ('CREATED', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
  password_hash text NOT NULL, full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'CUSTOMER', is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(trim(email)))
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL,
  description text NOT NULL DEFAULT '', venue text NOT NULL, starts_at timestamptz NOT NULL,
  timezone text NOT NULL, status event_status NOT NULL DEFAULT 'DRAFT',
  booking_opens_at timestamptz, booking_closes_at timestamptz, created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_booking_window CHECK (booking_closes_at IS NULL OR booking_opens_at IS NULL OR booking_closes_at > booking_opens_at)
);
CREATE INDEX events_public_schedule_idx ON events(status, starts_at);

CREATE TABLE event_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_label text NOT NULL, section text NOT NULL, row_label text, seat_number integer,
  price_paise bigint NOT NULL CHECK (price_paise >= 0), is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (event_id, seat_label)
);
CREATE INDEX event_seats_event_idx ON event_seats(event_id);

CREATE TABLE holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  event_id uuid NOT NULL REFERENCES events(id), status hold_status NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT hold_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX one_active_hold_per_user_idx ON holds(user_id) WHERE status = 'ACTIVE';
CREATE INDEX holds_expiry_idx ON holds(expires_at) WHERE status = 'ACTIVE';

CREATE TABLE hold_seats (
  hold_id uuid NOT NULL REFERENCES holds(id) ON DELETE CASCADE,
  event_seat_id uuid NOT NULL REFERENCES event_seats(id), price_paise bigint NOT NULL CHECK (price_paise >= 0),
  PRIMARY KEY (hold_id, event_seat_id)
);

-- Rows exist only while holds actively own seats. This primary key is the
-- database-enforced single-winner invariant across concurrent API processes.
CREATE TABLE seat_claims (
  event_seat_id uuid PRIMARY KEY REFERENCES event_seats(id) ON DELETE CASCADE,
  hold_id uuid NOT NULL REFERENCES holds(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seat_claims_hold_idx ON seat_claims(hold_id);
CREATE INDEX seat_claims_expiry_idx ON seat_claims(expires_at);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id), event_id uuid NOT NULL REFERENCES events(id),
  source_hold_id uuid NOT NULL UNIQUE REFERENCES holds(id), status booking_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  currency char(3) NOT NULL DEFAULT 'INR', subtotal_paise bigint NOT NULL CHECK (subtotal_paise >= 0),
  fees_paise bigint NOT NULL DEFAULT 0 CHECK (fees_paise >= 0), total_paise bigint NOT NULL CHECK (total_paise >= 0),
  cancelled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_user_created_idx ON bookings(user_id, created_at DESC);

CREATE TABLE booking_seats (
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_seat_id uuid NOT NULL REFERENCES event_seats(id), seat_label text NOT NULL,
  section text NOT NULL, price_paise bigint NOT NULL CHECK (price_paise >= 0),
  passenger_name text, cancelled_at timestamptz, PRIMARY KEY (booking_id, event_seat_id)
);
CREATE UNIQUE INDEX one_live_booking_per_seat_idx ON booking_seats(event_seat_id) WHERE cancelled_at IS NULL;

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
  status payment_status NOT NULL DEFAULT 'CREATED', method text NOT NULL, scenario text NOT NULL DEFAULT 'SUCCESS',
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0), currency char(3) NOT NULL DEFAULT 'INR',
  provider_reference text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_booking_idx ON payments(booking_id);

CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  event_id uuid NOT NULL REFERENCES events(id), requested_seats smallint NOT NULL CHECK (requested_seats BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'OFFERED', 'FULFILLED', 'CANCELLED', 'EXPIRED')),
  position bigint GENERATED ALWAYS AS IDENTITY, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX waitlist_event_order_idx ON waitlist_entries(event_id, position) WHERE status = 'WAITING';

CREATE TABLE idempotency_records (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, operation text NOT NULL, key text NOT NULL,
  request_hash text NOT NULL, response_status integer, response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, operation, key)
);
CREATE INDEX idempotency_expiry_idx ON idempotency_records(expires_at);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_user_id uuid REFERENCES users(id),
  action text NOT NULL, resource_type text NOT NULL, resource_id text, request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id, created_at DESC);
