import { Routes, Route, Navigate } from 'react-router-dom';
import { StorefrontPage } from './pages/StorefrontPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { PublicTrackingPage } from './pages/PublicTrackingPage';
import { OrderTrackingPage } from './pages/OrderTrackingPage';
import { OrdersHistoryPage } from './pages/OrdersHistoryPage';
import { StorefrontLayout } from './layouts/StorefrontLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

export function App() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <Routes>
        <Route element={<StorefrontLayout />}>
          {/* The main storefront route with dynamic slug */}
          <Route path="/:tenantSlug" element={<StorefrontPage />} />
          
          {/* Checkout */}
          <Route path="/:tenantSlug/checkout" element={<CheckoutPage />} />

          {/* Order confirmation */}
          <Route path="/:tenantSlug/order/:orderId" element={<OrderConfirmationPage />} />

          {/* Tracking by order id (UX premium) */}
          <Route path="/:tenantSlug/order/:orderId/tracking" element={<OrderTrackingPage />} />

          {/* Orders history */}
          <Route path="/:tenantSlug/orders" element={<OrdersHistoryPage />} />

          {/* Public tracking */}
          <Route path="/:tenantSlug/tracking/:token" element={<PublicTrackingPage />} />
        </Route>

        {/* Root redirect */}
        <Route path="/" element={<div className="p-10 text-center">Gestor Delivery - Digite o slug da sua loja.</div>} />
        
        {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </ToastProvider>
  );
}

