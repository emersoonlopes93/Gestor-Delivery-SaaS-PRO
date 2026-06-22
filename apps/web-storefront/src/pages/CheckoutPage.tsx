import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, MapPin, User, FileText, Loader2, AlertCircle, Truck, Store, CreditCard, Banknote, QrCode } from 'lucide-react';
import { useCartStore } from '../store/use-cart-store';
import { api } from '../lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { 
  CreateOrderDTO, 
  CreateOrderItemDTO, 
  OrderResponseDTO, 
  FulfillmentType,
  PaymentInput,
  PaymentMethod,
  DeliveryAddressDTO,
  CheckoutValidationResult,
  StorefrontPayload,
  StorefrontTenantInfo,
  PublicCustomerProfileAddressDTO
} from '@gestor/types';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { StructuredAddress, fetchAddressByCep, geocodeAddress } from '../lib/maps-service';
import { useDebounce } from '../hooks/use-debounce';
import { useCustomerStore } from '../store/useCustomerStore';
import { LoginModal } from '../components/LoginModal';
import { CouponInput } from '../components/CouponInput';
import { CashbackSelector } from '../components/CashbackSelector';
import { SchedulingSelector } from '../components/SchedulingSelector';
import { CardPayment } from '../components/CardPayment';
import { maskPhone, maskCEP, unmask } from '@gestor/utils';

interface MercadoPagoCardFormData {
  token: string;
  payment_method_id: string;
  issuer_id: string;
  installments: number;
  payer?: {
    email?: string;
  };
}

