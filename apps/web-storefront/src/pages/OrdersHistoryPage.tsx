import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  ChevronLeft,
  Clock,
  ExternalLink,
  Package,
  RefreshCcw,
  ShoppingBag,
} from 'lucide-react';
import { api } from '../lib/api-client';
import { useCustomerStore } from '../store/useCustomerStore';
import { useCartStore } from '../store/use-cart-store';
import { useToast } from '../components/Toast';
import type {
  CartBundleItemSnapshot,
  CartSelectedComboSlot,
  CartSelectedOptionGroup,
  OrderListItemDTO,
  OrderResponseDTO,
  StorefrontPayload,
  StorefrontProductPayload,
} from '@gestor/types';

type OrderItemSnapshotV2 = {
  pricing?: {
    unitPrice?: number;
  };
  selections?: CartSelectedOptionGroup[];
  slots?: Array<{
    slotId?: string;
    items?: Array<{
      productId: string;
      name: string;
      additionalPrice: number;
      qty?: number;
    }>;
  }>;
  bundleItems?: Array<{
    productId: string;
    name: string;
    qty?: number;
  }>;
  optionItems?: Array<{
    snapshotName?: string;
  }>;
};

export function OrdersHistoryPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { isLoggedIn, logout, tenantSlug: customerTenantSlug, setTenantSlug } = useCustomerStore();
  const { tenantSlug: cartTenantSlug, setTenantSlug: setCartTenantSlug, addItem, clearCart } = useCartStore();
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!tenantSlug) return;
    setTenantSlug(tenantSlug);
    setCartTenantSlug(tenantSlug);
  }, [tenantSlug, setTenantSlug, setCartTenantSlug]);

  const { data, isLoading } = useQuery({
    queryKey: ['order-history', tenantSlug],
    queryFn: async () => {
      const res = await api.get<{ items: OrderListItemDTO[]; total: number }>('/public/orders/history');
      return res.data;
    },
    enabled: isLoggedIn && customerTenantSlug === tenantSlug,
  });

  const { data: storefront } = useQuery({
    queryKey: ['storefront', tenantSlug],
    queryFn: async () => {
      const res = await api.get<StorefrontPayload>(`/public/storefront/${tenantSlug}`);
      return res.data;
    },
    enabled: !!tenantSlug,
  });

  const persistTrackingSession = (order: OrderResponseDTO) => {
    if (order.publicTrackingToken) {
      sessionStorage.setItem(`tracking:token:${order.id}`, order.publicTrackingToken);
    }

    const lat = order.deliveryAddress?.lat;
    const lng = order.deliveryAddress?.lng;
    if (lat != null && lng != null) {
      sessionStorage.setItem(`tracking:dest:${order.id}`, JSON.stringify({ lat, lng }));
    }
  };

  const handleOpenTracking = async (order: OrderListItemDTO) => {
    try {
      const { data: orderDetail } = await api.get<OrderResponseDTO>(`/public/orders/${order.id}`);
      if (!orderDetail.publicTrackingToken && order.publicTrackingToken) {
        orderDetail.publicTrackingToken = order.publicTrackingToken;
      }
      persistTrackingSession(orderDetail);
      navigate(`/${tenantSlug}/order/${order.id}/tracking`);
    } catch (e: unknown) {
      const error = e as Error;
      showToast({
        title: 'Nao foi possivel abrir o tracking',
        message: error.message || 'Tente novamente em instantes.',
        type: 'error',
      });
    }
  };

  const handleReorder = async (orderId: string) => {
    if (!tenantSlug || !storefront) {
      showToast({ title: 'Carregando cardapio...', type: 'info' });
      return;
    }

    if (customerTenantSlug && customerTenantSlug !== tenantSlug) {
      showToast({
        title: 'Nao foi possivel refazer este pedido',
        message: 'Abra o cardapio correto para continuar.',
        type: 'error',
      });
      return;
    }

    try {
      showToast({ title: 'Validando itens...', type: 'info' });

      const { data: order } = await api.get<OrderResponseDTO>(`/public/orders/${orderId}`);
      if (!order?.items) {
        throw new Error('Pedido nao encontrado');
      }

      const catalog = new Map<string, StorefrontProductPayload>();
      for (const product of storefront.categories.flatMap((category) => category.products)) {
        catalog.set(product.id, product);
      }
      for (const combo of storefront.combos) {
        catalog.set(combo.id, {
          id: combo.id,
          name: combo.name,
          slug: combo.slug,
          type: 'combo',
          shortDescription: combo.description || '',
          basePrice: combo.basePrice,
          image: combo.image || '',
          isAvailable: combo.isAvailable,
          badges: [],
          optionGroupLinks: [],
          complementGroups: [],
          upsellLinks: [],
          upsells: [],
        });
      }

      let itemsAdded = 0;
      let itemsMissing = 0;
      let priceChanged = false;
      const reorderQueue: Array<{
        product: StorefrontProductPayload;
        quantity: number;
        notes?: string;
        selections?: CartSelectedOptionGroup[];
        slots?: CartSelectedComboSlot[];
        bundleItems?: CartBundleItemSnapshot[];
        computedUnitPrice: number;
        compositionLabel: string;
      }> = [];

      for (const item of order.items) {
        const catalogId = item.lineType === 'combo' ? item.comboId : item.productId;
        if (!catalogId) {
          itemsMissing++;
          continue;
        }

        const currentProduct = catalog.get(catalogId);
        if (!currentProduct?.isAvailable) {
          itemsMissing++;
          continue;
        }

        const snapshotV2 = (item.snapshotCatalogV2Json as OrderItemSnapshotV2 | undefined) ?? {};
        const computedUnitPrice =
          snapshotV2.pricing?.unitPrice ??
          item.unitPrice ??
          item.snapshotBasePrice + item.snapshotExtrasTotal;

        if (!Number.isFinite(computedUnitPrice) || computedUnitPrice < 0) {
          itemsMissing++;
          continue;
        }

        if (computedUnitPrice !== item.unitPrice || currentProduct.basePrice !== item.snapshotBasePrice) {
          priceChanged = true;
        }

        const slots: CartSelectedComboSlot[] | undefined = snapshotV2.slots?.map((slot) => ({
          blockId: slot.slotId || '',
          comboSlotId: slot.slotId,
          productId: '',
          items: (slot.items || []).map((selected) => ({
            productId: selected.productId,
            name: selected.name,
            additionalPrice: selected.additionalPrice,
            qty: Math.max(1, selected.qty ?? 1),
          })),
        }));

        const bundleItems: CartBundleItemSnapshot[] | undefined = snapshotV2.bundleItems?.map((bundleItem) => ({
          productId: bundleItem.productId,
          name: bundleItem.name,
          productName: bundleItem.name,
          qty: Math.max(1, bundleItem.qty ?? 1),
        }));

        const optionNames = snapshotV2.optionItems
          ?.map((optionItem) => optionItem.snapshotName)
          .filter((name): name is string => Boolean(name))
          .join(', ');

        reorderQueue.push({
          product: currentProduct,
          quantity: item.quantity,
          notes: item.notes || undefined,
          selections: snapshotV2.selections,
          slots,
          bundleItems,
          computedUnitPrice,
          compositionLabel: item.snapshotComposition || optionNames || (currentProduct.type === 'combo' ? 'Combo' : ''),
        });
        itemsAdded++;
      }

      if (itemsAdded > 0) {
        if (cartTenantSlug !== tenantSlug) {
          setCartTenantSlug(tenantSlug);
        }
        clearCart();
        reorderQueue.forEach((queuedItem) => addItem(queuedItem));

        let message = `${itemsAdded} item(s) adicionados.`;
        if (itemsMissing > 0) message += ` ${itemsMissing} item(s) nao estao mais disponiveis.`;
        if (priceChanged) message += ' Atencao: alguns precos foram atualizados.';

        showToast({
          title: 'Carrinho atualizado!',
          message,
          type: priceChanged || itemsMissing > 0 ? 'warning' : 'success',
        });
        navigate(`/${tenantSlug}/checkout`);
        return;
      }

      showToast({
        title: 'Erro ao repetir',
        message: 'Nao foi possivel refazer este pedido porque alguns itens nao estao mais disponiveis.',
        type: 'error',
      });
    } catch (e: unknown) {
      const error = e as Error;
      showToast({ title: 'Erro ao repetir pedido', message: error.message, type: 'error' });
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

  if (!isLoggedIn || customerTenantSlug !== tenantSlug) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <Package className="w-16 h-16 text-gray-200 mb-4" />
        <h1 className="text-xl font-bold text-gray-800">Acesse sua conta</h1>
        <p className="mt-2 text-gray-500 mb-6">Entre para visualizar seu historico de pedidos.</p>
        <Link to={`/${tenantSlug}`} className="bg-primary-600 text-white px-6 py-2 rounded-lg font-bold">
          Voltar para a loja
        </Link>
      </div>
    );
  }

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
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 animate-pulse h-32" />
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
              Ver cardapio
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {data?.items.map((order) => (
              <div
                key={order.id}
                className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
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
                        {new Date(order.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      statusMap[order.status]?.color || 'bg-gray-100'
                    }`}
                  >
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
                    <button
                      onClick={() => handleOpenTracking(order)}
                      className="p-3 text-gray-400 hover:text-primary-600 transition-colors bg-gray-50 rounded-xl"
                      title="Rastrear Pedido"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </button>
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
