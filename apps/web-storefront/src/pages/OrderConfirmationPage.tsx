import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowLeft, Clock, MapPin, FileText, Package } from 'lucide-react';
import type { OrderResponseDTO } from '@gestor/types';

export function OrderConfirmationPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const order = (location.state as { order?: OrderResponseDTO })?.order;

  if (!order) {
    return (
      <div className="px-4 py-12 text-center">
        <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Pedido não encontrado</h2>
        <button
          onClick={() => navigate(`/${tenantSlug}`)}
          className="mt-4 bg-primary-600 text-white px-6 py-3 rounded-xl font-bold uppercase text-sm tracking-wider"
        >
          Voltar ao cardápio
        </button>
      </div>
    );
  }

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="px-4 py-8 max-w-lg mx-auto">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Pedido Confirmado!</h1>
        <div className="mt-3 bg-gray-900 text-white text-3xl font-black px-6 py-3 rounded-2xl inline-block">
          {order.orderNumber}
        </div>
      </div>

      {/* Order Summary */}
      <section className="bg-gray-50 rounded-2xl p-5 mb-6 border border-gray-100 space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock className="w-4 h-4" />
          <span>Status: <strong className="text-gray-800 uppercase">{order.status.replace(/_/g, ' ')}</strong></span>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Package className="w-4 h-4" />
          <span>{order.fulfillmentType === 'delivery' ? '📦 Entrega' : '🏪 Retirada'}</span>
        </div>

        {order.deliveryAddress && (
          <div className="flex items-start gap-2 text-sm text-gray-500">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {order.deliveryAddress.street}, {order.deliveryAddress.number}
              {order.deliveryAddress.complement ? ` - ${order.deliveryAddress.complement}` : ''}
              , {order.deliveryAddress.neighborhood} - {order.deliveryAddress.city}/{order.deliveryAddress.state}
            </span>
          </div>
        )}

        {order.notes && (
          <div className="flex items-start gap-2 text-sm text-gray-500">
            <FileText className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="italic">{order.notes}</span>
          </div>
        )}
      </section>

      {/* Items */}
      <section className="bg-white rounded-2xl p-5 mb-6 border border-gray-100">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-4">Itens do Pedido</h2>
        <div className="space-y-3">
          {order.items.map(item => (
            <div key={item.id} className="flex justify-between text-sm">
              <div>
                <span className="font-bold text-gray-800">{item.quantity}x</span>{' '}
                <span className="text-gray-700">{item.snapshotName}</span>
                {item.snapshotComposition && (
                  <p className="text-[11px] text-gray-400 mt-0.5 italic">{item.snapshotComposition}</p>
                )}
              </div>
              <span className="font-bold text-gray-800 ml-4">{fmt(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="border-t mt-4 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal dos itens</span><span>{fmt(order.itemsSubtotal)}</span>
          </div>
          {order.deliveryFee > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>Taxa de entrega</span><span>{fmt(order.deliveryFee)}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-gray-900 text-base pt-2 border-t">
            <span>Total</span><span>{fmt(order.total)}</span>
          </div>
        </div>
      </section>

      {order.publicTrackingToken ? (
        <button
          onClick={() => navigate(`/${tenantSlug}/tracking/${order.publicTrackingToken}`)}
          className="w-full h-14 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-primary-700 transition-colors mb-4"
        >
          Acompanhar entrega em tempo real
        </button>
      ) : null}

      {/* Back to menu */}
      <button
        onClick={() => navigate(`/${tenantSlug}`)}
        className="w-full flex items-center justify-center gap-2 h-14 bg-gray-100 text-gray-700 rounded-2xl font-bold uppercase tracking-widest text-sm hover:bg-gray-200 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Voltar ao cardápio
      </button>
    </div>
  );
}
