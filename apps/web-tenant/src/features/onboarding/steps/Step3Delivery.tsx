import { useEffect, useRef, useState } from 'react';
import { CircleDot, Info, Truck } from 'lucide-react';
import { CurrencyInput } from '@gestor/ui';
import { api } from '../../../lib/api-client';
import type { SaveStepOptions } from '../useOnboardingState';

interface TenantMeResponse {
  settings?: {
    pickupEnabled?: boolean;
    lat?: number | null;
    lng?: number | null;
  };
}

interface DeliveryCoverageConfigSnapshot {
  storeLat: number | null;
  storeLng: number | null;
  maxRadiusKm: number | string | null;
  defaultPricePerKm: number | string | null;
  minimumFee?: number | string | null;
  maximumFee?: number | string | null;
  defaultEstimatedDeliveryMinutes?: number | null;
  isDeliveryEnabled?: boolean;
}

interface Step3Props {
  onNext: (saveFn: () => Promise<void>, options?: SaveStepOptions) => Promise<boolean>;
  onPrev: () => void;
  onMarkValid: (valid: boolean) => void;
}

type RadiusDeliveryDraft = {
  maxRadiusKm: number;
  minimumFee: number;
  defaultPricePerKm: number;
  maximumFee: number | null;
  defaultEstimatedDeliveryMinutes: number;
};

const DEFAULT_RADIUS_DRAFT: RadiusDeliveryDraft = {
  maxRadiusKm: 5,
  minimumFee: 5,
  defaultPricePerKm: 1.5,
  maximumFee: null,
  defaultEstimatedDeliveryMinutes: 30,
};

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasRealCoordinates(lat: number | null | undefined, lng: number | null | undefined) {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat !== 0 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng !== 0
  );
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

