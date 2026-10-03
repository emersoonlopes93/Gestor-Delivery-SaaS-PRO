ALTER TABLE "base_menu_import_logs"
ADD COLUMN "operation_key" VARCHAR(200);

CREATE UNIQUE INDEX "base_menu_import_logs_operation_key_key"
ON "base_menu_import_logs"("operation_key");