export function CheckoutPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const items = useCartStore(s => s.items);
  const subtotal = useCartStore(s => s.subtotal);
  const tableId = useCartStore(s => s.tableId);
  const clearCart = useCartStore(s => s.clearCart);
  const setCartTenantSlug = useCartStore(s => s.setTenantSlug);

  const { customer, isLoggedIn, setTenantSlug } = useCustomerStore();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const cartTenantSlug = useCartStore(s => s.tenantSlug);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

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
    method: PaymentMethod.cash,
    changeFor: undefined,
  });

  // Coupon and Cashback state
  const [appliedCoupon, setAppliedCoupon] = useState<string>('');
  const [couponError, setCouponError] = useState<string>('');
  const [usedCashback, setUsedCashback] = useState<number>(0);

  // Financial state (calculated server-side)
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [discountTotal, setDiscountTotal] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<StorefrontTenantInfo | null>(null);
  const safeCustomerCashbackBalance = Number(customer?.cashbackBalance ?? 0);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null);

  const { data: customerProfile } = useQuery({
    queryKey: ['customer-profile', tenantSlug],
    queryFn: async () => (await api.get<{ profile?: { name?: string | null; email?: string | null }; wallet?: { cashbackBalance?: number | null }; addresses?: PublicCustomerProfileAddressDTO[] }>('/public/customer-profile')).data,
    enabled: isLoggedIn && !!tenantSlug,
  });

  useEffect(() => {
    if (!tenantSlug) return;
    setTenantSlug(tenantSlug);
    setCartTenantSlug(tenantSlug);
  }, [tenantSlug, setTenantSlug, setCartTenantSlug]);

  useEffect(() => {
    async function loadTenant() {
      if (!tenantSlug) return;
      try {
        const { data } = await api.get<StorefrontPayload>(`/public/storefront/${tenantSlug}`);
        setTenantInfo(data.tenant);
        
        // Auto-select first available payment method if current is not available
        const methods = (data.tenant.paymentMethods as PaymentMethod[]) || [];
        if (methods.length > 0 && !methods.includes(payment.method)) {
          setPayment((prev) => ({ ...prev, method: methods[0] }));
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
      const displayName = customer.name && customer.name !== 'Cliente Novo' ? customer.name : '';
      setCustomerName(prev => prev || displayName || customerProfile?.profile?.name || '');
      setCustomerPhone(prev => prev || customer.phone);
      setCustomerEmail(prev => prev || customer?.email || customerProfile?.profile?.email || '');
    }
  }, [isLoggedIn, customer, customerProfile]);

  useEffect(() => {
    if (!customerProfile) return;
    if (!customerName.trim() && customerProfile.profile?.name && customerProfile.profile.name !== 'Cliente Novo') {
      setCustomerName(customerProfile.profile.name);
    }
    setCustomerEmail(prev => prev || customerProfile.profile?.email || '');
  }, [customerProfile]);

  // Set default fulfillment to table if tableId exists
  useEffect(() => {
    if (tableId) {
      setFulfillmentType('table');
    }
  }, [tableId]);

  // Idempotency key — generated once per checkout session
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  // Real-time server-side validation for delivery fee and address availability
  const addressObject = useMemo(() => ({
    street,
    number,
    neighborhood,
    city,
    state,
    zipCode,
    lat,
    lng
  }), [street, number, neighborhood, city, state, zipCode, lat, lng]);

  const debouncedAddress = useDebounce(addressObject, 800);

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
          const itemPayload: CreateOrderItemDTO = {
            lineType: item.comboId ? 'combo' : 'product',
            productId: item.productId || item.comboId || '',
            quantity: item.quantity,
            notes: item.notes,
            selections: item.selections?.map(g => ({
              optionGroupId: g.optionGroupId,
              items: g.items.map(i => ({
                optionItemId: i.optionItemId,
                qty: i.qty,
              }))
            })),
            slots: item.slots?.map(s => ({
              comboSlotId: s.comboSlotId,
              items: s.items.map(i => ({
                productId: i.productId,
                qty: i.qty,
              }))
            })),

          };
          return itemPayload;
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
          lat: lat ?? 0,
          lng: lng ?? 0,
        } : null;

        // Safe payment for validation: if cash and no/invalid change, use a large dummy value
        // to avoid validation failure on the backend while just checking delivery fees/items.
        const validationPayment = { ...payment };
        if (payment.method === 'cash' && (payment.changeFor == null || payment.changeFor < total)) {
          validationPayment.changeFor = 9999; 
        }

        const { data: result } = await api.post<CheckoutValidationResult>(`/orders/public-checkout/${tenantSlug}/validate`, {
          items: orderItems,
          fulfillmentType,
          deliveryAddress: address,
          payment: validationPayment,
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
      } catch (err) {
        const error = err as Error;
        console.error('Validation error:', error);
        const msg = error.message || 'Erro ao validar entrega nesta região.';
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

  const total = Math.round((subtotal + deliveryFee - discountTotal) * 100) / 100;
  const effectiveCashbackBalance = Number(customerProfile?.wallet?.cashbackBalance ?? safeCustomerCashbackBalance);
  const savedAddresses = customerProfile?.addresses ?? [];
  const selectedSavedAddress = savedAddresses.find((address) => address.id === selectedSavedAddressId)
    ?? savedAddresses.find((address) => address.isDefault)
    ?? savedAddresses[0]
    ?? null;

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
    const cleanCep = unmask(zipCode);
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
    
    // Optional email validation if provided
    if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return false;

    if (items.length === 0) return false;
    
    if (fulfillmentType === 'delivery') {
      if (!street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state.trim() || !zipCode.trim()) {
        return false;
      }
    }

    if (!payment.method) return false;
    if (payment.method === 'cash') {
      if (payment.changeFor == null) return false;
      if (payment.changeFor > 0 && payment.changeFor < total) return false;
    }

    if (isScheduled && !timeSlotId) return false;

    return true;
  }, [customerName, customerPhone, items, fulfillmentType, street, number, neighborhood, city, state, zipCode, lat, lng, payment, total, isScheduled, timeSlotId]);

  useEffect(() => {
    if (!tenantSlug) return;
    if (cartTenantSlug && cartTenantSlug !== tenantSlug) {
      navigate(`/${tenantSlug}`, { replace: true });
      return;
    }

    if (items.length === 0) {
      showEmptyCartMessageOnce();
      navigate(`/${tenantSlug}`, { replace: true });
    }
  }, [items.length, tenantSlug, cartTenantSlug, navigate]);

  useEffect(() => {
    if (fulfillmentType !== 'delivery') return;
    if (!savedAddresses.length) return;
    if (street || number || neighborhood) return;
    applySavedAddress(selectedSavedAddress);
  }, [fulfillmentType, savedAddresses.length]);

  function showEmptyCartMessageOnce() {
    setSubmitError((prev) => prev ?? 'Seu carrinho está vazio. Adicione itens antes de finalizar.');
  }

  function applySavedAddress(address: PublicCustomerProfileAddressDTO | null) {
    if (!address) return;
    setStreet(address.street);
    setNumber(address.number);
    setComplement(address.complement || '');
    setNeighborhood(address.neighborhood);
    setCity(address.city);
    setState(address.state);
    setZipCode(address.zipCode);
    setLat(address.lat ?? undefined);
    setLng(address.lng ?? undefined);
    setSelectedSavedAddressId(address.id);
  }

  const handleCardSubmit = async (formData: MercadoPagoCardFormData) => {
    if (isSubmitting) return;
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
            selections: item.selections?.map(g => ({
              optionGroupId: g.optionGroupId,
              items: g.items.map(i => ({
                optionItemId: i.optionItemId,
                qty: i.qty,
              }))
            })),
            slots: item.slots?.map(s => ({
              comboSlotId: s.comboSlotId,
              items: s.items.map(i => ({
                productId: i.productId,
                qty: i.qty,
              }))
            })),

          };
        }
        return {
          lineType: 'product',
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
          selections: item.selections?.map(g => ({
            optionGroupId: g.optionGroupId,
            items: g.items.map(i => ({
              optionItemId: i.optionItemId,
              qty: i.qty,
            }))
          })),

        };
      });

      const payload: CreateOrderDTO = {
        customerName: customerName.trim(),
        customerPhone: unmask(customerPhone.trim()),
        customerEmail: formData.payer?.email || customerEmail.trim() || customer?.email || undefined,
        fulfillmentType,
        items: orderItems,
        idempotencyKey,
        notes,
        payment: {
          method: PaymentMethod.credit_card,
          cardToken: formData.token,
          paymentMethodId: formData.payment_method_id,
          issuerId: formData.issuer_id,
          installments: formData.installments,
        },
        sourceChannel: 'direct_online',
        couponCode: appliedCoupon || undefined,
        useCashbackAmount: usedCashback || undefined,
        deliveryAddress: fulfillmentType === 'delivery' ? {
          street,
          number,
          complement: complement || undefined,
          neighborhood,
          city,
          state,
          zipCode: unmask(zipCode),
          reference: reference || undefined,
          lat: lat ?? 0,
          lng: lng ?? 0,
        } : undefined,
        scheduledFor: isScheduled ? scheduledFor : undefined,
        timeSlotId: isScheduled ? timeSlotId : undefined,
        returnUrl: window.location.origin + `/${tenantSlug}`,
        tableId: tableId || undefined,
      };

      const res = await api.post<OrderResponseDTO>(`/orders/public-checkout/${tenantSlug}`, payload);
      
      clearCart();
      navigate(`/${tenantSlug}/order/${res.data.id}`, { state: { order: res.data } });
    } catch (err: unknown) {
      const error = err as Error & { details?: { validationErrors?: string[] } };
      console.error('Card checkout error:', error);
      setSubmitError(error.message || 'Erro ao processar pagamento com cartão.');
      throw error; // Re-throw to the brick so it can show error
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;
    
    // Se for cartão, o botão do brick cuida do submit (ou chamamos via ref se necessário)
    // Mas aqui o usuário clicou no botão "Enviar Pedido" customizado.
    // Se for cartão, devemos orientar o usuário a usar o botão do Brick ou disparar o submit do brick.
    if (payment.method === PaymentMethod.credit_card) {
      setSubmitError('Por favor, preencha os dados do cartão e clique em "Pagar".');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setValidationErrors([]);

    try {
      const orderItems: CreateOrderItemDTO[] = items.map(item => {
        if (item.comboId) {
          return {
            lineType: 'combo',
            comboId: item.comboId,
            productId: item.comboId,
            quantity: item.quantity,
            notes: item.notes,
            selections: item.selections?.map(g => ({
              optionGroupId: g.optionGroupId,
              items: g.items.map(i => ({
                optionItemId: i.optionItemId,
                qty: i.qty,
              }))
            })),
            slots: item.slots?.map(s => ({
              comboSlotId: s.comboSlotId,
              items: s.items.map(i => ({
                productId: i.productId,
                qty: i.qty,
              }))
            })),

          };
        }
        return {
          lineType: 'product',
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
          selections: item.selections?.map(g => ({
            optionGroupId: g.optionGroupId,
            items: g.items.map(i => ({
              optionItemId: i.optionItemId,
              qty: i.qty,
            }))
          })),

        };
      });

      const payload: CreateOrderDTO = {
        customerName: customerName.trim(),
        customerPhone: unmask(customerPhone.trim()),
        customerEmail: customerEmail.trim() || customer?.email || undefined,
        fulfillmentType,
        items: orderItems,
        idempotencyKey,
        notes: notes.trim() || undefined,
        payment: {
          ...payment,
          changeFor: payment.method === 'cash' ? (payment.changeFor ?? undefined) : undefined,
        },
        sourceChannel: 'direct_online',
        couponCode: appliedCoupon || undefined,
        useCashbackAmount: usedCashback || undefined,
        deliveryAddress: fulfillmentType === 'delivery' ? {
          street: street.trim(),
          number: number.trim(),
          complement: complement?.trim() || undefined,
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: state.trim(),
          zipCode: unmask(zipCode),
          reference: reference?.trim() || undefined,
          lat: lat ?? 0,
          lng: lng ?? 0,
        } : undefined,
        scheduledFor: isScheduled ? scheduledFor : undefined,
        timeSlotId: isScheduled ? timeSlotId : undefined,
        returnUrl: window.location.origin + `/${tenantSlug}`,
        tableId: tableId || undefined,
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
    } catch (err: unknown) {
      const error = err as Error & { details?: { validationErrors?: string[] } };
      console.error('Checkout error:', error);
      
      if (error.details?.validationErrors) {
        setSubmitError('Erro de validação. Verifique os campos abaixo:');
        setValidationErrors(error.details.validationErrors);
      } else {
        setSubmitError(error.message || 'Erro ao processar pedido. Tente novamente.');
      }
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
                {Number(item.snapshot.lineSubtotal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
              availableBalance={effectiveCashbackBalance}
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
            className="input-premium" />
          <input type="tel" placeholder="Seu WhatsApp (apenas números)" value={maskPhone(customerPhone)} onChange={e => setCustomerPhone(e.target.value)}
            className="input-premium" />
          <input type="email" placeholder="Seu e-mail (opcional)" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
            className="input-premium" />
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

      {!tableId && (
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
      )}

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
          
          {savedAddresses.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Endereços salvos</p>
              <div className="grid gap-2">
                {savedAddresses.map((address) => (
                  <button
                    key={address.id}
                    type="button"
                    onClick={() => applySavedAddress(address)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${selectedSavedAddressId === address.id ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700'}`}
                  >
                    <span className="font-bold">{address.label || (address.isDefault ? 'Principal' : 'Salvo')}</span>
                    <span className="block text-[11px] text-gray-500">
                      {address.street}, {address.number} - {address.neighborhood}
                    </span>
                  </button>
                ))}
              </div>
              {selectedSavedAddress && (
                <button
                  type="button"
                  onClick={() => applySavedAddress(selectedSavedAddress)}
                  className="text-xs font-bold text-primary-600 underline underline-offset-2"
                >
                  Usar este endereço salvo
                </button>
              )}
            </div>
          )}
          
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
                    value={maskCEP(zipCode)} 
                    onChange={e => setZipCode(e.target.value)}
                    className="input-premium py-2 text-xs" 
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
                  className="input-premium py-2 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-3">
                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-1 tracking-wider">Bairro</label>
                <input type="text" placeholder="Bairro" value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
                  className="input-premium py-2 text-xs" />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-1 tracking-wider">Nº</label>
                <input type="text" placeholder="Nº" value={number} onChange={e => setNumber(e.target.value)}
                  className="input-premium py-2 text-xs" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Complemento" value={complement} onChange={e => setComplement(e.target.value)}
                className="input-premium py-2 text-xs" />
              <input type="text" placeholder="Referência" value={reference} onChange={e => setReference(e.target.value)}
                className="input-premium py-2 text-xs" />
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
            <button onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.pix }))}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'pix' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <QrCode className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase">PIX</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('credit_card')) && (
            <button onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.credit_card }))}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'credit_card' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase text-center leading-none">Crédito<br/>On-line</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('debit_card')) && (
            <button onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.debit_card }))}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'debit_card' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase text-center leading-none">Débito<br/>On-line</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('card_on_delivery')) && (
            <button onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.card_on_delivery }))}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'card_on_delivery' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-tight text-center leading-none">Cartão na<br/>Entrega</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('cash')) && (
            <button onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.cash, changeFor: null }))}
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
              <input type="number" placeholder="0,00" value={payment.changeFor ?? ''} 
                onChange={e => setPayment(prev => ({ ...prev, changeFor: e.target.value === '' ? null : Number(e.target.value) }))}
                className="input-premium pl-10" />
            </div>
            {payment.changeFor != null && payment.changeFor > 0 && payment.changeFor < total && (
              <p className="mt-2 text-[10px] text-red-500 font-bold uppercase tracking-wider flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> O troco deve ser maior que o total
              </p>
            )}
          </div>
        )}

        {payment.method === PaymentMethod.credit_card && tenantInfo?.mercadoPagoPublicKey && (
          customerEmail.trim() ? (
          <CardPayment
            publicKey={tenantInfo.mercadoPagoPublicKey}
            amount={total}
            onSubmit={handleCardSubmit}
          />
          ) : (
            <div className="mt-4 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
              Para pagamento com cartão, informe um e-mail válido antes de continuar.
            </div>
          )
        )}
      </section>

      <section className="mb-8">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Observações
        </h2>
        <textarea placeholder="Ex: Tirar cebola, campainha estragada..." value={notes} onChange={e => setNotes(e.target.value)}
          className="input-premium min-h-[100px] resize-none" />
      </section>

      {submitError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex flex-col gap-2 text-red-600 animate-in shake duration-500">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-tight">{submitError}</p>
          </div>
          {validationErrors.length > 0 && (
            <ul className="ml-8 list-disc text-xs space-y-1">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {payment.method !== PaymentMethod.credit_card && (
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
      )}

      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={() => setIsLoginOpen(false)} 
        tenantSlug={tenantSlug!} 
      />
    </div>
  );
}
