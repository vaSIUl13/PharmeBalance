-- PostgreSQL requires the enum value to be committed before use.
BEGIN;
ALTER TYPE "RecommendationStatus" ADD VALUE IF NOT EXISTS 'Застаріла';
COMMIT;

BEGIN;
ALTER TABLE stock_item ADD COLUMN reserved_quantity integer NOT NULL DEFAULT 0;
UPDATE stock_item s SET reserved_quantity = r.total
FROM (SELECT donor_stock_id, sum(quantity) AS total FROM recommendation
      WHERE status IN ('Підтверджена', 'У виконанні') GROUP BY donor_stock_id) r
WHERE s.stock_id = r.donor_stock_id;
ALTER TABLE stock_item ADD CONSTRAINT chk_stock_reservation CHECK (reserved_quantity BETWEEN 0 AND quantity);
ALTER TABLE forecast ADD COLUMN redistribution_reason text;
ALTER TABLE recommendation
  ADD COLUMN forecast_id integer UNIQUE REFERENCES forecast(forecast_id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN distance_km decimal(7,2),
  ADD COLUMN distance_source "Source",
  ADD COLUMN uncovered_quantity decimal(14,0),
  ALTER COLUMN priority TYPE integer;
INSERT INTO action_type(code, name, permission_id, from_status, to_status)
SELECT 'STALE', 'Позначити застарілою', permission_id, 'Сформована', 'Застаріла'
FROM permission WHERE code = 'REC_DECIDE';
COMMIT;
