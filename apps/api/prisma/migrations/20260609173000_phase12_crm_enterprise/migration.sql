CREATE TYPE "CrmPipelineStage" AS ENUM ('lead', 'prospect', 'customer', 'vip_customer', 'at_risk_customer', 'recovered_customer');

CREATE TYPE "CrmTaskStatus" AS ENUM ('open', 'scheduled', 'completed', 'cancelled');

CREATE TABLE "crm_pipeline_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "stage" "CrmPipelineStage" NOT NULL DEFAULT 'lead',
    "source" VARCHAR(80),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_pipeline_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_tasks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMP(3),
    "status" "CrmTaskStatus" NOT NULL DEFAULT 'open',
    "created_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_notes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_pipeline_entries_tenant_id_customer_id_key" ON "crm_pipeline_entries"("tenant_id", "customer_id");
CREATE INDEX "crm_pipeline_entries_tenant_id_idx" ON "crm_pipeline_entries"("tenant_id");
CREATE INDEX "crm_pipeline_entries_tenant_id_stage_idx" ON "crm_pipeline_entries"("tenant_id", "stage");
CREATE INDEX "crm_tasks_tenant_id_idx" ON "crm_tasks"("tenant_id");
CREATE INDEX "crm_tasks_tenant_id_customer_id_idx" ON "crm_tasks"("tenant_id", "customer_id");
CREATE INDEX "crm_tasks_tenant_id_status_idx" ON "crm_tasks"("tenant_id", "status");
CREATE INDEX "crm_notes_tenant_id_idx" ON "crm_notes"("tenant_id");
CREATE INDEX "crm_notes_tenant_id_customer_id_idx" ON "crm_notes"("tenant_id", "customer_id");

ALTER TABLE "crm_pipeline_entries" ADD CONSTRAINT "crm_pipeline_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_pipeline_entries" ADD CONSTRAINT "crm_pipeline_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
