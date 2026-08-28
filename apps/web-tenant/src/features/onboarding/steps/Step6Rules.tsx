import { useEffect, useMemo, useState } from 'react';
import { Bike, CalendarClock, Loader2, MapPin, Store, Info, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../../../lib/api-client';
import type { TenantSchedulingSettings } from '@gestor/types';

interface Step6Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
  onMarkValid: (value: boolean) => void;
}

type DeliveryCoverageResponse = {
  isDeliveryEnabled?: boolean;
  maxRadiusKm?: number | string | null;
  defaultPricePerKm?: number | string | null;
} | null;

type TenantMeResponse = {
  settings?: {
    pickupEnabled?: boolean;
    pickupMinMinutes?: number | null;
    pickupMaxMinutes?: number | null;
    lat?: number | null;
    lng?: number | null;
  };
};

function hasRealCoordinates(lat?: number | null, lng?: number | null) {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat !== 0 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng !== 0
  );
}

function ToggleCard({
  title,
  description,
  enabled,
  disabled = false,
  badge,
  icon: Icon,
  onChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  badge?: string;
  icon: React.FC<{ className?: string }>;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${
        enabled
          ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-800 dark:bg-indigo-950/30'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
      } ${disabled ? 'opacity-80' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              enabled
                ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">{title}</h3>
              {badge ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>

        {!disabled && onChange ? (
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={enabled}
              onChange={(event) => onChange(event.target.checked)}
            />
            <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-indigo-600 dark:bg-slate-700">
              <div className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-primary-foreground transition peer-checked:translate-x-5" />
            </div>
          </label>
        ) : (
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {enabled ? 'Ativo' : 'Inativo'}
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="relative">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-16 text-sm font-bold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-500 dark:focus:ring-indigo-900/30"
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-wide text-slate-400">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

export function Step6Rules({ onNext, onPrev, onMarkValid }: Step6Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [pickupMinMinutes, setPickupMinMinutes] = useState(20);
  const [pickupMaxMinutes, setPickupMaxMinutes] = useState(30);
  const [schedulingEnabled, setSchedulingEnabled] = useState(false);
  const [allowScheduleWhenClosed, setAllowScheduleWhenClosed] = useState(false);
  const [minimumAdvanceHours, setMinimumAdvanceHours] = useState(1);
  const [maximumAdvanceDays, setMaximumAdvanceDays] = useState(7);
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30);
  const [maxOrdersPerSlot, setMaxOrdersPerSlot] = useState(5);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const [tenantRes, schedulingRes, coverageRes] = await Promise.all([
          api.get<TenantMeResponse>('/tenant/me'),
          api.get<TenantSchedulingSettings>('/scheduling/settings').catch(() => ({ success: true, data: null })),
          api.get<DeliveryCoverageResponse>('/delivery/coverage').catch(() => ({ success: true, data: null })),
        ]);

        if (!mounted) return;

        const tenantSettings = tenantRes.success ? tenantRes.data?.settings : undefined;
        const scheduling = schedulingRes.success ? schedulingRes.data : null;
        const coverage = coverageRes.success ? coverageRes.data : null;

        setPickupEnabled(Boolean(tenantSettings?.pickupEnabled));
        setPickupMinMinutes(tenantSettings?.pickupMinMinutes ?? 20);
        setPickupMaxMinutes(tenantSettings?.pickupMaxMinutes ?? 30);
        setSchedulingEnabled(Boolean(scheduling?.enabled && scheduling?.acceptScheduledOrders));
        setAllowScheduleWhenClosed(Boolean(scheduling?.allowScheduleWhenClosed));
        setMinimumAdvanceHours(Math.max(1, Math.ceil((scheduling?.minimumAdvanceMinutes ?? 60) / 60)));
        setMaximumAdvanceDays(scheduling?.maximumAdvanceDays ?? 7);
        setSlotIntervalMinutes(scheduling?.slotIntervalMinutes ?? 30);
        setMaxOrdersPerSlot(scheduling?.maxOrdersPerSlot ?? 5);
        setDeliveryEnabled(
          Boolean(
            coverage?.isDeliveryEnabled &&
            Number(coverage?.maxRadiusKm ?? 0) > 0 &&
            Number(coverage?.defaultPricePerKm ?? 0) >= 0 &&
            hasRealCoordinates(tenantSettings?.lat ?? null, tenantSettings?.lng ?? null),
          ),
        );
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof ApiError ? err.message : 'Nao foi possivel carregar os modos de pedido.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const pickupConfigValid =
    !pickupEnabled || (pickupMinMinutes > 0 && pickupMaxMinutes > 0 && pickupMinMinutes <= pickupMaxMinutes);

  const schedulingConfigValid =
    !schedulingEnabled ||
    (minimumAdvanceHours > 0 &&
      maximumAdvanceDays >= 1 &&
      slotIntervalMinutes >= 1 &&
      maxOrdersPerSlot >= 1);

  const hasOperationalMode = deliveryEnabled || pickupEnabled;
  const isStepValid = hasOperationalMode && pickupConfigValid && schedulingConfigValid;

  const validationMessage = useMemo(() => {
    if (!hasOperationalMode) {
      return 'Ative retirada ou finalize uma area de entrega valida para continuar.';
    }

    if (!pickupConfigValid) {
      return 'Revise o tempo minimo e maximo da retirada.';
    }

    if (!schedulingConfigValid) {
      return 'Revise as regras de agendamento antes de continuar.';
    }

    return '';
  }, [hasOperationalMode, pickupConfigValid, schedulingConfigValid]);

  useEffect(() => {
    onMarkValid(isStepValid);
  }, [isStepValid, onMarkValid]);

  const handleNext = () => {
    if (!isStepValid) {
      setError(validationMessage);
      return;
    }

    setError('');

    onNext(async () => {
      await Promise.all([
        api.patch('/tenant/settings', {
          pickupEnabled,
          pickupMinMinutes,
          pickupMaxMinutes,
        }),
        api.put('/scheduling/settings', {
          enabled: schedulingEnabled,
          acceptScheduledOrders: schedulingEnabled,
          allowScheduleWhenClosed,
          minimumAdvanceMinutes: minimumAdvanceHours * 60,
          maximumAdvanceDays,
          slotIntervalMinutes,
          maxOrdersPerSlot,
        }),
      ]);
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando modos de pedido...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-2 text-center">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 dark:bg-teal-900/40">
          <Store className="h-7 w-7 text-teal-600 dark:text-teal-300" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Modos de pedido aceitos pela sua loja</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Defina como o cliente pode comprar agora e o que ainda fica para depois.
        </p>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
          <p className="text-xs leading-relaxed text-indigo-700 dark:text-indigo-300">
            A entrega por raio ja foi configurada no passo anterior. Aqui nos concentramos em
            retirada, agendamento e no que a vitrine publica pode prometer com seguranca.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <ToggleCard
          title="Entrega"
          description={
            deliveryEnabled
              ? 'Sua area de entrega valida ja esta ativa e sera exibida no checkout.'
              : 'Ainda nao existe uma area de entrega valida publicada para esta loja.'
          }
          enabled={deliveryEnabled}
          disabled
          badge={deliveryEnabled ? 'Configurado' : 'Configure no passo de entrega'}
          icon={MapPin}
        />

        <ToggleCard
          title="Retirada no local"
          description="Permite que o cliente compre online e retire na loja."
          enabled={pickupEnabled}
          icon={Bike}
          onChange={setPickupEnabled}
        />

        {pickupEnabled ? (
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40 md:grid-cols-2">
            <NumberField
              label="Tempo minimo para retirada"
              value={pickupMinMinutes}
              min={1}
              suffix="min"
              onChange={setPickupMinMinutes}
            />
            <NumberField
              label="Tempo maximo para retirada"
              value={pickupMaxMinutes}
              min={1}
              suffix="min"
              onChange={setPickupMaxMinutes}
            />
          </div>
        ) : null}

        <ToggleCard
          title="Agendamento"
          description="Permite pedidos futuros com horario escolhido pelo cliente."
          enabled={schedulingEnabled}
          icon={CalendarClock}
          onChange={setSchedulingEnabled}
        />

        {schedulingEnabled ? (
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40 md:grid-cols-2">
            <NumberField
              label="Antecedencia minima"
              value={minimumAdvanceHours}
              min={1}
              suffix="horas"
              onChange={setMinimumAdvanceHours}
            />
            <NumberField
              label="Maximo de dias para frente"
              value={maximumAdvanceDays}
              min={1}
              suffix="dias"
              onChange={setMaximumAdvanceDays}
            />
            <NumberField
              label="Intervalo entre slots"
              value={slotIntervalMinutes}
              min={1}
              suffix="min"
              onChange={setSlotIntervalMinutes}
            />
            <NumberField
              label="Capacidade por slot"
              value={maxOrdersPerSlot}
              min={1}
              onChange={setMaxOrdersPerSlot}
            />

            <div className="md:col-span-2">
              <ToggleCard
                title="Aceitar agendamentos com a loja fechada"
                description="Quando desligado, o cliente so consegue agendar se a loja estiver aberta no momento do pedido."
                enabled={allowScheduleWhenClosed}
                icon={CheckCircle2}
                onChange={setAllowScheduleWhenClosed}
              />
            </div>
          </div>
        ) : null}

        <ToggleCard
          title="Consumo no local"
          description="Ainda nao vamos prometer essa experiencia na vitrine publica ate o fluxo completo estar pronto."
          enabled={false}
          disabled
          badge="Em breve"
          icon={Store}
        />
      </div>

      {!hasOperationalMode ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
            Ative a retirada ou configure uma entrega valida para concluir o onboarding com um modo operacional real.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          onClick={onPrev}
          className="flex-1 rounded-2xl bg-slate-100 py-4 text-sm font-black text-slate-700 transition-all hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          ← Voltar
        </button>
        <button
          onClick={handleNext}
          className="flex-[2] rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-700"
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}
