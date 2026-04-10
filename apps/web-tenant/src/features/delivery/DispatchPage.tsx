import React, { useState } from 'react';
import { useDispatch } from './hooks/useDispatch';
import { useDrivers } from './hooks/useDrivers';

export function DispatchPage() {
  const { orders, isLoading, isError, assignDriver, dispatchOrder, completeOrder } = useDispatch();
  const { drivers } = useDrivers();
  const [selectedDriverForOrder, setSelectedDriverForOrder] = useState<Record<string, string>>({});

  if (isLoading) return <div className="p-6">Carregando painel de despacho...</div>;
  if (isError) return <div className="p-6 text-red-500">Erro ao carregar pedidos para despacho.</div>;

  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready_for_delivery');
  const outOrders = orders.filter((o) => o.status === 'out_for_delivery');

  const handleAssignDriver = async (orderId: string) => {
    const driverId = selectedDriverForOrder[orderId];
    if (!driverId) {
      alert('Selecione um entregador primeiro.');
      return;
    }
    try {
      await assignDriver(orderId, driverId);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erro ao assinalar entregador');
    }
  };

  const handleDispatch = async (orderId: string) => {
    try {
      await dispatchOrder(orderId);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erro ao despachar pedido');
    }
  };

  const handleComplete = async (orderId: string) => {
    try {
      if (confirm('Tem certeza que este pedido já foi entregue ao cliente?')) {
        await completeOrder(orderId);
      }
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erro ao finalizar pedido');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Despacho em Tempo Real</h1>
        <p className="text-sm text-gray-500">
          Supervisione os pedidos para entrega, atribua entregadores e controle rotas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 items-start">
        {/* Coluna 1: Em Preparo (Próximos) */}
        <div className="bg-gray-100 rounded-xl p-4 min-h-[500px]">
          <h2 className="font-bold text-gray-700 mb-4 flex items-center justify-between">
            <span>👩‍🍳 Em Preparo</span>
            <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-sm">
              {preparingOrders.length}
            </span>
          </h2>
          <div className="space-y-4">
            {preparingOrders.map((o) => (
              <div key={o.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-primary-600">{o.orderNumber}</span>
                  <span className="text-xs text-gray-500">
                    {o.createdAt ? new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div className="font-medium text-gray-900">{o.customerName}</div>
                <div className="text-sm text-gray-500 mt-2 truncate">
                  {o.deliveryAddress?.street}, {o.deliveryAddress?.number} - {o.deliveryAddress?.neighborhood}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <select
                    className="text-sm border-gray-300 rounded focus:ring-primary-500 focus:border-primary-500 bg-gray-50 w-full mr-2"
                    value={selectedDriverForOrder[o.id] || o.deliveryDriverId || ''}
                    onChange={(e) =>
                      setSelectedDriverForOrder({ ...selectedDriverForOrder, [o.id]: e.target.value })
                    }
                  >
                    <option value="">(Nenhum entregador)</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.status === 'busy' ? '(Ocupado)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAssignDriver(o.id)}
                    className="text-xs font-semibold text-primary-600 hover:text-primary-800"
                  >
                    Atribuir
                  </button>
                </div>
              </div>
            ))}
            {preparingOrders.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum pedido em preparo.</p>
            )}
          </div>
        </div>

        {/* Coluna 2: Fila de Despacho (Prontos) */}
        <div className="bg-yellow-50/50 rounded-xl p-4 min-h-[500px] border border-yellow-100">
          <h2 className="font-bold text-yellow-800 mb-4 flex items-center justify-between">
            <span>📦 Prontos (Aguardando Retirada)</span>
            <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full text-sm">
              {readyOrders.length}
            </span>
          </h2>
          <div className="space-y-4">
            {readyOrders.map((o) => (
              <div key={o.id} className="bg-white p-4 rounded-lg shadow-sm border border-yellow-200">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-yellow-600">{o.orderNumber}</span>
                  <span className="text-xs font-semibold text-yellow-600 bg-yellow-100 px-2 rounded">
                    PRONTO
                  </span>
                </div>
                <div className="font-medium text-gray-900">{o.customerName}</div>
                <div className="text-sm text-gray-500 mt-2">
                  {o.deliveryAddress?.street}, {o.deliveryAddress?.number} - {o.deliveryAddress?.neighborhood}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <select
                      className="text-sm border-gray-300 rounded focus:ring-primary-500 focus:border-primary-500 bg-gray-50 w-full mr-2"
                      value={selectedDriverForOrder[o.id] || o.deliveryDriverId || ''}
                      onChange={(e) =>
                        setSelectedDriverForOrder({ ...selectedDriverForOrder, [o.id]: e.target.value })
                      }
                    >
                      <option value="">(Nenhum entregador)</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.status === 'busy' ? '(Ocupado)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAssignDriver(o.id)}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-800 whitespace-nowrap"
                    >
                      Atribuir
                    </button>
                  </div>
                  
                  <button
                    onClick={() => handleDispatch(o.id)}
                    disabled={!o.deliveryDriverId}
                    className={`w-full py-2 rounded text-sm font-bold text-white transition-colors ${
                      o.deliveryDriverId
                        ? 'bg-primary-600 hover:bg-primary-700 shadow-sm'
                        : 'bg-gray-300 cursor-not-allowed'
                    }`}
                  >
                    Despachar Pedido
                  </button>
                  {!o.deliveryDriverId && (
                    <p className="text-xs text-center text-gray-400 mt-2">Atribua um entregador primeiro</p>
                  )}
                </div>
              </div>
            ))}
            {readyOrders.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum pedido aguardando despacho.</p>
            )}
          </div>
        </div>

        {/* Coluna 3: Em Rota */}
        <div className="bg-primary-50/50 rounded-xl p-4 min-h-[500px] border border-primary-100">
          <h2 className="font-bold text-primary-800 mb-4 flex items-center justify-between">
            <span>🛵 Em Rota</span>
            <span className="bg-primary-200 text-primary-800 px-2 py-0.5 rounded-full text-sm">
              {outOrders.length}
            </span>
          </h2>
          <div className="space-y-4">
            {outOrders.map((o) => (
              <div key={o.id} className="bg-white p-4 rounded-lg shadow-sm border border-primary-200">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-primary-600">{o.orderNumber}</span>
                  <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-100 px-2 rounded-full py-0.5 whitespace-nowrap">
                    Em rota
                  </span>
                </div>
                <div className="font-medium text-gray-900">{o.customerName}</div>
                <div className="text-sm text-gray-500 truncate mb-1">
                  {o.deliveryAddress?.street}, {o.deliveryAddress?.number}
                </div>
                <div className="text-sm font-semibold text-primary-700 bg-primary-50 p-2 rounded truncate">
                  Entregador: {o.deliveryDriverName || 'Desconhecido'}
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
