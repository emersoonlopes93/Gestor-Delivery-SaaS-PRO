ALTER TABLE "tenant_settings"
  ADD COLUMN "auto_accept_orders_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "auto_accept_delay_seconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "auto_accept_delivery_orders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "auto_accept_pickup_orders" BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "tenant_permissions" ("id", "module", "action", "slug", "description", "created_at")
SELECT
  gen_random_uuid(),
  'orders',
  'settings_manage',
  'orders.settings.manage',
  'Manage operational order settings',
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "tenant_permissions"
  WHERE "slug" = 'orders.settings.manage'
);

INSERT INTO "tenant_role_permissions" ("id", "role_id", "permission_id")
SELECT
  gen_random_uuid(),
  role."id",
  permission."id"
FROM "tenant_roles" AS role
JOIN "tenant_permissions" AS permission
  ON permission."slug" = 'orders.settings.manage'
WHERE role."slug" IN ('tenant_owner', 'tenant_admin', 'manager')
  AND NOT EXISTS (
    SELECT 1
    FROM "tenant_role_permissions" AS trp
    WHERE trp."role_id" = role."id"
      AND trp."permission_id" = permission."id"
  );
