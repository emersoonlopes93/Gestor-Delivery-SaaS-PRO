CREATE TYPE "BusinessSegment" AS ENUM (
  'PIZZARIA',
  'HAMBURGUERIA',
  'RESTAURANTE',
  'MERCADO',
  'ACAI',
  'PADARIA',
  'OTHER'
);

ALTER TABLE "tenant_settings"
ADD COLUMN "business_segment" "BusinessSegment";
