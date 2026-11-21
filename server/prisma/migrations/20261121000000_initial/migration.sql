BEGIN;

CREATE TYPE "DataScope" AS ENUM ('мережа', 'призначені аптеки');
CREATE TYPE "RecommendationStatus" AS ENUM ('Сформована', 'Підтверджена', 'Відхилена', 'У виконанні', 'Виконана', 'Скасована');
CREATE TYPE "Source" AS ENUM ('Overpass API', 'гаверсинус');
CREATE TYPE "AbcClass" AS ENUM ('A', 'B', 'C');
CREATE TYPE "XyzClass" AS ENUM ('X', 'Y', 'Z');
CREATE TYPE "EventType" AS ENUM ('вхід', 'створення акаунта', 'блокування акаунта', 'зміна ролі', 'призначення до аптеки', 'зміна порогів', 'редагування довідника', 'експорт звіту');
CREATE TYPE "DataType" AS ENUM ('залишки', 'продажі');
CREATE TYPE "SourceFormat" AS ENUM ('CSV', 'JSON');
CREATE TYPE "PositionType" AS ENUM ('дефіцит', 'надлишок');
CREATE TYPE "RiskLevel" AS ENUM ('низький', 'середній', 'високий');

CREATE TABLE "drug" (
  drug_id serial NOT NULL,
  sku varchar(30) NOT NULL,
  name varchar(120) NOT NULL,
  dosage_form varchar(40) NOT NULL,
  strength varchar(40),
  unit varchar(20) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY ("drug_id"),
  CONSTRAINT "drug_sku_UNIQUE" UNIQUE ("sku")
);

CREATE TABLE "permission" (
  permission_id serial NOT NULL,
  code varchar(30) NOT NULL,
  name varchar(100) NOT NULL,
  requirement varchar(30),
  PRIMARY KEY ("permission_id"),
  CONSTRAINT "permission_code_UNIQUE" UNIQUE ("code")
);

