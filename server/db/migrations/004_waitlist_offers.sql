ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS offered_hold_id uuid REFERENCES holds(id);
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS offered_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS one_open_waitlist_entry_per_event_user_idx
  ON waitlist_entries(user_id,event_id) WHERE status IN ('WAITING','OFFERED');
