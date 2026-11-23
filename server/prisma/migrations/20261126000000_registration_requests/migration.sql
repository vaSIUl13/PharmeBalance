CREATE TABLE registration_request (
  id uuid PRIMARY KEY,
  first_name varchar(60) NOT NULL,
  last_name varchar(60) NOT NULL,
  login varchar(50) NOT NULL,
  email varchar(100) NOT NULL,
  requested_role varchar(20) NOT NULL CHECK (requested_role IN ('admin', 'logist', 'manager', 'head')),
  password_hash varchar(255),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at timestamptz(3),
  approved boolean,
  CHECK ((decided_at IS NULL AND password_hash IS NOT NULL AND approved IS NULL)
      OR (decided_at IS NOT NULL AND password_hash IS NULL AND approved IS NOT NULL))
);
CREATE INDEX registration_request_decided_at_created_at_idx ON registration_request(decided_at, created_at);
CREATE UNIQUE INDEX registration_request_pending_email ON registration_request(email) WHERE decided_at IS NULL;
CREATE UNIQUE INDEX registration_request_pending_login ON registration_request(login) WHERE decided_at IS NULL;