CREATE TABLE "pharmacy" (
  pharmacy_id serial NOT NULL,
  code varchar(20) NOT NULL,
  name varchar(100) NOT NULL,
  city varchar(60) NOT NULL,
  address varchar(150) NOT NULL,
  latitude decimal(9,6) NOT NULL,
  longitude decimal(9,6) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY ("pharmacy_id"),
  CONSTRAINT "pharmacy_code_UNIQUE" UNIQUE ("code"),
  CONSTRAINT chk_pharmacy_coordinates CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

CREATE TABLE "role" (
  role_id serial NOT NULL,
  code varchar(20) NOT NULL,
  name varchar(60) NOT NULL,
  data_scope "DataScope" NOT NULL,
  description varchar(200),
  PRIMARY KEY ("role_id"),
  CONSTRAINT "role_code_UNIQUE" UNIQUE ("code")
);

CREATE TABLE "action_type" (
  action_type_id serial NOT NULL,
  code varchar(20) NOT NULL,
  name varchar(60) NOT NULL,
  permission_id integer NOT NULL,
  CHECK (permission_id >= 0),
  from_status "RecommendationStatus" NOT NULL,
  to_status "RecommendationStatus" NOT NULL,
  PRIMARY KEY ("action_type_id"),
  CONSTRAINT "action_type_code_UNIQUE" UNIQUE ("code"),
  CONSTRAINT "fk_action_type_permission_id" FOREIGN KEY ("permission_id") REFERENCES "permission" ("permission_id")
);

CREATE TABLE "pharmacy_distance" (
  from_pharmacy_id integer NOT NULL,
  CHECK (from_pharmacy_id >= 0),
  to_pharmacy_id integer NOT NULL,
  CHECK (to_pharmacy_id >= 0),
  distance_km decimal(7,2) NOT NULL,
  source "Source" NOT NULL,
  calculated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_actual boolean NOT NULL DEFAULT true,
  PRIMARY KEY ("from_pharmacy_id","to_pharmacy_id"),
  CONSTRAINT "fk_pharmacy_distance_from_pharmacy_id" FOREIGN KEY ("from_pharmacy_id") REFERENCES "pharmacy" ("pharmacy_id"),
  CONSTRAINT "fk_pharmacy_distance_to_pharmacy_id" FOREIGN KEY ("to_pharmacy_id") REFERENCES "pharmacy" ("pharmacy_id"),
  CONSTRAINT "chk_distance_pair" CHECK ((("from_pharmacy_id" <> "to_pharmacy_id") and ("distance_km" >= 0)))
);

CREATE TABLE "role_permission" (
  role_id integer NOT NULL,
  CHECK (role_id >= 0),
  permission_id integer NOT NULL,
  CHECK (permission_id >= 0),
  granted_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("role_id","permission_id"),
  CONSTRAINT "fk_role_permission_permission_id" FOREIGN KEY ("permission_id") REFERENCES "permission" ("permission_id"),
  CONSTRAINT "fk_role_permission_role_id" FOREIGN KEY ("role_id") REFERENCES "role" ("role_id")
);

CREATE TABLE "stock_item" (
  stock_id serial NOT NULL,
  pharmacy_id integer NOT NULL,
  CHECK (pharmacy_id >= 0),
  drug_id integer NOT NULL,
  CHECK (drug_id >= 0),
  quantity integer NOT NULL DEFAULT 0,
  msl integer NOT NULL DEFAULT 0,
  max_level integer NOT NULL,
  abc_class "AbcClass",
  xyz_class "XyzClass",
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("stock_id"),
  CONSTRAINT "stock_pharmacy_drug_UNIQUE" UNIQUE ("pharmacy_id","drug_id"),
  CONSTRAINT "fk_stock_item_drug_id" FOREIGN KEY ("drug_id") REFERENCES "drug" ("drug_id"),
  CONSTRAINT "fk_stock_item_pharmacy_id" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacy" ("pharmacy_id"),
  CONSTRAINT "chk_stock_levels" CHECK ((("quantity" >= 0) and ("max_level" >= "msl"))),
  CONSTRAINT chk_msl_nonnegative CHECK (msl >= 0)
);

CREATE TABLE "user_account" (
  user_id serial NOT NULL,
  login varchar(50) NOT NULL,
  password_hash varchar(255) NOT NULL,
  last_name varchar(60) NOT NULL,
  first_name varchar(60) NOT NULL,
  email varchar(100) NOT NULL,
  role_id integer NOT NULL,
  CHECK (role_id >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id"),
  CONSTRAINT "user_login_UNIQUE" UNIQUE ("login"),
  CONSTRAINT "user_email_UNIQUE" UNIQUE ("email"),
  CONSTRAINT "fk_user_account_role_id" FOREIGN KEY ("role_id") REFERENCES "role" ("role_id")
);

CREATE TABLE "user_pharmacy" (
  user_id integer NOT NULL,
  CHECK (user_id >= 0),
  pharmacy_id integer NOT NULL,
  CHECK (pharmacy_id >= 0),
  assigned_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_at timestamptz(3),
  PRIMARY KEY ("user_id","pharmacy_id"),
  CONSTRAINT "fk_user_pharmacy_pharmacy_id" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacy" ("pharmacy_id"),
  CONSTRAINT "fk_user_pharmacy_user_id" FOREIGN KEY ("user_id") REFERENCES "user_account" ("user_id")
);

CREATE TABLE "audit_log" (
  log_id serial NOT NULL,
  user_id integer NOT NULL,
  CHECK (user_id >= 0),
  target_user_id integer,
  CHECK (target_user_id >= 0),
  stock_id integer,
  CHECK (stock_id >= 0),
  event_type "EventType" NOT NULL,
  event_time timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details varchar(300),
  PRIMARY KEY ("log_id"),
  CONSTRAINT "fk_audit_log_stock_id" FOREIGN KEY ("stock_id") REFERENCES "stock_item" ("stock_id"),
  CONSTRAINT "fk_audit_log_target_user_id" FOREIGN KEY ("target_user_id") REFERENCES "user_account" ("user_id"),
  CONSTRAINT "fk_audit_log_user_id" FOREIGN KEY ("user_id") REFERENCES "user_account" ("user_id")
);

CREATE TABLE "forecast" (
  forecast_id serial NOT NULL,
  stock_id integer NOT NULL,
  CHECK (stock_id >= 0),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  horizon_days smallint NOT NULL DEFAULT 14,
  CHECK (horizon_days >= 0),
  predicted_demand decimal(10,2) NOT NULL,
  shortage_probability decimal(5,4) NOT NULL,
  model_version varchar(30) NOT NULL,
  PRIMARY KEY ("forecast_id"),
  CONSTRAINT "fk_forecast_stock_id" FOREIGN KEY ("stock_id") REFERENCES "stock_item" ("stock_id"),
  CONSTRAINT "chk_forecast_prob" CHECK (("shortage_probability" between 0 and 1))
);

CREATE TABLE "import_batch" (
  import_id serial NOT NULL,
  uploaded_by integer NOT NULL,
  CHECK (uploaded_by >= 0),
  pharmacy_id integer NOT NULL,
  CHECK (pharmacy_id >= 0),
  data_type "DataType" NOT NULL,
  source_format "SourceFormat" NOT NULL,
  file_name varchar(150) NOT NULL,
  uploaded_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  records_total integer NOT NULL,
  CHECK (records_total >= 0),
  records_rejected integer NOT NULL DEFAULT 0,
  CHECK (records_rejected >= 0),
  PRIMARY KEY ("import_id"),
  CONSTRAINT "fk_import_batch_uploaded_by_pharmacy_id" FOREIGN KEY ("uploaded_by", "pharmacy_id") REFERENCES "user_pharmacy" ("user_id", "pharmacy_id")
);

CREATE TABLE "recommendation" (
  recommendation_id serial NOT NULL,
  recipient_stock_id integer NOT NULL,
  CHECK (recipient_stock_id >= 0),
  donor_stock_id integer NOT NULL,
  CHECK (donor_stock_id >= 0),
  quantity integer NOT NULL,
  CHECK (quantity >= 0),
  priority smallint NOT NULL,
  CHECK (priority >= 0),
  status "RecommendationStatus" NOT NULL DEFAULT 'Сформована',
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("recommendation_id"),
  CONSTRAINT "fk_recommendation_donor_stock_id" FOREIGN KEY ("donor_stock_id") REFERENCES "stock_item" ("stock_id"),
  CONSTRAINT "fk_recommendation_recipient_stock_id" FOREIGN KEY ("recipient_stock_id") REFERENCES "stock_item" ("stock_id"),
  CONSTRAINT "chk_rec_distinct" CHECK ((("recipient_stock_id" <> "donor_stock_id") and ("quantity" > 0)))
);

CREATE TABLE "recommendation_action" (
  action_id serial NOT NULL,
  recommendation_id integer NOT NULL,
  CHECK (recommendation_id >= 0),
  action_type_id integer NOT NULL,
  CHECK (action_type_id >= 0),
  user_id integer NOT NULL,
  CHECK (user_id >= 0),
  action_time timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  quantity integer,
  CHECK (quantity >= 0),
  comment varchar(300),
  PRIMARY KEY ("action_id"),
  CONSTRAINT "rec_action_UNIQUE" UNIQUE ("recommendation_id","action_type_id"),
  CONSTRAINT "fk_recommendation_action_action_type_id" FOREIGN KEY ("action_type_id") REFERENCES "action_type" ("action_type_id"),
  CONSTRAINT "fk_recommendation_action_recommendation_id" FOREIGN KEY ("recommendation_id") REFERENCES "recommendation" ("recommendation_id"),
  CONSTRAINT "fk_recommendation_action_user_id" FOREIGN KEY ("user_id") REFERENCES "user_account" ("user_id")
);

CREATE TABLE "risk" (
  forecast_id integer NOT NULL,
  CHECK (forecast_id >= 0),
  position_type "PositionType" NOT NULL,
  risk_level "RiskLevel" NOT NULL,
  surplus_quantity integer,
  CHECK (surplus_quantity >= 0),
  days_to_stockout integer,
  CHECK (days_to_stockout >= 0),
  calculated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("forecast_id"),
  CONSTRAINT "fk_risk_forecast_id" FOREIGN KEY ("forecast_id") REFERENCES "forecast" ("forecast_id")
);

CREATE TABLE "sale" (
  sale_id serial NOT NULL,
  stock_id integer NOT NULL,
  CHECK (stock_id >= 0),
  import_id integer NOT NULL,
  CHECK (import_id >= 0),
  sale_date date NOT NULL,
  quantity integer NOT NULL,
  CHECK (quantity >= 0),
  returned_quantity integer NOT NULL DEFAULT 0,
  CHECK (returned_quantity >= 0),
  unit_price decimal(10,2),
  source_row integer,
  CHECK (source_row >= 0),
  PRIMARY KEY ("sale_id"),
  CONSTRAINT "sale_stock_date_UNIQUE" UNIQUE ("stock_id","sale_date"),
  CONSTRAINT "fk_sale_import_id" FOREIGN KEY ("import_id") REFERENCES "import_batch" ("import_id"),
  CONSTRAINT "fk_sale_stock_id" FOREIGN KEY ("stock_id") REFERENCES "stock_item" ("stock_id")
);

CREATE INDEX "fk_action_type_permission_id_idx" ON "action_type" ("permission_id");
CREATE INDEX "fk_pharmacy_distance_to_pharmacy_id_idx" ON "pharmacy_distance" ("to_pharmacy_id");
CREATE INDEX "fk_role_permission_permission_id_idx" ON "role_permission" ("permission_id");
CREATE INDEX "fk_stock_item_drug_id_idx" ON "stock_item" ("drug_id");
CREATE INDEX "fk_user_account_role_id_idx" ON "user_account" ("role_id");
CREATE INDEX "fk_user_pharmacy_pharmacy_id_idx" ON "user_pharmacy" ("pharmacy_id");
CREATE INDEX "fk_audit_log_user_id_idx" ON "audit_log" ("user_id");
CREATE INDEX "fk_audit_log_target_user_id_idx" ON "audit_log" ("target_user_id");
CREATE INDEX "fk_audit_log_stock_id_idx" ON "audit_log" ("stock_id");
CREATE INDEX "fk_forecast_stock_id_idx" ON "forecast" ("stock_id");
CREATE INDEX "fk_import_batch_uploaded_by_pharmacy_id_idx" ON "import_batch" ("uploaded_by","pharmacy_id");
CREATE INDEX "fk_recommendation_recipient_stock_id_idx" ON "recommendation" ("recipient_stock_id");
CREATE INDEX "fk_recommendation_donor_stock_id_idx" ON "recommendation" ("donor_stock_id");
CREATE INDEX "fk_recommendation_action_action_type_id_idx" ON "recommendation_action" ("action_type_id");
CREATE INDEX "fk_recommendation_action_user_id_idx" ON "recommendation_action" ("user_id");
CREATE INDEX "fk_sale_import_id_idx" ON "sale" ("import_id");

COMMIT;
