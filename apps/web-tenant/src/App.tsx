
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { BillingPage } from './features/billing/BillingPage';
import { PartnersPage } from './features/billing/PartnersPage';
import { AuthLayout } from './layouts/AuthLayout';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { OnboardingGuard } from './components/OnboardingGuard';
import { PermissionGate } from './components/PermissionGate';
import { ModuleGate } from './components/ModuleGate';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { CategoriesPage } from './features/catalog/CategoriesPage';
import { ProductsPage } from './features/catalog/ProductsPage';
import { CatalogEditorPage } from './features/catalog/CatalogEditorPage';
import { OptionGroupsPage } from './features/catalog/OptionGroupsPage';
import { CombosV2Page } from './features/catalog/CombosV2Page';
import { OrderSimulationPage } from './features/catalog/OrderSimulationPage';
import { UpsellsPage } from './features/catalog/UpsellsPage';
import { OrdersListPage } from './features/orders/OrdersListPage';
import { OperationBoardPage } from './features/orders/OperationBoardPage';
import { KdsPage } from './features/orders/KdsPage';
import { DriversListPage } from './features/delivery/DriversListPage';
import { DispatchPage } from './features/delivery/DispatchPage';
import { DeliveryZonesPageRefactored } from './features/delivery/DeliveryZonesPageRefactored';
import { DeliveryMapPage } from './features/delivery/DeliveryMapPage';
import CashPage from './features/cash/CashPage';
import PosPage from './features/pos/PosPage';
import WaiterPage from './features/pos/WaiterPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { TablesPage } from './features/pos/TablesPage';
import { QrCodesPage } from './features/settings/QrCodesPage';
import { PrinterSettings } from './features/pos/PrinterSettings';
import { NotificationSettings } from './features/settings/NotificationSettings';
import { StorefrontCustomizationPage } from './features/settings/StorefrontCustomizationPage';
import { SchedulingSettingsPage } from './features/settings/SchedulingSettingsPage';
import { MenuImportPage } from './features/settings/MenuImportPage';
import { IntegrationsPage } from './features/settings/IntegrationsPage';
import { StoreNetworkPage } from './features/settings/StoreNetworkPage';

// CRM & Promotions
import { CustomersListPage } from './features/crm/CustomersListPage';
import { CrmDashboardPage } from './features/crm/CrmDashboardPage';
// import { CustomerProfilePage } from './features/crm/CustomerProfilePage'; // Optional next
import { PromotionsPage } from './features/promotions/PromotionsPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { ReportsPage, GoalsPage } from './features/analytics';
import { BusinessIntelligencePage } from './features/analytics/BusinessIntelligencePage';
import { SuppliersPage } from './features/purchasing/SuppliersPage';
import { PurchasesPage } from './features/purchasing/PurchasesPage';
import { FinancePage } from './features/purchasing/FinancePage';
import { EmployeesPage } from './features/management/employees/EmployeesPage';

// WhatsApp & IA & Campanhas (Phase 11)
import { WhatsAppConfigPage } from './features/whatsapp/pages/WhatsAppConfigPage';
import { InboxPage } from './features/whatsapp/pages/InboxPage';
import { CampaignsPage } from './features/campaigns/pages/CampaignsPage';
import { AutomationsPage } from './features/campaigns/pages/AutomationsPage';
import { AuthThemeBoundary } from './components/AuthThemeBoundary';


