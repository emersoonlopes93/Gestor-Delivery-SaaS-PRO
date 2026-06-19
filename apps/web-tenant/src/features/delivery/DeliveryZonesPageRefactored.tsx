import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle,
  Crosshair,
  Edit2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Target,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
// Import removido: createPolygonDrawer não é mais necessário
import type { LatLngExpression } from 'leaflet';
import { Tenant } from '@gestor/types';





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
type DeliveryPricingMode = 'fixed' | 'distance' | 'free' | 'tiers';

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
  distanceTiers?: Array<{
    id: string;
    minDistanceKm: string;
    maxDistanceKm: string;
    fee: string;
  }>;

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
  distanceTiers: Array<{
    id?: string;
    minDistanceKm: number;
    maxDistanceKm: number;
    fee: number;
  }>;
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

type DrawMode = 'idle' | 'drawing';

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

function fmtMoney(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `R$ ${v.toFixed(2)}`;
}

function parseDecimalString(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
  if (v === 'custom_zone_tiers') return 'Faixas de distância';
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


function SectionHeader(props: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-black text-foreground">{props.title}</div>
        {props.subtitle ? <div className="text-xs text-muted-foreground mt-0.5">{props.subtitle}</div> : null}
      </div>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  );
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

const ZoneEditLayer = memo(function ZoneEditLayer(props: {
  enabled: boolean;
  color: string;
  seedPolygon: PolygonCoordinates | null;
  onPolygonChange: (coords: PolygonCoordinates | null) => void;
}) {
  const { enabled, color, seedPolygon, onPolygonChange } = props;
  const map = useMap();
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);

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
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      map.removeControl(editControl);
      map.removeLayer(fg);
      featureGroupRef.current = null;
    };
  }, [color, map, onPolygonChange, enabled]);

  useEffect(() => {
    if (!featureGroupRef.current) return;
    clearLayers();

    if (!enabled || !seedPolygon || seedPolygon.length < 3) return;
    const seeded = ensureRingClosed(seedPolygon);
    const poly = new L.Polygon(coordsToLatLngs(seeded), {
      color,
      fillColor: color,
      fillOpacity: 0.12,
      weight: 3,
    });
    featureGroupRef.current.addLayer(poly);
  }, [clearLayers, color, seedPolygon, enabled]);

  return null;
});

const ManualDrawLayer = memo(function ManualDrawLayer(props: {
  enabled: boolean;
  points: L.LatLng[];
  setPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  color: string;
}) {
  const map = useMap();
  const [mousePos, setMousePos] = useState<L.LatLng | null>(null);

  useMapEvents({
    click: (e) => {
      if (!props.enabled) return;
      props.setPoints((prev) => [...prev, e.latlng]);
    },
    mousemove: (e) => {
      if (!props.enabled) return;
      setMousePos(e.latlng);
    },
    mouseout: () => {
      if (!props.enabled) return;
      setMousePos(null);
    }
  });

  useEffect(() => {
    const el = map.getContainer();
    if (props.enabled) {
      el.style.cursor = 'crosshair';
    } else {
      el.style.cursor = '';
      setMousePos(null);
    }
    return () => {
      el.style.cursor = '';
    };
  }, [props.enabled, map]);

  if (!props.enabled) return null;

  const currentPositions = [...props.points];
  if (mousePos) {
    currentPositions.push(mousePos);
  }

  return (
    <>
      {props.points.map((p, i) => (
        <CircleMarker
          key={i}
          center={p}
          radius={5}
          pathOptions={{ color: props.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }}
        />
      ))}
      
      {currentPositions.length >= 2 && (
        <Polygon
          positions={currentPositions}
          pathOptions={{
            color: props.color,
            weight: 2,
            dashArray: '5, 5',
            fillColor: currentPositions.length >= 3 ? props.color : 'transparent',
            fillOpacity: currentPositions.length >= 3 ? 0.12 : 0,
            interactive: false,
          }}
        />
      )}
    </>
  );
});

