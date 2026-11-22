ALTER TABLE email_event ADD COLUMN missing_roles text[] NOT NULL DEFAULT ARRAY[]::text[];
