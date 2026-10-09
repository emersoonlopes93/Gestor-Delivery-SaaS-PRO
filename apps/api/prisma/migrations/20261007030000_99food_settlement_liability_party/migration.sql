-- Additive compatibility field: the official 99Food settlement contract defines
-- liability as a semantic party string. The legacy numeric column is retained
-- untouched for historical records and must not be reinterpreted as text.
ALTER TABLE "marketplace_settlements"
ADD COLUMN "liability_party" VARCHAR(160);

-- Preserve historical numeric values but let new contract-compliant writes
-- leave the legacy field NULL rather than fabricating a zero amount.
ALTER TABLE "marketplace_settlements"
ALTER COLUMN "liability" DROP DEFAULT,
ALTER COLUMN "liability" DROP NOT NULL;
