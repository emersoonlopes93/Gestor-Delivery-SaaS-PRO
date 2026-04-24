import { useState, useEffect } from 'react'
import { MapPin, Navigation, Package, Settings, User } from 'lucide-react'

function App() {
  const [isTracking, setIsTracking] = useState(false)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout;
    let watchId: number;

    if (isTracking && "geolocation" in navigator) {
      // 1. Initial and periodic updates via watchPosition
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newLoc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setLocation(newLoc);
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );

      // 2. Periodic emission to backend API
      // In a real app, driverId and tenantId would come from auth context
      const driverId = localStorage.getItem('driver_id') || 'temp-driver-id';
      
      interval = setInterval(async () => {
        if (location) {
          try {
            await fetch(`http://localhost:3000/delivery/drivers/${driverId}/location`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                // Authorization would be here
              },
              body: JSON.stringify(location),
            });
          } catch (e) {
            console.error('Failed to send location:', e);
          }
        }
      }, 10000); // Every 10 seconds
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (interval) clearInterval(interval);
    };
  }, [isTracking, location]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 max-w-md mx-auto relative overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10">
        <h1 className="font-bold text-lg text-primary-600">Gestor Delivery</h1>
        <button className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <User className="w-6 h-6 text-gray-500" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-4">
          <div className={`p-4 rounded-full ${isTracking ? 'bg-green-100 text-green-600 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
            <Navigation className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{isTracking ? 'Em Serviço' : 'Fora de Serviço'}</h2>
            <p className="text-sm text-gray-500">
              {isTracking ? 'Sua localização está sendo enviada em tempo real.' : 'Inicie o serviço para receber entregas.'}
            </p>
          </div>
          <button 
            onClick={() => setIsTracking(!isTracking)}
            className={`w-full py-3 rounded-xl font-bold transition-all transform active:scale-95 ${
              isTracking 
                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' 
                : 'bg-primary-600 text-white shadow-lg shadow-primary-200 hover:bg-primary-700'
            }`}
          >
            {isTracking ? 'Finalizar Expediente' : 'Ficar Disponível'}
          </button>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
             <Package className="w-6 h-6 text-indigo-500 mb-2" />
             <div className="text-2xl font-bold">0</div>
             <div className="text-xs text-gray-500">Pedidos Hoje</div>
           </div>
           <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
             <MapPin className="w-6 h-6 text-orange-500 mb-2" />
             <div className="text-sm font-bold truncate">
               {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Aguardando...'}
             </div>
             <div className="text-xs text-gray-500">Sua Posição</div>
           </div>
        </div>
      </main>

      {/* Navigation */}
      <nav className="bg-white border-t border-gray-200 px-6 py-2 flex items-center justify-between">
        <button className="flex flex-col items-center space-y-1 text-primary-600">
          <Package className="w-6 h-6" />
          <span className="text-[10px] font-medium">Pedidos</span>
        </button>
        <button className="flex flex-col items-center space-y-1 text-gray-400">
          <MapPin className="w-6 h-6" />
          <span className="text-[10px] font-medium">Histórico</span>
        </button>
        <button className="flex flex-col items-center space-y-1 text-gray-400">
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-medium">Ajustes</span>
        </button>
      </nav>
    </div>
  )
}

export default App
