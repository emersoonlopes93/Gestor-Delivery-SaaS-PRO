import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ActiveDeliveryPage } from './pages/ActiveDeliveryPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PwaStatusBanner } from './components/PwaStatusBanner';
import { useEffect } from 'react';
import { initSharedAudioContext } from './lib/driverDeliveryEvents';

function App() {
  useEffect(() => {
    const unlockAudio = () => {
      initSharedAudioContext();
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
  }, []);
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <PwaStatusBanner />
      <Routes>
        {/* Rota pública de login */}
        <Route path="/login" element={<LoginPage />} />

        {['/', '/routes', '/earnings', '/account'].map((path) => (
          <Route
            key={path}
            path={path}
            element={<ProtectedRoute><ActiveDeliveryPage /></ProtectedRoute>}
          />
        ))}

        {/* Rota Padrão / Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
