import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Navigation, Save, Truck } from 'lucide-react';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { Tenant } from '@gestor/types';
import { CurrencyInput } from '@gestor/ui';
import { api, ApiError } from '@/lib/api-client';
import { DeliveryMapCanvas } from './DeliveryMapCanvas';
import { DeliveryTestPanel } from './DeliveryTestPanel';
import { RadiusTiersPanel } from './RadiusTiersPanel';
import { SpecialAreasPanel } from './SpecialAreasPanel';
import { defaultZoneColor, fmtMoney, hydrateSpecialArea, parseDecimalString, validateTierDrafts, zoneColorPreset } from './helpers';
import type { CoverageConfig, DeliveryRateRule, DeliveryTestResult, SpecialAreaDraft, TierDraft } from './types';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isDesktop;
}

function latLngsToCoords(latLngs: readonly L.LatLng[]) {
  return latLngs.map((point) => [point.lng, point.lat] as const);
}

function emptyTier(minDistanceKm = 0, maxDistanceKm = 2): TierDraft {
  return {
    minDistanceKm,
    maxDistanceKm,
    fee: 0,
    estimatedDeliveryMinutes: 30,
  };
}

function emptySpecialArea(): SpecialAreaDraft {
  return {
    id: null,
    name: '',
    color: defaultZoneColor(),
    zoneKind: 'custom_zone',
    pricingMode: 'fixed',
    fixedFee: 15,
    pricePerKm: null,
    estimatedDeliveryMinutes: 45,
    polygonCoordinates: null,
  };
}

