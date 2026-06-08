-- Drop legacy tables if they exist to prevent errors since they were dropped physically out of band
DROP TABLE IF EXISTS "ProductComplementGroupLink" CASCADE;
DROP TABLE IF EXISTS "ProductComplementItem" CASCADE;
DROP TABLE IF EXISTS "ProductComplementGroup" CASCADE;

DROP TABLE IF EXISTS "ProductComboBlockItem" CASCADE;
DROP TABLE IF EXISTS "ProductComboBlock" CASCADE;
DROP TABLE IF EXISTS "ProductCombo" CASCADE;

DROP TABLE IF EXISTS "OrderItemComplement" CASCADE;
DROP TABLE IF EXISTS "OrderItemComboSelection" CASCADE;