async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'pt-BR',
        'User-Agent': 'PedeHub-App',
      },
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
  } catch (err) {
    console.error('Nominatim geocoding error:', err);
  }
  return null;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export function DeliveryZonesPageRefactored() {
  const [coverage, setCoverage] = useState<CoverageConfig | null>(null);
  const [hasDefaultCoords, setHasDefaultCoords] = useState(false);
  const isMobile = useIsMobile();
  const [showMobileMap, setShowMobileMap] = useState(false);

  const [draftPolygonPoints, setDraftPolygonPoints] = useState<L.LatLng[]>([]);
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
  const [globalDistanceRule, setGlobalDistanceRule] = useState<DeliveryRateRule | null>(null);
  const [distanceTiersDraft, setDistanceTiersDraft] = useState<Array<{ id?: string; minDistanceKm: string; maxDistanceKm: string; fee: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedZone = useMemo(() => zones.find((z) => z.id === selectedZoneId) ?? null, [selectedZoneId, zones]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('idle');

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
    distanceTiers: [],
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
      distanceTiers: [],
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

      let fetchedLat = -23.55052;
      let fetchedLng = -46.633308;
      let hasConfig = false;

      if (covRes.success) {
        setCoverage(covRes.data ?? null);
        const cfg = covRes.data;
        if (cfg) {
          fetchedLat = cfg.storeLat;
          fetchedLng = cfg.storeLng;
          hasConfig = true;
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
        const ds = all.filter((r) => r.type === 'distance');

        setZones(zs.sort((a, b) => a.priority - b.priority));

        if (zs.length > 0 && !selectedZoneId) setSelectedZoneId(zs[0].id);

        const dRule = ds.find((r) => r.pricingMode === 'tiers');
        setGlobalDistanceRule(dRule || null);
        if (dRule?.distanceTiers) {
           setDistanceTiersDraft(dRule.distanceTiers);
        } else {
           setDistanceTiersDraft([]);
        }
      }

      const tenantRes = await api.get<Tenant>('/tenant/me');
      if (tenantRes.success && tenantRes.data) {
        const settings = tenantRes.data.settings;
        if (settings) {
          const isDefaultCoords = Math.abs(fetchedLat - (-23.55052)) < 0.0001 && Math.abs(fetchedLng - (-46.633308)) < 0.0001;
          let updatedToRealCoords = false;

          if (typeof settings.lat === 'number' && typeof settings.lng === 'number') {
            setCoverageDraft((d) => ({ ...d, storeLat: settings.lat ?? 0, storeLng: settings.lng ?? 0 }));
            setFitToStoreSeq((v) => v + 1);
            updatedToRealCoords = true;
          } else if (hasConfig && !isDefaultCoords) {
            setFitToStoreSeq((v) => v + 1);
            updatedToRealCoords = true;
          } else if (settings.street && settings.number && settings.city) {
            const addressStr = `${settings.street}, ${settings.number}, ${settings.neighborhood || ''}, ${settings.city} - ${settings.state || ''}, Brasil`;
            const coords = await geocodeNominatim(addressStr);
            if (coords) {
              setCoverageDraft((d) => ({ ...d, storeLat: coords.lat, storeLng: coords.lng }));
              setFitToStoreSeq((v) => v + 1);
              updatedToRealCoords = true;
            } else {
              setToast('Aviso: Não foi possível geocodificar o endereço. Edite o endereço da loja nas Configurações.');
            }
          } else {
            setToast('Aviso: Configure o endereço com precisão em Configurações para centralizar o mapa.');
          }

          setHasDefaultCoords(!updatedToRealCoords);
        }
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

  const openNewZone = useCallback(() => {
    resetZoneForm();
    setEditorOpen(false);
    setDrawMode('drawing');
  }, [resetZoneForm]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setDrawMode('idle');
  }, []);

  const handlePolygonChange = useCallback((coords: PolygonCoordinates | null) => {
    setZoneForm((z) => ({ ...z, polygonCoordinates: coords }));
    if (coords && coords.length >= 3 && drawMode === 'drawing') {
      setEditorOpen(true);
      setDrawMode('idle');
    }
  }, [drawMode]);

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

  const handleSaveDistanceTiers = useCallback(async () => {
    setSavingZone(true);
    setError(null);
    try {
      const payload = {
        type: 'distance' as const,
        isActive: true,
        priority: 500,
        isFallback: false,
        pricingMode: 'tiers' as const,
        distanceTiers: distanceTiersDraft.map((t, idx) => ({
          id: t.id,
          minDistanceKm: Number(t.minDistanceKm),
          maxDistanceKm: Number(t.maxDistanceKm),
          fee: Number(t.fee),
          sortOrder: idx
        })),
        name: 'Faixas de Distância Globais',
      };

      if (globalDistanceRule?.id) {
        await api.put(`/delivery/rates/${globalDistanceRule.id}`, payload);
        setToast('Faixas atualizadas');
      } else {
        await api.post('/delivery/rates', payload);
        setToast('Faixas criadas');
      }
      await fetchAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Erro ao salvar faixas';
      setError(msg);
    } finally {
      setSavingZone(false);
    }
  }, [fetchAll, distanceTiersDraft, globalDistanceRule]);

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
        distanceTiers: pricingMode === 'tiers' && zoneKind !== 'blocked_zone' ? zoneForm.distanceTiers : undefined,
        fixedRate: pricingMode === 'fixed' && zoneKind !== 'blocked_zone' ? fixedFee ?? undefined : undefined,
        ratePerKm: pricingMode === 'distance' && zoneKind !== 'blocked_zone' ? pricePerKm ?? undefined : undefined,
        rate: (pricingMode === 'free' && zoneKind !== 'blocked_zone') ? 0 : undefined,
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

  const renderEditorForm = () => (
    <div className="flex flex-col h-full bg-card">
      {isMobile && (
        <div className="p-4 shrink-0 bg-blue-50/50 border-b border-blue-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-900">
              <strong className="block font-black mb-1">Modo Simplificado</strong>
              Edição avançada de formato e desenho disponível apenas no Computador.
            </div>
          </div>
        </div>
      )}
      <div className="p-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="text-lg font-black text-foreground">
            {zoneForm.id ? 'Editar zona' : 'Nova zona'}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {drawMode === 'drawing'
              ? 'Desenhe no mapa e depois ajuste os detalhes.'
              : 'Essas regras têm prioridade sobre faixas de distância.'}
          </div>
        </div>
        <button
          type="button"
          onClick={closeEditor}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">
            Nome da zona
          </label>
          <input
            value={zoneForm.name}
            onChange={(e) => setZoneForm((z) => ({ ...z, name: e.target.value }))}
            className="w-full h-11 px-3 rounded-xl border border-input focus:outline-none focus:ring-2 focus:ring-primary-500 bg-card text-foreground transition-all shadow-sm"
            placeholder="Ex: Centro, Condomínios..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Cor no mapa
            </label>
            <input
              type="color"
              value={zoneForm.color}
              onChange={(e) => setZoneForm((z) => ({ ...z, color: e.target.value }))}
              className="w-full h-11 px-1 rounded-xl border border-input bg-card cursor-pointer shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Prioridade
            </label>
            <input
              type="number"
              min={0}
              value={zoneForm.priority}
              onChange={(e) => setZoneForm((z) => ({ ...z, priority: Number(e.target.value) }))}
              className="w-full h-11 px-3 rounded-xl border border-input focus:outline-none focus:ring-2 focus:ring-primary-500 bg-card text-foreground transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Finalidade
            </label>
            <select
              value={zoneForm.zoneKind}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'blocked_zone' || v === 'custom_zone') {
                  setZoneForm((z) => ({ ...z, zoneKind: v }));
                }
              }}
              className="w-full h-11 px-3 rounded-xl border border-input focus:outline-none focus:ring-2 focus:ring-primary-500 bg-card text-foreground transition-all shadow-sm"
            >
              <option value="custom_zone">Zona de entrega</option>
              <option value="blocked_zone">Área bloqueada</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Status
            </label>
            <button
              type="button"
              onClick={() => setZoneForm((z) => ({ ...z, isActive: !z.isActive }))}
              className={
                'w-full h-11 px-3 rounded-xl border text-sm font-bold inline-flex items-center justify-center gap-2 transition-all shadow-sm ' +
                (zoneForm.isActive
                  ? 'border-status-success bg-status-success/10 text-status-success dark:bg-status-success/10 dark:text-status-success'
                  : 'border-input bg-muted text-muted-foreground')
              }
            >
              {zoneForm.isActive ? 'Ativada' : 'Desativada'}
            </button>
          </div>
        </div>

        {zoneForm.zoneKind !== 'blocked_zone' ? (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Regra de cobrança
            </label>
            <div className="grid grid-cols-4 gap-2">
              {([
                { mode: 'fixed' as const, label: 'Fixa' },
                { mode: 'distance' as const, label: 'Por km' },
                { mode: 'tiers' as const, label: 'Faixas' },
                { mode: 'free' as const, label: 'Grátis' },
              ] as const).map((o) => (
                <button
                  key={o.mode}
                  type="button"
                  onClick={() => setZoneForm((z) => ({ ...z, pricingMode: o.mode }))}
                  className={
                    'h-10 rounded-xl border text-sm font-bold transition-all ' +
                    (zoneForm.pricingMode === o.mode
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400 shadow-sm'
                      : 'border-input bg-card text-muted-foreground hover:bg-muted')
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-400 flex items-center gap-3">
            <Ban className="h-5 w-5 shrink-0" />
            <div>
              <div className="font-bold">Entrega bloqueada</div>
              <div className="opacity-80">Pedidos com destino a esta área serão negados.</div>
            </div>
          </div>
        )}

        {zoneForm.zoneKind !== 'blocked_zone' && zoneForm.pricingMode === 'fixed' ? (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Valor da taxa (R$)
            </label>
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
              className="w-full h-11 px-3 rounded-xl border border-input focus:outline-none focus:ring-2 focus:ring-primary-500 bg-card text-foreground transition-all shadow-sm"
              placeholder="0,00"
            />
          </div>
        ) : null}

        {zoneForm.zoneKind !== 'blocked_zone' && zoneForm.pricingMode === 'distance' ? (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Valor por km percorrido (R$)
            </label>
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
              className="w-full h-11 px-3 rounded-xl border border-input focus:outline-none focus:ring-2 focus:ring-primary-500 bg-card text-foreground transition-all shadow-sm"
              placeholder="0,00"
            />
          </div>
        ) : null}

        {zoneForm.zoneKind !== 'blocked_zone' && zoneForm.pricingMode === 'free' ? (
          <div className="rounded-xl border border-status-success/20 dark:border-status-success/30 bg-status-success/10 dark:bg-status-success/10 p-4 text-sm text-status-success flex items-center gap-3">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <div>
              <div className="font-bold">Entrega grátis</div>
              <div className="opacity-80">Nenhuma taxa será cobrada nesta área.</div>
            </div>
          </div>
        ) : null}

        {zoneForm.zoneKind !== 'blocked_zone' && zoneForm.pricingMode === 'tiers' ? (
          <div className="space-y-4 border-t border-border pt-4 mt-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-foreground">
                Faixas de Distância
              </label>
              <button
                type="button"
                onClick={() => {
                  setZoneForm((z) => {
                    const lastMax = z.distanceTiers.length > 0 ? z.distanceTiers[z.distanceTiers.length - 1].maxDistanceKm : 0;
                    return {
                      ...z,
                      distanceTiers: [...z.distanceTiers, { minDistanceKm: lastMax, maxDistanceKm: lastMax + 1, fee: 5 }]
                    };
                  });
                }}
                className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Adicionar faixa
              </button>
            </div>

            {zoneForm.distanceTiers.length === 0 && (
              <div className="text-sm text-muted-foreground italic bg-muted/50 p-3 rounded-lg border border-border">
                Nenhuma faixa configurada. Adicione faixas para cobrar.
              </div>
            )}

            <div className="space-y-2">
              {zoneForm.distanceTiers.map((tier, idx) => (
                <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-muted p-2.5 rounded-xl border border-border relative">
                  <div className="flex-1 min-w-[80px]">
                    <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">De (km)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={tier.minDistanceKm}
                      onChange={(e) => {
                        const newTiers = [...zoneForm.distanceTiers];
                        newTiers[idx].minDistanceKm = Number(e.target.value);
                        setZoneForm((z) => ({ ...z, distanceTiers: newTiers }));
                      }}
                      className="w-full h-9 px-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex-1 min-w-[80px]">
                    <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Até (km)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={tier.maxDistanceKm}
                      onChange={(e) => {
                        const newTiers = [...zoneForm.distanceTiers];
                        newTiers[idx].maxDistanceKm = Number(e.target.value);
                        setZoneForm((z) => ({ ...z, distanceTiers: newTiers }));
                      }}
                      className="w-full h-9 px-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex-1 min-w-[90px]">
                    <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Valor (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={tier.fee}
                      onChange={(e) => {
                        const newTiers = [...zoneForm.distanceTiers];
                        newTiers[idx].fee = Number(e.target.value);
                        setZoneForm((z) => ({ ...z, distanceTiers: newTiers }));
                      }}
                      className="w-full h-9 px-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex items-end pb-[2px]">
                    <button
                      type="button"
                      onClick={() => {
                        const newTiers = zoneForm.distanceTiers.filter((_, i) => i !== idx);
                        setZoneForm((z) => ({ ...z, distanceTiers: newTiers }));
                      }}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors h-9 flex items-center justify-center"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

      </div>

      <div className="shrink-0 bg-card border-t border-border p-4 space-y-3 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          {!isMobile && (
            <button
              type="button"
              onClick={() => {
                setDrawMode('drawing');
                setEditorOpen(false);
                setDraftPolygonPoints([]);
              }}
              className="h-12 px-4 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-sm font-bold flex flex-1 items-center justify-center gap-2 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Refazer desenho
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveZone}
            disabled={savingZone}
            className="h-12 flex-1 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-md transition-all"
          >
            {savingZone ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Salvar
          </button>
        </div>

        <button
          type="button"
          onClick={closeEditor}
          className="h-12 w-full rounded-xl bg-card border border-input text-sm font-black text-foreground hover:bg-muted transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          <span className="ml-3 text-muted-foreground">Carregando Zonas de Entrega...</span>
        </div>
      </div>
    );
  }

  const renderLeftPanelContent = () => {
    if (drawMode === 'drawing') {
      return (
        <div className="flex flex-col h-full bg-card">
          <div className="p-6 pb-4 border-b border-border shrink-0">
            <button 
              type="button"
              onClick={() => { setDrawMode('idle'); setEditorOpen(false); setDraftPolygonPoints([]); }} 
              className="p-2 -ml-2 mb-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-bold">Voltar</span>
            </button>
            <h2 className="text-xl font-black text-foreground">Desenhando nova zona</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Clique no mapa para adicionar pontos. Use Concluir área quando terminar.
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-muted p-4 rounded-xl text-center border border-border">
              <Crosshair className="h-8 w-8 text-primary mx-auto mb-2 animate-pulse" />
              <div className="font-black text-lg">{draftPolygonPoints.length}</div>
              <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Pontos marcados</div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setDraftPolygonPoints((prev) => prev.slice(0, -1))}
                disabled={draftPolygonPoints.length === 0}
                className="w-full h-10 rounded-xl bg-card border border-input text-sm font-bold hover:bg-muted transition-colors disabled:opacity-50"
              >
                Desfazer ponto
              </button>
              <button
                type="button"
                onClick={() => setDraftPolygonPoints([])}
                disabled={draftPolygonPoints.length === 0}
                className="w-full h-10 rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 text-sm font-bold hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                Limpar
              </button>
            </div>
          </div>
          <div className="mt-auto p-4 border-t border-border shrink-0">
            <button
              onClick={() => {
                if (draftPolygonPoints.length >= 3) {
                  handlePolygonChange(latLngsToCoords(draftPolygonPoints));
                  setDrawMode('idle');
                  setEditorOpen(true);
                  setDraftPolygonPoints([]);
                }
              }}
              disabled={draftPolygonPoints.length < 3}
              className="w-full h-12 rounded-xl bg-status-success text-white text-sm font-black hover:bg-status-success/90 transition-all shadow-md disabled:opacity-50"
            >
              Concluir área
            </button>
          </div>
        </div>
      );
    }

    if (editorOpen) {
      return renderEditorForm();
    }

    return (
      <div className="flex flex-col h-full bg-card">
        <div className="p-6 pb-4 border-b border-border shrink-0">
          <h1 className="text-2xl font-black text-foreground">Zonas de Entrega</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Desenhe áreas específicas para cobrar taxas diferentes por região.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {hasDefaultCoords && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl flex items-start gap-3 shadow-sm">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-black">Endereço não configurado</div>
                <div className="text-xs font-medium mt-0.5 opacity-90">
                  O mapa está usando coordenadas padrão. Configure a origem real.
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={openNewZone}
              className="h-12 w-full rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-all shadow-md inline-flex items-center justify-center gap-2"
            >
              <Plus className="h-5 w-5" />
              Desenhar nova zona
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFitToStoreSeq((v) => v + 1)}
                className="h-10 rounded-xl bg-card border border-input text-sm font-bold text-foreground hover:bg-muted inline-flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <Crosshair className="h-4 w-4" />
                Localizar loja
              </button>

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
                  'h-10 rounded-xl border text-sm font-bold transition-all inline-flex items-center justify-center gap-2 shadow-sm ' +
                  (simulationOn
                    ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                    : 'bg-card text-foreground border border-border hover:bg-muted')
                }
              >
                <Target className="h-4 w-4" />
                Simular CEP
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeader
              title="Cobertura Base (Raio)"
              subtitle="Configuração padrão sem zonas."
              right={
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={coverageDraft.isDeliveryEnabled}
                    onChange={() => setCoverageDraft((d) => ({ ...d, isDeliveryEnabled: !d.isDeliveryEnabled }))}
                  />
                  <div
                    className={`w-11 h-6 rounded-full transition-colors relative ${coverageDraft.isDeliveryEnabled ? 'bg-primary' : 'bg-muted border border-border'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${coverageDraft.isDeliveryEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </div>
                </label>
              }
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Raio Max (km)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={coverageDraft.maxRadiusKm}
                  onChange={(e) => setCoverageDraft((d) => ({ ...d, maxRadiusKm: Number(e.target.value) }))}
                  className="input-premium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Preço/km (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={coverageDraft.defaultPricePerKm}
                  onChange={(e) =>
                    setCoverageDraft((d) => ({ ...d, defaultPricePerKm: Number(e.target.value) }))
                  }
                  className="input-premium"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveCoverage}
              disabled={savingCoverage}
              className="w-full h-10 rounded-xl bg-card text-foreground border border-border text-sm font-bold hover:bg-muted transition-all inline-flex items-center justify-center gap-2 shadow-sm"
            >
              {savingCoverage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar cobertura base
            </button>
          </div>

          <div className="border-t border-border pt-6">
            <SectionHeader
              title="Zonas Mapeadas"
              subtitle="Áreas desenhadas com regras exclusivas."
            />

            <div className="mt-4">
              {visibleZones.length === 0 ? (
                <div className="text-center py-8 bg-muted/20 border border-dashed border-border text-muted-foreground rounded-2xl p-4">
                  <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <div className="text-sm font-bold">Sem zonas criadas</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleZones.map((z) => {
                    const isSelected = selectedZoneId === z.id;
                    const isHovered = hoveredZoneId === z.id;
                    return (
                      <div
                        key={z.id}
                        className={`group p-3 rounded-xl border cursor-pointer transition-all ${isSelected
                            ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-500/10 shadow-sm ring-1 ring-primary-500'
                            : isHovered
                              ? 'border-input bg-muted'
                              : 'border-input bg-card'
                          }`}
                        onClick={() => setSelectedZoneId(z.id)}
                        onMouseEnter={() => setHoveredZoneId(z.id)}
                        onMouseLeave={() => setHoveredZoneId(null)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: z.color ?? defaultZoneColor() }}
                              />
                              <span className="text-sm font-bold text-foreground truncate">
                                {z.name || `Zona ${visibleZones.indexOf(z) + 1}`}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {z.zoneKind === 'blocked_zone' ? 'Bloqueada' : z.pricingMode === 'free' ? 'Entrega grátis' : 'Com taxa'}
                            </div>
                          </div>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedZoneId(z.id);
                                setEditorOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteZone(z);
                              }}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDesktopContent = () => (
    <div className="h-full flex overflow-hidden bg-muted/50 relative">
      <div className="w-[360px] max-w-[380px] shrink-0 h-full border-r border-border flex flex-col z-10 shadow-sm relative overflow-hidden bg-card">
        {renderLeftPanelContent()}
      </div>

      <div className="flex-1 min-w-0 h-full bg-muted/50 relative" style={{ isolation: 'isolate' }}>
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
                  weight: simulationDecision?.matchedStrategy === 'base_radius' ? 3 : 2,
                  opacity: 0.9,
                  fillColor: '#3b82f6',
                  fillOpacity: simulationDecision?.matchedStrategy === 'base_radius' ? 0.12 : 0.08,
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
                      '<div class="w-9 h-9 rounded-full bg-card shadow-md border border-input flex items-center justify-center">' +
                      '<div class="w-3 h-3 rounded-full bg-card"></div>' +
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
                  className="!bg-card !border-0 !shadow-none"
                >
                  <div
                    className={
                      'w-[280px] rounded-2xl border p-4 shadow-lg backdrop-blur-md bg-card text-card-foreground ' +
                      (simulationDecision
                        ? simulationDecision.canDeliver
                          ? 'border-status-success/30 border-l-4 border-l-status-success'
                          : 'border-destructive/30 border-l-4 border-l-destructive'
                        : 'border-border')
                    }
                  >
                    {simulationLoading ? (
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Calculando entrega...
                      </div>
                    ) : simulationError ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-black text-red-700">
                          <AlertCircle className="h-5 w-5" />
                          Entrega indisponível
                        </div>
                        <div className="text-xs text-muted-foreground">{simulationError}</div>
                      </div>
                    ) : simulationDecision ? (
                      <div className="space-y-2">
                        <div
                          className={
                            'flex items-center gap-2 text-base font-black ' +
                            (simulationDecision.canDeliver ? 'text-status-success' : 'text-destructive')
                          }
                        >
                          {simulationDecision.canDeliver ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            <AlertCircle className="h-5 w-5" />
                          )}
                          {simulationDecision.canDeliver ? 'Entrega disponível' : 'Entrega indisponível'}
                        </div>
                        <div className="text-sm font-semibold text-foreground">
                          Taxa de entrega: {fmtMoney(simulationDecision.fee)}
                        </div>
                        {(() => {
                          const zoneName = zoneNameById(zones, simulationDecision.matchedZoneId);
                          return zoneName ? (
                            <div className="text-xs text-foreground">
                              <span className="font-semibold">Zona aplicada:</span> {zoneName}
                            </div>
                          ) : null;
                        })()}
                        <div className="text-xs text-foreground">
                          <span className="font-semibold">Regra aplicada:</span> {strategyLabel(simulationDecision.matchedStrategy)}
                        </div>
                        {typeof simulationDecision.distanceKm === 'number' ? (
                          <div className="text-xs text-foreground">
                            <span className="font-semibold">Distância:</span> {simulationDecision.distanceKm.toFixed(2)} km
                          </div>
                        ) : null}
                        <div className="text-[11px] text-muted-foreground pt-1">{simulationDecision.reason}</div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm font-black text-foreground">Clique no mapa</div>
                        <div className="text-xs text-muted-foreground mt-1">
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
                    click: () => setSelectedZoneId(z.id),
                    mouseover: () => setHoveredZoneId(z.id),
                    mouseout: () => setHoveredZoneId(null),
                  }}
                />
              );
            })}
            <ZoneEditLayer
              enabled={editorOpen && drawMode !== 'drawing'}
              color={zoneForm.color}
              seedPolygon={editorOpen ? zoneForm.polygonCoordinates : null}
              onPolygonChange={handlePolygonChange}
            />
            <ManualDrawLayer
              enabled={drawMode === 'drawing'}
              points={draftPolygonPoints}
              setPoints={setDraftPolygonPoints}
              color={zoneForm.color}
            />
          </MapContainer>
        </div>

        <div className="hidden lg:block absolute bottom-6 right-6 z-[1000]">
          <div className="bg-white/95 dark:bg-slate-950/95 text-slate-950 dark:text-white border border-slate-200 dark:border-white/15 rounded-2xl shadow-xl dark:shadow-2xl backdrop-blur-md absolute bottom-0 right-0 min-w-[180px] p-4 space-y-3">
            <div className="text-xs font-black text-slate-950 dark:text-white mb-1 uppercase tracking-wide">LEGENDA</div>

            <div className="flex items-center gap-3 text-xs font-semibold text-slate-800 dark:text-slate-100">
              <div className="w-3.5 h-3.5 rounded-full bg-primary border border-primary shadow-sm shrink-0" />
              <span>Cobertura padrão</span>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold text-slate-800 dark:text-slate-100">
              <div className="w-3.5 h-3.5 rounded-full bg-status-success border border-status-success shadow-sm shrink-0" />
              <span>Entrega grátis</span>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold text-slate-800 dark:text-slate-100">
              <div className="w-3.5 h-3.5 rounded-full bg-status-warning border border-status-warning shadow-sm shrink-0" />
              <span>Zona com taxa</span>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold text-slate-800 dark:text-slate-100">
              <div className="w-3.5 h-3.5 rounded-full bg-destructive border border-destructive shadow-sm shrink-0" />
              <span>Área bloqueada</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMobileContent = () => {
    if (showMobileMap) {
      return (
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
          <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-border bg-card">
            <h2 className="text-lg font-black text-foreground">Visualização do Mapa</h2>
            <button
              type="button"
              onClick={() => setShowMobileMap(false)}
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 relative bg-slate-100 dark:bg-slate-900">
            <MapContainer
              center={mapCenter}
              zoom={14}
              className="h-full w-full"
              dragging={!isMobile}
              touchZoom={!isMobile}
              scrollWheelZoom={!isMobile}
              doubleClickZoom={!isMobile}
              zoomControl={false}
            >
              <MapImperative storePosition={storePosition} fitToStoreSeq={fitToStoreSeq} />
              <MapRefSync mapRef={mapRef} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={storePosition} />
              {coverage && (
                <Circle
                  center={[coverage.storeLat, coverage.storeLng]}
                  radius={Number(coverage.maxRadiusKm) * 1000}
                  pathOptions={{
                    color: '#3b82f6',
                    weight: 2,
                    opacity: 0.9,
                    fillColor: '#3b82f6',
                    fillOpacity: 0.08,
                    dashArray: '8, 6',
                    lineJoin: 'round',
                  }}
                />
              )}
              {visibleZones.map((z) => {
                const coords = normalizePolygonCoordinates(z.polygonCoordinates);
                if (!coords || coords.length < 3) return null;
                const color = z.color ?? z.geoJson?.properties?.color ?? defaultZoneColor();
                return (
                  <Polygon
                    key={`zone-${z.id}`}
                    positions={coordsToLatLngs(coords)}
                    pathOptions={{
                      color: color,
                      weight: 3,
                      opacity: 0.9,
                      fillColor: color,
                      fillOpacity: 0.25,
                      lineJoin: 'round',
                    }}
                  />
                );
              })}
            </MapContainer>
          </div>
        </div>
      );
    }

    if (editorOpen) {
      return (
        <div className="h-full bg-background overflow-y-auto">
          {renderEditorForm()}
        </div>
      );
    }

    return (
      <div className="h-full bg-background overflow-y-auto p-4 space-y-6 pb-24">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-foreground">Zonas de Entrega</h2>
          <p className="text-sm text-muted-foreground">
            Configure raio, taxas e zonas sem precisar usar o mapa no celular.
          </p>
        </div>

        {hasDefaultCoords && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl flex items-start gap-3 shadow-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-black">Endereço não configurado</div>
              <div className="text-xs font-medium mt-0.5 opacity-90">
                Configure a origem real da sua loja nas Configurações Gerais para que o raio funcione a partir de você.
              </div>
            </div>
          </div>
        )}

        <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 text-blue-900 shadow-sm flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <strong className="block font-black mb-1">Modo Simplificado</strong>
            Edição avançada de mapa e desenho de polígonos disponível apenas no Computador.
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {coverageDraft && (
          <div className="space-y-4">
            <h3 className="text-lg font-black text-foreground">Cobertura Principal (Raio)</h3>
            <div className="p-5 rounded-xl border border-input bg-card shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Entrega ativa</span>
                <button
                  type="button"
                  onClick={() => setCoverageDraft(d => ({ ...d, isDeliveryEnabled: !d.isDeliveryEnabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                    coverageDraft.isDeliveryEnabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      coverageDraft.isDeliveryEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Raio Máximo (km)</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={coverageDraft.maxRadiusKm}
                  onChange={(e) => setCoverageDraft((d) => ({ ...d, maxRadiusKm: Number(e.target.value) }))}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-card focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Taxa Padrão por km (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={coverageDraft.defaultPricePerKm}
                  onChange={(e) => setCoverageDraft((d) => ({ ...d, defaultPricePerKm: Number(e.target.value) }))}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-card focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveCoverage}
                disabled={savingCoverage}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-black flex items-center justify-center shadow-sm disabled:opacity-70 transition-all"
              >
                {savingCoverage ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar Cobertura
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-foreground">Entrega por distância</h3>
            <p className="text-sm text-muted-foreground">Use faixas para cobrar valores diferentes conforme a distância.</p>
          </div>
          
          <div className="p-5 rounded-xl border border-input bg-card shadow-sm space-y-4">
            {distanceTiersDraft.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-input bg-muted/30 text-center">
                <div className="text-sm font-semibold mb-1">Nenhuma faixa configurada.</div>
                <div className="text-xs text-muted-foreground">Você pode usar a taxa padrão acima ou adicionar faixas por KM aqui.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {distanceTiersDraft.map((tier, idx) => (
                  <div key={idx} className="flex flex-col gap-2 p-3 rounded-lg border border-input bg-muted/20">
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        min={0} 
                        step={0.1} 
                        value={tier.minDistanceKm} 
                        onChange={e => {
                          const val = e.target.value;
                          setDistanceTiersDraft(draft => draft.map((t, i) => i === idx ? { ...t, minDistanceKm: val } : t));
                        }} 
                        className="w-20 h-9 px-2 text-sm rounded-lg border border-input bg-card" 
                        placeholder="De (km)"
                      />
                      <span className="text-sm text-muted-foreground">a</span>
                      <input 
                        type="number" 
                        min={0} 
                        step={0.1} 
                        value={tier.maxDistanceKm} 
                        onChange={e => {
                          const val = e.target.value;
                          setDistanceTiersDraft(draft => draft.map((t, i) => i === idx ? { ...t, maxDistanceKm: val } : t));
                        }} 
                        className="w-20 h-9 px-2 text-sm rounded-lg border border-input bg-card" 
                        placeholder="Até (km)"
                      />
                      <span className="text-sm text-muted-foreground">km</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                        <input 
                          type="number" 
                          min={0} 
                          step={0.01} 
                          value={tier.fee} 
                          onChange={e => {
                            const val = e.target.value;
                            setDistanceTiersDraft(draft => draft.map((t, i) => i === idx ? { ...t, fee: val } : t));
                          }} 
                          className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-input bg-card" 
                          placeholder="0.00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setDistanceTiersDraft(draft => draft.filter((_, i) => i !== idx))}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {Number(tier.maxDistanceKm) <= Number(tier.minDistanceKm) && (
                      <div className="text-xs font-semibold text-red-500">A distância final deve ser maior que a inicial.</div>
                    )}
                    {idx > 0 && Number(tier.minDistanceKm) < Number(distanceTiersDraft[idx-1].maxDistanceKm) && (
                      <div className="text-xs font-semibold text-yellow-600">Esta faixa cruza com a faixa anterior.</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <button
              type="button"
              onClick={() => {
                const last = distanceTiersDraft[distanceTiersDraft.length - 1];
                const nextMin = last ? Number(last.maxDistanceKm) : 0;
                const nextMax = nextMin + 5;
                setDistanceTiersDraft(draft => [...draft, { minDistanceKm: String(nextMin), maxDistanceKm: String(nextMax), fee: '0' }]);
              }}
              className="w-full h-9 rounded-lg border border-dashed border-input hover:bg-muted text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" /> Adicionar faixa
            </button>

            <button
              type="button"
              onClick={handleSaveDistanceTiers}
              disabled={savingZone}
              className="w-full h-11 rounded-xl bg-card border border-border text-foreground hover:bg-muted text-sm font-black flex items-center justify-center shadow-sm disabled:opacity-70 transition-all mt-4"
            >
              {savingZone ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Faixas
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-foreground">Zonas Avançadas</h3>
            <button
              type="button"
              onClick={() => setShowMobileMap(true)}
              className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
            >
              <MapPin className="h-3 w-3" /> Ver mapa
            </button>
          </div>

          {visibleZones.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-input bg-muted/30 text-center">
              <div className="text-sm font-semibold mb-1">Nenhuma zona avançada criada.</div>
              <div className="text-xs text-muted-foreground mb-4">Você pode usar a cobertura por raio agora e criar polígonos depois pelo computador.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleZones.map((z) => (
                <div key={z.id} className="p-4 rounded-xl border border-input bg-card shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-3 h-3 rounded-full border border-white shadow-sm shrink-0"
                          style={{ backgroundColor: z.color ?? defaultZoneColor() }}
                        />
                        <span className="text-sm font-bold text-foreground truncate">
                          {z.name || `Zona ${visibleZones.indexOf(z) + 1}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase font-bold tracking-wider">
                        <span className={z.isActive ? 'text-status-success' : 'text-muted-foreground'}>
                          {z.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-blue-600 dark:text-blue-400">
                           {z.zoneKind === 'blocked_zone' ? 'Bloqueada' : z.pricingMode === 'free' ? 'Grátis' : 'Com Taxa'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedZoneId(z.id);
                        setEditorOpen(true);
                      }}
                      className="flex-1 h-9 rounded-lg border border-input bg-card hover:bg-muted text-xs font-black transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit2 className="h-3 w-3" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMobileMap(true)}
                      className="flex-1 h-9 rounded-lg border border-input bg-card hover:bg-muted text-xs font-black transition-colors flex items-center justify-center gap-2"
                    >
                      <MapPin className="h-3 w-3" /> Ver mapa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-64px)] min-h-[720px]">
      <div className="hidden lg:block h-full">
        {renderDesktopContent()}
      </div>
      <div className="lg:hidden h-full">
        {renderMobileContent()}
      </div>
    </div>
  );
}

export default DeliveryZonesPageRefactored;
