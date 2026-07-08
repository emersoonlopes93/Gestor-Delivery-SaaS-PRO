import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Navigation } from 'lucide-react';
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

interface GeocodeResult {
  provider?: string | null;
  lat: number | null;
  lng: number | null;
}

interface Step2Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
  onMarkValid: (valid: boolean) => void;
}

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

export function Step2Location({ onNext, onPrev, onMarkValid }: Step2Props) {
  const [form, setForm] = useState<Step2Data>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [cepLoading, setCepLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [coordinatesDirty, setCoordinatesDirty] = useState(false);
  const [addressNotice, setAddressNotice] = useState<string | null>(null);
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
      const tenantRes = await api.get<TenantMeResponse>('/tenant/me');
      const settings = tenantRes.data?.settings;

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
      setShowDetails(Boolean(nextForm.street || nextForm.city || nextForm.zipCode));
      setManualMode(Boolean(nextForm.street || nextForm.city || nextForm.zipCode));
      setCoordinatesDirty(false);
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
        source: 'onboarding',
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
    setManualMode(false);
    setShowDetails(false);
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
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const nextDisabled = !isAddressStepValid(form) || geocoding;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40">
          <MapPin className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Onde fica sua loja?</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Primeiro confirme o endereco da loja. A configuracao de entrega vem no proximo passo.
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Pais</label>
              <input
                type="text"
                value={form.country}
                onChange={(event) => updateField('country', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Coordenadas</div>
              <div className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
                {hasRealCoordinates(form.lat, form.lng) ? 'Validadas automaticamente' : 'Aguardando validacao'}
              </div>
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

      <div className="flex gap-3">
        <button
          onClick={onPrev}
          className="flex-1 rounded-2xl bg-slate-100 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Voltar
        </button>
        <button
          onClick={handleNext}
          disabled={nextDisabled}
          className="flex-[2] rounded-2xl bg-emerald-600 py-4 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-700"
        >
          Proximo
        </button>
      </div>
    </div>
  );
}
