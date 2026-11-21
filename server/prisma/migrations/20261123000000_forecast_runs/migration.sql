BEGIN;
CREATE TABLE forecast_run (
  id serial PRIMARY KEY, as_of date NOT NULL, synthetic boolean NOT NULL, version text NOT NULL,
  policy jsonb NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(as_of, synthetic, version)
);
ALTER TABLE sale ADD COLUMN stockout boolean;
ALTER TABLE forecast
  ADD COLUMN run_id integer REFERENCES forecast_run(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN abc_class "AbcClass", ADD COLUMN xyz_class "XyzClass",
  ADD COLUMN quantity integer, ADD COLUMN msl integer, ADD COLUMN max_level integer,
  ADD COLUMN quality jsonb, ADD COLUMN shortage numeric(14,0) CHECK (shortage >= 0),
  ADD COLUMN current_surplus integer CHECK (current_surplus >= 0),
  ADD COLUMN projected_surplus integer CHECK (projected_surplus >= 0),
  ALTER COLUMN predicted_demand TYPE numeric(14,2), ALTER COLUMN predicted_demand DROP NOT NULL,
  ALTER COLUMN shortage_probability DROP NOT NULL, ADD UNIQUE(run_id,stock_id);
COMMIT;
