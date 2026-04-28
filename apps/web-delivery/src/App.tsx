import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ActiveDeliveryPage } from './pages/ActiveDeliveryPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        {/* Rota pública de login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Home Route */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <ActiveDeliveryPage />
            </ProtectedRoute>
          } 
        />

        {/* Rota Padrão / Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
