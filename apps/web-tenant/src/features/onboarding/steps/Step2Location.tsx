import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Navigation, CircleDot, Route, Map, Info } from 'lucide-react';
import { CurrencyInput } from '@gestor/ui';
import { api } from '../../../lib/api-client';
import { AddressSearchInput } from '../components/AddressSearchInput';
import { fetchAddressByCep, isValidCoordinatePair, maskCEP, unmask } from '@gestor/utils';

interface Step2Data {
  searchQuery: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  lat: number | null;
  lng: number | null;
}

interface TenantSettingsPayload {
  address?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface TenantMeResponse {
  settings?: TenantSettingsPayload | null;
}

interface DeliveryCoverageConfigSnapshot {
  storeLat: number;
  storeLng: number;
  maxRadiusKm: number | string;
  defaultPricePerKm: number | string;
  minimumFee?: number | string | null;
  maximumFee?: number | string | null;
  defaultEstimatedDeliveryMinutes?: number | null;
  isDeliveryEnabled?: boolean;
}

interface GeocodeResult {
  lat: number | null;
  lng: number | null;
}

interface Step2Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
  onMarkValid: (valid: boolean) => void;
}

type DeliveryMethod = 'radius';

type RadiusDeliveryDraft = {
  maxRadiusKm: number;
  minimumFee: number;
  defaultPricePerKm: number;
  maximumFee: number | null;
  defaultEstimatedDeliveryMinutes: number;
};

const EMPTY_FORM: Step2Data = {
  searchQuery: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  country: 'Brasil',
  lat: null,
  lng: null,
};

const DEFAULT_RADIUS_DRAFT: RadiusDeliveryDraft = {
  maxRadiusKm: 5,
  minimumFee: 5,
  defaultPricePerKm: 1.5,
  maximumFee: null,
  defaultEstimatedDeliveryMinutes: 30,
};

function hasRequiredAddressFields(form: Step2Data) {
  return Boolean(
    form.street.trim() &&
      form.number.trim() &&
      form.neighborhood.trim() &&
      form.city.trim() &&
      form.state.trim(),
  );
}

function hasRealCoordinates(lat: number | null, lng: number | null) {
  return isValidCoordinatePair(lat, lng) && lat !== 0 && lng !== 0;
}

function isAddressStepValid(form: Step2Data) {
  return hasRequiredAddressFields(form) && hasRealCoordinates(form.lat, form.lng);
}

function buildFullAddress(form: Step2Data) {
  return [
    `${form.street.trim()}, ${form.number.trim()}`,
    form.complement.trim(),
    form.neighborhood.trim(),
    `${form.city.trim()} - ${form.state.trim()}`,
    form.country.trim() || 'Brasil',
  ]
    .filter(Boolean)
    .join(', ');
}

