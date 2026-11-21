BEGIN;
CREATE TYPE "ImportStatus" AS ENUM ('LEGACY', 'APPLIED', 'REJECTED');
ALTER TABLE import_batch
  ADD COLUMN status "ImportStatus" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN request_key char(64) UNIQUE,
  ADD COLUMN checksum char(64),
  ADD COLUMN snapshot_at timestamptz(3),
  ADD COLUMN records_applied integer NOT NULL DEFAULT 0,
  ADD COLUMN errors jsonb NOT NULL DEFAULT '[]';
CREATE INDEX import_batch_pharmacy_id_import_id_idx ON import_batch(pharmacy_id, import_id);
ALTER TABLE stock_item ADD COLUMN quantity_as_of timestamptz(3);
UPDATE stock_item SET quantity_as_of = updated_at;
ALTER TABLE stock_item ALTER COLUMN quantity_as_of SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN quantity_as_of SET NOT NULL;

CREATE FUNCTION track_quantity_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantity_as_of < OLD.quantity_as_of THEN
    RAISE EXCEPTION 'Stock quantity timestamp cannot go backwards';
  END IF;
  IF NEW.quantity <> OLD.quantity AND NEW.quantity_as_of = OLD.quantity_as_of THEN
    NEW.quantity_as_of := greatest(clock_timestamp(), OLD.quantity_as_of);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_quantity_change BEFORE UPDATE OF quantity, quantity_as_of ON stock_item
FOR EACH ROW EXECUTE FUNCTION track_quantity_change();
COMMIT;
