import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { TenantsPage } from './features/tenants/TenantsPage';
import { TenantModulesPage } from './features/tenants/TenantModulesPage';
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

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
