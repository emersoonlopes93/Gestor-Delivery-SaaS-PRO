import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Crosshair,
  DollarSign,
  Edit2,
  Gift,
  Loader2,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Ruler,
  Target,
  Save,
  TrendingUp,
  Trash2,
  X,
} from 'lucide-react';
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

type DeliveryDecisionResponse = {
  canDeliver: boolean;
  matchedStrategy: string;
  matchedZoneId: string | null;
  fee: number;
  distanceKm: number | null;
  reason: string;
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

const MapRefSync = memo(function MapRefSync(props: {
  mapRef: React.MutableRefObject<L.Map | null>;
}) {
  const { mapRef } = props;
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    return () => {
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [map, mapRef]);

  return null;
});

const SimulationClickLayer = memo(function SimulationClickLayer(props: {
  enabled: boolean;
  onPick: (pos: { lat: number; lng: number }) => void;
}) {
  const map = useMap();
  useMapEvents({
    click: (e) => {
      if (!props.enabled) return;
      props.onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  // Microfeedback visual no clique (ripple/escala leve)
  useEffect(() => {
    if (!props.enabled) return;
    const el = map.getContainer();
    el.style.cursor = 'crosshair';
    return () => {
      el.style.cursor = '';
    };
  }, [props.enabled, map]);

  return null;
});

function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function strategyLabel(v: string): string {
  if (v === 'base_radius') return 'Cobertura padrão';
  if (v === 'custom_zone_free') return 'Zona personalizada';
  if (v === 'custom_zone_fixed') return 'Zona personalizada';
  if (v === 'custom_zone_distance') return 'Zona personalizada';
  if (v === 'blocked_zone') return 'Área bloqueada';
  if (v === 'out_of_coverage') return 'Fora da área de entrega';
  if (v === 'delivery_disabled') return 'Entrega desativada';
  if (v === 'legacy_rules') return 'Regras legadas';
  return 'Regra aplicada';
}

function zoneNameById(zones: DeliveryRateRule[], id: string | null): string | null {
  if (!id) return null;
  const zone = zones.find((z) => z.id === id);
  if (!zone) return null;
  return zone.name && zone.name.trim() !== '' ? zone.name : null;
}

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

  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [highlightZoneId, setHighlightZoneId] = useState<string | null>(null);

  const [simulationOn, setSimulationOn] = useState(false);
  const [simulationPoint, setSimulationPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationDecision, setSimulationDecision] = useState<DeliveryDecisionResponse | null>(null);

  const clearSimulation = useCallback(() => {
    setSimulationPoint(null);
    setSimulationDecision(null);
    setSimulationError(null);
    setSimulationLoading(false);
    setHighlightZoneId(null);
  }, []);

  const mapRef = useRef<L.Map | null>(null);
  const [showMapMobile, setShowMapMobile] = useState(false);

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

  useEffect(() => {
    if (!highlightZoneId) return;
    const t = window.setTimeout(() => setHighlightZoneId(null), 900);
    return () => window.clearTimeout(t);
  }, [highlightZoneId]);

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

  const handleUseCurrentLocation = useCallback(async () => {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('Seu navegador não suporta geolocalização.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoverageDraft((d) => ({ ...d, storeLat: lat, storeLng: lng }));
        setToast('Localização atual aplicada');
        setFitToStoreSeq((v) => v + 1);
      },
      () => {
        setError('Não foi possível obter sua localização. Verifique as permissões do navegador.');
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 },
    );
  }, []);

  type ZonePreset = 'blocked' | 'free' | 'fixed' | 'distance';
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);

  const openNewZoneWithPreset = useCallback(
    (preset: ZonePreset) => {
      resetZoneForm();

      const next =
        preset === 'blocked'
          ? ({
              zoneKind: 'blocked_zone' as const,
              pricingMode: 'fixed' as const,
              blocksDelivery: true,
              fixedFee: null,
              pricePerKm: null,
              color: zoneColorPreset('blocked_zone', 'fixed'),
            })
          : preset === 'free'
            ? ({
                zoneKind: 'custom_zone' as const,
                pricingMode: 'free' as const,
                blocksDelivery: false,
                fixedFee: null,
                pricePerKm: null,
                color: zoneColorPreset('custom_zone', 'free'),
              })
            : preset === 'distance'
              ? ({
                  zoneKind: 'custom_zone' as const,
                  pricingMode: 'distance' as const,
                  blocksDelivery: false,
                  fixedFee: null,
                  pricePerKm: 2.5,
                  color: zoneColorPreset('custom_zone', 'distance'),
                })
              : ({
                  zoneKind: 'custom_zone' as const,
                  pricingMode: 'fixed' as const,
                  blocksDelivery: false,
                  fixedFee: 10,
                  pricePerKm: null,
                  color: zoneColorPreset('custom_zone', 'fixed'),
                });

      setZoneForm((z) => ({
        ...z,
        ...next,
      }));

      setPresetPickerOpen(false);
      setEditorOpen(true);
      setDrawMode('drawing');
      setShowMapMobile(true);
    },
    [resetZoneForm],
  );

  const openNewZone = useCallback(() => {
    setPresetPickerOpen(true);
  }, []);

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
    setShowMapMobile(true);
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
        setHighlightZoneId(zoneForm.id);
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

  const fitSelectedZone = useCallback((zoneId: string | null) => {
    if (!zoneId) return;
    if (!mapRef.current) return;
    const z = zones.find((x) => x.id === zoneId);
    if (!z) return;
    const coords = normalizePolygonCoordinates(z.polygonCoordinates);
    if (!coords || coords.length < 3) return;

    const latLngs = coords.map(([lng, lat]) => L.latLng(lat, lng));
    const bounds = L.latLngBounds(latLngs);
    mapRef.current.fitBounds(bounds, {
      padding: [42, 42],
      animate: true,
      duration: 0.35,
    });
  }, [zones]);

  useEffect(() => {
    fitSelectedZone(selectedZoneId);
  }, [fitSelectedZone, selectedZoneId]);

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

  const runSimulationAt = useCallback(
    async (pos: { lat: number; lng: number }) => {
      if (!coverage?.tenantId) {
        setSimulationError('Não foi possível simular: tenant não identificado.');
        return;
      }

      setSimulationPoint(pos);
      setSimulationError(null);
      setSimulationLoading(true);
      setSimulationDecision(null);

      const address = {
        street: 'Simulação',
        number: '0',
        neighborhood: 'Simulação',
        city: 'Simulação',
        state: 'XX',
        zipCode: '00000-000',
        lat: pos.lat,
        lng: pos.lng,
      };

      try {
        const res = await api.post<DeliveryDecisionResponse>('/delivery/rates/calculate-decision', {
          tenantId: coverage.tenantId,
          address,
          distanceKm: haversineDistanceKm({ lat: coverage.storeLat, lng: coverage.storeLng }, pos),
        });
        if (!res.success) {
          setSimulationError('Falha ao simular entrega.');
          return;
        }
        setSimulationDecision(res.data);
        setHighlightZoneId(res.data.matchedZoneId ?? null);

        // Auto-pan para garantir que o tooltip não fique cortado
        if (mapRef.current) {
          const map = mapRef.current;
          const point = L.latLng(pos.lat, pos.lng);
          const pixelPoint = map.latLngToContainerPoint(point);
          const mapSize = map.getSize();
          const tooltipWidth = 260;
          const tooltipHeight = 180;
          const offset = { x: 0, y: -14 };
          const tooltipLeft = pixelPoint.x + offset.x;
          const tooltipTop = pixelPoint.y + offset.y;
          const tooltipRight = tooltipLeft + tooltipWidth;
          const tooltipBottom = tooltipTop + tooltipHeight;
          const padding = 80;
          let panX = 0;
          let panY = 0;
          if (tooltipLeft < padding) panX = padding - tooltipLeft;
          if (tooltipRight > mapSize.x - padding) panX = tooltipRight - (mapSize.x - padding);
          if (tooltipTop < padding) panY = padding - tooltipTop;
          if (tooltipBottom > mapSize.y - padding) panY = tooltipBottom - (mapSize.y - padding);
          if (panX !== 0 || panY !== 0) {
            map.panBy([panX, panY], { animate: true, duration: 0.35 });
          }
        }
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Erro ao simular entrega';
        setSimulationError(msg);
      } finally {
        setSimulationLoading(false);
      }
    },
    [coverage?.storeLat, coverage?.storeLng, coverage?.tenantId],
  );

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
        <div
          className={
            'h-full border-r border-gray-100 bg-white overflow-auto ' +
            (showMapMobile ? 'hidden lg:block' : 'block')
          }
        >
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-gray-900">Zonas de Entrega</h1>
                <p className="text-sm text-gray-500 mt-1">Defina sua cobertura base e desenhe zonas no mapa.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSimulationOn((v) => {
                      const next = !v;
                      if (!next) clearSimulation();
                      return next;
                    });
                  }}
                  className={
                    'h-10 px-3 rounded-lg border text-sm font-black transition-all duration-200 inline-flex items-center gap-2 ' +
                    (simulationOn
                      ? 'bg-gray-900 text-white border-gray-900 hover:bg-black'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50')
                  }
                  title="Clique no mapa para simular"
                >
                  <Target className="h-4 w-4" />
                  Simular entrega
                </button>

                {simulationOn && (simulationPoint || simulationDecision || simulationError) ? (
                  <button
                    type="button"
                    onClick={clearSimulation}
                    className="h-10 px-3 rounded-lg bg-white border border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50 transition-all duration-200"
                  >
                    Limpar
                  </button>
                ) : null}
              </div>
            </div>
            <section className="rounded-2xl border border-gray-100 shadow-md bg-white p-6 mt-6">
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

              <div className="p-5 space-y-5">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <p className="text-sm text-blue-800 font-medium">
                    <span className="font-black">Dica:</span> Use os botões abaixo para definir sua localização automaticamente. O sistema usará o endereço cadastrado nas configurações ou sua localização atual.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setFitToStoreSeq((v) => v + 1)}
                    className="h-10 px-4 rounded-lg bg-white border border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-md"
                  >
                    <Crosshair className="h-4 w-4" />
                    Centralizar no mapa
                  </button>

                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    className="h-10 px-4 rounded-lg bg-white border border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-md"
                  >
                    <MapPin className="h-4 w-4" />
                    Usar minha localização
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Raio máximo (km)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={coverageDraft.maxRadiusKm}
                      onChange={(e) => setCoverageDraft((d) => ({ ...d, maxRadiusKm: Number(e.target.value) }))}
                      className="mt-2 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200"
                    />
                    <div className="mt-2 text-[11px] text-gray-500">Até onde você entrega na cobertura base.</div>
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
                      className="mt-2 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200"
                    />
                    <div className="mt-2 text-[11px] text-gray-500">Valor padrão aplicado dentro do raio.</div>
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

            {/* Section B — Zonas */}
            <section className="rounded-xl border border-gray-200 shadow-sm bg-white">
              <div className="p-4 border-b border-gray-100">
                <SectionHeader
                  title="Zonas personalizadas"
                  subtitle="Desenhe áreas com regras específicas (ex: entrega grátis, bloqueio, taxa fixa)."
                  right={
                    <button
                      type="button"
                      onClick={openNewZone}
                      className="h-10 px-4 rounded-lg bg-primary-600 text-white text-sm font-black hover:bg-primary-700 transition-all duration-200 shadow-sm inline-flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Nova zona
                    </button>
                  }
                />
              </div>

              <div className="p-5">
                {visibleZones.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                      <MapPin className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="text-sm font-semibold text-gray-900 mb-2">Nenhuma zona personalizada ainda</div>
                    <div className="text-xs text-gray-500 mb-6 max-w-sm mx-auto">
                      Sua cobertura padrão (raio base) já está funcionando. Zonas são úteis para criar exceções como
                      entrega grátis em bairros próximos ou bloquear áreas muito distantes.
                    </div>
                    <button
                      type="button"
                      onClick={openNewZone}
                      className="h-10 px-5 rounded-lg bg-primary-600 text-white text-sm font-black hover:bg-primary-700 transition-all duration-200 shadow-sm inline-flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Desenhar primeira zona
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleZones.map((z) => {
                      const isSelected = selectedZoneId === z.id;
                      const isHovered = hoveredZoneId === z.id;
                      return (
                        <div
                          key={z.id}
                          className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? 'border-primary-500 bg-primary-50/50 shadow-sm border-l-4 border-l-primary-500'
                              : isHovered
                              ? 'border-gray-300 bg-gray-50'
                              : 'border-gray-200 bg-white'
                          }`}
                          onClick={() => {
                            setSelectedZoneId(z.id);
                            setShowMapMobile(true);
                          }}
                          onMouseEnter={() => setHoveredZoneId(z.id)}
                          onMouseLeave={() => setHoveredZoneId(null)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div
                                  className="w-3 h-3 rounded-full border border-white shadow-sm"
                                  style={{ backgroundColor: z.color ?? defaultZoneColor() }}
                                />
                                <span className="text-sm font-semibold text-gray-900 truncate">
                                  {z.name || `Zona ${visibleZones.indexOf(z) + 1}`}
                                </span>
                                {isSelected && (
                                  <Badge tone="blue" label="Ativo" />
                                )}
                              </div>
                              <div className="text-xs text-gray-500 space-y-1">
                                <div>
                                  {z.zoneKind === 'blocked_zone' && (
                                    <span className="inline-flex items-center gap-1">
                                      <Ban className="h-3 w-3" />
                                      Entrega bloqueada
                                    </span>
                                  )}
                                  {z.zoneKind === 'custom_zone' && z.pricingMode === 'free' && (
                                    <span className="inline-flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" />
                                      Entrega grátis
                                    </span>
                                  )}
                                  {z.zoneKind === 'custom_zone' && z.pricingMode === 'fixed' && (
                                    <span className="inline-flex items-center gap-1">
                                      <DollarSign className="h-3 w-3" />
                                      Taxa fixa: {fmtMoney(z.fixedFee != null ? Number(z.fixedFee) : null)}
                                    </span>
                                  )}
                                  {z.zoneKind === 'custom_zone' && z.pricingMode === 'distance' && (
                                    <span className="inline-flex items-center gap-1">
                                      <TrendingUp className="h-3 w-3" />
                                      {fmtMoney(z.pricePerKm != null ? Number(z.pricePerKm) : null)}/km
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedZoneId(z.id);
                                  setEditorOpen(true);
                                }}
                                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                <Edit2 className="h-4 w-4 text-gray-500" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteZone(z);
                                }}
                                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </button>
                            </div>
                          </div>
                        </div>
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
        <div className={
          'h-full bg-gray-50 relative ' +
          (showMapMobile ? 'block' : 'hidden lg:block')
        }>
          <div className="absolute inset-0">
            <MapContainer
              center={mapCenter}
              zoom={14}
              className={"h-full w-full " + (simulationOn ? 'cursor-crosshair' : '')}
            >
              <MapImperative storePosition={storePosition} fitToStoreSeq={fitToStoreSeq} />

              <MapRefSync mapRef={mapRef} />

              <SimulationClickLayer enabled={simulationOn} onPick={runSimulationAt} />

              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker
                position={storePosition}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const target = e.target;
                    if (!(target instanceof L.Marker)) return;
                    const pos = target.getLatLng();
                    setCoverageDraft((d) => ({ ...d, storeLat: pos.lat, storeLng: pos.lng }));
                  },
                }}
              />

              {coverage && (
                <Circle
                  center={[coverage.storeLat, coverage.storeLng]}
                  radius={Number(coverage.maxRadiusKm) * 1000}
                  pathOptions={{
                    color: '#3b82f6',
                    weight:
                      simulationDecision?.matchedStrategy === 'base_radius'
                        ? 3
                        : 2,
                    opacity: 0.9,
                    fillColor: '#3b82f6',
                    fillOpacity:
                      simulationDecision?.matchedStrategy === 'base_radius'
                        ? 0.12
                        : 0.08,
                    dashArray: '8, 6',
                    lineJoin: 'round',
                  }}
                />
              )}

              {simulationPoint ? (
                <Marker
                  position={[simulationPoint.lat, simulationPoint.lng]}
                  icon={
                    new L.DivIcon({
                      className: 'delivery-sim-marker',
                      html:
                        '<div class="w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center">' +
                        '<div class="w-3 h-3 rounded-full bg-gray-900"></div>' +
                        '</div>',
                      iconSize: [36, 36],
                      iconAnchor: [18, 18],
                    })
                  }
                >
                  <Tooltip
                    direction="top"
                    offset={[0, -14]}
                    opacity={1}
                    permanent
                    className="!bg-transparent !border-0 !shadow-none"
                  >
                    <div
                      className={
                        'w-[260px] rounded-xl border p-3 shadow-md backdrop-blur-md ' +
                        (simulationDecision
                          ? simulationDecision.canDeliver
                            ? 'bg-green-50/90 border-green-300'
                            : 'bg-red-50/90 border-red-300'
                          : 'bg-white/85 border-gray-200')
                      }
                    >
                      {simulationLoading ? (
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Calculando entrega...
                        </div>
                      ) : simulationError ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-black text-red-700">
                            <AlertCircle className="h-5 w-5" />
                            Entrega indisponível
                          </div>
                          <div className="text-xs text-gray-600">{simulationError}</div>
                        </div>
                      ) : simulationDecision ? (
                        <div className="space-y-2">
                          <div
                            className={
                              'flex items-center gap-2 text-base font-black ' +
                              (simulationDecision.canDeliver ? 'text-green-700' : 'text-red-700')
                            }
                          >
                            {simulationDecision.canDeliver ? (
                              <CheckCircle className="h-5 w-5" />
                            ) : (
                              <AlertCircle className="h-5 w-5" />
                            )}
                            {simulationDecision.canDeliver ? 'Entrega disponível' : 'Entrega indisponível'}
                          </div>
                          <div className="text-sm font-semibold text-gray-900">
                            Taxa de entrega: {fmtMoney(simulationDecision.fee)}
                          </div>
                          {(() => {
                            const zoneName = zoneNameById(zones, simulationDecision.matchedZoneId);
                            return zoneName ? (
                              <div className="text-xs text-gray-700">
                                <span className="font-semibold">Zona aplicada:</span> {zoneName}
                              </div>
                            ) : null;
                          })()}
                          <div className="text-xs text-gray-700">
                            <span className="font-semibold">Regra aplicada:</span> {strategyLabel(simulationDecision.matchedStrategy)}
                          </div>
                          {typeof simulationDecision.distanceKm === 'number' ? (
                            <div className="text-xs text-gray-700">
                              <span className="font-semibold">Distância:</span> {simulationDecision.distanceKm.toFixed(2)} km
                            </div>
                          ) : null}
                          <div className="text-[11px] text-gray-500 pt-1">{simulationDecision.reason}</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm font-black text-gray-900">Clique no mapa</div>
                          <div className="text-xs text-gray-600 mt-1">
                            Selecione um ponto para simular a entrega.
                          </div>
                        </div>
                      )}
                    </div>
                  </Tooltip>
                </Marker>
              ) : null}

              {visibleZones.map((z) => {
                const coords = normalizePolygonCoordinates(z.polygonCoordinates);
                if (!coords || coords.length < 3) return null;
                const color = z.color ?? z.geoJson?.properties?.color ?? defaultZoneColor();
                const isSelected = selectedZoneId === z.id;
                const isHovered = hoveredZoneId === z.id;
                const isHighlighted = highlightZoneId === z.id;
                return (
                  <Polygon
                    key={`zone-${z.id}`}
                    positions={coordsToLatLngs(coords)}
                    pathOptions={{
                      color: isSelected || isHighlighted ? '#1e40af' : isHovered ? '#1e40af' : color,
                      weight: isSelected ? 4 : isHighlighted ? 5 : isHovered ? 3 : 2,
                      opacity: 0.9,
                      fillColor: color,
                      fillOpacity: isSelected ? 0.35 : isHighlighted ? 0.38 : isHovered ? 0.32 : 0.28,
                      lineJoin: 'round',
                      className:
                        'transition-all duration-200 ' +
                        (isSelected || isHighlighted
                          ? 'drop-shadow-[0_0_8px_rgba(37,99,235,0.35)]'
                          : isHovered
                            ? 'drop-shadow-[0_0_6px_rgba(15,23,42,0.18)]'
                            : ''),
                    }}
                    eventHandlers={{
                      click: () => {
                        setSelectedZoneId(z.id);
                        setShowMapMobile(true);
                      },
                      mouseover: () => setHoveredZoneId(z.id),
                      mouseout: () => setHoveredZoneId(null),
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

          {/* Map legend (glass) */}
          <div className="absolute bottom-4 right-4 z-[1000] pointer-events-none">
            <div className="bg-white/70 backdrop-blur-md border border-gray-200 rounded-xl shadow-md p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-700 mb-1">Legenda</div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-3 h-3 rounded-full bg-blue-500 border border-blue-600" />
                <span>Cobertura padrão</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-3 h-3 rounded-full bg-green-500 border border-green-600" />
                <span>Entrega grátis</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-3 h-3 rounded-full bg-yellow-500 border border-yellow-600" />
                <span>Zona personalizada</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-3 h-3 rounded-full bg-red-500 border border-red-600" />
                <span>Área bloqueada</span>
              </div>
            </div>
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

            <button
              type="button"
              onClick={() => setShowMapMobile(false)}
              className="lg:hidden h-10 px-3 rounded-lg bg-gray-900 text-white text-sm font-black hover:bg-black shadow-sm"
            >
              Voltar
            </button>

            {drawMode === 'drawing' ? (
              <Badge tone="blue" label="Modo desenho ativo" />
            ) : null}
          </div>

          {/* (Legenda movida para fora do MapContainer) */}

          {/* Editor panel (contextual drawer) */}
          {editorOpen ? (
            <div className="absolute top-4 right-4 w-[380px] max-w-[calc(100vw-32px)] bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden transition-all duration-200">
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
