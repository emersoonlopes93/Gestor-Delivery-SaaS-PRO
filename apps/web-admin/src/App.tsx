import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { TenantsPage } from './features/tenants/TenantsPage';
import { TenantModulesPage } from './features/tenants/TenantModulesPage';
import { TenantAiAgentConfigPage } from './features/tenants/TenantAiAgentConfigPage';
import { BillingPage } from './features/billing/BillingPage';
import { AuditLogsPage } from './features/audit/AuditLogsPage';
import { FranchiseDashboard } from './features/franchise/FranchiseDashboard';
import IntegrationsPage from './features/integrations/pages/IntegrationsPage';
import { AuthLayout } from './layouts/AuthLayout';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PermissionGate } from './components/PermissionGate';

export function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/tenants"
          element={
            <PermissionGate permission="saas.tenants.read">
              <TenantsPage />
            </PermissionGate>
          }
        />
        <Route
          path="/tenants/:tenantId/modules"
          element={
            <PermissionGate permission="saas.modules.read">
              <TenantModulesPage />
            </PermissionGate>
          }
        />
        <Route
          path="/tenants/:tenantId/ai-agent"
          element={
            <PermissionGate permission="saas.tenants.ai.read">
              <TenantAiAgentConfigPage />
            </PermissionGate>
          }
        />

        {/* Billing */}
        <Route
          path="/billing"
          element={
            <PermissionGate permission="saas.plans.read">
              <BillingPage />
            </PermissionGate>
          }
        />

        {/* Audit Logs */}
        <Route
          path="/audit-logs"
          element={
            <PermissionGate permission="saas.audit.read">
              <AuditLogsPage />
            </PermissionGate>
          }
        />

        {/* Franchise */}
        <Route
          path="/franchise"
          element={
            <PermissionGate permission="saas.franchise.read">
              <FranchiseDashboard />
            </PermissionGate>
          }
        />

        {/* Integrations */}
        <Route
          path="/integrations"
          element={
            <PermissionGate permission="saas.settings.read">
              <IntegrationsPage />
            </PermissionGate>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
