-- AlterTable
ALTER TABLE "drug" ADD COLUMN     "registration_id" INTEGER,
ADD COLUMN     "registration_package_key" TEXT;

-- AlterTable
ALTER TABLE "pharmacy" ADD COLUMN     "is_synthetic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "import_batch" ADD COLUMN     "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "synthetic_key" TEXT;

-- CreateTable
CREATE TABLE "drug_registration" (
    "registration_id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "version_id" TEXT,
    "name" TEXT NOT NULL,
    "inn" TEXT,
    "form" TEXT,
    "composition" TEXT,
    "atc_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manufacturers" JSONB NOT NULL,
    "packages" JSONB NOT NULL,
    "is_current" BOOLEAN NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "source_modified_at" TIMESTAMPTZ(3),
    "removed_at" TIMESTAMPTZ(3),
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_registration_pkey" PRIMARY KEY ("registration_id")
);

-- CreateTable
CREATE TABLE "external_pharmacy" (
    "id" SERIAL NOT NULL,
    "source" VARCHAR(12) NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT,
    "city" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "coordinate_quality" VARCHAR(12),
    "pharmacy_id" INTEGER,
    "source_modified_at" TIMESTAMPTZ(3),
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_pharmacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_sync_run" (
    "id" UUID NOT NULL,
    "source" VARCHAR(12) NOT NULL,
    "scope" TEXT NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "checkpoint" JSONB NOT NULL,
    "counters" JSONB NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "lease_until" TIMESTAMPTZ(3) NOT NULL,
    "error" VARCHAR(500),

    CONSTRAINT "catalog_sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drug_registration_number_key" ON "drug_registration"("number");

-- CreateIndex
CREATE UNIQUE INDEX "drug_registration_source_id_key" ON "drug_registration"("source_id");

-- CreateIndex
CREATE INDEX "drug_registration_version_id_idx" ON "drug_registration"("version_id");

-- CreateIndex
CREATE INDEX "external_pharmacy_pharmacy_id_idx" ON "external_pharmacy"("pharmacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_pharmacy_source_external_id_key" ON "external_pharmacy"("source", "external_id");

-- CreateIndex
CREATE INDEX "catalog_sync_run_source_scope_started_at_idx" ON "catalog_sync_run"("source", "scope", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "drug_registration_id_registration_package_key_key" ON "drug"("registration_id", "registration_package_key");

-- CreateIndex
CREATE UNIQUE INDEX "import_batch_synthetic_key_key" ON "import_batch"("synthetic_key");

-- AddForeignKey
ALTER TABLE "drug" ADD CONSTRAINT "drug_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "drug_registration"("registration_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_pharmacy" ADD CONSTRAINT "external_pharmacy_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacy"("pharmacy_id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "catalog_sync_run_active_source" ON "catalog_sync_run" ("source") WHERE "status" = 'RUNNING';
ALTER TABLE "import_batch" ADD CONSTRAINT "chk_catalog_synthetic_key"
  CHECK ("synthetic_key" IS NULL OR "is_synthetic");
ALTER TABLE "drug" ADD CONSTRAINT "chk_catalog_package_registration"
  CHECK ("registration_package_key" IS NULL OR "registration_id" IS NOT NULL);
