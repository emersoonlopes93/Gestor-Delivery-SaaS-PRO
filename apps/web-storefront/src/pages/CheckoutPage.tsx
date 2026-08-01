import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, MapPin, User, FileText, Loader2, AlertCircle, Truck, Store, CreditCard, Banknote, QrCode, PencilLine } from 'lucide-react';
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
import { StructuredAddress, fetchAddressByCep } from '../lib/maps-service';
import { useDebounce } from '../hooks/use-debounce';
import { useCustomerStore } from '../store/useCustomerStore';
import { LoginModal } from '../components/LoginModal';
import { CouponInput } from '../components/CouponInput';
import { CashbackSelector } from '../components/CashbackSelector';
import { SchedulingSelector } from '../components/SchedulingSelector';
import { CardPayment } from '../components/CardPayment';
import { maskPhone, maskCEP, unmask } from '@gestor/utils';
import { useAnalytics } from '../features/analytics';
import { CheckoutFinalSummary } from '../components/CheckoutFinalSummary';
import {
  CheckoutSubmitGuard,
  createCheckoutIdempotencyKey,
  isAmbiguousCheckoutError,
} from '../lib/checkout-submission';
import {
  getAdjacentCheckoutStep,
  getCheckoutStepError,
  getCheckoutSteps,
  type CheckoutStep,
  type CheckoutStepValidationContext,
} from '../lib/checkout-flow';
import {
  canApplyAddressLookup,
  getDeliveryAddressKey,
  mergeAddressAutofill,
  type AddressAutofillField,
} from '../lib/address-autofill';

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
  const analytics = useAnalytics();

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
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('contact');
  const [stepError, setStepError] = useState<string | null>(null);

  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>('');
  const [timeSlotId, setTimeSlotId] = useState<string>('');
  const [schedulingRefreshKey, setSchedulingRefreshKey] = useState(0);

  useEffect(() => {
    setIsScheduled(false);
    setScheduledFor('');
    setTimeSlotId('');
  }, [fulfillmentType]);

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
  const [cepLookupError, setCepLookupError] = useState<string | null>(null);
  const [showManualAddress, setShowManualAddress] = useState(false);
  const addressEditRevisionRef = useRef(0);
  const addressLookupRequestRef = useRef(0);
  const manuallyEditedAddressFieldsRef = useRef<Set<AddressAutofillField>>(new Set());

  // Payment state
  const [payment, setPayment] = useState<PaymentInput>({
    method: PaymentMethod.cash,
    changeFor: undefined,
  });

  // Coupon and Cashback state
  const [appliedCoupon, setAppliedCoupon] = useState<string>('');
  const [couponError, setCouponError] = useState<string>('');
  const [usedCashback, setUsedCashback] = useState<number>(0);
  const hasCompletedCheckoutRef = useRef(false);
  const submitGuardRef = useRef(new CheckoutSubmitGuard());
  const checkoutAttemptIdRef = useRef(crypto.randomUUID());

  // Financial state (calculated server-side)
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryEstimatedMinutes, setDeliveryEstimatedMinutes] = useState<number | null>(null);
  const [discountTotal, setDiscountTotal] = useState(0);
  const [validatedCashbackUsed, setValidatedCashbackUsed] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [addressValidationError, setAddressValidationError] = useState<string | null>(null);
  const [validatedAddressKey, setValidatedAddressKey] = useState<string | null>(null);
  const [tenantInfo, setTenantInfo] = useState<StorefrontTenantInfo | null>(null);
  const safeCustomerCashbackBalance = Number(customer?.cashbackBalance ?? 0);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null);
  const availableOrderModes = tenantInfo?.orderModes;

  const serializeCartItem = (item: (typeof items)[number]): CreateOrderItemDTO => {
    const buildSlots = (slots?: typeof item.slots) =>
      slots?.flatMap((s) => {
        if (!s.comboSlotId || !s.items?.length) return [];
        return [{
          comboSlotId: s.comboSlotId,
          items: s.items.map((i) => ({
            productId: i.productId,
            qty: i.qty,
          })),
        }];
      });

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
          })),
        })),
        slots: buildSlots(item.slots),
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
        })),
      })),
      slots: buildSlots(item.slots),
      pizzaComposition: item.pizzaComposition ? {
        ...item.pizzaComposition,
        calculatedPrice: item.pizzaComposition.calculatedPrice ?? item.snapshot.basePrice,
      } : undefined,
    };
  };

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
        const deliveryAvailable = data.tenant.orderModes?.deliveryEnabled !== false;
        const pickupAvailable = Boolean(data.tenant.orderModes?.pickupEnabled);

        if (!deliveryAvailable && pickupAvailable) {
          setFulfillmentType('pickup');
        } else if (deliveryAvailable) {
          setFulfillmentType((current) => (current === 'pickup' && !pickupAvailable ? 'delivery' : current));
        }
        
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

  const addressKey = useMemo(() => getDeliveryAddressKey(addressObject), [addressObject]);

  const debouncedAddress = useDebounce(addressObject, 800);

  useEffect(() => {
    if (fulfillmentType !== 'delivery' || validatedAddressKey === addressKey) return;
    setDeliveryFee(0);
    setDeliveryEstimatedMinutes(null);
    setValidatedAddressKey(null);
    setAddressValidationError(null);
  }, [addressKey, fulfillmentType, validatedAddressKey]);

  useEffect(() => {
    let cancelled = false;

    async function validate() {
      if (items.length === 0 || !tenantSlug) return;
      
      const isDelivery = fulfillmentType === 'delivery';
      // Only validate delivery if we have basic address parts (especially number which is required by DTO)
      if (isDelivery && (!number || !street || !neighborhood || !city || !state)) {
        setDeliveryFee(0);
        setDeliveryEstimatedMinutes(null);
        setValidatedAddressKey(null);
        setAddressValidationError(null);
        return;
      }

      // Ensure we have a payment method (default usually cash, but safety check)
      if (!payment.method) {
        return;
      }

      setIsValidating(true);
      if (isDelivery) setAddressValidationError(null);
      try {
        const orderItems: CreateOrderItemDTO[] = items.map(serializeCartItem);

        const address: DeliveryAddressDTO | null = isDelivery ? {
          street,
          number,
          complement: complement || undefined,
          neighborhood,
          city,
          state,
          zipCode,
          reference: reference || undefined,
          lat: lat ?? undefined,
          lng: lng ?? undefined,
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
          scheduledFor: isScheduled && scheduledFor && timeSlotId ? new Date(scheduledFor) : undefined,
          timeSlotId: isScheduled ? timeSlotId : undefined,
        });

        if (cancelled) return;
        setDeliveryFee(result.deliveryFee || 0);
        setDeliveryEstimatedMinutes(result.estimatedDeliveryMinutes ?? null);
        setDiscountTotal(result.discountTotal || 0);
        setValidatedCashbackUsed(result.cashbackUsed || 0);
        if (isDelivery) {
          setValidatedAddressKey(getDeliveryAddressKey(debouncedAddress));
          setAddressValidationError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const error = err as Error;
        console.error('Validation error:', error);
        const msg = error.message || 'Erro ao validar entrega nesta região.';
        const isClosed = msg.toLowerCase().includes('fechada') || msg.toLowerCase().includes('aberta');
        
        if (isDelivery) {
          setValidatedAddressKey(null);
          setAddressValidationError(isClosed ? msg : `Não foi possível validar esta entrega: ${msg}`);
        }
        setDeliveryFee(0);
        setDeliveryEstimatedMinutes(null);
        setDiscountTotal(0);
        setValidatedCashbackUsed(0);
      } finally {
        if (!cancelled) setIsValidating(false);
      }
    }

    validate();
    return () => {
      cancelled = true;
    };
  }, [debouncedAddress, fulfillmentType, items, tenantSlug, payment, appliedCoupon, usedCashback, isScheduled, scheduledFor, timeSlotId]);

  const total = Math.round((subtotal + deliveryFee - discountTotal) * 100) / 100;
  const effectiveCashbackBalance = Number(customerProfile?.wallet?.cashbackBalance ?? safeCustomerCashbackBalance);
  const savedAddresses = customerProfile?.addresses ?? [];
  const selectedSavedAddress = savedAddresses.find((address) => address.id === selectedSavedAddressId)
    ?? savedAddresses.find((address) => address.isDefault)
    ?? savedAddresses[0]
    ?? null;

  const markAddressFieldEdited = (field: AddressAutofillField) => {
    manuallyEditedAddressFieldsRef.current.add(field);
    addressEditRevisionRef.current += 1;
    setSelectedSavedAddressId(null);
  };

  const handleAddressSelected = (addr: StructuredAddress) => {
    addressLookupRequestRef.current += 1;
    addressEditRevisionRef.current += 1;
    const merged = mergeAddressAutofill(
      { street, neighborhood, city, state },
      addr,
      manuallyEditedAddressFieldsRef.current,
    );
    setStreet(merged.street);
    setNeighborhood(merged.neighborhood);
    setCity(merged.city);
    setState(merged.state);
    if (addr.zipCode) setZipCode(addr.zipCode);
    setLat(addr.lat);
    setLng(addr.lng);
    setCepLookupError(null);
    setShowManualAddress(true);
  };

  // CEP Autocomplete logic
  useEffect(() => {
    const cleanCep = unmask(zipCode);
    if (cleanCep.length === 8) {
      const request = {
        cep: cleanCep,
        editRevision: addressEditRevisionRef.current,
        requestId: addressLookupRequestRef.current,
      };
      const triggerCepLookup = async () => {
        setIsFetchingCep(true);
        setCepLookupError(null);
        const addr = await fetchAddressByCep(cleanCep);
        const currentLookupState = {
          cep: cleanCep,
          editRevision: addressEditRevisionRef.current,
          requestId: addressLookupRequestRef.current,
          editedFields: manuallyEditedAddressFieldsRef.current,
        };
        if (addr && canApplyAddressLookup(request, currentLookupState)) {
          const merged = mergeAddressAutofill(
            { street, neighborhood, city, state },
            addr,
            manuallyEditedAddressFieldsRef.current,
          );
          setStreet(merged.street);
          setNeighborhood(merged.neighborhood);
          setCity(merged.city);
          setState(merged.state);
          setLat(undefined);
          setLng(undefined);
          setShowManualAddress(true);
        } else if (!addr && request.requestId === addressLookupRequestRef.current) {
          setCepLookupError('CEP não encontrado. Preencha o endereço manualmente.');
          setShowManualAddress(true);
        }
        if (request.requestId === addressLookupRequestRef.current) setIsFetchingCep(false);
      };
      triggerCepLookup();
    } else {
      setIsFetchingCep(false);
    }
  }, [zipCode]);

  const contactValid = useMemo(() => {
    if (!customerName.trim() || !customerPhone.trim()) return false;
    return !customerEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail);
  }, [customerEmail, customerName, customerPhone]);

  const addressFieldsValid = useMemo(() => (
    Boolean(
      street.trim()
      && number.trim()
      && neighborhood.trim()
      && city.trim()
      && state.trim()
      && unmask(zipCode).length === 8,
    )
  ), [city, neighborhood, number, state, street, zipCode]);

  const addressQuoteCurrent = fulfillmentType !== 'delivery'
    || (validatedAddressKey === addressKey && !addressValidationError && !isValidating);

  const paymentValid = useMemo(() => {
    if (!payment.method) return false;
    if (payment.method === PaymentMethod.credit_card) {
      return Boolean(customerEmail.trim() && tenantInfo?.mercadoPagoPublicKey);
    }
    if (payment.method === PaymentMethod.cash) {
      if (payment.changeFor == null) return false;
      if (payment.changeFor > 0 && payment.changeFor < total) return false;
    }
    return true;
  }, [customerEmail, payment, tenantInfo?.mercadoPagoPublicKey, total]);

  const isFormValid = useMemo(() => {
    if (!contactValid) return false;

    if (items.length === 0) return false;
    
    if (fulfillmentType === 'delivery') {
      if (!addressFieldsValid || !addressQuoteCurrent) return false;
    }

    if (!paymentValid) return false;

    if (isScheduled && !timeSlotId) return false;

    return true;
  }, [addressFieldsValid, addressQuoteCurrent, contactValid, fulfillmentType, isScheduled, items, paymentValid, timeSlotId]);

  const checkoutSteps = useMemo(
    () => getCheckoutSteps(fulfillmentType, Boolean(tableId)),
    [fulfillmentType, tableId],
  );

  const stepValidationContext: CheckoutStepValidationContext = {
    contactValid,
    fulfillmentValid: Boolean(fulfillmentType),
    addressValid: addressFieldsValid,
    addressQuoteCurrent,
    addressValidationPending: isValidating,
    addressValidationError: Boolean(addressValidationError),
    paymentValid,
    schedulingValid: !isScheduled || Boolean(timeSlotId),
    orderValid: isFormValid,
  };

  useEffect(() => {
    if (checkoutSteps.some((step) => step.id === currentStep)) return;
    setCurrentStep(checkoutSteps.find((step) => step.id === 'payment')?.id ?? checkoutSteps[0].id);
    setStepError(null);
  }, [checkoutSteps, currentStep]);

  useEffect(() => {
    if (!tenantSlug) return;
    if (cartTenantSlug && cartTenantSlug !== tenantSlug) {
      navigate(`/${tenantSlug}`, { replace: true });
      return;
    }

    if (items.length === 0 && !hasCompletedCheckoutRef.current) {
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

  useEffect(() => {
    if (!availableOrderModes) return;
    if (fulfillmentType === 'pickup' && !availableOrderModes.pickupEnabled) {
      setFulfillmentType('delivery');
    }
    if (fulfillmentType === 'delivery' && !availableOrderModes.deliveryEnabled && availableOrderModes.pickupEnabled) {
      setFulfillmentType('pickup');
    }
  }, [availableOrderModes, fulfillmentType]);

  useEffect(() => {
    if (tenantInfo?.scheduling?.enabled) return;
    if (isScheduled) {
      setIsScheduled(false);
      setTimeSlotId('');
    }
  }, [tenantInfo?.scheduling?.enabled, isScheduled]);

  function showEmptyCartMessageOnce() {
    setSubmitError((prev) => prev ?? 'Seu carrinho está vazio. Adicione itens antes de finalizar.');
  }

  function applySavedAddress(address: PublicCustomerProfileAddressDTO | null) {
    if (!address) return;
    addressLookupRequestRef.current += 1;
    addressEditRevisionRef.current += 1;
    manuallyEditedAddressFieldsRef.current.clear();
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
    setCepLookupError(null);
    setShowManualAddress(true);
  }

  function buildOrderPayload(
    submissionPayment: PaymentInput,
    submissionEmail: string | undefined,
  ): CreateOrderDTO {
    return {
      customerName: customerName.trim(),
      customerPhone: unmask(customerPhone.trim()),
      customerEmail: submissionEmail,
      fulfillmentType,
      items: items.map(serializeCartItem),
      idempotencyKey: '',
      notes: notes.trim() || undefined,
      payment: submissionPayment,
      sourceChannel: 'direct_online',
      couponCode: appliedCoupon || undefined,
      useCashbackAmount: usedCashback || undefined,
      deliveryAddress: fulfillmentType === 'delivery' ? {
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim() || undefined,
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: state.trim(),
        zipCode: unmask(zipCode),
        reference: reference.trim() || undefined,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
      } : undefined,
      scheduledFor: isScheduled ? scheduledFor : undefined,
      timeSlotId: isScheduled ? timeSlotId : undefined,
      returnUrl: window.location.origin + `/${tenantSlug}`,
      tableId: tableId || undefined,
    };
  }

  const addressSummary = fulfillmentType === 'delivery'
    ? [
        `${street.trim()}, ${number.trim()}`,
        complement.trim(),
        neighborhood.trim(),
        `${city.trim()} - ${state.trim()}`,
        maskCEP(zipCode),
      ].filter(Boolean).join(' · ')
    : undefined;

  const handleCardSubmit = async (formData: unknown) => {
    if (!submitGuardRef.current.tryStart()) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const paymentData = formData as MercadoPagoCardFormData;

    try {
      const payload = buildOrderPayload(
        {
          method: PaymentMethod.credit_card,
          cardToken: paymentData.token,
          paymentMethodId: paymentData.payment_method_id,
          issuerId: paymentData.issuer_id,
          installments: paymentData.installments,
        },
        paymentData.payer?.email || customerEmail.trim() || customer?.email || undefined,
      );
      payload.idempotencyKey = await createCheckoutIdempotencyKey(checkoutAttemptIdRef.current, payload);

      const res = await api.post<OrderResponseDTO>(`/orders/public-checkout/${tenantSlug}`, payload);
      
      submitGuardRef.current.succeed();
      hasCompletedCheckoutRef.current = true;
      analytics.track('order_submitted', { orderId: res.data.id, itemCount: items.length, value: subtotal });
      clearCart();
      navigate(`/${tenantSlug}/order/${res.data.id}`, { state: { order: res.data } });
    } catch (err: unknown) {
      submitGuardRef.current.fail();
      const error = err as Error & { details?: { validationErrors?: string[] } };
      console.error('Card checkout error:', error);
      const message = error.message || 'Erro ao processar pagamento com cartão.';
      if (isAmbiguousCheckoutError(error)) {
        setSubmitError('Não foi possível confirmar o resultado. Tente novamente: a mesma tentativa será consultada sem duplicar o pedido.');
      } else if (isScheduled && /(horário|slot|limite|agendamento)/i.test(message)) {
        setTimeSlotId('');
        setScheduledFor('');
        setSchedulingRefreshKey((value) => value + 1);
        setSubmitError('O horário selecionado não está mais disponível. Escolha outro horário.');
      } else {
        setSubmitError(message);
      }
      throw error; // Re-throw to the brick so it can show error
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;
    
    // Se for cartão, o botão do brick cuida do submit (ou chamamos via ref se necessário)
    // Mas aqui o usuário clicou no botão "Enviar Pedido" customizado.
    // Se for cartão, devemos orientar o usuário a usar o botão do Brick ou disparar o submit do brick.
    if (payment.method === PaymentMethod.credit_card) {
      setSubmitError('Por favor, preencha os dados do cartão e clique em "Pagar".');
      return;
    }

    if (!submitGuardRef.current.tryStart()) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setValidationErrors([]);

    try {
      const payload = buildOrderPayload(
        {
          ...payment,
          changeFor: payment.method === 'cash' ? (payment.changeFor ?? undefined) : undefined,
        },
        customerEmail.trim() || customer?.email || undefined,
      );
      payload.idempotencyKey = await createCheckoutIdempotencyKey(checkoutAttemptIdRef.current, payload);

      const res = await api.post<OrderResponseDTO>(`/orders/public-checkout/${tenantSlug}`, payload);
      
      submitGuardRef.current.succeed();
      hasCompletedCheckoutRef.current = true;
      analytics.track('order_submitted', { orderId: res.data.id, itemCount: items.length, value: subtotal });
      clearCart();
      const summaryIdentifier = res.data.publicTrackingToken || res.data.id;
      
      // Se for Cartão on-line, redirecionar para Checkout Pro do Mercado Pago
      if (res.data.preferencePayment) {
        window.location.href = res.data.preferencePayment.initPoint;
      } 
      else {
        navigate(`/${tenantSlug}/order/${summaryIdentifier}`, { state: { order: res.data } });
      }
    } catch (err: unknown) {
      submitGuardRef.current.fail();
      const error = err as Error & { details?: { validationErrors?: string[] } };
      console.error('Checkout error:', error);
      
      if (isAmbiguousCheckoutError(error)) {
        setSubmitError('Não foi possível confirmar o resultado. Tente novamente: a mesma tentativa será consultada sem duplicar o pedido.');
      } else if (error.details?.validationErrors) {
        setSubmitError('Erro de validação. Verifique os campos abaixo:');
        setValidationErrors(error.details.validationErrors);
      } else {
        const message = error.message || 'Erro ao processar pedido. Tente novamente.';
        if (isScheduled && /(horário|slot|limite|agendamento)/i.test(message)) {
          setTimeSlotId('');
          setScheduledFor('');
          setSchedulingRefreshKey((value) => value + 1);
          setSubmitError('O horário selecionado não está mais disponível. Escolha outro horário.');
        } else {
          setSubmitError(message);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStepIndex = Math.max(0, checkoutSteps.findIndex((step) => step.id === currentStep));
  const isReviewStep = currentStep === 'review';

  const handleContinue = () => {
    const error = getCheckoutStepError(currentStep, stepValidationContext);
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setCurrentStep(getAdjacentCheckoutStep(checkoutSteps, currentStep, 'next'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackStep = () => {
    setStepError(null);
    setCurrentStep(getAdjacentCheckoutStep(checkoutSteps, currentStep, 'back'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleZipCodeChange = (value: string) => {
    addressLookupRequestRef.current += 1;
    addressEditRevisionRef.current += 1;
    setSelectedSavedAddressId(null);
    setCepLookupError(null);
    setZipCode(value);
  };

  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-32">
      <header className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">Finalizar Pedido</h1>
      </header>

      <nav aria-label="Progresso do checkout" className="mb-8">
        <div className="mb-3 flex items-center justify-between text-xs font-bold text-gray-500">
          <span>Etapa {currentStepIndex + 1} de {checkoutSteps.length}</span>
          <span className="text-primary-700">{checkoutSteps[currentStepIndex]?.label}</span>
        </div>
        <ol className="flex items-center gap-1.5">
          {checkoutSteps.map((step, index) => {
            const isCurrent = index === currentStepIndex;
            const isComplete = index < currentStepIndex;
            return (
              <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black transition-colors ${
                    isCurrent
                      ? 'bg-primary-600 text-white shadow-sm'
                      : isComplete
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className={`hidden truncate text-[10px] font-bold sm:block ${isCurrent ? 'text-gray-900' : 'text-gray-400'}`}>
                  {step.shortLabel}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      {stepError && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{stepError}</p>
        </div>
      )}

      {currentStep === 'payment' && <section className="mb-6">
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
      </section>}

      {currentStep === 'contact' && <section className="mb-6">
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
      </section>}

      {currentStep === 'fulfillment' && !tableId && (
        <section className="mb-6">
          <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3">Como deseja receber?</h2>
          <div className="grid grid-cols-2 gap-3">
            {availableOrderModes?.deliveryEnabled !== false && (
              <button onClick={() => setFulfillmentType('delivery')}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${fulfillmentType === 'delivery' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100 bg-white text-gray-500'}`}>
                <Truck className="w-6 h-6" />
                <span className="text-xs font-bold uppercase">Entrega</span>
              </button>
            )}
            {availableOrderModes?.pickupEnabled && (
              <button onClick={() => setFulfillmentType('pickup')}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${fulfillmentType === 'pickup' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100 bg-white text-gray-500'}`}>
                <Store className="w-6 h-6" />
                <span className="text-xs font-bold uppercase">Retirada</span>
              </button>
            )}
          </div>
        </section>
      )}

      {currentStep === 'payment' && tenantInfo?.scheduling?.enabled && (
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
            timezone={tenantInfo.scheduling.timezone}
            maximumAdvanceDays={tenantInfo.scheduling.maximumAdvanceDays}
            refreshKey={schedulingRefreshKey}
            onSlotSelect={(slotId, date) => {
              setTimeSlotId(slotId);
              setScheduledFor(date);
            }}
          />
        )}
      </section>
      )}

      {currentStep === 'address' && fulfillmentType === 'delivery' && (
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

          <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
            <label className="mb-1 ml-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">Buscar pelo CEP</label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                placeholder="00000-000"
                value={maskCEP(zipCode)}
                onChange={(event) => handleZipCodeChange(event.target.value)}
                className="input-premium pr-10"
              />
              {isFetchingCep && (
                <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary-500" />
              )}
            </div>
            {cepLookupError && <p className="mt-2 text-xs font-medium text-amber-700">{cepLookupError}</p>}
            {!showManualAddress && (
              <button
                type="button"
                onClick={() => setShowManualAddress(true)}
                className="mt-3 flex items-center gap-2 text-xs font-bold text-primary-700 underline underline-offset-4"
              >
                <PencilLine className="h-3.5 w-3.5" />
                Não encontrou? Preencher endereço manualmente
              </button>
            )}
          </div>

          {showManualAddress && (
          <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-3">
                <label className="mb-1 ml-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">Rua</label>
                <input type="text" placeholder="Rua" value={street} onChange={(event) => { markAddressFieldEdited('street'); setStreet(event.target.value); }}
                  className="input-premium py-2 text-xs" />
              </div>
              <div className="col-span-1">
                <label className="mb-1 ml-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">Nº</label>
                <input type="text" placeholder="Nº" value={number} onChange={e => setNumber(e.target.value)}
                  className="input-premium py-2 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 ml-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">Bairro</label>
                <input type="text" placeholder="Bairro" value={neighborhood} onChange={(event) => { markAddressFieldEdited('neighborhood'); setNeighborhood(event.target.value); }}
                  className="input-premium py-2 text-xs" />
              </div>
              <div>
                <label className="mb-1 ml-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">Cidade</label>
                <input type="text" placeholder="Cidade" value={city} onChange={(event) => { markAddressFieldEdited('city'); setCity(event.target.value); }}
                  className="input-premium py-2 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_88px] gap-3">
              <input type="text" placeholder="Complemento" value={complement} onChange={e => setComplement(e.target.value)}
                className="input-premium py-2 text-xs" />
              <input type="text" placeholder="UF" maxLength={2} value={state} onChange={(event) => { markAddressFieldEdited('state'); setState(event.target.value.toUpperCase()); }}
                className="input-premium py-2 text-xs uppercase" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Referência" value={reference} onChange={e => setReference(e.target.value)}
                className="input-premium col-span-2 py-2 text-xs" />
            </div>

            {isValidating && (
              <div className="flex items-center gap-2 text-[10px] text-primary-500 font-bold uppercase tracking-wider animate-pulse pt-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Verificando região de entrega...
              </div>
            )}
            {addressValidationError && !isValidating && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {addressValidationError}
              </div>
            )}
          </div>
          )}
        </section>
      )}

      {currentStep === 'payment' && <section className="mb-6">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Forma de Pagamento
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('pix')) && (
            <button
              type="button"
              onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.pix }))}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'pix' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <QrCode className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase">PIX</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('credit_card')) && (
            <button
              type="button"
              onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.credit_card }))}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'credit_card' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase text-center leading-none">Crédito<br/>On-line</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('debit_card')) && (
            <button
              type="button"
              onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.debit_card }))}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'debit_card' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase text-center leading-none">Débito<br/>On-line</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('card_on_delivery')) && (
            <button
              type="button"
              onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.card_on_delivery }))}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${payment.method === 'card_on_delivery' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-100'}`}>
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-tight text-center leading-none">Cartão na<br/>Entrega</span>
            </button>
          )}
          {(!tenantInfo || tenantInfo.paymentMethods?.includes('cash')) && (
            <button
              type="button"
              onClick={() => setPayment(prev => ({ ...prev, method: PaymentMethod.cash, changeFor: 0 }))}
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

        {payment.method === PaymentMethod.credit_card && (!tenantInfo?.mercadoPagoPublicKey || !customerEmail.trim()) && (
            <div className="mt-4 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
              Para pagamento com cartão, informe um e-mail válido e aguarde a configuração da loja.
            </div>
        )}
      </section>}

      {currentStep === 'payment' && <section className="mb-8">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Observações
        </h2>
        <textarea placeholder="Ex: Tirar cebola, campainha estragada..." value={notes} onChange={e => setNotes(e.target.value)}
          className="input-premium min-h-[100px] resize-none" />
      </section>}

      {isReviewStep && <CheckoutFinalSummary
        items={items}
        subtotal={subtotal}
        deliveryFee={deliveryFee}
        deliveryEstimatedMinutes={deliveryEstimatedMinutes}
        discountTotal={discountTotal}
        cashbackUsed={validatedCashbackUsed}
        couponCode={appliedCoupon}
        total={total}
        fulfillmentType={fulfillmentType}
        payment={payment}
        addressSummary={addressSummary}
        notes={notes}
        isValidating={isValidating}
      />}

      {isReviewStep && payment.method === PaymentMethod.credit_card && tenantInfo?.mercadoPagoPublicKey && customerEmail.trim() && (
        <div className="mb-6">
          <CardPayment
            publicKey={tenantInfo.mercadoPagoPublicKey}
            amount={total}
            onSubmit={handleCardSubmit}
          />
        </div>
      )}

      {isReviewStep && submitError && (
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

      <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto flex max-w-lg gap-3 border-t border-gray-100 bg-white/90 p-4 backdrop-blur-md">
        {currentStepIndex > 0 && (
          <button
            type="button"
            onClick={handleBackStep}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-1 rounded-2xl border border-gray-200 px-4 py-4 text-xs font-black uppercase tracking-wider text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>
        )}
        {!isReviewStep && (
          <button
            type="button"
            onClick={handleContinue}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-primary-700 active:scale-[0.99]"
          >
            Continuar <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {isReviewStep && payment.method !== PaymentMethod.credit_card && (
          <button onClick={handleSubmit} disabled={!isFormValid || isSubmitting || isValidating}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-primary-700 active:scale-[0.99] disabled:bg-gray-200 disabled:text-gray-400">
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processando...
              </>
            ) : (
              <>Enviar pedido para a loja</>
            )}
          </button>
        )}
      </div>

      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={() => setIsLoginOpen(false)} 
        tenantSlug={tenantSlug!} 
      />
    </div>
  );
}
