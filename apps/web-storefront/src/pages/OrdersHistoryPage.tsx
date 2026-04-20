import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { 
  ChevronLeft, 
  Package, 
  Calendar, 
  Clock, 
  RefreshCcw, 
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import { useCustomerStore } from '../store/useCustomerStore';
import { useCartStore } from '../store/use-cart-store';
import { useToast } from '../components/Toast';
import type { OrderListItemDTO, OrderResponseDTO } from '@gestor/types';

export function OrdersHistoryPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { isLoggedIn, logout } = useCustomerStore();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['order-history', tenantSlug],
    queryFn: async () => {
      const res = await api.get<{ items: OrderListItemDTO[], total: number }>(
        '/public/orders/history'
      );
      return res.data;
    },
    enabled: isLoggedIn,
  });

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <Package className="w-16 h-16 text-gray-200 mb-4" />
        <h1 className="text-xl font-bold text-gray-800">Acesse sua conta</h1>
        <p className="mt-2 text-gray-500 mb-6">Entre para visualizar seu histórico de pedidos.</p>
        <Link 
          to={`/${tenantSlug}`}
          className="bg-primary-600 text-white px-6 py-2 rounded-lg font-bold"
        >
          Voltar para a loja
        </Link>
      </div>
    );
  }

  const handleReorder = async (orderId: string) => {
    try {
      showToast({ title: 'Recriando seu carrinho...', type: 'info' });
      
      const { data: order } = await api.get<OrderResponseDTO>(`/public/orders/${orderId}`);
      
      if (!order || !order.items) {
        throw new Error('Pedido não encontrado');
      }

      for (const item of order.items) {
        if (item.lineType === 'product' && item.productId) {
          // Map to CartLineItem snapshot format
          const cartItem = {
            cartLineId: crypto.randomUUID(),
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes || undefined,
            selectedOptions: item.complements.map((c) => ({
              groupId: '', // Not stored in legacy snapshot, but needed for type
              itemId: c.complementItemId,
              name: c.snapshotName,
              price: c.snapshotPrice,
            })),
            snapshot: {
              productName: item.snapshotName,
              productImage: item.snapshotImage || undefined,
              basePrice: item.snapshotBasePrice,
              lineSubtotal: item.lineTotal,
              extrasDescription: item.complements.map((c) => c.snapshotName).join(', '),
            }
          };
          
          useCartStore.setState((state) => {
            const newItems = [...state.items, cartItem as any];
            return {
              items: newItems,
              subtotal: newItems.reduce((sum, i) => sum + i.snapshot.lineSubtotal, 0)
            };
          });
        }
      }

      showToast({ title: 'Itens adicionados ao carrinho!', type: 'success' });
      navigate(`/${tenantSlug}`);
    } catch (e: any) {
      showToast({ title: 'Erro ao repetir pedido', message: e.message, type: 'error' });
    }
  };

  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-700' },
    confirmed: { label: 'Confirmado', color: 'bg-blue-100 text-blue-700' },
    preparing: { label: 'Em preparo', color: 'bg-indigo-100 text-indigo-700' },
    ready_for_pickup: { label: 'Pronto p/ Retirada', color: 'bg-green-100 text-green-700' },
    ready_for_delivery: { label: 'Pronto p/ Entrega', color: 'bg-green-100 text-green-700' },
    out_for_delivery: { label: 'Em entrega', color: 'bg-purple-100 text-purple-700' },
    completed: { label: 'Finalizado', color: 'bg-gray-100 text-gray-700' },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <header className="mb-8">
          <Link 
            to={`/${tenantSlug}`}
            className="flex items-center gap-2 text-gray-500 hover:text-primary-600 transition-colors mb-4"
          >
            <ChevronLeft className="w-5 h-5" />
            Voltar para a loja
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-gray-900">MEUS PEDIDOS</h1>
            <button 
              onClick={() => {
                logout();
                navigate(`/${tenantSlug}`);
              }}
              className="text-sm font-bold text-red-500"
            >
              Sair
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 animate-pulse h-32"></div>
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-gray-100 text-center">
            <ShoppingBag className="w-16 h-16 text-gray-100 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800">Nenhum pedido ainda</h3>
            <p className="text-gray-500 mt-2">Que tal fazer o seu primeiro pedido?</p>
            <Link 
              to={`/${tenantSlug}`}
              className="inline-block mt-6 bg-primary-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-primary-100"
            >
              Ver cardápio
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {data?.items.map((order) => (
              <div key={order.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Pedido {order.orderNumber}</h3>
                    <div className="flex items-center gap-3 mt-1 text-gray-500 text-sm">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${statusMap[order.status]?.color || 'bg-gray-100'}`}>
                    {statusMap[order.status]?.label || order.status}
                  </span>
                </div>

                <div className="border-t border-gray-50 pt-4 mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Total</p>
                    <p className="text-lg font-black text-primary-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Link 
                      to={`/${tenantSlug}/order/${order.id}/tracking`}
                      className="p-3 text-gray-400 hover:text-primary-600 transition-colors bg-gray-50 rounded-xl"
                      title="Rastrear Pedido"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </Link>
                    <button 
                      onClick={() => handleReorder(order.id)}
                      className="flex items-center gap-2 bg-primary-50 text-primary-700 px-4 py-3 rounded-xl font-bold hover:bg-primary-100 transition-colors"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      Pedir novamente
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
