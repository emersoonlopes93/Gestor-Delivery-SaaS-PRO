import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, MapPin, User, FileText, Loader2, AlertCircle, Truck, Store, CreditCard, Banknote, QrCode } from 'lucide-react';
import { useCartStore } from '../store/use-cart-store';
import { api } from '../lib/api-client';
import { 
  CreateOrderDTO, 
  CreateOrderItemDTO, 
  OrderResponseDTO, 
  FulfillmentType,
  PaymentInput,
  PaymentMethod,
  DeliveryAddressDTO,
  CheckoutValidationResult
} from '@gestor/types';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { StructuredAddress, fetchAddressByCep, geocodeAddress } from '../lib/maps-service';
import { useDebounce } from '../hooks/use-debounce';
import { useCustomerStore } from '../store/useCustomerStore';
import { LoginModal } from '../components/LoginModal';
import { CouponInput } from '../components/CouponInput';
import { CashbackSelector } from '../components/CashbackSelector';
import { SchedulingSelector } from '../components/SchedulingSelector';

export function CheckoutPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const items = useCartStore(s => s.items);
  const subtotal = useCartStore(s => s.subtotal);
  const clearCart = useCartStore(s => s.clearCart);

  const { customer, isLoggedIn } = useCustomerStore();
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>(new Date().toISOString().split('T')[0]);
  const [timeSlotId, setTimeSlotId] = useState<string>('');

  // Address fields
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [reference, setReference] = useState('');
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();
  const [isFetchingCep, setIsFetchingCep] = useState(false);

  // Payment state
  const [payment, setPayment] = useState<PaymentInput>({
    method: PaymentMethod.pix,
  });

  // Coupon and Cashback state
  const [appliedCoupon, setAppliedCoupon] = useState<string>('');
  const [couponError, setCouponError] = useState<string>('');
  const [usedCashback, setUsedCashback] = useState<number>(0);

  // Financial state (calculated server-side)
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [discountTotal, setDiscountTotal] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<any>(null);

  useEffect(() => {
    async function loadTenant() {
      if (!tenantSlug) return;
      try {
        const { data } = await api.get<any>(`/public/storefront/${tenantSlug}`);
        setTenantInfo(data.tenant);
        
        // Auto-select first available payment method if current is not available
        const methods = (data.tenant.paymentMethods as string[]) || [];
        if (methods.length > 0 && !methods.includes(payment.method)) {
          setPayment({ method: methods[0] as any });
        }
      } catch (err) {
        console.error('Error loading tenant info', err);
      }
    }
    loadTenant();
  }, [tenantSlug]);

  // Pre-fill customer data
  useEffect(() => {
    if (isLoggedIn && customer) {
      setCustomerName(prev => prev || customer.name);
      setCustomerPhone(prev => prev || customer.phone);
    }
  }, [isLoggedIn, customer]);

  // Idempotency key — generated once per checkout session
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  // Real-time server-side validation for delivery fee and address availability
  const debouncedAddress = useDebounce({ street, number, neighborhood, city, state, zipCode, lat, lng }, 800);

  useEffect(() => {
    async function validate() {
      if (items.length === 0 || !tenantSlug) return;
      
      const isDelivery = fulfillmentType === 'delivery';
      // Only validate delivery if we have basic address parts (especially number which is required by DTO)
      if (isDelivery && (!lat || !lng || !number || !street)) {
        setDeliveryFee(0);
        return;
      }

      // Ensure we have a payment method (default usually cash, but safety check)
      if (!payment.method) {
        return;
      }

      setIsValidating(true);
      try {
        const orderItems: CreateOrderItemDTO[] = items.map(item => {
          if (item.comboId) {
            return {
              lineType: 'combo' as const,
              comboId: item.comboId,
              productId: item.comboId,
              quantity: item.quantity,
              notes: item.notes,
              comboSelections: item.selectedComboItems?.map(s => ({
                blockId: (s as any).blockId,
                blockItemId: (s as any).blockItemId,
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

        const address: DeliveryAddressDTO | null = isDelivery ? {
          street,
          number,
          complement: complement || undefined,
          neighborhood,
          city,
          state,
          zipCode,
          reference: reference || undefined,
          lat,
          lng,
        } : null;

        const { data: result } = await api.post<CheckoutValidationResult>(`/orders/public-checkout/${tenantSlug}/validate`, {
          items: orderItems,
          fulfillmentType,
          deliveryAddress: address,
          payment: { 
            ...payment, 
            changeFor: payment.changeFor || undefined,
          },
          couponCode: appliedCoupon || undefined,
          useCashbackAmount: usedCashback || undefined,
          customerName: customerName || 'Simulação',
          customerPhone: customerPhone || '0000000000',
          idempotencyKey: 'validation-only',
          scheduledFor: isScheduled ? new Date(scheduledFor) : undefined,
          timeSlotId: isScheduled ? timeSlotId : undefined,
        });

        setDeliveryFee(result.deliveryFee || 0);
        setDiscountTotal(result.discountTotal || 0);
        if (isDelivery) setSubmitError(null);
      } catch (err: any) {
        console.error('Validation error:', err);
        const msg = err.message || 'Erro ao validar entrega nesta região.';
        const isClosed = msg.toLowerCase().includes('fechada') || msg.toLowerCase().includes('aberta');
        
        if (isDelivery) {
           setSubmitError(isClosed ? msg : `Validando: ${msg}`);
        }
        setDeliveryFee(0);
        setDiscountTotal(0);
      } finally {
        setIsValidating(false);
      }
    }

    validate();
  }, [debouncedAddress, fulfillmentType, items, tenantSlug, payment, appliedCoupon, usedCashback, isScheduled, scheduledFor, timeSlotId]);

  const total = subtotal + deliveryFee - discountTotal;

  const handleAddressSelected = (addr: StructuredAddress) => {
    setStreet(addr.street);
    setNumber(addr.number || '');
    setNeighborhood(addr.neighborhood);
    setCity(addr.city);
    setState(addr.state);
    setZipCode(addr.zipCode);
    setLat(addr.lat);
    setLng(addr.lng);
  };

  // CEP Autocomplete logic
  useEffect(() => {
    const cleanCep = zipCode.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      const triggerCepLookup = async () => {
        setIsFetchingCep(true);
        const addr = await fetchAddressByCep(cleanCep);
        if (addr) {
          setStreet(addr.street);
          setNeighborhood(addr.neighborhood);
          setCity(addr.city);
          setState(addr.state);
          
          // Try to get coordinates for better freight calculation
          const fullAddress = `${addr.street}, ${addr.neighborhood}, ${addr.city} - ${addr.state}`;
          const coords = await geocodeAddress(fullAddress);
          if (coords) {
            setLat(coords.lat);
            setLng(coords.lng);
          }
        }
        setIsFetchingCep(false);
      };
      triggerCepLookup();
    }
  }, [zipCode]);

  const isFormValid = useMemo(() => {
    if (!customerName.trim() || !customerPhone.trim()) return false;
    if (items.length === 0) return false;
    
    if (fulfillmentType === 'delivery') {
      if (!street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state.trim() || !zipCode.trim() || !lat || !lng) {
        return false;
      }
    }

    if (!payment.method) return false;
    if (payment.method === 'cash') {
      if (!payment.changeFor || payment.changeFor < total) return false;
    }

    if (isScheduled && !timeSlotId) return false;

    return true;
  }, [customerName, customerPhone, items, fulfillmentType, street, number, neighborhood, city, state, zipCode, lat, lng, payment, total, isScheduled, timeSlotId]);

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const orderItems: CreateOrderItemDTO[] = items.map(item => {
        if (item.comboId) {
          return {
            lineType: 'combo',
            comboId: item.comboId,
            productId: item.comboId,
            quantity: item.quantity,
            notes: item.notes,
            comboSelections: item.selectedComboItems?.map(s => ({
              blockId: (s as any).blockId,
              blockItemId: (s as any).blockItemId,
            })) || [],
          };
        }
        return {
          lineType: 'product',
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
          complements: item.selectedOptions?.map(o => ({
            groupId: o.groupId,
            itemId: o.itemId,
          })) || [],
        };
      }) as any;

      const payload: CreateOrderDTO = {
        customerName,
        customerPhone,
        customerEmail: '',
        fulfillmentType,
        items: orderItems,
        idempotencyKey,
        notes,
        payment,
        couponCode: appliedCoupon || undefined,
        useCashbackAmount: usedCashback || undefined,
        deliveryAddress: fulfillmentType === 'delivery' ? {
          street,
          number,
          complement: complement || undefined,
          neighborhood,
          city,
          state,
          zipCode,
          reference: reference || undefined,
          lat,
          lng,
        } : undefined,
        scheduledFor: isScheduled ? scheduledFor : undefined,
        timeSlotId: isScheduled ? timeSlotId : undefined,
        returnUrl: window.location.origin + `/${tenantSlug}`,
      };

      const res = await api.post<OrderResponseDTO>(`/orders/public-checkout/${tenantSlug}`, payload);
      
      clearCart();
      
      // Se for pagamento PIX, redirecionar para página do QR code
      if (res.data.pixPayment) {
        navigate(`/${tenantSlug}/payment/${res.data.pixPayment.transactionId}`, { state: { pixPayment: res.data.pixPayment } });
      } 
      // Se for Cartão on-line, redirecionar para Checkout Pro do Mercado Pago
      else if (res.data.preferencePayment) {
        window.location.href = res.data.preferencePayment.initPoint;
      } 
      // Pagamento em Dinheiro ou Máquina na Entrega
      else {
        navigate(`/${tenantSlug}/order/${res.data.id}`, { state: { order: res.data } });
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setSubmitError(err.response?.data?.message || 'Erro ao processar pedido. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-32">
      <header className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">Finalizar Pedido</h1>
      </header>

      <section className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3">Resumo</h2>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span className="text-gray-600">{item.quantity}x {item.snapshot.productName}</span>
              <span className="font-medium text-gray-900">
                {item.snapshot.lineSubtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          ))}
          <div className="pt-3 border-t border-gray-200 mt-2 space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Subtotal</span>
              <span>{subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
            {fulfillmentType === 'delivery' && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Taxa de entrega</span>
                <span className={deliveryFee === 0 && !isValidating ? 'text-green-600 font-bold' : ''}>
                  {isValidating ? 'Calculando...' : deliveryFee === 0 ? 'Grátis' : deliveryFee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            )}
            {discountTotal > 0 && (
              <div className="flex justify-between text-xs text-green-600 font-semibold">
                <span>Descontos</span>
                <span>- {discountTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-black text-gray-900 pt-1">
              <span>Total</span>
              <span>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3">Cupom e Cashback</h2>
        
        <div className="space-y-4">
          <CouponInput
            onApplyCoupon={(code) => {
              setAppliedCoupon(code);
              setCouponError('');
            }}
            onRemoveCoupon={() => {
              setAppliedCoupon('');
              setCouponError('');
            }}
            appliedCoupon={appliedCoupon}
            error={couponError}
          />
          
          {customer && (
            <CashbackSelector
              availableBalance={customer.cashbackBalance}
              usedAmount={usedCashback}
              onUseCashback={setUsedCashback}
              onRemoveCashback={() => setUsedCashback(0)}
              maxUsable={subtotal + deliveryFee}
            />
          )}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <User className="w-4 h-4" /> Seus Dados
        </h2>
        <div className="space-y-3">
          <input type="text" placeholder="Seu nome completo" value={customerName} onChange={e => setCustomerName(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
          <input type="tel" placeholder="Seu WhatsApp (apenas números)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
        </div>

        {!isLoggedIn && (
          <div className="mt-4 p-4 bg-primary-50 rounded-2xl border border-primary-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-primary-600 shadow-sm">
                <User className="w-5 h-5" />
              </div>
              <div className="pr-4">
                <p className="text-xs font-bold text-primary-900">Já pediu antes?</p>
                <p className="text-[10px] text-primary-700">Entre para carregar seus dados.</p>
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setIsLoginOpen(true)}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm shrink-0"
            >
              ENTRAR
            </button>
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3">Como deseja receber?</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setFulfillmentType('delivery')}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${fulfillmentType === 'delivery' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100 bg-white text-gray-500'}`}>
            <Truck className="w-6 h-6" />
            <span className="text-xs font-bold uppercase">Entrega</span>
          </button>
          <button onClick={() => setFulfillmentType('pickup')}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${fulfillmentType === 'pickup' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100 bg-white text-gray-500'}`}>
            <Store className="w-6 h-6" />
            <span className="text-xs font-bold uppercase">Retirada</span>
          </button>
        </div>
      </section>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest">Quando deseja receber?</h2>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={isScheduled} onChange={() => setIsScheduled(!isScheduled)} />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            <span className="ml-3 text-xs font-bold text-gray-700 uppercase">{isScheduled ? 'Agendar' : 'Agora'}</span>
          </label>
        </div>
        
        {isScheduled && (
          <SchedulingSelector
            tenantSlug={tenantSlug!}
            selectedDate={scheduledFor}
            selectedSlotId={timeSlotId}
            onSlotSelect={(slotId, date) => {
              setTimeSlotId(slotId);
              setScheduledFor(date);
            }}
          />
        )}
      </section>

      {fulfillmentType === 'delivery' && (
        <section className="mb-6">
          <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Endereço de Entrega
          </h2>
          
          <AddressAutocomplete 
            onAddressSelected={handleAddressSelected}
            placeholder="Comece digitando sua rua e número..."
            className="mb-4"
          />

          <div className="space-y-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-1">
                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-1 tracking-wider">CEP</label>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="00000-000" 
                    value={zipCode} 
                    onChange={e => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (val.length > 8) val = val.substring(0, 8);
                      if (val.length > 5) {
                        val = val.substring(0, 5) + '-' + val.substring(5);
                      }
                      setZipCode(val);
                    }}
                    className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" 
                  />
                  {isFetchingCep && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-3 h-3 animate-spin text-primary-500" />
                    </div>
                  )}
                </div>
              </div>
              <div className="col-span-3">
                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-1 tracking-wider">Rua</label>
                <input type="text" placeholder="Rua" value={street} onChange={e => setStreet(e.target.value)}
                  className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-3">
                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-1 tracking-wider">Bairro</label>
                <input type="text" placeholder="Bairro" value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
                  className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-1 tracking-wider">Nº</label>
                <input type="text" placeholder="Nº" value={number} onChange={e => setNumber(e.target.value)}
                  className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Complemento" value={complement} onChange={e => setComplement(e.target.value)}
                className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              <input type="text" placeholder="Referência" value={reference} onChange={e => setReference(e.target.value)}
                className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            </div>
            
            {isValidating && (
              <div className="flex items-center gap-2 text-[10px] text-primary-500 font-bold uppercase tracking-wider animate-pulse pt-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Verificando região de entrega...
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Forma de Pagamento
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('pix')) && (
            <button onClick={() => setPayment({ method: PaymentMethod.pix })}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'pix' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <QrCode className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase">PIX</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('credit_card')) && (
            <button onClick={() => setPayment({ method: PaymentMethod.credit_card })}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'credit_card' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase text-center leading-none">Crédito<br/>On-line</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('debit_card')) && (
            <button onClick={() => setPayment({ method: PaymentMethod.debit_card })}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'debit_card' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase text-center leading-none">Débito<br/>On-line</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('card_on_delivery')) && (
            <button onClick={() => setPayment({ method: PaymentMethod.card_on_delivery })}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'card_on_delivery' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-tight text-center leading-none">Cartão na<br/>Entrega</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('cash')) && (
            <button onClick={() => setPayment({ method: PaymentMethod.cash, changeFor: null })}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'cash' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <Banknote className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase mt-2">Dinheiro</span>
            </button>
          )}
        </div>

        {payment.method === 'cash' && (
          <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <label className="block text-xs font-semibold text-gray-700 mb-2">Troco para quanto?</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">R$</span>
              <input type="number" placeholder="0,00" value={payment.changeFor || ''} 
                onChange={e => setPayment({ ...payment, changeFor: Number(e.target.value) })}
                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-medium" />
            </div>
            {payment.changeFor !== null && payment.changeFor < total && (
              <p className="mt-2 text-[10px] text-red-500 font-bold uppercase tracking-wider flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> O troco deve ser maior que o total
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Observações
        </h2>
        <textarea placeholder="Ex: Tirar cebola, campainha estragada..." value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none min-h-[100px] resize-none" />
      </section>

      {submitError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 animate-in shake duration-500">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium leading-tight">{submitError}</p>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 max-w-lg mx-auto z-20">
        <button onClick={handleSubmit} disabled={!isFormValid || isSubmitting || isValidating}
          className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest text-sm">
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processando...
            </>
          ) : (
            <>Enviar Pedido</>
          )}
        </button>
      </div>

      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={() => setIsLoginOpen(false)} 
        tenantSlug={tenantSlug!} 
      />
    </div>
  );
}
