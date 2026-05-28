import { useState } from 'react';
import { useDispatch } from './hooks/useDispatch';
import { useDrivers } from './hooks/useDrivers';
import { Package, Truck, AlertCircle, MapPin, Phone } from 'lucide-react';
import type { OrderDispatchItemDTO } from '@gestor/types';

function StatusBadge({ status }: { status: OrderDispatchItemDTO['status'] }) {
  if (status === 'ready_for_delivery') {
    return (
      <span className="text-xs font-semibold text-status-warning-foreground bg-status-warning px-2 py-0.5 rounded-full">
        Aguardando Saída
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold text-status-success-foreground bg-status-success px-2 py-0.5 rounded-full">
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

  const handleDispatch = async (order: OrderDispatchItemDTO) => {
    const pendingDriverId = selectedDriverForOrder[order.id];
    const effectiveDriverId = order.deliveryDriverId || pendingDriverId;

    if (!effectiveDriverId) {
      alert('Atribua um entregador antes de despachar o pedido.');
      return;
    }

    try {
      if (!order.deliveryDriverId && pendingDriverId) {
        await assignDriver(order.id, pendingDriverId);
      }
      await dispatchOrder(order.id);
      setSelectedDriverForOrder((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
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
        <h1 className="text-2xl font-bold text-foreground">Despacho em Tempo Real</h1>
        <p className="text-sm text-muted-foreground">
          Supervisione os pedidos prontos, atribua entregadores e controle rotas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 items-start">

        {/* Coluna 1: Aguardando Despacho (ready_for_delivery) */}
        <div className="bg-card rounded-xl p-4 min-h-[500px] border border-border">
          <h2 className="font-bold text-foreground mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Aguardando Despacho
            </span>
            <span className="bg-status-warning text-status-warning-foreground px-2 py-0.5 rounded-full text-sm">
              {waitingOrders.length}
            </span>
          </h2>
          <div className="space-y-4">
            {waitingOrders.map((o) => (
              <div key={o.id} className="bg-card p-4 rounded-lg shadow-sm border border-border">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-foreground">{o.orderNumber}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="font-medium text-foreground">{o.customerName}</div>
                {o.customerPhone && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" />
                    {o.customerPhone}
                  </div>
                )}
                <div className="text-sm text-muted-foreground mt-2 truncate flex items-start gap-1">
                  <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    {o.deliveryAddress?.street}, {o.deliveryAddress?.number}
                    {o.deliveryAddress?.neighborhood ? ` — ${o.deliveryAddress.neighborhood}` : ''}
                  </span>
                </div>

                {/* Entregador já atribuído */}
                {o.deliveryDriverName ? (
                  <div className="mt-3 px-3 py-2 bg-muted rounded-lg border border-border">
                    <p className="text-xs font-semibold text-foreground">
                      🏍 Entregador: {o.deliveryDriverName}
                    </p>
                    {o.deliveryDriverStatus === 'busy' && (
                      <p className="text-xs text-muted-foreground">Status: Em rota</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-status-warning shrink-0" />
                    <p className="text-xs text-status-warning-foreground font-medium">Nenhum entregador atribuído</p>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      className="text-sm border-input rounded focus:ring-ring focus:border-primary bg-card text-foreground flex-1"
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
                      className="text-xs font-semibold text-primary hover:text-foreground whitespace-nowrap border border-border px-2 py-1.5 rounded"
                    >
                      Atribuir
                    </button>
                  </div>

                  <button
                    onClick={() => handleDispatch(o)}
                    disabled={!o.deliveryDriverId && !selectedDriverForOrder[o.id]}
                    className={`w-full py-2 rounded text-sm font-bold text-primary-foreground transition-colors ${
                      o.deliveryDriverId || selectedDriverForOrder[o.id]
                        ? 'bg-primary hover:bg-primary/90 shadow-sm'
                        : 'bg-secondary text-muted-foreground cursor-not-allowed'
                    }`}
                  >
                    Despachar Pedido
                  </button>
                  {!o.deliveryDriverId && !selectedDriverForOrder[o.id] && (
                    <p className="text-xs text-center text-muted-foreground">Atribua um entregador primeiro</p>
                  )}
                </div>
              </div>
            ))}
            {waitingOrders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum pedido aguardando despacho.</p>
            )}
          </div>
        </div>

        {/* Coluna 2: Em Rota (out_for_delivery) */}
        <div className="bg-card rounded-xl p-4 min-h-[500px] border border-border">
          <h2 className="font-bold text-foreground mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Em Rota
            </span>
            <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-sm">
              {outOrders.length}
            </span>
          </h2>
          <div className="space-y-4">
            {outOrders.map((o) => (
              <div key={o.id} className="bg-card p-4 rounded-lg shadow-sm border border-border">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-foreground">{o.orderNumber}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="font-medium text-foreground">{o.customerName}</div>
                {o.customerPhone && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" />
                    {o.customerPhone}
                  </div>
                )}
                <div className="text-sm text-muted-foreground truncate mb-3 flex items-start gap-1 mt-2">
                  <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    {o.deliveryAddress?.street}, {o.deliveryAddress?.number}
                  </span>
                </div>
                <div className="text-sm font-semibold text-foreground bg-muted p-2 rounded truncate">
                  🏍 Entregador: {o.deliveryDriverName || 'Desconhecido'}
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => handleComplete(o.id)}
                    className="w-full py-2 bg-status-success text-status-success-foreground border border-status-success/30 hover:bg-status-success/90 rounded text-sm font-bold transition-colors"
                  >
                    Marcar como Entregue
                  </button>
                </div>
              </div>
            ))}
            {outOrders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum pedido em rota neste momento.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
