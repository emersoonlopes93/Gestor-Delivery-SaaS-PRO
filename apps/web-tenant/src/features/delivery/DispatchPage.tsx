import { useState } from 'react';
import { useDispatch } from './hooks/useDispatch';
import { useDrivers } from './hooks/useDrivers';
import { Package, Truck, AlertCircle, MapPin, Phone } from 'lucide-react';
import type { OrderDispatchItemDTO } from '@gestor/types';

function StatusBadge({ status }: { status: OrderDispatchItemDTO['status'] }) {
  if (status === 'ready_for_delivery') {
    return (
      <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
        Aguardando Saída
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
      Em Rota
    </span>
  );
}

export function DispatchPage() {
  const { orders, isLoading, isError, assignDriver, dispatchOrder, completeOrder } = useDispatch();
  const { drivers } = useDrivers();
  const [selectedDriverForOrder, setSelectedDriverForOrder] = useState<Record<string, string>>({});

  if (isLoading) return <div className="p-6">Carregando painel de despacho...</div>;
  if (isError) return <div className="p-6 text-red-500">Erro ao carregar pedidos para despacho.</div>;

  // BUG 1 FIX: Dispatch endpoint only returns ready_for_delivery and out_for_delivery.
  // The old "Em Preparo" column was showing data that never existed in this endpoint.
  const waitingOrders = orders.filter((o) => o.status === 'ready_for_delivery');
  const outOrders = orders.filter((o) => o.status === 'out_for_delivery');

  const handleAssignDriver = async (orderId: string) => {
    const driverId = selectedDriverForOrder[orderId];
    if (!driverId) {
      alert('Selecione um entregador primeiro.');
      return;
    }
    try {
      await assignDriver(orderId, driverId);
    } catch (e: unknown) {
      const error = e as Error & { response?: { data?: { message?: string } } };
      alert(error?.response?.data?.message || 'Erro ao assinalar entregador');
    }
  };

  const handleDispatch = async (orderId: string) => {
    try {
      await dispatchOrder(orderId);
    } catch (e: unknown) {
      const error = e as Error & { response?: { data?: { message?: string } } };
      alert(error?.response?.data?.message || 'Erro ao despachar pedido');
    }
  };

  const handleComplete = async (orderId: string) => {
    try {
      if (confirm('Tem certeza que este pedido já foi entregue ao cliente?')) {
        await completeOrder(orderId);
      }
    } catch (e: unknown) {
      const error = e as Error & { response?: { data?: { message?: string } } };
      alert(error?.response?.data?.message || 'Erro ao finalizar pedido');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Despacho em Tempo Real</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Supervisione os pedidos prontos, atribua entregadores e controle rotas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 items-start">

        {/* Coluna 1: Aguardando Despacho (ready_for_delivery) */}
        <div className="bg-yellow-50/60 rounded-xl p-4 min-h-[500px] border border-yellow-200">
          <h2 className="font-bold text-yellow-800 dark:text-yellow-700 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Aguardando Despacho
            </span>
            <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full text-sm">
              {waitingOrders.length}
            </span>
          </h2>
          <div className="space-y-4">
            {waitingOrders.map((o) => (
              <div key={o.id} className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm border border-yellow-200">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-yellow-600">{o.orderNumber}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{o.customerName}</div>
                {o.customerPhone && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" />
                    {o.customerPhone}
                  </div>
                )}
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 truncate flex items-start gap-1">
                  <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    {o.deliveryAddress?.street}, {o.deliveryAddress?.number}
                    {o.deliveryAddress?.neighborhood ? ` — ${o.deliveryAddress.neighborhood}` : ''}
                  </span>
                </div>

                {/* Entregador já atribuído */}
                {o.deliveryDriverName ? (
                  <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs font-semibold text-blue-700">
                      🏍 Entregador: {o.deliveryDriverName}
                    </p>
                    {o.deliveryDriverStatus === 'busy' && (
                      <p className="text-xs text-blue-500">Status: Em rota</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
                    <p className="text-xs text-orange-500 font-medium">Nenhum entregador atribuído</p>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      className="text-sm border-gray-300 dark:border-gray-700 rounded focus:ring-primary-500 focus:border-primary-500 bg-gray-50 dark:bg-gray-900/50 flex-1"
                      value={selectedDriverForOrder[o.id] || o.deliveryDriverId || ''}
                      onChange={(e) =>
                        setSelectedDriverForOrder({ ...selectedDriverForOrder, [o.id]: e.target.value })
                      }
                    >
                      <option value="">(Selecione entregador)</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id} disabled={d.status === 'offline' || !d.isActive}>
                          {d.name} {d.status === 'busy' ? '(Ocupado)' : d.status === 'offline' ? '(Offline)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAssignDriver(o.id)}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-800 whitespace-nowrap border border-primary-200 px-2 py-1.5 rounded"
                    >
                      Atribuir
                    </button>
                  </div>

                  <button
                    onClick={() => handleDispatch(o.id)}
                    disabled={!o.deliveryDriverId && !selectedDriverForOrder[o.id]}
                    className={`w-full py-2 rounded text-sm font-bold text-white transition-colors ${
                      o.deliveryDriverId || selectedDriverForOrder[o.id]
                        ? 'bg-primary-600 hover:bg-primary-700 shadow-sm'
                        : 'bg-gray-300 cursor-not-allowed'
                    }`}
                  >
                    Despachar Pedido
                  </button>
                  {!o.deliveryDriverId && !selectedDriverForOrder[o.id] && (
                    <p className="text-xs text-center text-gray-400">Atribua um entregador primeiro</p>
                  )}
                </div>
              </div>
            ))}
            {waitingOrders.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum pedido aguardando despacho.</p>
            )}
          </div>
        </div>

        {/* Coluna 2: Em Rota (out_for_delivery) */}
        <div className="bg-primary-50/50 rounded-xl p-4 min-h-[500px] border border-primary-100">
          <h2 className="font-bold text-primary-800 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Em Rota
            </span>
            <span className="bg-primary-200 text-primary-800 px-2 py-0.5 rounded-full text-sm">
              {outOrders.length}
            </span>
          </h2>
          <div className="space-y-4">
            {outOrders.map((o) => (
              <div key={o.id} className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm border border-primary-200">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-primary-600">{o.orderNumber}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{o.customerName}</div>
                {o.customerPhone && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" />
                    {o.customerPhone}
                  </div>
                )}
                <div className="text-sm text-gray-500 dark:text-gray-400 truncate mb-3 flex items-start gap-1 mt-2">
                  <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    {o.deliveryAddress?.street}, {o.deliveryAddress?.number}
                  </span>
                </div>
                <div className="text-sm font-semibold text-primary-700 bg-primary-50 p-2 rounded truncate">
                  🏍 Entregador: {o.deliveryDriverName || 'Desconhecido'}
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => handleComplete(o.id)}
                    className="w-full py-2 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 rounded text-sm font-bold transition-colors"
                  >
                    Marcar como Entregue
                  </button>
                </div>
              </div>
            ))}
            {outOrders.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum pedido em rota neste momento.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