export function App() {

  return (
    <Routes>
      {/* Public routes */}
      <Route element={<AuthThemeBoundary><AuthLayout /></AuthThemeBoundary>}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <AppLayout />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/billing"
          element={
            <PermissionGate permission="billing.read">
              <BillingPage />
            </PermissionGate>
          }
        />
        <Route
          path="/partners"
          element={
            <PermissionGate permission="billing.read">
              <PartnersPage />
            </PermissionGate>
          }
        />

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
              <CatalogEditorPage mode="product" />
            </PermissionGate>
          }
        />
        <Route
          path="/catalog/products/new/v2"
          element={
            <PermissionGate permission="catalog.manage_products">
              <CatalogEditorPage mode="product" />
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
          path="/catalog/combos"
          element={
            <PermissionGate permission="catalog.manage_combos">
              <CombosV2Page />
            </PermissionGate>
          }
        />
        <Route
          path="/catalog/upsells"
          element={
            <PermissionGate permission="catalog.read">
              <UpsellsPage />
            </PermissionGate>
          }
        />
        <Route
          path="/catalog/combos/:id/v2"
          element={
            <PermissionGate permission="catalog.manage_combos">
              <CatalogEditorPage mode="combo" />
            </PermissionGate>
          }
        />
        <Route
          path="/catalog/combos/new/v2"
          element={
            <PermissionGate permission="catalog.manage_combos">
              <CatalogEditorPage mode="combo" />
            </PermissionGate>
          }
        />
        <Route
          path="/catalog/simulation"
          element={
            <PermissionGate permission="catalog.read">
              <OrderSimulationPage />
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
              <DeliveryZonesPageRefactored />
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
        <Route
          path="/pos/tables"
          element={
            <PermissionGate permission="pos.read">
              <TablesPage />
            </PermissionGate>
          }
        />
        <Route
          path="/pos/printers"
          element={
            <PermissionGate permission="settings.manage">
              <PrinterSettings />
            </PermissionGate>
          }
        />
        <Route
          path="/waiter"
          element={
            <PermissionGate permission="pos.waiter_mode">
              <WaiterPage />
            </PermissionGate>
          }
        />

        {/* CRM (Phase 8) */}
        <Route
          path="/crm/dashboard"
          element={
            <ModuleGate module="crm">
              <PermissionGate permission="crm.read">
                <CrmDashboardPage />
              </PermissionGate>
            </ModuleGate>
          }
        />
        <Route
          path="/customers"
          element={
            <ModuleGate module="crm">
              <PermissionGate permission="crm.read">
                <CustomersListPage />
              </PermissionGate>
            </ModuleGate>
          }
        />

        {/* Promotions (Phase 8) */}
        <Route
          path="/promotions"
          element={
            <ModuleGate module="crm">
              <PermissionGate permission="crm.manage_coupons">
                <PromotionsPage />
              </PermissionGate>
            </ModuleGate>
          }
        />

        {/* Campanhas (Phase 11) */}
        <Route
          path="/campaigns"
          element={
            <ModuleGate module="campaigns">
              <PermissionGate permission="crm.manage_coupons">
                <CampaignsPage />
              </PermissionGate>
            </ModuleGate>
          }
        />
        <Route
          path="/marketing/automations"
          element={
            <ModuleGate module="campaigns">
              <PermissionGate permission="crm.read">
                <AutomationsPage />
              </PermissionGate>
            </ModuleGate>
          }
        />

        {/* WhatsApp & IA (Phase 11) */}
        <Route
          path="/whatsapp/config"
          element={
            <ModuleGate module="whatsapp">
              <PermissionGate permission="settings.manage">
                <WhatsAppConfigPage />
              </PermissionGate>
            </ModuleGate>
          }
        />
        <Route
          path="/whatsapp/inbox"
          element={
            <ModuleGate module="whatsapp">
              <PermissionGate permission="orders.read">
                <InboxPage />
              </PermissionGate>
            </ModuleGate>
          }
        />

        {/* Inventory & Recipes (Phase 9) */}
        <Route
          path="/inventory"
          element={
            <ModuleGate module="inventory">
              <PermissionGate permission="inventory.read">
                <InventoryPage />
              </PermissionGate>
            </ModuleGate>
          }
        />

        {/* Phase 3 - Management Layer */}
        <Route
          path="/management/suppliers"
          element={
            <ModuleGate module="purchasing">
              <PermissionGate permission="purchasing.read">
                <SuppliersPage />
              </PermissionGate>
            </ModuleGate>
          }
        />
        <Route
          path="/management/purchases"
          element={
            <ModuleGate module="purchasing">
              <PermissionGate permission="purchasing.read">
                <PurchasesPage />
              </PermissionGate>
            </ModuleGate>
          }
        />
        <Route
          path="/management/finance"
          element={
            <ModuleGate module="finance">
              <PermissionGate permission="finance.read">
                <FinancePage />
              </PermissionGate>
            </ModuleGate>
          }
        />
        <Route
          path="/management/employees"
          element={
            <PermissionGate permission="users.read">
              <EmployeesPage />
            </PermissionGate>
          }
        />

        {/* Analytics & Performance (Phase 10) */}
        <Route
          path="/analytics/reports"
          element={
            <ModuleGate module="reports">
              <PermissionGate permission="reports.read">
                <ReportsPage />
              </PermissionGate>
            </ModuleGate>
          }
        />
        <Route
          path="/analytics/business-intelligence"
          element={
            <ModuleGate module="bi">
              <PermissionGate permission="reports.read">
                <BusinessIntelligencePage />
              </PermissionGate>
            </ModuleGate>
          }
        />
        <Route
          path="/analytics/goals"
          element={
            <ModuleGate module="goals">
              <PermissionGate permission="goals.read">
                <GoalsPage />
              </PermissionGate>
            </ModuleGate>
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
        <Route
          path="/settings/storefront"
          element={
            <PermissionGate permission="settings.manage">
              <StorefrontCustomizationPage />
            </PermissionGate>
          }
        />
        <Route
          path="/settings/integrations"
          element={
            <ModuleGate module="marketplace">
              <PermissionGate permission="settings.manage">
                <IntegrationsPage />
              </PermissionGate>
            </ModuleGate>
          }
        />
        <Route
          path="/settings/network"
          element={
            <PermissionGate permission="settings.manage">
              <StoreNetworkPage />
            </PermissionGate>
          }
        />
        <Route
          path="/settings/qr-codes"
          element={
            <PermissionGate permission="settings.manage">
              <QrCodesPage />
            </PermissionGate>
          }
        />
        <Route
          path="/settings/notifications"
          element={
            <PermissionGate permission="settings.manage">
              <NotificationSettings />
            </PermissionGate>
          }
        />
        <Route
          path="/settings/scheduling"
          element={
            <PermissionGate permission="settings.manage">
              <SchedulingSettingsPage />
            </PermissionGate>
          }
        />
        <Route
          path="/settings/menu-import"
          element={
            <PermissionGate permission="catalog.create">
              <MenuImportPage />
            </PermissionGate>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>

      {/* Onboarding Dedicated Route (Protected but No AppLayout) */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <OnboardingWizard />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