function buildAddressLabel(form: Step2Data) {
  return [
    `${form.street.trim()}, ${form.number.trim()}`,
    form.complement.trim() ? `- ${form.complement.trim()}` : '',
    form.neighborhood.trim() ? `- ${form.neighborhood.trim()}` : '',
    `${form.city.trim()} - ${form.state.trim()}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function buildSearchQueryFromSettings(settings?: TenantSettingsPayload | null) {
  if (!settings) return '';
  if (settings.address?.trim()) return settings.address.trim();

  return [
    settings.street?.trim(),
    settings.number?.trim(),
    settings.neighborhood?.trim(),
    settings.city?.trim(),
    settings.state?.trim(),
  ]
    .filter(Boolean)
    .join(', ');
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildRadiusDraft(config?: DeliveryCoverageConfigSnapshot | null): RadiusDeliveryDraft {
  return {
    maxRadiusKm: toNumberOrNull(config?.maxRadiusKm) ?? DEFAULT_RADIUS_DRAFT.maxRadiusKm,
    minimumFee: toNumberOrNull(config?.minimumFee) ?? DEFAULT_RADIUS_DRAFT.minimumFee,
    defaultPricePerKm: toNumberOrNull(config?.defaultPricePerKm) ?? DEFAULT_RADIUS_DRAFT.defaultPricePerKm,
    maximumFee: toNumberOrNull(config?.maximumFee),
    defaultEstimatedDeliveryMinutes:
      config?.defaultEstimatedDeliveryMinutes ?? DEFAULT_RADIUS_DRAFT.defaultEstimatedDeliveryMinutes,
  };
}

function isRadiusDraftValid(draft: RadiusDeliveryDraft) {
  if (!(draft.maxRadiusKm > 0)) return false;
  if (draft.minimumFee < 0) return false;
  if (draft.defaultPricePerKm < 0) return false;
  if (draft.maximumFee != null && draft.maximumFee < draft.minimumFee) return false;
  if (!(draft.defaultEstimatedDeliveryMinutes > 0)) return false;
  return true;
}

function radiusDraftError(draft: RadiusDeliveryDraft) {
  if (!(draft.maxRadiusKm > 0)) return 'Informe um raio maior que zero.';
  if (draft.minimumFee < 0) return 'A taxa minima nao pode ser negativa.';
  if (draft.defaultPricePerKm < 0) return 'O preco por km nao pode ser negativo.';
  if (draft.maximumFee != null && draft.maximumFee < draft.minimumFee) {
    return 'A taxa maxima deve ser maior ou igual a taxa minima.';
  }
  if (!(draft.defaultEstimatedDeliveryMinutes > 0)) {
    return 'Informe um tempo estimado padrao maior que zero.';
  }
  return null;
}

function DeliveryChoiceCard(props: {
  title: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick?: () => void;
}) {
  const Icon = props.icon;

  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`w-full rounded-3xl border p-4 text-left transition ${
        props.active
          ? 'border-emerald-300 bg-emerald-50 shadow-sm dark:border-emerald-700 dark:bg-emerald-900/20'
          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
      } ${props.disabled ? 'cursor-not-allowed opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              props.active
                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">{props.title}</h3>
              {props.badge ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  {props.badge}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{props.description}</p>
          </div>
        </div>
        <div
          className={`mt-1 h-4 w-4 rounded-full border-2 ${
            props.active
              ? 'border-emerald-500 bg-emerald-500'
              : 'border-slate-300 bg-transparent dark:border-slate-600'
          }`}
        />
      </div>
    </button>
  );
}

export function Step2Location({ onNext, onPrev, onMarkValid }: Step2Props) {
  const [form, setForm] = useState<Step2Data>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [cepLoading, setCepLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [coordinatesDirty, setCoordinatesDirty] = useState(false);
  const [addressNotice, setAddressNotice] = useState<string | null>(null);
  const [coverageConfig, setCoverageConfig] = useState<DeliveryCoverageConfigSnapshot | null>(null);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('radius');
  const [radiusDraft, setRadiusDraft] = useState<RadiusDeliveryDraft>(DEFAULT_RADIUS_DRAFT);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const geocodeRequestRef = useRef(0);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    onMarkValid(isAddressStepValid(form));
  }, [form, onMarkValid]);

  useEffect(() => {
    if (!showDetails || !hasRequiredAddressFields(form)) return;
    if (!coordinatesDirty && hasRealCoordinates(form.lat, form.lng)) return;

    const timeoutId = window.setTimeout(() => {
      void geocodeCurrentAddress();
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [form, showDetails, coordinatesDirty]);

  const loadData = async () => {
    setLoading(true);

    try {
      const [tenantRes, coverageRes] = await Promise.all([
        api.get<TenantMeResponse>('/tenant/me'),
        api.get<DeliveryCoverageConfigSnapshot | null>('/delivery/coverage').catch(() => null),
      ]);

      const settings = tenantRes.data?.settings;
      const loadedCoverage = coverageRes?.data ?? null;
      const nextForm: Step2Data = {
        searchQuery: buildSearchQueryFromSettings(settings),
        zipCode: settings?.zipCode || '',
        street: settings?.street || '',
        number: settings?.number || '',
        complement: settings?.complement || '',
        neighborhood: settings?.neighborhood || '',
        city: settings?.city || '',
        state: settings?.state || '',
        country: 'Brasil',
        lat: settings?.lat ?? null,
        lng: settings?.lng ?? null,
      };

      setForm(nextForm);
      setCoverageConfig(loadedCoverage);
      setDeliveryEnabled(Boolean(loadedCoverage?.isDeliveryEnabled));
      setRadiusDraft(buildRadiusDraft(loadedCoverage));
      setDeliveryMethod('radius');
      setShowDetails(Boolean(nextForm.street || nextForm.city || nextForm.zipCode));
      setManualMode(Boolean(nextForm.street || nextForm.city || nextForm.zipCode));
      setCoordinatesDirty(false);
      setDeliveryError(null);
      setAddressNotice(
        hasRealCoordinates(nextForm.lat, nextForm.lng)
          ? 'Endereco carregado com coordenadas validas.'
          : nextForm.street
            ? 'Revise o endereco para recalcular as coordenadas reais da loja.'
            : null,
      );
    } finally {
      setLoading(false);
    }
  };

  const geocodeCurrentAddress = async () => {
    const currentRequest = geocodeRequestRef.current + 1;
    geocodeRequestRef.current = currentRequest;

    setGeocoding(true);
    setAddressNotice('Validando a localizacao da loja...');

    try {
      const response = await api.post<GeocodeResult>('/delivery/coverage/geocode', {
        query: buildFullAddress(form),
      });

      if (geocodeRequestRef.current !== currentRequest) return;

      const nextLat = response.data?.lat ?? null;
      const nextLng = response.data?.lng ?? null;

      setForm((current) => ({
        ...current,
        lat: nextLat,
        lng: nextLng,
      }));

      if (hasRealCoordinates(nextLat, nextLng)) {
        setCoordinatesDirty(false);
        setAddressNotice('Endereco validado com sucesso.');
      } else {
        setCoordinatesDirty(true);
        setAddressNotice('Nao foi possivel localizar esse endereco. Revise os campos ou use outra busca.');
      }
    } catch {
      if (geocodeRequestRef.current !== currentRequest) return;
      setForm((current) => ({
        ...current,
        lat: null,
        lng: null,
      }));
      setCoordinatesDirty(true);
      setAddressNotice('A geocodificacao falhou. Revise o endereco para continuar.');
    } finally {
      if (geocodeRequestRef.current === currentRequest) {
        setGeocoding(false);
      }
    }
  };

  const handleAddressSelected = (
    address: {
      street: string;
      number: string;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
      lat: number;
      lng: number;
      country?: string;
    },
    description: string,
  ) => {
    setForm((current) => ({
      ...current,
      searchQuery: description,
      zipCode: address.zipCode,
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      country: address.country || 'Brasil',
      lat: address.lat,
      lng: address.lng,
    }));
    setShowDetails(true);
    setManualMode(false);
    setCoordinatesDirty(false);
    setAddressNotice(
      address.number
        ? 'Endereco encontrado. Revise os campos antes de continuar.'
        : 'Endereco encontrado, mas o numero nao veio na busca. Preencha o numero para continuar.',
    );

    window.requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const updateField = <K extends keyof Step2Data>(field: K, value: Step2Data[K], invalidateCoordinates = false) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      lat: invalidateCoordinates ? null : current.lat,
      lng: invalidateCoordinates ? null : current.lng,
    }));

    if (invalidateCoordinates) {
      setCoordinatesDirty(true);
      setAddressNotice('Endereco alterado. Vamos recalcular as coordenadas automaticamente.');
    }
  };

  const handleCepBlur = async () => {
    const cep = unmask(form.zipCode);
    if (cep.length !== 8) return;

    setCepLoading(true);

    try {
      const result = await fetchAddressByCep(cep);
      if (!result) return;

      setForm((current) => ({
        ...current,
        zipCode: result.zipCode || current.zipCode,
        street: result.street || current.street,
        neighborhood: result.neighborhood || current.neighborhood,
        city: result.city || current.city,
        state: result.state || current.state,
        lat: null,
        lng: null,
      }));
      setShowDetails(true);
      setManualMode(true);
      setCoordinatesDirty(true);
      setAddressNotice('CEP encontrado. Complete o numero para validar a localizacao.');
    } finally {
      setCepLoading(false);
    }
  };

  const handleNext = () => {
    if (!isAddressStepValid(form)) return;

    if (deliveryEnabled) {
      const error = radiusDraftError(radiusDraft);
      if (error) {
        setDeliveryError(error);
        return;
      }
    }

    setDeliveryError(null);

    onNext(async () => {
      const finalLat = hasRealCoordinates(form.lat, form.lng) ? form.lat : null;
      const finalLng = hasRealCoordinates(form.lat, form.lng) ? form.lng : null;

      await api.patch('/tenant/settings', {
        zipCode: unmask(form.zipCode) || undefined,
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim() || undefined,
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        address: buildAddressLabel(form),
        lat: finalLat,
        lng: finalLng,
      });

      if (finalLat === null || finalLng === null) {
        await api.patch('/tenant/onboarding-step', { step: 'delivery', completed: false });
        return;
      }

      if (deliveryEnabled && deliveryMethod === 'radius') {
        await api.put('/delivery/coverage', {
          storeLat: finalLat,
          storeLng: finalLng,
          maxRadiusKm: radiusDraft.maxRadiusKm,
          defaultPricePerKm: radiusDraft.defaultPricePerKm,
          minimumFee: radiusDraft.minimumFee,
          maximumFee: radiusDraft.maximumFee ?? undefined,
          defaultEstimatedDeliveryMinutes: radiusDraft.defaultEstimatedDeliveryMinutes,
          isDeliveryEnabled: true,
        });
        await api.patch('/tenant/onboarding-step', { step: 'delivery', completed: true });
        return;
      }

      if (coverageConfig) {
        await api.put('/delivery/coverage', {
          storeLat: finalLat,
          storeLng: finalLng,
          maxRadiusKm: Number(coverageConfig.maxRadiusKm),
          defaultPricePerKm: Number(coverageConfig.defaultPricePerKm),
          minimumFee: toNumberOrNull(coverageConfig.minimumFee) ?? undefined,
          maximumFee: toNumberOrNull(coverageConfig.maximumFee) ?? undefined,
          defaultEstimatedDeliveryMinutes: coverageConfig.defaultEstimatedDeliveryMinutes ?? undefined,
          isDeliveryEnabled: false,
        });
      }

      await api.patch('/tenant/onboarding-step', { step: 'delivery', completed: false });
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const addressValid = isAddressStepValid(form);
  const radiusValid = !deliveryEnabled || isRadiusDraftValid(radiusDraft);
  const nextDisabled = !addressValid || geocoding || !radiusValid;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40">
          <MapPin className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Onde fica sua loja e como ela entrega?</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Primeiro confirme o endereco da loja. Depois escolha a forma mais simples de calcular a entrega.
        </p>
      </div>

      <AddressSearchInput
        value={form.searchQuery}
        onChange={(value) => {
          updateField('searchQuery', value);
          setShowDetails(false);
        }}
        onSelect={handleAddressSelected}
        onRequestManualEntry={() => {
          setManualMode(true);
          setShowDetails(true);
          setAddressNotice('Preencha o endereco manualmente para validarmos a localizacao.');
          window.requestAnimationFrame(() => {
            detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }}
      />

      {(showDetails || manualMode) && (
        <div ref={detailsRef} className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-2 text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-300">
              <Navigation className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Conferencia do endereco
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Ajuste os dados se necessario. Mudancas em rua, numero, bairro, cidade, estado ou CEP recalculam as coordenadas.
              </p>
            </div>
          </div>

          {addressNotice && (
            <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-emerald-900/50 dark:bg-slate-950 dark:text-slate-200">
              {addressNotice}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">CEP</label>
              <div className="relative">
                <input
                  type="text"
                  value={maskCEP(form.zipCode)}
                  onChange={(event) => updateField('zipCode', event.target.value, true)}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                />
                {cepLoading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-500" /> : null}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Rua *</label>
              <input
                type="text"
                value={form.street}
                onChange={(event) => updateField('street', event.target.value, true)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Numero *</label>
              <input
                type="text"
                value={form.number}
                onChange={(event) => updateField('number', event.target.value, true)}
                placeholder="123"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Complemento</label>
              <input
                type="text"
                value={form.complement}
                onChange={(event) => updateField('complement', event.target.value)}
                placeholder="Sala, bloco, referencia..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Bairro *</label>
              <input
                type="text"
                value={form.neighborhood}
                onChange={(event) => updateField('neighborhood', event.target.value, true)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Cidade *</label>
              <input
                type="text"
                value={form.city}
                onChange={(event) => updateField('city', event.target.value, true)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Estado *</label>
              <input
                type="text"
                value={form.state}
                onChange={(event) => updateField('state', event.target.value.toUpperCase().slice(0, 2), true)}
                placeholder="SP"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Pais</label>
              <input
                type="text"
                value={form.country}
                onChange={(event) => updateField('country', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Latitude</label>
              <input
                type="text"
                value={form.lat ?? ''}
                readOnly
                className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Longitude</label>
              <input
                type="text"
                value={form.lng ?? ''}
                readOnly
                className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          {geocoding ? (
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando coordenadas da loja...
            </div>
          ) : null}
        </div>
      )}

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
            <CircleDot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Escolha o tipo de area de entrega</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Por agora, o modo operacional pronto ponta a ponta e por raio. As outras opcoes aparecem apenas como preview seguro.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={deliveryEnabled}
              onChange={(event) => {
                setDeliveryEnabled(event.target.checked);
                setDeliveryError(null);
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <div className="text-sm font-black text-slate-900 dark:text-white">Quero ativar entrega agora</div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Se desligar esta opcao, voce ainda pode concluir o onboarding usando retirada no local no passo seguinte.
              </p>
            </div>
          </label>
        </div>

        {!addressValid ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
              Confirme primeiro o endereco com coordenadas reais da loja para liberar a configuracao de entrega.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3">
          <DeliveryChoiceCard
            title="Por raio"
            description="Calcule a entrega pela distancia em linha reta."
            icon={CircleDot}
            active={deliveryEnabled && deliveryMethod === 'radius'}
            onClick={() => {
              if (!deliveryEnabled) {
                setDeliveryEnabled(true);
              }
              setDeliveryMethod('radius');
            }}
          />

          <DeliveryChoiceCard
            title="Zonas especiais por mapa"
            description="Defina areas especiais por mapa depois que a operacao basica estiver publicada."
            icon={Map}
            disabled
            badge="Em breve"
          />

          <DeliveryChoiceCard
            title="Por bairro"
            description="Ainda nao esta pronto ponta a ponta no checkout, por isso nao sera ativado agora."
            icon={Route}
            disabled
            badge="Em breve"
          />
        </div>

        {deliveryEnabled && deliveryMethod === 'radius' ? (
          <div className="space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-800 dark:bg-emerald-950/20">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Entrega por raio
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Essa configuracao usa a origem oficial da loja em <code>tenant_settings.lat/lng</code> e salva a cobertura no endpoint atual de delivery.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Raio maximo</span>
                <div className="relative">
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={radiusDraft.maxRadiusKm}
                    onChange={(event) => {
                      setRadiusDraft((current) => ({ ...current, maxRadiusKm: Number(event.target.value) }));
                      setDeliveryError(null);
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-14 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-wide text-slate-400">km</span>
                </div>
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Tempo estimado padrao</span>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={radiusDraft.defaultEstimatedDeliveryMinutes}
                    onChange={(event) => {
                      setRadiusDraft((current) => ({
                        ...current,
                        defaultEstimatedDeliveryMinutes: Number(event.target.value),
                      }));
                      setDeliveryError(null);
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-16 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-wide text-slate-400">min</span>
                </div>
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Taxa minima</span>
                <CurrencyInput
                  value={radiusDraft.minimumFee}
                  onChange={(value) => {
                    setRadiusDraft((current) => ({ ...current, minimumFee: value }));
                    setDeliveryError(null);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                />
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Preco por km</span>
                <CurrencyInput
                  value={radiusDraft.defaultPricePerKm}
                  onChange={(value) => {
                    setRadiusDraft((current) => ({ ...current, defaultPricePerKm: value }));
                    setDeliveryError(null);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Taxa maxima</span>
                <CurrencyInput
                  value={radiusDraft.maximumFee ?? 0}
                  onChange={(value) => {
                    setRadiusDraft((current) => ({
                      ...current,
                      maximumFee: value > 0 ? value : null,
                    }));
                    setDeliveryError(null);
                  }}
                  placeholder="Opcional"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Deixe zerado se nao quiser limitar um teto de entrega agora.
                </p>
              </label>
            </div>

            {deliveryError ? (
              <div className="rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-600 dark:border-red-900/40 dark:bg-slate-950">
                {deliveryError}
              </div>
            ) : null}

            <div className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-3 dark:border-emerald-900/40 dark:bg-slate-950">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  Essa etapa salva apenas a cobertura oficial por raio. Bairros e zonas especiais ficam para a tela completa de delivery depois do onboarding.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onPrev}
          className="flex-1 rounded-2xl bg-slate-100 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          ← Voltar
        </button>
        <button
          onClick={handleNext}
          disabled={nextDisabled}
          className="flex-[2] rounded-2xl bg-emerald-600 py-4 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-700"
        >
          Proximo →
        </button>
      </div>
    </div>
  );
}
