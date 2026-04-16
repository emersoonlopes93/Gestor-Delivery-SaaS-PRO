import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { AuthLayout } from './layouts/AuthLayout';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PermissionGate } from './components/PermissionGate';
import { CategoriesPage } from './features/catalog/CategoriesPage';
import { ProductsPage } from './features/catalog/ProductsPage';
import { ProductV2EditorPage } from './features/catalog/ProductV2EditorPage';
import { ComplementsPage } from './features/catalog/ComplementsPage';
import { CombosPage } from './features/catalog/CombosPage';
import { OptionGroupsPage } from './features/catalog/OptionGroupsPage';
import { OrdersListPage } from './features/orders/OrdersListPage';
import { OperationBoardPage } from './features/orders/OperationBoardPage';
import { KdsPage } from './features/orders/KdsPage';
import { DriversListPage } from './features/delivery/DriversListPage';
import { DispatchPage } from './features/delivery/DispatchPage';
import { DeliveryRatesPage } from './features/delivery/DeliveryRatesPage';
import { DeliveryZonesPage } from './features/delivery/DeliveryZonesPage';
import { DeliveryMapPage } from './features/delivery/DeliveryMapPage';
import CashPage from './features/cash/CashPage';
import PosPage from './features/pos/PosPage';
import { SettingsPage } from './features/settings/SettingsPage';

// CRM & Promotions
import { CustomersListPage } from './features/crm/CustomersListPage';
// import { CustomerProfilePage } from './features/crm/CustomerProfilePage'; // Optional next
import { PromotionsPage } from './features/promotions/PromotionsPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { ReportsPage, GoalsPage } from './features/analytics';

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
          path="/catalog/products/:id/v2"
          element={
            <PermissionGate permission="catalog.manage_products">
              <ProductV2EditorPage />
            </PermissionGate>
          }
        />
        <Route
          path="/catalog/option-groups"
          element={
            <PermissionGate permission="catalog.manage_option_groups">
              <OptionGroupsPage />
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
          path="/delivery/map"
          element={
            <PermissionGate permission="delivery.read">
              <DeliveryMapPage />
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
        <Route
          path="/delivery/rates"
          element={
            <PermissionGate permission="delivery.manage">
              <DeliveryZonesPage />
            </PermissionGate>
          }
        />

        <Route
          path="/delivery/rates/legacy"
          element={
            <PermissionGate permission="delivery.manage">
              <DeliveryRatesPage />
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

        {/* Analytics & Performance (Phase 10) */}
        <Route
          path="/analytics/reports"
          element={
            <PermissionGate permission="reports.read">
              <ReportsPage />
            </PermissionGate>
          }
        />
        <Route
          path="/analytics/goals"
          element={
            <PermissionGate permission="goals.read">
              <GoalsPage />
            </PermissionGate>
          }
        />

        {/* Settings */}
        <Route
          path="/settings"
          element={
            <PermissionGate permission="settings.manage">
              <SettingsPage />
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

