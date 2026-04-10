import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { AuthLayout } from './layouts/AuthLayout';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PermissionGate } from './components/PermissionGate';
import { CategoriesPage } from './features/catalog/CategoriesPage';
import { ProductsPage } from './features/catalog/ProductsPage';
import { ComplementsPage } from './features/catalog/ComplementsPage';
import { CombosPage } from './features/catalog/CombosPage';
import { OrdersListPage } from './features/orders/OrdersListPage';

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

        {/* Catalog module Routes */}
        <Route
          path="/catalog/categories"
          element={
            <PermissionGate permission="catalog.read">
              <CategoriesPage />
            </PermissionGate>
          }
        />
        <Route
          path="/catalog/products"
          element={
            <PermissionGate permission="catalog.read">
              <ProductsPage />
            </PermissionGate>
          }
        />
        <Route
          path="/catalog/complements"
          element={
            <PermissionGate permission="catalog.manage_complements">
              <ComplementsPage />
            </PermissionGate>
          }
        />
        <Route
          path="/catalog/combos"
          element={
            <PermissionGate permission="catalog.manage_combos">
              <CombosPage />
            </PermissionGate>
          }
        />

        {/* Orders module Routes (Phase 4) */}
        <Route
          path="/orders"
          element={
            <PermissionGate permission="orders.read">
              <OrdersListPage />
            </PermissionGate>
          }
        />

        {/* Settings */}
        <Route
          path="/settings"
          element={
            <PermissionGate permission="settings.read">
              <div className="p-6">
                <h1 className="text-2xl font-bold">Configurações</h1>
                <p className="text-gray-500 mt-2">Área de configurações da loja — será expandida em fases futuras.</p>
              </div>
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

