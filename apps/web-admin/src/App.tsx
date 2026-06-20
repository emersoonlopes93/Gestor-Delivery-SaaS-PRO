import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { TenantsPage } from './features/tenants/TenantsPage';
import { TenantDetailsPage } from './features/tenants/TenantDetailsPage';
import { TenantAccessPage } from './features/tenants/TenantAccessPage';
import { TenantModulesPage } from './features/tenants/TenantModulesPage';
import { TenantSchedulingPage } from './features/tenants/TenantSchedulingPage';
import { TenantAiAgentConfigPage } from './features/tenants/TenantAiAgentConfigPage';
import { BillingConsolePage } from './features/billing/BillingConsolePage';
import { GlobalAiAgentConfigPage } from './features/ai-agent/GlobalAiAgentConfigPage';
import { AuditLogsPage } from './features/audit/AuditLogsPage';
import { FranchiseDashboard } from './features/franchise/FranchiseDashboard';
import IntegrationsPage from './features/integrations/pages/IntegrationsPage';
import { GlobalMediaLibraryPage } from './features/media/GlobalMediaLibraryPage';
import { BaseMediaLibraryPage } from './features/base-media/BaseMediaLibraryPage';
import { BaseMenusPage } from './features/base-menus/BaseMenusPage';
import { HealthPage } from './features/operations/health/HealthPage';
import { AuthLayout } from './layouts/AuthLayout';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PermissionGate } from './components/PermissionGate';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';

export function App() {
  return (
    <ToastProvider>
      <ToastContainer />
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
            path="/tenants/:tenantId"
            element={
              <PermissionGate permission="saas.tenants.read">
                <TenantDetailsPage />
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
            path="/tenants/:tenantId/access"
            element={
              <PermissionGate permission="saas.tenants.read">
                <TenantAccessPage />
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
          <Route
            path="/tenants/:tenantId/scheduling"
            element={
              <PermissionGate permission="saas.tenants.read">
                <TenantSchedulingPage />
              </PermissionGate>
            }
          />
          <Route
            path="/ai-agent/global"
            element={
              <PermissionGate permission="saas.ai.read">
                <GlobalAiAgentConfigPage />
              </PermissionGate>
            }
          />

          {/* Health / Operations */}
          <Route
            path="/health"
            element={
              <PermissionGate permission="saas.tenants.read">
                <HealthPage />
              </PermissionGate>
            }
          />

          {/* Billing */}
          <Route
            path="/billing"
            element={
              <PermissionGate permission="saas.billing.read">
                <BillingConsolePage />
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
          <Route
            path="/media"
            element={
              <PermissionGate permission="saas.settings.read">
                <GlobalMediaLibraryPage />
              </PermissionGate>
            }
          />
          <Route
            path="/base-menus"
            element={
              <PermissionGate permission="saas.base_menu.read">
                <BaseMenusPage />
              </PermissionGate>
            }
          />
          <Route
            path="/base-menus/:id"
            element={
              <PermissionGate permission="saas.base_menu.read">
                <BaseMenusPage />
              </PermissionGate>
            }
          />
          <Route
            path="/base-menus/:id/draft"
            element={
              <PermissionGate permission="saas.base_menu.read">
                <BaseMenusPage />
              </PermissionGate>
            }
          />
          <Route
            path="/base-media"
            element={
              <PermissionGate permission="saas.base_media.read">
                <BaseMediaLibraryPage />
              </PermissionGate>
            }
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ToastProvider>
  );
}
