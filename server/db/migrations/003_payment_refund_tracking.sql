ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_paise bigint NOT NULL DEFAULT 0 CHECK (refunded_paise >= 0 AND refunded_paise <= amount_paise);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_payment_per_booking_idx ON payments(booking_id) WHERE status IN ('CREATED','PROCESSING','SUCCESSFUL');
