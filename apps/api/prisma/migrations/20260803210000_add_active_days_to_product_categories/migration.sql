CREATE TYPE "CategoryActiveDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

ALTER TABLE "product_categories"
ADD COLUMN "active_days" "CategoryActiveDay"[] NOT NULL DEFAULT ARRAY[]::"CategoryActiveDay"[];
