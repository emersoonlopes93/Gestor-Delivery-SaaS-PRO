import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, Polygon, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import { Check, ChevronDown, ChevronUp, Crosshair, Loader2, LocateFixed, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import type { LatLngExpression } from 'leaflet';

type CoverageConfig = {
  id: string;
  tenantId: string;
  storeLat: number;
  storeLng: number;
  maxRadiusKm: string;
  defaultPricePerKm: string;
  minimumFee: string | null;
  maximumFee: string | null;
  isDeliveryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type DeliveryZoneKind = 'blocked_zone' | 'custom_zone';
type DeliveryPricingMode = 'fixed' | 'distance' | 'free';

type PolygonCoordinates = ReadonlyArray<readonly [number, number]>; // [[lng,lat],...]

type DeliveryRateRuleType = 'neighborhood' | 'distance' | 'fixed' | 'polygon';

type DeliveryRuleGeoJson = {
  type: string;
  properties?: {
    name?: string;
    color?: string;
  };
  geometry?: {
    type: string;
    coordinates: unknown;
  };
};

type DeliveryRateRule = {
  id: string;
  type: DeliveryRateRuleType;
  priority: number;
  isFallback: boolean;
  isActive: boolean;

  neighborhood: string | null;
  rate: string | null;
  minKm: string | null;
  maxKm: string | null;
  ratePerKm: string | null;
  fixedRate: string | null;

  geoJson: DeliveryRuleGeoJson | null;
  polygonCoordinates: unknown[] | null;

  name: string | null;
  color: string | null;
  zoneKind: DeliveryZoneKind | null;
  pricingMode: DeliveryPricingMode | null;
  fixedFee: string | null;
  pricePerKm: string | null;
  blocksDelivery: boolean;

  createdAt: string;
  updatedAt: string;
};

type ZoneForm = {
  id: string | null;
  name: string;
  color: string;
  isActive: boolean;
  priority: number;
  zoneKind: DeliveryZoneKind;
  pricingMode: DeliveryPricingMode;
  blocksDelivery: boolean;
  fixedFee: number | null;
  pricePerKm: number | null;
  polygonCoordinates: PolygonCoordinates | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function normalizePolygonCoordinates(value: unknown): PolygonCoordinates | null {
  if (!Array.isArray(value)) return null;
  const out: Array<readonly [number, number]> = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const lng = item[0];
    const lat = item[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    out.push([lng, lat] as const);
  }
  return out;
}

function coordsToLatLngs(coords: PolygonCoordinates): LatLngExpression[] {
  return coords.map(([lng, lat]) => [lat, lng] as LatLngExpression);
}

function latLngsToCoords(latLngs: readonly L.LatLng[]): PolygonCoordinates {
  const out: Array<readonly [number, number]> = [];
  for (const p of latLngs) out.push([p.lng, p.lat] as const);
  return out;
}

function ensureRingClosed(points: PolygonCoordinates): PolygonCoordinates {
  if (points.length === 0) return points;
  const [flng, flat] = points[0];
  const [llng, llat] = points[points.length - 1];
  if (flng === llng && flat === llat) return points;
  return [...points, [flng, flat] as const];
}

function defaultZoneColor(): string {
  return '#2563eb';
}

function zoneColorPreset(zoneKind: DeliveryZoneKind, pricingMode: DeliveryPricingMode): string {
  if (zoneKind === 'blocked_zone') return '#ef4444';
  if (pricingMode === 'free') return '#16a34a';
  if (pricingMode === 'fixed' || pricingMode === 'distance') return '#f59e0b';
  return defaultZoneColor();
}

function zoneLabel(zone: DeliveryRateRule): string {
  if (zone.type !== 'polygon') return 'Regra';
  const name = zone.name ?? (zone.geoJson?.properties?.name ?? null);
  return name && name.trim() !== '' ? name : 'Zona sem nome';
}

function kindLabel(kind: DeliveryZoneKind | null): string {
  if (kind === 'blocked_zone') return 'Área bloqueada';
  return 'Zona personalizada';
}

function pricingLabel(mode: DeliveryPricingMode | null): string {
  if (mode === 'free') return 'Entrega grátis';
  if (mode === 'distance') return 'Cobrança por km';
  return 'Cobrança fixa';
}

function fmtMoney(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `R$ ${v.toFixed(2)}`;
}

function parseDecimalString(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const MapImperative = memo(function MapImperative(props: {
  storePosition: LatLngExpression;
  fitToStoreSeq: number;
}) {
  const { storePosition, fitToStoreSeq } = props;
  const map = useMap();

  useEffect(() => {
    if (fitToStoreSeq <= 0) return;
    map.setView(storePosition, Math.max(map.getZoom(), 14), { animate: true });
  }, [fitToStoreSeq, map, storePosition]);

  return null;
});

type DrawMode = 'idle' | 'drawing';

const ZoneDrawLayer = memo(function ZoneDrawLayer(props: {
  mode: DrawMode;
  color: string;
  seedPolygon: PolygonCoordinates | null;
  onPolygonChange: (coords: PolygonCoordinates | null) => void;
}) {
  const { mode, color, seedPolygon, onPolygonChange } = props;
  const map = useMap();
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const drawRef = useRef<L.Draw.Polygon | null>(null);

  const clearLayers = useCallback(() => {
    if (!featureGroupRef.current) return;
    featureGroupRef.current.clearLayers();
  }, []);

  useEffect(() => {
    const fg = new L.FeatureGroup();
    featureGroupRef.current = fg;
    map.addLayer(fg);

    const handleCreated = (e: L.LeafletEvent) => {
      if (!isRecord(e)) return;
      const layer = e['layer'];
      if (!(layer instanceof L.Polygon)) return;
      fg.clearLayers();
      fg.addLayer(layer);
      const latLngs = layer.getLatLngs();
      if (!Array.isArray(latLngs) || latLngs.length === 0) return;
      const first = latLngs[0];
      if (!Array.isArray(first)) return;
      const ring = first;
      if (!ring.every((p) => p instanceof L.LatLng)) return;
      onPolygonChange(latLngsToCoords(ring));
    };

    const handleEdited = (e: L.LeafletEvent) => {
      if (!isRecord(e)) return;
      const layers = e['layers'];
      if (!(layers instanceof L.LayerGroup)) return;
      const list = layers.getLayers();
      for (const layer of list) {
        if (layer instanceof L.Polygon) {
          const latLngs = layer.getLatLngs();
          if (!Array.isArray(latLngs) || latLngs.length === 0) return;
          const first = latLngs[0];
          if (!Array.isArray(first)) return;
          const ring = first;
          if (!ring.every((p) => p instanceof L.LatLng)) return;
          onPolygonChange(latLngsToCoords(ring));
          return;
        }
      }
    };

    const handleDeleted = () => {
      fg.clearLayers();
      onPolygonChange(null);
    };

    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.EDITED, handleEdited);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    const editControl = new L.Control.Draw({
      position: 'topright',
      edit: {
        featureGroup: fg,
        edit: {
          selectedPathOptions: {
            color,
            fillColor: color,
            fillOpacity: 0.18,
            weight: 3,
          },
        },
        remove: true,
      },
      draw: {
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
        polygon: false,
      },
    });

    map.addControl(editControl);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      map.removeControl(editControl);
      map.removeLayer(fg);
      featureGroupRef.current = null;
      drawRef.current = null;
    };
  }, [color, map, onPolygonChange]);

  // Seed polygon (edit mode)
  useEffect(() => {
    if (!featureGroupRef.current) return;
    clearLayers();

    if (!seedPolygon || seedPolygon.length < 3) return;
    const seeded = ensureRingClosed(seedPolygon);
    const poly = new L.Polygon(coordsToLatLngs(seeded), {
      color,
      fillColor: color,
      fillOpacity: 0.12,
      weight: 3,
    });
    featureGroupRef.current.addLayer(poly);
  }, [clearLayers, color, seedPolygon]);

  // Drawing mode (programmatic)
  useEffect(() => {
    if (mode !== 'drawing') {
      if (drawRef.current) {
        drawRef.current.disable();
        drawRef.current = null;
      }
      return;
    }

    const drawMap = map as unknown as L.DrawMap;
    const drawer = new L.Draw.Polygon(drawMap, {
      allowIntersection: false,
      showArea: true,
      shapeOptions: {
        color,
        fillColor: color,
        fillOpacity: 0.12,
        weight: 3,
      },
    });

    drawRef.current = drawer;
    drawer.enable();

    return () => {
      drawer.disable();
      if (drawRef.current === drawer) drawRef.current = null;
    };
  }, [color, map, mode]);

  return null;
});

function Badge(props: { tone: 'gray' | 'red' | 'green' | 'amber' | 'blue'; label: string }) {
  const { tone, label } = props;
  const cls =
    tone === 'red'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : tone === 'green'
        ? 'bg-green-50 text-green-700 ring-green-200'
        : tone === 'amber'
          ? 'bg-amber-50 text-amber-800 ring-amber-200'
          : tone === 'blue'
            ? 'bg-blue-50 text-blue-700 ring-blue-200'
            : 'bg-gray-50 text-gray-700 ring-gray-200';

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${cls}`}>
      {label}
    </span>
  );
}

function SectionHeader(props: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-black text-gray-900">{props.title}</div>
        {props.subtitle ? <div className="text-xs text-gray-500 mt-0.5">{props.subtitle}</div> : null}
      </div>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  );
}

export function DeliveryZonesPage() {
  const [coverage, setCoverage] = useState<CoverageConfig | null>(null);
  const [coverageDraft, setCoverageDraft] = useState({
    isDeliveryEnabled: true,
    storeLat: -23.55052,
    storeLng: -46.633308,
    maxRadiusKm: 10,
    defaultPricePerKm: 2.5,
    minimumFee: null as number | null,
    maximumFee: null as number | null,
  });

  const [zones, setZones] = useState<DeliveryRateRule[]>([]);
  const [legacyRules, setLegacyRules] = useState<DeliveryRateRule[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedZone = useMemo(() => zones.find((z) => z.id === selectedZoneId) ?? null, [selectedZoneId, zones]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('idle');

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [fitToStoreSeq, setFitToStoreSeq] = useState(0);

  const storePosition = useMemo<LatLngExpression>(() => {
    return [coverageDraft.storeLat, coverageDraft.storeLng] as LatLngExpression;
  }, [coverageDraft.storeLat, coverageDraft.storeLng]);

  const [zoneForm, setZoneForm] = useState<ZoneForm>(() => ({
    id: null,
    name: '',
    color: defaultZoneColor(),
    isActive: true,
    priority: 1000,
    zoneKind: 'custom_zone',
    pricingMode: 'fixed',
    blocksDelivery: false,
    fixedFee: 10,
    pricePerKm: 2.5,
    polygonCoordinates: null,
  }));

  const resetZoneForm = useCallback(() => {
    setZoneForm({
      id: null,
      name: '',
      color: defaultZoneColor(),
      isActive: true,
      priority: 1000,
      zoneKind: 'custom_zone',
      pricingMode: 'fixed',
      blocksDelivery: false,
      fixedFee: 10,
      pricePerKm: 2.5,
      polygonCoordinates: null,
    });
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [covRes, rulesRes] = await Promise.all([
        api.get<CoverageConfig | null>('/delivery/coverage'),
        api.get<DeliveryRateRule[]>('/delivery/rates'),
      ]);

      if (covRes.success) {
        setCoverage(covRes.data ?? null);
        const cfg = covRes.data;
        if (cfg) {
          setCoverageDraft({
            isDeliveryEnabled: cfg.isDeliveryEnabled,
            storeLat: cfg.storeLat,
            storeLng: cfg.storeLng,
            maxRadiusKm: Number(cfg.maxRadiusKm),
            defaultPricePerKm: Number(cfg.defaultPricePerKm),
            minimumFee: parseDecimalString(cfg.minimumFee),
            maximumFee: parseDecimalString(cfg.maximumFee),
          });
        }
      }

      if (rulesRes.success) {
        const all = rulesRes.data ?? [];
        const zs = all.filter((r) => r.type === 'polygon');
        const legacy = all.filter((r) => r.type !== 'polygon');

        setZones(zs.sort((a, b) => a.priority - b.priority));
        setLegacyRules(legacy.sort((a, b) => a.priority - b.priority));

        if (zs.length > 0 && !selectedZoneId) setSelectedZoneId(zs[0].id);
      }

      setToast(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Erro ao carregar configurações de entrega';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleSaveCoverage = useCallback(async () => {
    setSavingCoverage(true);
    setError(null);

    try {
      const res = await api.put<CoverageConfig>('/delivery/coverage', {
        storeLat: coverageDraft.storeLat,
        storeLng: coverageDraft.storeLng,
        maxRadiusKm: coverageDraft.maxRadiusKm,
        defaultPricePerKm: coverageDraft.defaultPricePerKm,
        minimumFee: coverageDraft.minimumFee ?? undefined,
        maximumFee: coverageDraft.maximumFee ?? undefined,
        isDeliveryEnabled: coverageDraft.isDeliveryEnabled,
      });

      if (res.success) {
        setCoverage(res.data);
        setToast('Configuração salva');
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Erro ao salvar configuração';
      setError(msg);
    } finally {
      setSavingCoverage(false);
    }
  }, [coverageDraft]);

  const openNewZone = useCallback(() => {
    resetZoneForm();
    const color = zoneColorPreset('custom_zone', 'fixed');
    setZoneForm((z) => ({ ...z, color }));
    setEditorOpen(true);
    setDrawMode('drawing');
  }, [resetZoneForm]);

  const openEditZone = useCallback((z: DeliveryRateRule) => {
    const coords = normalizePolygonCoordinates(z.polygonCoordinates);
    setZoneForm({
      id: z.id,
      name: z.name ?? z.geoJson?.properties?.name ?? '',
      color: z.color ?? z.geoJson?.properties?.color ?? defaultZoneColor(),
      isActive: z.isActive,
      priority: z.priority,
      zoneKind: z.zoneKind ?? (z.blocksDelivery ? 'blocked_zone' : 'custom_zone'),
      pricingMode: z.pricingMode ?? 'fixed',
      blocksDelivery: z.blocksDelivery,
      fixedFee: parseDecimalString(z.fixedFee) ?? parseDecimalString(z.fixedRate) ?? 0,
      pricePerKm: parseDecimalString(z.pricePerKm) ?? parseDecimalString(z.ratePerKm) ?? 0,
      polygonCoordinates: coords,
    });
    setSelectedZoneId(z.id);
    setEditorOpen(true);
    setDrawMode('idle');
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setDrawMode('idle');
  }, []);

  const handlePolygonChange = useCallback((coords: PolygonCoordinates | null) => {
    setZoneForm((z) => ({ ...z, polygonCoordinates: coords }));
  }, []);

  const handleDuplicate = useCallback((z: DeliveryRateRule) => {
    const coords = normalizePolygonCoordinates(z.polygonCoordinates);
    const baseName = zoneLabel(z);
    const nextName = `${baseName} (cópia)`;
    setZoneForm({
      id: null,
      name: nextName,
      color: z.color ?? z.geoJson?.properties?.color ?? defaultZoneColor(),
      isActive: z.isActive,
      priority: z.priority + 1,
      zoneKind: z.zoneKind ?? (z.blocksDelivery ? 'blocked_zone' : 'custom_zone'),
      pricingMode: z.pricingMode ?? 'fixed',
      blocksDelivery: z.blocksDelivery,
      fixedFee: parseDecimalString(z.fixedFee) ?? parseDecimalString(z.fixedRate) ?? 0,
      pricePerKm: parseDecimalString(z.pricePerKm) ?? parseDecimalString(z.ratePerKm) ?? 0,
      polygonCoordinates: coords,
    });
    setEditorOpen(true);
    setDrawMode('idle');
  }, []);

  const handleDeleteZone = useCallback(
    async (z: DeliveryRateRule) => {
      const ok = window.confirm(`Excluir "${zoneLabel(z)}"?`);
      if (!ok) return;

      try {
        await api.delete(`/delivery/rates/${z.id}`);
        setToast('Zona excluída');
        if (selectedZoneId === z.id) setSelectedZoneId(null);
        await fetchAll();
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Erro ao excluir zona';
        setError(msg);
      }
    },
    [fetchAll, selectedZoneId],
  );

  const handleSaveZone = useCallback(async () => {
    setSavingZone(true);
    setError(null);

    try {
      if (!zoneForm.polygonCoordinates || zoneForm.polygonCoordinates.length < 3) {
        setError('Desenhe uma zona no mapa (mínimo 3 pontos).');
        return;
      }

      const zoneKind: DeliveryZoneKind = zoneForm.zoneKind;
      const pricingMode: DeliveryPricingMode = zoneForm.pricingMode;
      const blocksDelivery = zoneKind === 'blocked_zone' ? true : zoneForm.blocksDelivery;

      const color = zoneForm.color;
      const name = zoneForm.name.trim() !== '' ? zoneForm.name.trim() : null;

      const coords = zoneForm.polygonCoordinates;
      const geoJson: DeliveryRuleGeoJson = {
        type: 'Feature',
        properties: {
          name: name ?? undefined,
          color,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coords],
        },
      };

      const fixedFee = pricingMode === 'fixed' && zoneKind !== 'blocked_zone' ? zoneForm.fixedFee : null;
      const pricePerKm = pricingMode === 'distance' && zoneKind !== 'blocked_zone' ? zoneForm.pricePerKm : null;

      const payload = {
        type: 'polygon' as const,
        isActive: zoneForm.isActive,
        priority: zoneForm.priority,
        isFallback: false,
        geoJson,
        polygonCoordinates: coords,
        name,
        color,
        zoneKind,
        pricingMode,
        blocksDelivery,
        fixedFee: fixedFee ?? undefined,
        pricePerKm: pricePerKm ?? undefined,
        fixedRate: pricingMode === 'fixed' && zoneKind !== 'blocked_zone' ? fixedFee ?? undefined : undefined,
        ratePerKm: pricingMode === 'distance' && zoneKind !== 'blocked_zone' ? pricePerKm ?? undefined : undefined,
        rate: pricingMode === 'free' && zoneKind !== 'blocked_zone' ? 0 : undefined,
      };

      if (zoneForm.id) {
        await api.put(`/delivery/rates/${zoneForm.id}`, payload);
        setToast('Zona atualizada');
      } else {
        await api.post('/delivery/rates', payload);
        setToast('Zona criada');
      }

      setEditorOpen(false);
      setDrawMode('idle');
      await fetchAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Erro ao salvar zona';
      setError(msg);
    } finally {
      setSavingZone(false);
    }
  }, [fetchAll, zoneForm]);

  // Keep conditional UX: auto adjust when changing kind/pricing
  useEffect(() => {
    if (!editorOpen) return;

    setZoneForm((z) => {
      if (z.zoneKind === 'blocked_zone') {
        const c = z.color === defaultZoneColor() ? zoneColorPreset('blocked_zone', 'fixed') : z.color;
        return {
          ...z,
          color: c,
          blocksDelivery: true,
          pricingMode: 'fixed',
          fixedFee: null,
          pricePerKm: null,
        };
      }

      if (z.pricingMode === 'free') {
        const c = z.color === defaultZoneColor() ? zoneColorPreset('custom_zone', 'free') : z.color;
        return { ...z, color: c, fixedFee: null, pricePerKm: null, blocksDelivery: false };
      }

      if (z.pricingMode === 'fixed') {
        const c = z.color === defaultZoneColor() ? zoneColorPreset('custom_zone', 'fixed') : z.color;
        return { ...z, color: c, fixedFee: z.fixedFee ?? 10, pricePerKm: null, blocksDelivery: false };
      }

      const c = z.color === defaultZoneColor() ? zoneColorPreset('custom_zone', 'distance') : z.color;
      return { ...z, color: c, fixedFee: null, pricePerKm: z.pricePerKm ?? 2.5, blocksDelivery: false };
    });
  }, [editorOpen, zoneForm.pricingMode, zoneForm.zoneKind]);

  const visibleZones = useMemo(() => {
    return zones.filter((z) => z.isActive);
  }, [zones]);

  const mapCenter = useMemo<LatLngExpression>(() => {
    if (selectedZone) {
      const coords = normalizePolygonCoordinates(selectedZone.polygonCoordinates);
      if (coords && coords.length > 0) {
        const [lng, lat] = coords[0];
        return [lat, lng] as LatLngExpression;
      }
    }
    return storePosition;
  }, [selectedZone, storePosition]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          <span className="ml-3 text-gray-500">Carregando Zonas de Entrega...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] min-h-[720px]">
      <div className="h-full grid grid-cols-1 lg:grid-cols-[420px_1fr]">
        {/* LEFT PANEL */}
        <div className="h-full border-r border-gray-100 bg-white overflow-auto">
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-gray-900">Zonas de Entrega</h1>
                <p className="text-sm text-gray-500 mt-1">Defina sua cobertura base e desenhe zonas no mapa.</p>
              </div>
              <button
                type="button"
                onClick={() => setFitToStoreSeq((v) => v + 1)}
                className="h-10 px-3 rounded-lg bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                title="Centralizar loja"
              >
                <LocateFixed className="h-4 w-4" />
              </button>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {toast ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2">
                <Check className="h-4 w-4" />
                {toast}
              </div>
            ) : null}

            {/* Section A — Quick setup */}
            <section className="rounded-xl border border-gray-100 shadow-sm">
              <div className="p-4 border-b border-gray-100">
                <SectionHeader
                  title="Configuração rápida"
                  subtitle="Configure em poucos minutos. Isso define sua cobertura base."
                  right={
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <span className="text-xs text-gray-500">Entrega</span>
                      <button
                        type="button"
                        onClick={() =>
                          setCoverageDraft((d) => ({ ...d, isDeliveryEnabled: !d.isDeliveryEnabled }))
                        }
                        className={
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' +
                          (coverageDraft.isDeliveryEnabled ? 'bg-primary-600' : 'bg-gray-200')
                        }
                        aria-pressed={coverageDraft.isDeliveryEnabled}
                      >
                        <span
                          className={
                            'inline-block h-5 w-5 transform rounded-full bg-white transition-transform ' +
                            (coverageDraft.isDeliveryEnabled ? 'translate-x-5' : 'translate-x-1')
                          }
                        />
                      </button>
                    </label>
                  }
                />
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Latitude da loja</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={coverageDraft.storeLat}
                      onChange={(e) => setCoverageDraft((d) => ({ ...d, storeLat: Number(e.target.value) }))}
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Longitude da loja</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={coverageDraft.storeLng}
                      onChange={(e) => setCoverageDraft((d) => ({ ...d, storeLng: Number(e.target.value) }))}
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Raio máximo (km)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={coverageDraft.maxRadiusKm}
                      onChange={(e) => setCoverageDraft((d) => ({ ...d, maxRadiusKm: Number(e.target.value) }))}
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="mt-1 text-[11px] text-gray-500">Até onde você entrega na cobertura base.</div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Preço por km (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={coverageDraft.defaultPricePerKm}
                      onChange={(e) =>
                        setCoverageDraft((d) => ({ ...d, defaultPricePerKm: Number(e.target.value) }))
                      }
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="mt-1 text-[11px] text-gray-500">Valor padrão aplicado dentro do raio.</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Taxa mínima (opcional)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={coverageDraft.minimumFee ?? ''}
                      onChange={(e) =>
                        setCoverageDraft((d) => ({
                          ...d,
                          minimumFee: e.target.value.trim() === '' ? null : Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="—"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Taxa máxima (opcional)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={coverageDraft.maximumFee ?? ''}
                      onChange={(e) =>
                        setCoverageDraft((d) => ({
                          ...d,
                          maximumFee: e.target.value.trim() === '' ? null : Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="—"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    {coverage ? `Última atualização: ${new Date(coverage.updatedAt).toLocaleString()}` : 'Ainda não configurado'}
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveCoverage}
                    disabled={savingCoverage}
                    className="h-10 px-4 rounded-lg bg-primary-600 text-white text-sm font-black hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    {savingCoverage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                  </button>
                </div>
              </div>
            </section>

            {/* Section B — Zones */}
            <section className="rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <SectionHeader
                  title="Zonas personalizadas"
                  subtitle="Desenhe áreas no mapa para bloquear ou cobrar diferente."
                  right={
                    <button
                      type="button"
                      onClick={openNewZone}
                      className="h-10 px-3 rounded-lg bg-primary-600 text-white text-sm font-black hover:bg-primary-700 inline-flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Nova zona
                    </button>
                  }
                />
              </div>

              <div className="p-4">
                {zones.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-4">
                    <div className="text-sm font-semibold text-gray-900">Sem zonas ainda</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Crie uma zona para bloquear regiões ou oferecer entrega grátis.
                    </div>
                    <button
                      type="button"
                      onClick={openNewZone}
                      className="mt-3 h-10 px-3 rounded-lg bg-gray-900 text-white text-sm font-black hover:bg-black inline-flex items-center gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                      Desenhar primeira zona
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {zones.map((z) => {
                      const selected = selectedZoneId === z.id;
                      const color = z.color ?? z.geoJson?.properties?.color ?? defaultZoneColor();
                      const zoneKind = z.zoneKind ?? (z.blocksDelivery ? 'blocked_zone' : 'custom_zone');
                      const pricingMode = z.pricingMode ?? 'fixed';

                      return (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => setSelectedZoneId(z.id)}
                          className={
                            'w-full text-left rounded-xl border px-3 py-3 transition-colors ' +
                            (selected
                              ? 'border-primary-300 bg-primary-50'
                              : 'border-gray-100 hover:bg-gray-50')
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block w-3 h-3 rounded-full"
                                  style={{ backgroundColor: color }}
                                  aria-hidden
                                />
                                <div className="font-black text-gray-900 truncate">{zoneLabel(z)}</div>
                                {!z.isActive ? <Badge tone="gray" label="Inativa" /> : null}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <Badge
                                  tone={zoneKind === 'blocked_zone' ? 'red' : 'blue'}
                                  label={kindLabel(zoneKind)}
                                />
                                <Badge
                                  tone={pricingMode === 'free' ? 'green' : pricingMode === 'distance' ? 'amber' : 'gray'}
                                  label={pricingLabel(pricingMode)}
                                />
                                <Badge tone="gray" label={`Prioridade ${z.priority}`} />
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openEditZone(z);
                                }}
                                className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white"
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDuplicate(z);
                                }}
                                className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white"
                                title="Duplicar"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleDeleteZone(z);
                                }}
                                className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-white"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Section C — Advanced */}
            <section className="rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <div>
                  <div className="text-sm font-black text-gray-900">Avançado / Legado</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Compatibilidade com regras antigas (não recomendado para o fluxo principal).
                  </div>
                </div>
                {advancedOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>

              {advancedOpen ? (
                <div className="p-4 border-t border-gray-100">
                  {legacyRules.length === 0 ? (
                    <div className="text-xs text-gray-500">Nenhuma regra legada configurada.</div>
                  ) : (
                    <div className="space-y-2">
                      {legacyRules.map((r) => (
                        <div key={r.id} className="rounded-lg border border-gray-100 p-3">
                          <div className="text-sm font-semibold text-gray-900">{r.type}</div>
                          <div className="text-xs text-gray-600 mt-1">
                            Prioridade {r.priority} {r.isActive ? '• Ativa' : '• Inativa'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>

            <div className="text-xs text-gray-400">
              Dica: você pode usar zonas para "exceções" e manter a cobertura base como padrão.
            </div>
          </div>
        </div>

        {/* RIGHT MAP */}
        <div className="h-full bg-gray-50 relative">
          <div className="absolute inset-0">
            <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
              <MapImperative storePosition={storePosition} fitToStoreSeq={fitToStoreSeq} />

              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker position={storePosition} />

              <Circle
                center={storePosition}
                radius={Math.max(0, coverageDraft.maxRadiusKm) * 1000}
                pathOptions={{
                  color: '#2563eb',
                  fillColor: '#2563eb',
                  fillOpacity: 0.06,
                  weight: 2,
                  dashArray: '6 6',
                }}
              />

              {visibleZones.map((z) => {
                const coords = normalizePolygonCoordinates(z.polygonCoordinates);
                if (!coords || coords.length < 3) return null;
                const color = z.color ?? z.geoJson?.properties?.color ?? defaultZoneColor();
                return (
                  <Polygon
                    key={`zone-${z.id}`}
                    positions={coordsToLatLngs(coords)}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: selectedZoneId === z.id ? 0.22 : 0.12,
                      weight: selectedZoneId === z.id ? 4 : 3,
                    }}
                    eventHandlers={{
                      click: () => setSelectedZoneId(z.id),
                    }}
                  />
                );
              })}

              {/* Drawing layer sits on top */}
              <ZoneDrawLayer
                mode={drawMode}
                color={zoneForm.color}
                seedPolygon={editorOpen ? zoneForm.polygonCoordinates : null}
                onPolygonChange={handlePolygonChange}
              />
            </MapContainer>
          </div>

          {/* Map actions */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFitToStoreSeq((v) => v + 1)}
              className="h-10 px-3 rounded-lg bg-white border border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50 shadow-sm inline-flex items-center gap-2"
            >
              <Crosshair className="h-4 w-4" />
              Centralizar loja
            </button>

            {drawMode === 'drawing' ? (
              <Badge tone="blue" label="Modo desenho ativo" />
            ) : null}
          </div>

          {/* Editor panel (contextual drawer) */}
          {editorOpen ? (
            <div className="absolute top-4 right-4 w-[380px] max-w-[calc(100vw-32px)] bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-black text-gray-900">
                    {zoneForm.id ? 'Editar zona' : 'Nova zona'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {drawMode === 'drawing'
                      ? 'Desenhe no mapa e depois complete os detalhes aqui.'
                      : 'Ajuste os detalhes e salve.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-50"
                  title="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[calc(100vh-120px)] overflow-auto">
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Nome</label>
                  <input
                    value={zoneForm.name}
                    onChange={(e) => setZoneForm((z) => ({ ...z, name: e.target.value }))}
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Ex: Centro, Condomínios, Área restrita"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Cor</label>
                    <input
                      type="color"
                      value={zoneForm.color}
                      onChange={(e) => setZoneForm((z) => ({ ...z, color: e.target.value }))}
                      className="mt-1 w-full h-10 px-2 rounded-lg border border-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Prioridade</label>
                    <input
                      type="number"
                      min={0}
                      value={zoneForm.priority}
                      onChange={(e) => setZoneForm((z) => ({ ...z, priority: Number(e.target.value) }))}
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Tipo</label>
                    <select
                      value={zoneForm.zoneKind}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'blocked_zone' || v === 'custom_zone') {
                          setZoneForm((z) => ({ ...z, zoneKind: v }));
                        }
                      }}
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="blocked_zone">Área bloqueada</option>
                      <option value="custom_zone">Zona personalizada</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Status</label>
                    <button
                      type="button"
                      onClick={() => setZoneForm((z) => ({ ...z, isActive: !z.isActive }))}
                      className={
                        'mt-1 w-full h-10 px-3 rounded-lg border text-sm font-black inline-flex items-center justify-center gap-2 ' +
                        (zoneForm.isActive
                          ? 'border-green-200 bg-green-50 text-green-800'
                          : 'border-gray-200 bg-gray-50 text-gray-700')
                      }
                    >
                      {zoneForm.isActive ? 'Ativa' : 'Inativa'}
                    </button>
                  </div>
                </div>

                {zoneForm.zoneKind !== 'blocked_zone' ? (
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Política de cobrança</label>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {([
                        { mode: 'fixed' as const, label: 'Fixa' },
                        { mode: 'distance' as const, label: 'Por km' },
                        { mode: 'free' as const, label: 'Grátis' },
                      ] as const).map((o) => (
                        <button
                          key={o.mode}
                          type="button"
                          onClick={() => setZoneForm((z) => ({ ...z, pricingMode: o.mode }))}
                          className={
                            'h-10 rounded-lg border text-sm font-black transition-colors ' +
                            (zoneForm.pricingMode === o.mode
                              ? 'border-primary-300 bg-primary-50 text-primary-800'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')
                          }
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    Esta zona bloqueia entregas. Campos de cobrança ficam ocultos.
                  </div>
                )}

                {zoneForm.zoneKind !== 'blocked_zone' && zoneForm.pricingMode === 'fixed' ? (
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Valor fixo (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={zoneForm.fixedFee ?? ''}
                      onChange={(e) =>
                        setZoneForm((z) => ({
                          ...z,
                          fixedFee: e.target.value.trim() === '' ? null : Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="0,00"
                    />
                  </div>
                ) : null}

                {zoneForm.zoneKind !== 'blocked_zone' && zoneForm.pricingMode === 'distance' ? (
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Valor por km (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={zoneForm.pricePerKm ?? ''}
                      onChange={(e) =>
                        setZoneForm((z) => ({
                          ...z,
                          pricePerKm: e.target.value.trim() === '' ? null : Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="0,00"
                    />
                  </div>
                ) : null}

                {zoneForm.zoneKind !== 'blocked_zone' && zoneForm.pricingMode === 'free' ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800">
                    Entrega grátis nesta zona.
                  </div>
                ) : null}

                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-xs font-black text-gray-500 uppercase tracking-wider">Resumo</div>
                  <div className="mt-2 text-sm text-gray-900 font-semibold">
                    {zoneForm.zoneKind === 'blocked_zone'
                      ? 'Bloqueia entrega'
                      : zoneForm.pricingMode === 'free'
                        ? 'Entrega grátis'
                        : zoneForm.pricingMode === 'distance'
                          ? `Cobrança por km: ${fmtMoney(zoneForm.pricePerKm)}/km`
                          : `Cobrança fixa: ${fmtMoney(zoneForm.fixedFee)}`}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Prioridade {zoneForm.priority} • {zoneForm.isActive ? 'Ativa' : 'Inativa'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDrawMode((m) => (m === 'drawing' ? 'idle' : 'drawing'))}
                    className="h-10 px-3 rounded-lg bg-white border border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    {drawMode === 'drawing' ? 'Parar desenho' : 'Desenhar/ajustar'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveZone}
                    disabled={savingZone}
                    className="h-10 flex-1 px-3 rounded-lg bg-gray-900 text-white text-sm font-black hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {savingZone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar zona
                  </button>
                </div>

                <button
                  type="button"
                  onClick={closeEditor}
                  className="h-10 w-full px-3 rounded-lg bg-white border border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Small note about status codes: not shown in UI */}
    </div>
  );
}
