import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { ArrowLeft, MapPin, User, FileText, Loader2, AlertCircle, Truck, Store } from 'lucide-react';
import { useCartStore } from '../store/use-cart-store';
import { api } from '../lib/api-client';
import type { CreateOrderDTO, CreateOrderItemDTO, OrderResponseDTO, FulfillmentType } from '@gestor/types';

export function CheckoutPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const items = useCartStore(s => s.items);
  const subtotal = useCartStore(s => s.subtotal);
  const clearCart = useCartStore(s => s.clearCart);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Address fields
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [reference, setReference] = useState('');

  // Idempotency key — generated once per checkout session
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const isFormValid = useMemo(() => {
    if (!customerName.trim() || !customerPhone.trim()) return false;
    if (items.length === 0) return false;
    if (fulfillmentType === 'delivery') {
      if (!street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state.trim() || !zipCode.trim()) {
        return false;
      }
    }
    return true;
  }, [customerName, customerPhone, items, fulfillmentType, street, number, neighborhood, city, state, zipCode]);

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Map cart lines to CreateOrderItemDTO[]
      const orderItems: CreateOrderItemDTO[] = items.map(item => {
        if (item.comboId) {
          return {
            lineType: 'combo' as const,
            comboId: item.comboId,
            quantity: item.quantity,
            notes: item.notes,
            comboSelections: item.selectedComboItems?.map(s => ({
              blockId: s.blockId,
              blockItemId: s.blockItemId,
            })) || [],
          };
        }
        return {
          lineType: 'product' as const,
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
          complements: item.selectedOptions?.map(o => ({
            groupId: o.groupId,
            itemId: o.itemId,
          })) || [],
        };
      });

      const payload: CreateOrderDTO = {
        idempotencyKey,
        items: orderItems,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        fulfillmentType,
        notes: notes.trim() || undefined,
        deliveryAddress: fulfillmentType === 'delivery' ? {
          street: street.trim(),
          number: number.trim(),
          complement: complement.trim() || undefined,
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: state.trim(),
          zipCode: zipCode.trim(),
          reference: reference.trim() || undefined,
        } : undefined,
      };

      const res = await api.post<OrderResponseDTO>(
        `/public/storefront/${tenantSlug}/checkout`,
        payload,
      );

      clearCart();
      navigate(`/${tenantSlug}/order/${res.data.id}`, { state: { order: res.data } });
    } catch (err: unknown) {
      const message = (err instanceof Error) ? err.message : 'Erro ao criar pedido.';
      // Try to extract API error message
      const apiErr = err as { response?: { data?: { message?: string } } };
      setSubmitError(apiErr?.response?.data?.message || message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Carrinho vazio</h2>
        <p className="text-gray-500 mb-6">Adicione itens ao carrinho antes de finalizar.</p>
        <button
          onClick={() => navigate(`/${tenantSlug}`)}
          className="bg-primary-600 text-white px-6 py-3 rounded-xl font-bold uppercase text-sm tracking-wider"
        >
          Voltar ao cardápio
        </button>
      </div>
    );
  }

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <header className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">Finalizar Pedido</h1>
      </header>

      {/* Cart Summary */}
      <section className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3">Resumo</h2>
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.cartLineId} className="flex justify-between items-start text-sm">
              <div className="flex-1">
                <span className="font-bold text-gray-800">{item.quantity}x</span>{' '}
                <span className="text-gray-700">{item.snapshot.productName}</span>
                {item.snapshot.extrasDescription && (
                  <p className="text-[11px] text-gray-400 mt-0.5 italic">{item.snapshot.extrasDescription}</p>
                )}
              </div>
              <span className="font-bold text-gray-800 ml-4">{fmt(item.snapshot.lineSubtotal)}</span>
            </div>
          ))}
        </div>
        <div className="border-t mt-4 pt-3 flex justify-between font-black text-gray-900">
          <span>Subtotal</span>
          <span>{fmt(subtotal)}</span>
        </div>
      </section>

      {/* Customer Data */}
      <section className="mb-6">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <User className="w-4 h-4" /> Seus Dados
        </h2>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Nome completo"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
          <input
            type="tel"
            placeholder="Telefone / WhatsApp"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </div>
      </section>

      {/* Fulfillment Type */}
      <section className="mb-6">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3">Como deseja receber?</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setFulfillmentType('delivery')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              fulfillmentType === 'delivery'
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
            }`}
          >
            <Truck className="w-6 h-6" />
            <span className="font-bold text-xs uppercase tracking-wider">Entrega</span>
          </button>
          <button
            onClick={() => setFulfillmentType('pickup')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              fulfillmentType === 'pickup'
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'
            }`}
          >
            <Store className="w-6 h-6" />
            <span className="font-bold text-xs uppercase tracking-wider">Retirada</span>
          </button>
        </div>
      </section>

      {/* Delivery Address */}
      {fulfillmentType === 'delivery' && (
        <section className="mb-6">
          <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Endereço de Entrega
          </h2>
          <div className="space-y-3">
            <input type="text" placeholder="Rua / Avenida" value={street} onChange={e => setStreet(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            <div className="grid grid-cols-3 gap-3">
              <input type="text" placeholder="Nº" value={number} onChange={e => setNumber(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
              <input type="text" placeholder="Complemento" value={complement} onChange={e => setComplement(e.target.value)}
                className="col-span-2 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <input type="text" placeholder="Bairro" value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            <div className="grid grid-cols-5 gap-3">
              <input type="text" placeholder="Cidade" value={city} onChange={e => setCity(e.target.value)}
                className="col-span-2 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
              <input type="text" placeholder="UF" value={state} onChange={e => setState(e.target.value)} maxLength={2}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none uppercase" />
              <input type="text" placeholder="CEP" value={zipCode} onChange={e => setZipCode(e.target.value)}
                className="col-span-2 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <input type="text" placeholder="Referência (opcional)" value={reference} onChange={e => setReference(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
          </div>
        </section>
      )}

      {/* Notes */}
      <section className="mb-8">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Observações
        </h2>
        <textarea
          placeholder="Alguma observação para o pedido?"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none min-h-[80px]"
        />
      </section>

      {/* Error */}
      {submitError && (
        <div className="mb-4 bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-2 text-red-700 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {submitError}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isFormValid || isSubmitting}
        className={`w-full h-14 rounded-2xl flex items-center justify-center gap-3 font-bold uppercase tracking-widest text-sm transition-all active:scale-[0.98] ${
          isFormValid && !isSubmitting
            ? 'bg-primary-600 text-white shadow-lg shadow-primary-200 hover:bg-primary-700'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processando...
          </>
        ) : (
          <>
            Confirmar Pedido — {fmt(subtotal)}
          </>
        )}
      </button>
    </div>
  );
}
