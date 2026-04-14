import { useMemo, useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, MapPin, Route, DollarSign, Layers, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '../../lib/api-client';
import { MapContainer, TileLayer, FeatureGroup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import type { LatLngExpression } from 'leaflet';

type PolygonCoordinates = Array<[number, number]>; // [[lng,lat],...]

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

interface DeliveryRateRule {
  id: string;
  type: DeliveryRateRuleType;
  priority?: number;
  isFallback?: boolean;
  neighborhood?: string;
  rate?: number;
  minKm?: number;
  maxKm?: number;
  ratePerKm?: number;
  fixedRate?: number;
  geoJson?: DeliveryRuleGeoJson | null;
  polygonCoordinates?: unknown[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type CreateRuleDto = Omit<DeliveryRateRule, 'id' | 'createdAt' | 'updatedAt'>;

const TYPE_LABELS = {
  neighborhood: 'Por Bairro',
  distance: 'Por Distância',
  fixed: 'Taxa Fixa',
  polygon: 'Por Zona (Polígono)',
};

const TYPE_ICONS = {
  neighborhood: MapPin,
  distance: Route,
  fixed: DollarSign,
  polygon: Layers,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' ? v : null;
}

function pickBoolean(obj: Record<string, unknown>, key: string): boolean | null {
  const v = obj[key];
  return typeof v === 'boolean' ? v : null;
}

function normalizePolygonCoordinates(value: unknown): PolygonCoordinates | null {
  if (!Array.isArray(value)) return null;
  const out: PolygonCoordinates = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const lng = item[0];
    const lat = item[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    out.push([lng, lat]);
  }
  return out;
}

function coordsToLatLngs(coords: PolygonCoordinates): LatLngExpression[] {
  return coords.map(([lng, lat]) => [lat, lng] as LatLngExpression);
}

function latLngsToCoords(latLngs: L.LatLng[]): PolygonCoordinates {
  return latLngs.map((p) => [p.lng, p.lat]);
}

function defaultZoneColor(): string {
  return '#2563eb';
}

function getZoneMeta(rule: DeliveryRateRule): { name: string | null; color: string } {
  const gj = rule.geoJson;
  const name = gj && typeof gj.properties?.name === 'string' ? gj.properties.name : null;
  const color = gj && typeof gj.properties?.color === 'string' ? gj.properties.color : defaultZoneColor();
  return { name, color };
}

function ensureRingClosed(points: PolygonCoordinates): PolygonCoordinates {
  if (points.length === 0) return points;
  const [flng, flat] = points[0];
  const [llng, llat] = points[points.length - 1];
  if (flng === llng && flat === llat) return points;
  return [...points, [flng, flat]];
}

const PolygonDrawControl = function PolygonDrawControl(props: {
  zoneColor: string;
  polygonCoords: PolygonCoordinates | null;
  onChange: (coords: PolygonCoordinates | null) => void;
}) {
  const { zoneColor, polygonCoords, onChange } = props;
  const map = useMap();

  useEffect(() => {
    const fg = new L.FeatureGroup();
    map.addLayer(fg);

    const drawControl = new L.Control.Draw({
      position: 'topright',
      edit: {
        featureGroup: fg,
        edit: {
          selectedPathOptions: {
            color: zoneColor,
            fillColor: zoneColor,
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
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: zoneColor,
            fillColor: zoneColor,
            fillOpacity: 0.12,
            weight: 3,
          },
        },
      },
    });

    map.addControl(drawControl);

    const syncFromLayer = (layer: L.Layer) => {
      if (layer instanceof L.Polygon) {
        const latLngs = layer.getLatLngs();
        if (!Array.isArray(latLngs) || latLngs.length === 0) return;
        const first = latLngs[0];
        if (!Array.isArray(first)) return;
        const ring = first;
        if (ring.every((p) => p instanceof L.LatLng)) {
          onChange(latLngsToCoords(ring));
        }
      }
    };

    const onCreated = (e: L.LeafletEvent) => {
      if (!isRecord(e)) return;
      const layer = e['layer'];
      if (layer instanceof L.Layer) {
        fg.clearLayers();
        fg.addLayer(layer);
        syncFromLayer(layer);
      }
    };

    const onEdited = (e: L.LeafletEvent) => {
      if (!isRecord(e)) return;
      const layers = e['layers'];
      if (layers instanceof L.LayerGroup) {
        const list = layers.getLayers();
        for (const layer of list) {
          syncFromLayer(layer);
          return;
        }
      }
    };

    const onDeleted = () => {
      fg.clearLayers();
      onChange(null);
    };

    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.EDITED, onEdited);
    map.on(L.Draw.Event.DELETED, onDeleted);

    // Seed existing polygon when editing
    if (polygonCoords && polygonCoords.length >= 3) {
      const seeded = ensureRingClosed(polygonCoords);
      const seededLatLngs = coordsToLatLngs(seeded);
      const poly = new L.Polygon(seededLatLngs as L.LatLngExpression[], {
        color: zoneColor,
        fillColor: zoneColor,
        fillOpacity: 0.12,
        weight: 3,
      });
      fg.addLayer(poly);
    }

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.off(L.Draw.Event.EDITED, onEdited);
      map.off(L.Draw.Event.DELETED, onDeleted);
      map.removeControl(drawControl);
      map.removeLayer(fg);
    };
  }, [map, onChange, polygonCoords, zoneColor]);

  return null;
};

export function DeliveryRatesPage() {
  const [rules, setRules] = useState<DeliveryRateRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<DeliveryRateRule | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get<DeliveryRateRule[]>('/delivery/rates');
      if (response.success) {
        setRules(response.data || []);
      }
    } catch (err) {
      console.error('Erro ao buscar regras:', err);
      setError('Erro ao carregar regras de entrega');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRule(null);
    setShowModal(true);
  };

  const handleEdit = (rule: DeliveryRateRule) => {
    setEditingRule(rule);
    setShowModal(true);
  };

  const handleDelete = async (rule: DeliveryRateRule) => {
    if (!confirm(`Tem certeza que deseja excluir esta regra?`)) return;

    try {
      await api.delete(`/delivery/rates/${rule.id}`);
      await fetchRules();
    } catch (err) {
      console.error('Erro ao excluir regra:', err);
      alert('Erro ao excluir regra');
    }
  };

  const handleToggleActive = async (rule: DeliveryRateRule) => {
    try {
      const updatedRule = { ...rule, isActive: !rule.isActive };
      await api.put(`/delivery/rates/${rule.id}`, updatedRule);
      await fetchRules();
    } catch (err) {
      console.error('Erro ao atualizar regra:', err);
      alert('Erro ao atualizar regra');
    }
  };

  const handleSubmit = async (data: CreateRuleDto) => {
    try {
      setSaving(true);
      
      if (editingRule) {
        await api.put(`/delivery/rates/${editingRule.id}`, data);
      } else {
        await api.post('/delivery/rates', data);
      }
      
      await fetchRules();
      setShowModal(false);
      setEditingRule(null);
    } catch (err) {
      console.error('Erro ao salvar regra:', err);
      alert('Erro ao salvar regra');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveUp = async (rule: DeliveryRateRule) => {
    const sortedRules = [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const currentIndex = sortedRules.findIndex(r => r.id === rule.id);
    
    if (currentIndex <= 0) return; // Já está no topo
    
    const previousRule = sortedRules[currentIndex - 1];
    const currentPriority = rule.priority ?? currentIndex;
    const previousPriority = previousRule.priority ?? (currentIndex - 1);
    
    try {
      // Trocar prioridades
      await Promise.all([
        api.put(`/delivery/rates/${rule.id}`, { ...rule, priority: previousPriority }),
        api.put(`/delivery/rates/${previousRule.id}`, { ...previousRule, priority: currentPriority })
      ]);
      
      await fetchRules();
    } catch (err) {
      console.error('Erro ao mover regra para cima:', err);
      alert('Erro ao mover regra');
    }
  };

  const handleMoveDown = async (rule: DeliveryRateRule) => {
    const sortedRules = [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const currentIndex = sortedRules.findIndex(r => r.id === rule.id);
    
    if (currentIndex >= sortedRules.length - 1) return; // Já está no final
    
    const nextRule = sortedRules[currentIndex + 1];
    const currentPriority = rule.priority ?? currentIndex;
    const nextPriority = nextRule.priority ?? (currentIndex + 1);
    
    try {
      // Trocar prioridades
      await Promise.all([
        api.put(`/delivery/rates/${rule.id}`, { ...rule, priority: nextPriority }),
        api.put(`/delivery/rates/${nextRule.id}`, { ...nextRule, priority: currentPriority })
      ]);
      
      await fetchRules();
    } catch (err) {
      console.error('Erro ao mover regra para baixo:', err);
      alert('Erro ao mover regra');
    }
  };

  const formatRuleDescription = (rule: DeliveryRateRule) => {
    switch (rule.type) {
      case 'neighborhood':
        return `${rule.neighborhood} - R$ ${Number(rule.rate || 0).toFixed(2)}`;
      case 'distance':
        return `${rule.minKm}-${rule.maxKm}km - R$ ${Number(rule.ratePerKm || 0).toFixed(2)}/km`;
      case 'fixed':
        return `Taxa fixa - R$ ${Number(rule.fixedRate || 0).toFixed(2)}`;
      case 'polygon': {
        const meta = getZoneMeta(rule);
        const title = meta.name ? meta.name : 'Zona sem nome';
        return `${title} - R$ ${Number(rule.fixedRate || rule.rate || 0).toFixed(2)}`;
      }
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <span className="ml-2 text-gray-500">Carregando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Taxas de Entrega</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure as regras para cálculo de taxa de entrega
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Regra
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma regra configurada</h3>
          <p className="text-gray-500 mb-4">
            Crie sua primeira regra de taxa de entrega para começar a usar o sistema
          </p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Regra
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {[...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)).map((rule, index, sortedRules) => {
            const Icon = TYPE_ICONS[rule.type];
            const meta = rule.type === 'polygon' ? getZoneMeta(rule) : null;
            const canMoveUp = index > 0;
            const canMoveDown = index < sortedRules.length - 1;
            
            return (
              <div
                key={rule.id}
                className={`bg-white rounded-lg border p-4 ${
                  rule.isActive ? 'border-gray-200' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      rule.isActive ? 'bg-primary-100 text-primary-600' : 'bg-gray-200 text-gray-400'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {TYPE_LABELS[rule.type]}
                        </span>
                        {rule.type === 'polygon' ? (
                          <span
                            className="px-2 py-0.5 text-xs font-black rounded-full border"
                            style={{ borderColor: meta?.color ?? defaultZoneColor(), color: meta?.color ?? defaultZoneColor() }}
                          >
                            Polygon
                          </span>
                        ) : null}
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          rule.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {rule.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                        {rule.isFallback ? (
                          <span className="px-2 py-0.5 text-xs font-black rounded-full bg-amber-100 text-amber-800">
                            Fallback
                          </span>
                        ) : null}
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          #{index + 1}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatRuleDescription(rule)}
                      </p>
                      {typeof rule.priority === 'number' ? (
                        <p className="text-xs text-gray-400 mt-1">Prioridade: {rule.priority}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveUp(rule)}
                        disabled={!canMoveUp}
                        className={`p-1 rounded transition-colors ${
                          canMoveUp
                            ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            : 'text-gray-200 cursor-not-allowed'
                        }`}
                        title="Mover para cima"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveDown(rule)}
                        disabled={!canMoveDown}
                        className={`p-1 rounded transition-colors ${
                          canMoveDown
                            ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            : 'text-gray-200 cursor-not-allowed'
                        }`}
                        title="Mover para baixo"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        rule.isActive
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {rule.isActive ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => handleEdit(rule)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <DeliveryRateModal
          rule={editingRule}
          onClose={() => {
            setShowModal(false);
            setEditingRule(null);
          }}
          onSubmit={handleSubmit}
          saving={saving}
        />
      )}
    </div>
  );
}

// Modal Component
interface DeliveryRateModalProps {
  rule: DeliveryRateRule | null;
  onClose: () => void;
  onSubmit: (data: CreateRuleDto) => void;
  saving: boolean;
}

function DeliveryRateModal({ rule, onClose, onSubmit, saving }: DeliveryRateModalProps) {
  const [formData, setFormData] = useState<CreateRuleDto>(() => ({
    type: 'neighborhood',
    neighborhood: '',
    rate: 0,
    minKm: 0,
    maxKm: 0,
    ratePerKm: 0,
    fixedRate: 0,
    priority: 1000,
    isFallback: false,
    geoJson: null,
    polygonCoordinates: null,
    isActive: true,
  }));

  const [zoneName, setZoneName] = useState('');
  const [zoneColor, setZoneColor] = useState(defaultZoneColor());
  const [polygonCoords, setPolygonCoords] = useState<PolygonCoordinates | null>(null);

  useEffect(() => {
    if (rule) {
      setFormData({
        type: rule.type,
        neighborhood: rule.neighborhood || '',
        rate: Number(rule.rate || 0),
        minKm: Number(rule.minKm || 0),
        maxKm: Number(rule.maxKm || 0),
        ratePerKm: Number(rule.ratePerKm || 0),
        fixedRate: Number(rule.fixedRate || 0),
        priority: typeof rule.priority === 'number' ? rule.priority : 1000,
        isFallback: !!rule.isFallback,
        geoJson: rule.geoJson ?? null,
        polygonCoordinates: rule.polygonCoordinates ?? null,
        isActive: rule.isActive,
      });

      const meta = getZoneMeta(rule);
      setZoneName(meta.name ?? '');
      setZoneColor(meta.color);

      const normalized = normalizePolygonCoordinates(rule.polygonCoordinates);
      setPolygonCoords(normalized);
    }
  }, [rule]);

  useEffect(() => {
    if (!rule) {
      setZoneName('');
      setZoneColor(defaultZoneColor());
      setPolygonCoords(null);
    }
  }, [rule]);

  const mapCenter: LatLngExpression = useMemo(() => {
    if (polygonCoords && polygonCoords.length > 0) {
      const [lng, lat] = polygonCoords[0];
      return [lat, lng];
    }
    return [-23.55052, -46.633308];
  }, [polygonCoords]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação básica
    if (formData.type === 'neighborhood' && (!formData.neighborhood || (formData.rate ?? 0) <= 0)) {
      alert('Preencha o bairro e o valor da taxa');
      return;
    }
    
    if (formData.type === 'distance' && ((formData.minKm ?? 0) <= 0 || (formData.maxKm ?? 0) <= (formData.minKm ?? 0) || (formData.ratePerKm ?? 0) <= 0)) {
      alert('Preencha os campos de distância corretamente');
      return;
    }
    
    if (formData.type === 'fixed' && (formData.fixedRate ?? 0) <= 0) {
      alert('Preencha o valor da taxa fixa');
      return;
    }

    if (formData.type === 'polygon') {
      if (!polygonCoords || polygonCoords.length < 3) {
        alert('Desenhe uma zona (polígono) com no mínimo 3 pontos');
        return;
      }

      const gj: DeliveryRuleGeoJson = {
        type: 'Feature',
        properties: {
          name: zoneName.trim() !== '' ? zoneName.trim() : undefined,
          color: zoneColor,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [polygonCoords],
        },
      };

      onSubmit({
        ...formData,
        geoJson: gj,
        polygonCoordinates: polygonCoords,
      });
      return;
    }
    
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {rule ? 'Editar Regra' : 'Nova Regra de Entrega'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Regra
            </label>
            <select
              value={formData.type}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'neighborhood' || v === 'distance' || v === 'fixed' || v === 'polygon') {
                  setFormData({ ...formData, type: v });
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={!!rule}
            >
              <option value="neighborhood">Por Bairro</option>
              <option value="distance">Por Distância</option>
              <option value="fixed">Taxa Fixa</option>
              <option value="polygon">Por Zona (Polígono)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
              <input
                type="number"
                min="0"
                value={formData.priority ?? 1000}
                onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!formData.isFallback}
                  onChange={(e) => setFormData({ ...formData, isFallback: e.target.checked })}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                Usar como fallback
              </label>
            </div>
          </div>

          {formData.type === 'neighborhood' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bairro
                </label>
                <input
                  type="text"
                  value={formData.neighborhood}
                  onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Centro"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Taxa (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.rate}
                  onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="0.00"
                  required
                />
              </div>
            </>
          )}

          {formData.type === 'distance' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Distância Mínima (km)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.minKm}
                    onChange={(e) => setFormData({ ...formData, minKm: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Distância Máxima (km)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.maxKm}
                    onChange={(e) => setFormData({ ...formData, maxKm: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Taxa por km (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.ratePerKm}
                  onChange={(e) => setFormData({ ...formData, ratePerKm: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="0.00"
                  required
                />
              </div>
            </>
          )}

          {formData.type === 'fixed' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Taxa Fixa (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.fixedRate}
                onChange={(e) => setFormData({ ...formData, fixedRate: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="0.00"
                required
              />
            </div>
          )}

          {formData.type === 'polygon' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome da zona</label>
                  <input
                    type="text"
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Ex: Zona Centro"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                  <input
                    type="color"
                    value={zoneColor}
                    onChange={(e) => setZoneColor(e.target.value)}
                    className="w-full h-[42px] px-2 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div className="rounded-lg overflow-hidden border border-gray-200">
                <div className="px-3 py-2 bg-gray-50 text-xs text-gray-600 flex items-center justify-between">
                  <span>Desenhe a zona no mapa (polígono)</span>
                  <span className="text-gray-500">Arraste os pontos para editar • Lixeira para remover</span>
                </div>
                <div className="h-[320px]">
                  <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <FeatureGroup>
                      <PolygonDrawControl
                        zoneColor={zoneColor}
                        polygonCoords={polygonCoords}
                        onChange={setPolygonCoords}
                      />

                      {polygonCoords ? (
                        <Polygon
                          positions={coordsToLatLngs(polygonCoords)}
                          pathOptions={{ color: zoneColor, fillColor: zoneColor, fillOpacity: 0.12, weight: 3 }}
                        />
                      ) : null}
                    </FeatureGroup>
                  </MapContainer>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
              Regra ativa
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : rule ? 'Atualizar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
