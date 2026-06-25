INSERT INTO "admin_permissions" ("id", "module", "action", "slug", "description", "created_at")
VALUES (
  gen_random_uuid(),
  'saas.base_menu',
  'manage',
  'saas.base_menu.manage',
  'Manage base menu templates',
  NOW()
)
ON CONFLICT ("slug") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "admin_role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), "admin_roles"."id", "admin_permissions"."id"
FROM "admin_roles"
CROSS JOIN "admin_permissions"
WHERE "admin_roles"."slug" IN ('super_admin', 'operations')
  AND "admin_permissions"."slug" = 'saas.base_menu.manage'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
