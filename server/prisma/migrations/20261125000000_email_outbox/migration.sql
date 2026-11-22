BEGIN;
CREATE TABLE email_event (
  action_id integer PRIMARY KEY REFERENCES recommendation_action(action_id) ON DELETE CASCADE ON UPDATE CASCADE,
  donor text NOT NULL,
  recipient text NOT NULL,
  sku text NOT NULL,
  drug_name text NOT NULL,
  prepared_at timestamptz(3),
  recipient_count integer NOT NULL DEFAULT 0
);
CREATE INDEX email_event_prepared_at_action_id_idx ON email_event(prepared_at,action_id);
CREATE TABLE email_delivery (
  id serial PRIMARY KEY,
  action_id integer NOT NULL REFERENCES email_event(action_id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id integer NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz(3) NOT NULL DEFAULT now(),
  accepted_at timestamptz(3),
  failed_at timestamptz(3),
  skipped_at timestamptz(3),
  last_error text,
  UNIQUE(action_id,user_id)
);
CREATE INDEX email_delivery_next_attempt_at_id_idx ON email_delivery(next_attempt_at,id);
CREATE INDEX email_delivery_pending_idx ON email_delivery(next_attempt_at,id)
  WHERE accepted_at IS NULL AND failed_at IS NULL AND skipped_at IS NULL;
COMMIT;
