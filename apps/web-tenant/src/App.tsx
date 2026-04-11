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
import { OperationBoardPage } from './features/orders/OperationBoardPage';
import { KdsPage } from './features/orders/KdsPage';
import { DriversListPage } from './features/delivery/DriversListPage';
import { DispatchPage } from './features/delivery/DispatchPage';
import CashPage from './features/cash/CashPage';
import PosPage from './features/pos/PosPage';

// CRM & Promotions
import { CustomersListPage } from './features/crm/CustomersListPage';
// import { CustomerProfilePage } from './features/crm/CustomerProfilePage'; // Optional next
import { PromotionsPage } from './features/promotions/PromotionsPage';
import { InventoryPage } from './features/inventory/InventoryPage';

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
        <Route
          path="/orders/board"
          element={
            <PermissionGate permission="orders.use_kanban">
              <OperationBoardPage />
            </PermissionGate>
          }
        />
        <Route
          path="/orders/kds"
          element={
            <PermissionGate permission="kds.use">
              <KdsPage />
            </PermissionGate>
          }
        />

        {/* Logistics module (Phase 6) */}
        <Route
          path="/delivery/dispatch"
          element={
            <PermissionGate permission="delivery.read">
              <DispatchPage />
            </PermissionGate>
          }
        />
        <Route
          path="/delivery/drivers"
          element={
            <PermissionGate permission="delivery.manage_drivers">
              <DriversListPage />
            </PermissionGate>
          }
        />

        {/* Cash Register (Phase 7) */}
        <Route
          path="/cash"
          element={
            <PermissionGate permission="cash.read">
              <CashPage />
            </PermissionGate>
          }
        />

        {/* Point of Sale (Phase 7) */}
        <Route
          path="/pos"
          element={
            <PermissionGate permission="pos.read">
              <PosPage />
            </PermissionGate>
          }
        />

        {/* CRM (Phase 8) */}
        <Route
          path="/customers"
          element={
            <PermissionGate permission="crm.read">
              <CustomersListPage />
            </PermissionGate>
          }
        />

        {/* Promotions (Phase 8) */}
        <Route
          path="/promotions"
          element={
            <PermissionGate permission="crm.manage_coupons">
              <PromotionsPage />
            </PermissionGate>
          }
        />

        {/* Inventory & Recipes (Phase 9) */}
        <Route
          path="/inventory"
          element={
            <PermissionGate permission="inventory.read">
              <InventoryPage />
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

