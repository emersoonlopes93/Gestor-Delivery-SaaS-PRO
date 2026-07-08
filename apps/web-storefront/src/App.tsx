import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { StorefrontPage } from './pages/StorefrontPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { PublicTrackingPage } from './pages/PublicTrackingPage';
import { PublicFeedbackPage } from './pages/PublicFeedbackPage';
import { OrderTrackingPage } from './pages/OrderTrackingPage';
import { PaymentPage } from './pages/PaymentPage';
import { OrdersHistoryPage } from './pages/OrdersHistoryPage';
import { CustomerProfilePage } from './pages/CustomerProfilePage';
import { StorefrontLayout } from './layouts/StorefrontLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { PwaLifecycle } from './components/PwaLifecycle';
import { useStorefrontThemeStore } from './stores/theme.store';

import { SaasLayout } from './layouts/SaasLayout';
import { SaasLandingPage } from './pages/SaasLandingPage';
import { SaasPricingPage } from './pages/SaasPricingPage';
import { SaasRegisterPage } from './pages/SaasRegisterPage';
import { SaasRedirectLogin } from './pages/SaasRedirectLogin';

export function App() {
  const initTheme = useStorefrontThemeStore((s) => s.initializeTheme);
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <ToastProvider>
      <PwaLifecycle />
      <ErrorBoundary>
        <Routes>
          {/* Public SaaS Routes */}
          <Route element={<SaasLayout />}>
            <Route path="/" element={<SaasLandingPage />} />
            <Route path="/precos" element={<SaasPricingPage />} />
          </Route>
          
          <Route path="/cadastro" element={<SaasRegisterPage />} />
          <Route path="/login" element={<SaasRedirectLogin />} />

          {/* Tenant Storefront Routes */}
          <Route element={<StorefrontLayout />}>
            <Route path="/:tenantSlug" element={<StorefrontPage />} />
            <Route path="/:tenantSlug/checkout" element={<CheckoutPage />} />
            <Route path="/:tenantSlug/order/:orderId" element={<OrderConfirmationPage />} />
            <Route path="/:tenantSlug/order/:orderId/tracking" element={<OrderTrackingPage />} />
            <Route path="/:tenantSlug/payment/:transactionId" element={<PaymentPage />} />
            <Route path="/:tenantSlug/orders" element={<OrdersHistoryPage />} />
            <Route path="/:tenantSlug/profile" element={<CustomerProfilePage />} />
            <Route path="/:tenantSlug/tracking/:token" element={<PublicTrackingPage />} />
            <Route path="/:tenantSlug/feedback/:token" element={<PublicFeedbackPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </ToastProvider>
  );
}
