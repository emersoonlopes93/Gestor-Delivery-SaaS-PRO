import { Routes, Route, Navigate } from 'react-router-dom';
import { StorefrontPage } from './pages/StorefrontPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { StorefrontLayout } from './layouts/StorefrontLayout';

export function App() {
  return (
    <Routes>
      <Route element={<StorefrontLayout />}>
        {/* The main storefront route with dynamic slug */}
        <Route path="/:tenantSlug" element={<StorefrontPage />} />
        
        {/* Checkout */}
        <Route path="/:tenantSlug/checkout" element={<CheckoutPage />} />

        {/* Order confirmation */}
        <Route path="/:tenantSlug/order/:orderId" element={<OrderConfirmationPage />} />
      </Route>

      {/* Root redirect */}
      <Route path="/" element={<div className="p-10 text-center">Gestor Delivery - Digite o slug da sua loja.</div>} />
      
      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