export function Step3Delivery({ onNext, onPrev, onMarkValid }: Step3Props) {
  const [loading, setLoading] = useState(true);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [addressWarning, setAddressWarning] = useState<string | null>(null);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);
  const [coverageConfig, setCoverageConfig] = useState<DeliveryCoverageConfigSnapshot | null>(null);
  const [radiusDraft, setRadiusDraft] = useState<RadiusDeliveryDraft>(DEFAULT_RADIUS_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setSavingError(null);

      try {
        const [tenantRes, coverageRes] = await Promise.all([
          api.get<TenantMeResponse>('/tenant/me'),
          api.get<DeliveryCoverageConfigSnapshot | null>('/delivery/coverage').catch(() => ({ success: true, data: null })),
        ]);

        if (!mounted) return;

        const settings = tenantRes.success ? tenantRes.data?.settings : undefined;
        const coverage = coverageRes.success ? coverageRes.data : null;
        const initialLat = settings?.lat ?? coverage?.storeLat ?? null;
        const initialLng = settings?.lng ?? coverage?.storeLng ?? null;

        setPickupEnabled(Boolean(settings?.pickupEnabled));
        setOriginLat(initialLat);
        setOriginLng(initialLng);
        setCoverageConfig(coverage);
        setDeliveryEnabled(Boolean(coverage?.isDeliveryEnabled));
        setRadiusDraft(buildRadiusDraft(coverage));
        setAddressWarning(
          hasRealCoordinates(initialLat, initialLng)
            ? null
            : 'Volte ao passo de localizacao para salvar a origem da loja antes de ativar a entrega.',
        );
      } catch {
        if (!mounted) return;
        setAddressWarning('Nao foi possivel carregar a configuracao de entrega. Tente novamente.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadData();

    return () => {
      mounted = false;
    };
  }, []);

  const configValid = !deliveryEnabled || isRadiusDraftValid(radiusDraft);
  const hasOrigin = hasRealCoordinates(originLat, originLng);
  const isStepValid = configValid && (!deliveryEnabled || hasOrigin);

  useEffect(() => {
    onMarkValid(isStepValid);
  }, [isStepValid, onMarkValid]);

  const handleNext = async () => {
    if (submittingRef.current) return;
    if (!configValid) {
      setSavingError(radiusDraftError(radiusDraft));
      return;
    }

    if (deliveryEnabled && !hasOrigin) {
      setSavingError('Configure primeiro a origem da loja no passo de localizacao.');
      return;
    }

    setSavingError(null);

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const advanced = await onNext(async () => {
        const storeLat = hasOrigin ? originLat : coverageConfig?.storeLat ?? null;
        const storeLng = hasOrigin ? originLng : coverageConfig?.storeLng ?? null;
        const hasPersistableOrigin = hasRealCoordinates(storeLat, storeLng);

        if (!deliveryEnabled && !coverageConfig && !hasOrigin) {
          return;
        }

        if (deliveryEnabled && !hasPersistableOrigin) {
          throw new Error('Origem da loja invalida para entrega.');
        }

        if (!deliveryEnabled && !hasPersistableOrigin) {
          return;
        }

        const response = await api.put('/delivery/coverage', {
          storeLat,
          storeLng,
          maxRadiusKm: radiusDraft.maxRadiusKm,
          defaultPricePerKm: radiusDraft.defaultPricePerKm,
          minimumFee: radiusDraft.minimumFee,
          maximumFee: radiusDraft.maximumFee ?? undefined,
          defaultEstimatedDeliveryMinutes: radiusDraft.defaultEstimatedDeliveryMinutes,
          isDeliveryEnabled: deliveryEnabled,
        });
        if (!response.success) throw new Error('Nao foi possivel salvar a cobertura de entrega.');
      }, { resumePersistedDeliveryCoverage: true });

      if (!advanced) {
        setSavingError('Nao foi possivel concluir a configuracao. Tente novamente.');
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40">
          <Truck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Como sua loja vai entregar?</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configure apenas a entrega por raio. A origem oficial continua sendo o endereco salvo no passo anterior.
        </p>
      </div>

      {addressWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{addressWarning}</p>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
            <CircleDot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Entrega por raio</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sem mapa, sem zonas e sem coordenadas visiveis. So o que o lojista precisa para publicar a entrega basica.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={deliveryEnabled}
              onChange={(event) => {
                setDeliveryEnabled(event.target.checked);
                setSavingError(null);
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <div className="text-sm font-black text-slate-900 dark:text-white">Ativar entrega por raio</div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Se desligar, o onboarding continua e a operacao pode seguir com retirada.
              </p>
            </div>
          </label>
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-950">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Origem efetiva</div>
            <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
              {hasOrigin ? 'Endereco salvo no passo de localizacao' : 'Origem ausente'}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {hasOrigin ? 'A entrega usa as coordenadas oficiais da loja.' : 'A entrega fica bloqueada ate a origem ser salva.'}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-950">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Retirada</div>
            <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
              {pickupEnabled ? 'Ativa' : 'Inativa'}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              A retirada continua sendo configurada no passo seguinte.
            </p>
          </div>
        </div>

        {deliveryEnabled ? (
          <div className="mt-5 space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-800 dark:bg-emerald-950/20">
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
                      setSavingError(null);
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
                      setSavingError(null);
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
                    setSavingError(null);
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
                    setSavingError(null);
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
                    setSavingError(null);
                  }}
                  placeholder="Opcional"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Deixe zerado se nao quiser limitar um teto de entrega agora.
                </p>
              </label>
            </div>

            <div className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-3 dark:border-emerald-900/40 dark:bg-slate-950">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  A configuracao salva somente a cobertura basica por raio. O checkout usara a origem oficial da loja no tenant.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
            Entrega desativada. O proximo passo pode seguir com retirada e agendamento.
          </div>
        )}
      </div>

      {savingError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600 dark:border-red-900/40 dark:bg-slate-950">
          {savingError}
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          onClick={onPrev}
          className="flex-1 rounded-2xl bg-slate-100 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Voltar
        </button>
        <button
          onClick={handleNext}
          disabled={isSubmitting || !configValid || (deliveryEnabled && !hasOrigin)}
          className="flex-[2] rounded-2xl bg-emerald-600 py-4 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-700"
        >
          {isSubmitting ? 'Salvando...' : 'Proximo'}
        </button>
      </div>
    </div>
  );
}
