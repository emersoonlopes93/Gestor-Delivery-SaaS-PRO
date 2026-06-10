-- Adds a dedicated SaaS admin permission for billing ledger audit endpoints.

INSERT INTO "admin_permissions" ("id", "module", "action", "slug", "description", "created_at")
VALUES (
  '00000000-0000-4000-8000-000000000002',
  'saas.billing',
  'audit',
  'saas.billing.audit',
  'Audit billing ledger',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "admin_role_permissions" ("id", "role_id", "permission_id")
SELECT
  md5("admin_roles"."id" || ':saas.billing.audit')::uuid::text,
  "admin_roles"."id",
  "admin_permissions"."id"
FROM "admin_roles"
CROSS JOIN "admin_permissions"
WHERE "admin_roles"."slug" IN ('super_admin', 'financial', 'auditor')
  AND "admin_permissions"."slug" = 'saas.billing.audit'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