export function DeliveryRatesPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savingArea, setSavingArea] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [coverageDraft, setCoverageDraft] = useState({
    isDeliveryEnabled: true,
    storeLat: -23.55052,
    storeLng: -46.633308,
    maxRadiusKm: 8,
    defaultPricePerKm: 2.5,
    minimumFee: null as number | null,
    maximumFee: null as number | null,
    defaultEstimatedDeliveryMinutes: 45,
  });

  const [globalDistanceRuleId, setGlobalDistanceRuleId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [tierForm, setTierForm] = useState<TierDraft>(emptyTier());
  const [editingTierIndex, setEditingTierIndex] = useState<number | null>(null);
  const [tierError, setTierError] = useState<string | null>(null);

  const [areas, setAreas] = useState<DeliveryRateRule[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [highlightedZoneId, setHighlightedZoneId] = useState<string | null>(null);
  const [areaDraft, setAreaDraft] = useState<SpecialAreaDraft>(emptySpecialArea());
  const [areaError, setAreaError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<L.LatLng[]>([]);

  const [testQuery, setTestQuery] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<DeliveryTestResult | null>(null);

  const storeAddressLabel = useMemo(() => {
    const settings = tenant?.settings;
    if (!settings) return 'Configure o endereço da loja';
    if (settings.street && settings.number) {
      const parts = [`${settings.street}, ${settings.number}`];
      if (settings.neighborhood) parts.push(settings.neighborhood);
      if (settings.city || settings.state) parts.push([settings.city, settings.state].filter(Boolean).join('/'));
      return parts.join(' • ');
    }
    return 'Configure o endereço da loja';
  }, [tenant]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [coverageRes, rulesRes, tenantRes] = await Promise.all([
        api.get<CoverageConfig | null>('/delivery/coverage'),
        api.get<DeliveryRateRule[]>('/delivery/rates'),
        api.get<Tenant>('/tenant/me'),
      ]);

      const cfg = coverageRes.data ?? null;
      setTenant(tenantRes.data ?? null);

      const effectiveStoreLat = tenantRes.data?.settings?.lat ?? cfg?.storeLat ?? -23.55052;
      const effectiveStoreLng = tenantRes.data?.settings?.lng ?? cfg?.storeLng ?? -46.633308;

      if (cfg) {
        setCoverageDraft({
          isDeliveryEnabled: cfg.isDeliveryEnabled,
          storeLat: effectiveStoreLat,
          storeLng: effectiveStoreLng,
          maxRadiusKm: Number(cfg.maxRadiusKm),
          defaultPricePerKm: Number(cfg.defaultPricePerKm),
          minimumFee: parseDecimalString(cfg.minimumFee),
          maximumFee: parseDecimalString(cfg.maximumFee),
          defaultEstimatedDeliveryMinutes: cfg.defaultEstimatedDeliveryMinutes ?? 45,
        });
      } else if (tenantRes.data?.settings?.lat && tenantRes.data?.settings?.lng) {
        setCoverageDraft((prev) => ({
          ...prev,
          storeLat: effectiveStoreLat,
          storeLng: effectiveStoreLng,
        }));
      }

      const allRules = rulesRes.data ?? [];
      const distanceRule = allRules.find((rule) => rule.type === 'distance' && rule.pricingMode === 'tiers') ?? null;
      setGlobalDistanceRuleId(distanceRule?.id ?? null);
      setTiers(
        (distanceRule?.distanceTiers ?? []).map((tier) => ({
          id: tier.id,
          minDistanceKm: Number(tier.minDistanceKm),
          maxDistanceKm: Number(tier.maxDistanceKm),
          fee: Number(tier.fee),
          estimatedDeliveryMinutes: tier.estimatedDeliveryMinutes ?? 45,
        })),
      );

      const polygonAreas = allRules
        .filter((rule) => rule.type === 'polygon')
        .sort((a, b) => a.priority - b.priority);
      setAreas(polygonAreas);
      setSelectedZoneId((current) => current ?? polygonAreas[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar as configurações de entrega.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleSaveAll = useCallback(async () => {
    setSavingAll(true);
    setError(null);

    const tierValidation = validateTierDrafts(tiers);
    if (tierValidation) {
      setSavingAll(false);
      setTierError(tierValidation);
      return;
    }

    try {
      await api.put('/delivery/coverage', {
        storeLat: coverageDraft.storeLat,
        storeLng: coverageDraft.storeLng,
        maxRadiusKm: coverageDraft.maxRadiusKm,
        defaultPricePerKm: coverageDraft.defaultPricePerKm,
        minimumFee: coverageDraft.minimumFee ?? undefined,
        maximumFee: coverageDraft.maximumFee ?? undefined,
        defaultEstimatedDeliveryMinutes: coverageDraft.defaultEstimatedDeliveryMinutes,
        isDeliveryEnabled: coverageDraft.isDeliveryEnabled,
      });

      const tierPayload = {
        type: 'distance' as const,
        isActive: true,
        priority: 500,
        isFallback: false,
        pricingMode: 'tiers' as const,
        name: 'Faixas principais de entrega',
        estimatedDeliveryMinutes: coverageDraft.defaultEstimatedDeliveryMinutes,
        distanceTiers: tiers.map((tier, index) => ({
          id: tier.id,
          minDistanceKm: tier.minDistanceKm,
          maxDistanceKm: tier.maxDistanceKm,
          fee: tier.fee,
          estimatedDeliveryMinutes: tier.estimatedDeliveryMinutes,
          sortOrder: index,
        })),
      };

      if (globalDistanceRuleId) {
        await api.put(`/delivery/rates/${globalDistanceRuleId}`, tierPayload);
      } else {
        await api.post('/delivery/rates', tierPayload);
      }

      setToast('Configurações salvas');
      await fetchAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar as configurações.');
    } finally {
      setSavingAll(false);
    }
  }, [coverageDraft, fetchAll, globalDistanceRuleId, tiers]);

  const handleStartAddTier = useCallback(() => {
    const last = tiers[tiers.length - 1];
    const nextMin = last ? last.maxDistanceKm : 0;
    setTierForm(emptyTier(nextMin, nextMin + 2));
    setEditingTierIndex(null);
    setTierError(null);
  }, [tiers]);

  const handleStartEditTier = useCallback((index: number) => {
    setTierForm(tiers[index]);
    setEditingTierIndex(index);
    setTierError(null);
  }, [tiers]);

  const handleSaveTier = useCallback(() => {
    const nextTiers = [...tiers];
    if (editingTierIndex == null) {
      nextTiers.push(tierForm);
    } else {
      nextTiers[editingTierIndex] = tierForm;
    }

    const validation = validateTierDrafts(nextTiers);
    if (validation) {
      setTierError(validation);
      return;
    }

    const sorted = [...nextTiers].sort((a, b) => a.minDistanceKm - b.minDistanceKm);
    setTiers(sorted);
    setTierForm(emptyTier());
    setEditingTierIndex(null);
    setTierError(null);
  }, [editingTierIndex, tierForm, tiers]);

  const handleRemoveTier = useCallback((index: number) => {
    setTiers((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const beginAreaDraft = useCallback((mode: 'fixed' | 'distance' | 'free' | 'blocked') => {
    setAreaError(null);
    setTestResult(null);
    setDrawing(true);
    setDraftPoints([]);
    setSelectedZoneId(null);
    setAreaDraft({
      ...emptySpecialArea(),
      color: zoneColorPreset(mode === 'blocked' ? 'blocked_zone' : 'custom_zone', mode === 'blocked' ? 'fixed' : mode),
      zoneKind: mode === 'blocked' ? 'blocked_zone' : 'custom_zone',
      pricingMode: mode === 'blocked' ? 'fixed' : mode,
      fixedFee: mode === 'fixed' ? 15 : null,
      pricePerKm: mode === 'distance' ? 2.5 : null,
      estimatedDeliveryMinutes: mode === 'blocked' ? 45 : 45,
    });
  }, []);

  const handleFinishDrawing = useCallback(() => {
    if (draftPoints.length < 3) {
      setAreaError('Desenhe pelo menos 3 pontos no mapa para criar a área.');
      return;
    }
    setAreaDraft((prev) => ({ ...prev, polygonCoordinates: latLngsToCoords(draftPoints) }));
    setDrawing(false);
    setDraftPoints([]);
    setAreaError(null);
  }, [draftPoints]);

  const handleEditArea = useCallback((rule: DeliveryRateRule) => {
    setDrawing(false);
    setDraftPoints([]);
    setSelectedZoneId(rule.id);
    setAreaDraft(hydrateSpecialArea(rule));
    setAreaError(null);
  }, []);

  const handleCancelArea = useCallback(() => {
    setAreaDraft(emptySpecialArea());
    setAreaError(null);
    setDrawing(false);
    setDraftPoints([]);
    setSelectedZoneId(null);
  }, []);

  const handleSaveArea = useCallback(async () => {
    if (!areaDraft.polygonCoordinates || areaDraft.polygonCoordinates.length < 3) {
      setAreaError('Desenhe a área no mapa antes de salvar.');
      return;
    }
    if (!areaDraft.name.trim()) {
      setAreaError('Dê um nome para a área.');
      return;
    }
    if (areaDraft.zoneKind !== 'blocked_zone' && areaDraft.pricingMode !== 'free') {
      if (areaDraft.pricingMode === 'fixed' && (areaDraft.fixedFee == null || areaDraft.fixedFee < 0)) {
        setAreaError('Informe um valor fixo válido para a área.');
        return;
      }
      if (areaDraft.pricingMode === 'distance' && (areaDraft.pricePerKm == null || areaDraft.pricePerKm < 0)) {
        setAreaError('Informe um valor por km válido para a área.');
        return;
      }
    }
    if (areaDraft.zoneKind !== 'blocked_zone' && areaDraft.estimatedDeliveryMinutes <= 0) {
      setAreaError('Informe um tempo estimado válido para a área.');
      return;
    }

    setSavingArea(true);
    setAreaError(null);
    try {
      const payload = {
        type: 'polygon' as const,
        isActive: true,
        priority: areaDraft.zoneKind === 'blocked_zone' ? 50 : 200,
        isFallback: false,
        name: areaDraft.name.trim(),
        color: areaDraft.color,
        zoneKind: areaDraft.zoneKind,
        pricingMode: areaDraft.zoneKind === 'blocked_zone' ? 'fixed' : areaDraft.pricingMode,
        blocksDelivery: areaDraft.zoneKind === 'blocked_zone',
        polygonCoordinates: areaDraft.polygonCoordinates,
        geoJson: {
          type: 'Feature',
          properties: { name: areaDraft.name.trim(), color: areaDraft.color },
          geometry: { type: 'Polygon', coordinates: [areaDraft.polygonCoordinates] },
        },
        fixedFee:
          areaDraft.zoneKind !== 'blocked_zone' && areaDraft.pricingMode === 'fixed'
            ? areaDraft.fixedFee ?? undefined
            : undefined,
        fixedRate:
          areaDraft.zoneKind !== 'blocked_zone' && areaDraft.pricingMode === 'fixed'
            ? areaDraft.fixedFee ?? undefined
            : undefined,
        pricePerKm:
          areaDraft.zoneKind !== 'blocked_zone' && areaDraft.pricingMode === 'distance'
            ? areaDraft.pricePerKm ?? undefined
            : undefined,
        ratePerKm:
          areaDraft.zoneKind !== 'blocked_zone' && areaDraft.pricingMode === 'distance'
            ? areaDraft.pricePerKm ?? undefined
            : undefined,
        rate: areaDraft.pricingMode === 'free' ? 0 : undefined,
        estimatedDeliveryMinutes:
          areaDraft.zoneKind === 'blocked_zone' ? undefined : areaDraft.estimatedDeliveryMinutes,
      };

      if (areaDraft.id) {
        await api.put(`/delivery/rates/${areaDraft.id}`, payload);
      } else {
        await api.post('/delivery/rates', payload);
      }

      setToast('Área especial salva');
      handleCancelArea();
      await fetchAll();
    } catch (err) {
      setAreaError(err instanceof ApiError ? err.message : 'Erro ao salvar a área especial.');
    } finally {
      setSavingArea(false);
    }
  }, [areaDraft, fetchAll, handleCancelArea]);

  const handleDeleteArea = useCallback(async (rule: DeliveryRateRule) => {
    if (!window.confirm(`Remover a área "${rule.name || 'Área especial'}"?`)) return;
    try {
      await api.delete(`/delivery/rates/${rule.id}`);
      setToast('Área removida');
      if (selectedZoneId === rule.id) setSelectedZoneId(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover a área especial.');
    }
  }, [fetchAll, selectedZoneId]);

  const handleRunTest = useCallback(async () => {
    if (!testQuery.trim()) {
      setTestError('Digite um endereço ou CEP para testar.');
      return;
    }
    setTestLoading(true);
    setTestError(null);
    try {
      const response = await api.post<DeliveryTestResult>('/delivery/rates/test-current', { query: testQuery.trim() });
      setTestResult(response.data);
      setHighlightedZoneId(response.data?.matchedZoneId ?? null);
    } catch (err) {
      setTestResult(null);
      setHighlightedZoneId(null);
      setTestError(err instanceof ApiError ? err.message : 'Erro ao testar a entrega.');
    } finally {
      setTestLoading(false);
    }
  }, [testQuery]);

  const summaryAreasCount = areas.length;
  const summaryMaxRadius = tiers.length > 0 ? Math.max(...tiers.map((tier) => tier.maxDistanceKm)) : coverageDraft.maxRadiusKm;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="rounded-3xl border border-border bg-card px-6 py-5 text-sm font-semibold text-muted-foreground shadow-sm">
          Carregando entrega...
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] bg-background text-foreground">
      {toast ? (
        <div className="fixed right-6 top-20 z-[9999] rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-background shadow-xl">
          {toast}
        </div>
      ) : null}

      {isDesktop ? (
        <div className="flex h-full">
          <div className="flex-1">
            <DeliveryMapCanvas
              storePosition={[coverageDraft.storeLat, coverageDraft.storeLng]}
              maxRadiusKm={summaryMaxRadius}
              tiers={tiers}
              visibleZones={areas}
              selectedZoneId={selectedZoneId}
              highlightedZoneId={highlightedZoneId}
              onSelectZone={setSelectedZoneId}
              drawing={drawing}
              draftPoints={draftPoints}
              setDraftPoints={setDraftPoints}
              editingPolygon={areaDraft.polygonCoordinates}
              onPolygonChange={(coords) => setAreaDraft((prev) => ({ ...prev, polygonCoordinates: coords }))}
              editingColor={areaDraft.color}
            />
          </div>

          <aside className="flex h-full w-[460px] flex-col border-l border-border bg-card">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black text-foreground">Entrega</h1>
                  <p className="mt-2 text-sm text-slate-500">Configure onde sua loja entrega e quanto será cobrado.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveAll()}
                  disabled={savingAll}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-500 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingAll ? 'Salvando...' : 'Salvar configurações'}
                </button>
              </div>

              {error ? <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{error}</div> : null}

              <div className="mt-6 rounded-3xl border border-border bg-muted/40 p-5">
                <div className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">Loja / ponto de partida</div>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <div className="text-sm text-muted-foreground">
                    <div className="font-semibold text-foreground">{storeAddressLabel}</div>
                    <div className="mt-1">
                      {coverageDraft.storeLat.toFixed(5)}, {coverageDraft.storeLng.toFixed(5)}
                    </div>
                  </div>
                  <button type="button" onClick={() => navigate('/settings')} className="text-sm font-bold text-blue-600 hover:text-blue-500">
                    Alterar endereço
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-border bg-muted/40 p-5">
                <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Forma de cálculo</div>
                <div className="mt-4 space-y-3">
                  <label className="block space-y-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Truck className="h-4 w-4 text-primary" />
                      Forma de cÃ¡lculo
                    </span>
                    <select value="radius" disabled className="input-premium cursor-not-allowed">
                      <option value="radius">Entrega por raio — recomendado</option>
                      <option value="route">Entrega por rota — em breve / premium</option>
                      <option value="neighborhood">Entrega por bairro — futuro</option>
                    </select>
                  </label>
                  <p className="text-xs font-semibold text-muted-foreground">
                    As opÃ§Ãµes por rota e bairro continuam reservadas para evoluÃ§Ãµes futuras.
                  </p>
                </div>
                <div className="hidden mt-4 space-y-3">
                  <div className="rounded-2xl border border-blue-500 bg-blue-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-blue-700">
                      <Truck className="h-4 w-4" />
                      Entrega por raio
                    </div>
                    <div className="mt-1 text-sm text-blue-900">Recomendado</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 opacity-70">
                    <div className="text-sm font-black text-slate-700">Entrega por rota</div>
                    <div className="mt-1 text-sm text-slate-500">Em breve / Premium</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 opacity-70">
                    <div className="text-sm font-black text-slate-700">Entrega por bairro</div>
                    <div className="mt-1 text-sm text-slate-500">Futuro</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-border bg-muted/40 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Entrega ativa</span>
                    <button
                      type="button"
                      onClick={() => setCoverageDraft((prev) => ({ ...prev, isDeliveryEnabled: !prev.isDeliveryEnabled }))}
                      className={
                        'relative inline-flex h-11 w-full items-center rounded-2xl px-4 text-left text-sm font-bold transition ' +
                        (coverageDraft.isDeliveryEnabled ? 'bg-blue-600 text-white' : 'bg-muted text-foreground')
                      }
                    >
                      {coverageDraft.isDeliveryEnabled ? 'Ligada' : 'Desligada'}
                    </button>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Raio máximo (km)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={coverageDraft.maxRadiusKm}
                      onChange={(event) => setCoverageDraft((prev) => ({ ...prev, maxRadiusKm: Number(event.target.value) }))}
                      className="input-premium"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Preço padrão por km</span>
                    <CurrencyInput
                      value={coverageDraft.defaultPricePerKm}
                      onChange={(value) => setCoverageDraft((prev) => ({ ...prev, defaultPricePerKm: value }))}
                      className="input-premium"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Tempo padrão (min)</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={coverageDraft.defaultEstimatedDeliveryMinutes}
                      onChange={(event) =>
                        setCoverageDraft((prev) => ({ ...prev, defaultEstimatedDeliveryMinutes: Number(event.target.value) }))
                      }
                      className="input-premium"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Taxa mínima</span>
                    <CurrencyInput
                      value={coverageDraft.minimumFee ?? 0}
                      onChange={(value) => setCoverageDraft((prev) => ({ ...prev, minimumFee: value }))}
                      className="input-premium"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Taxa máxima</span>
                    <CurrencyInput
                      value={coverageDraft.maximumFee ?? 0}
                      onChange={(value) => setCoverageDraft((prev) => ({ ...prev, maximumFee: value }))}
                      className="input-premium"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-6">
                <RadiusTiersPanel
                  tiers={tiers}
                  tierForm={tierForm}
                  editingIndex={editingTierIndex}
                  error={tierError}
                  onTierFormChange={setTierForm}
                  onStartAdd={handleStartAddTier}
                  onStartEdit={handleStartEditTier}
                  onRemove={handleRemoveTier}
                  onSave={handleSaveTier}
                  onCancel={() => {
                    setTierForm(emptyTier());
                    setEditingTierIndex(null);
                    setTierError(null);
                  }}
                />
              </div>

              <div className="mt-6">
                <SpecialAreasPanel
                  areas={areas}
                  isDesktop
                  drawing={drawing}
                  draftPointCount={draftPoints.length}
                  areaDraft={areaDraft}
                  areaError={savingArea ? 'Salvando área...' : areaError}
                  onAreaDraftChange={setAreaDraft}
                  onCreateSpecialFee={() => beginAreaDraft('fixed')}
                  onCreateBlocked={() => beginAreaDraft('blocked')}
                  onCreateFree={() => beginAreaDraft('free')}
                  onUndoPoint={() => setDraftPoints((prev) => prev.slice(0, -1))}
                  onClearDrawing={() => setDraftPoints([])}
                  onFinishDrawing={handleFinishDrawing}
                  onEditArea={handleEditArea}
                  onDeleteArea={handleDeleteArea}
                  onSaveArea={() => void handleSaveArea()}
                  onCancelArea={handleCancelArea}
                />
              </div>

              <div className="mt-6">
                <DeliveryTestPanel
                  query={testQuery}
                  loading={testLoading}
                  error={testError}
                  result={testResult}
                  onQueryChange={setTestQuery}
                  onSubmit={() => void handleRunTest()}
                />
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="h-full overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl space-y-4 pb-12">
            <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-200">Entrega</div>
              <div className="mt-2 text-2xl font-black">Resumo rápido</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-blue-100">Status</div>
                  <div className="mt-2 text-sm font-bold">{coverageDraft.isDeliveryEnabled ? 'Entrega ativa' : 'Entrega desligada'}</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-blue-100">Modelo</div>
                  <div className="mt-2 text-sm font-bold">Por raio</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-blue-100">Raio máximo</div>
                  <div className="mt-2 text-sm font-bold">{summaryMaxRadius} km</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleSaveAll()}
                disabled={savingAll}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950"
              >
                <Save className="h-4 w-4" />
                {savingAll ? 'Salvando...' : 'Salvar configurações'}
              </button>
            </div>

            {error ? <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{error}</div> : null}

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                <MapPin className="h-4 w-4" />
                Loja / ponto de partida
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{storeAddressLabel}</div>
              <button type="button" onClick={() => navigate('/settings')} className="mt-3 text-sm font-bold text-blue-600">
                Alterar endereço
              </button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Forma de cálculo</div>
              <div className="mt-3 rounded-2xl border border-blue-500 bg-blue-50 p-4 text-sm font-bold text-blue-700">
                Entrega por raio • Recomendado
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Configuração básica</div>
              <div className="mt-4 grid gap-4">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Entrega ativa</span>
                  <button
                    type="button"
                    onClick={() => setCoverageDraft((prev) => ({ ...prev, isDeliveryEnabled: !prev.isDeliveryEnabled }))}
                    className={
                      'relative inline-flex h-11 w-full items-center rounded-2xl px-4 text-left text-sm font-bold transition ' +
                      (coverageDraft.isDeliveryEnabled ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700')
                    }
                  >
                    {coverageDraft.isDeliveryEnabled ? 'Ligada' : 'Desligada'}
                  </button>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Raio máximo (km)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={coverageDraft.maxRadiusKm}
                    onChange={(event) => setCoverageDraft((prev) => ({ ...prev, maxRadiusKm: Number(event.target.value) }))}
                    className="input-premium"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Preço padrão por km</span>
                  <CurrencyInput
                    value={coverageDraft.defaultPricePerKm}
                    onChange={(value) => setCoverageDraft((prev) => ({ ...prev, defaultPricePerKm: value }))}
                    className="input-premium"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Tempo padrão (min)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={coverageDraft.defaultEstimatedDeliveryMinutes}
                    onChange={(event) =>
                      setCoverageDraft((prev) => ({ ...prev, defaultEstimatedDeliveryMinutes: Number(event.target.value) }))
                    }
                    className="input-premium"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <RadiusTiersPanel
                tiers={tiers}
                tierForm={tierForm}
                editingIndex={editingTierIndex}
                error={tierError}
                onTierFormChange={setTierForm}
                onStartAdd={handleStartAddTier}
                onStartEdit={handleStartEditTier}
                onRemove={handleRemoveTier}
                onSave={handleSaveTier}
                onCancel={() => {
                  setTierForm(emptyTier());
                  setEditingTierIndex(null);
                  setTierError(null);
                }}
              />
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Áreas especiais</div>
              <div className="mt-3 text-sm text-slate-600">
                Existem {summaryAreasCount} áreas criadas. Para desenhar ou editar áreas no mapa, recomendamos usar um computador.
              </div>
              <div className="mt-4 space-y-3">
                {areas.map((area) => (
                  <div key={area.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-black text-slate-900">{area.name || 'Área especial'}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {area.zoneKind === 'blocked_zone'
                        ? 'Área bloqueada'
                        : `${area.pricingMode === 'free' ? 'Entrega grátis' : area.pricingMode === 'distance' ? 'Cobrança por km' : `Taxa ${fmtMoney(Number(area.fixedFee ?? area.fixedRate ?? 0))}`} • ${area.estimatedDeliveryMinutes ?? coverageDraft.defaultEstimatedDeliveryMinutes} min`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DeliveryTestPanel
              query={testQuery}
              loading={testLoading}
              error={testError}
              result={testResult}
              onQueryChange={setTestQuery}
              onSubmit={() => void handleRunTest()}
            />

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                <Navigation className="h-4 w-4" />
                Mapa no desktop
              </div>
              <div className="mt-2 text-sm text-slate-600">
                No computador, o mapa fica sempre visível para desenhar áreas especiais e visualizar sua cobertura.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeliveryRatesPage;
