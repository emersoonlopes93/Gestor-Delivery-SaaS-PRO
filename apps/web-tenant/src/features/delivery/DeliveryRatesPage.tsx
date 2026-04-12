import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin, Route, DollarSign } from 'lucide-react';
import { api } from '../../lib/api-client';

interface DeliveryRateRule {
  id: string;
  type: 'neighborhood' | 'distance' | 'fixed';
  neighborhood?: string;
  rate?: number;
  minKm?: number;
  maxKm?: number;
  ratePerKm?: number;
  fixedRate?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type CreateRuleDto = Omit<DeliveryRateRule, 'id' | 'createdAt' | 'updatedAt'>;

const TYPE_LABELS = {
  neighborhood: 'Por Bairro',
  distance: 'Por Distância',
  fixed: 'Taxa Fixa',
};

const TYPE_ICONS = {
  neighborhood: MapPin,
  distance: Route,
  fixed: DollarSign,
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

  const formatRuleDescription = (rule: DeliveryRateRule) => {
    switch (rule.type) {
      case 'neighborhood':
        return `${rule.neighborhood} - R$ ${rule.rate?.toFixed(2)}`;
      case 'distance':
        return `${rule.minKm}-${rule.maxKm}km - R$ ${rule.ratePerKm?.toFixed(2)}/km`;
      case 'fixed':
        return `Taxa fixa - R$ ${rule.fixedRate?.toFixed(2)}`;
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
          {rules.map((rule) => {
            const Icon = TYPE_ICONS[rule.type];
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
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          rule.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {rule.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatRuleDescription(rule)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
    isActive: true,
  }));

  useEffect(() => {
    if (rule) {
      setFormData({
        type: rule.type,
        neighborhood: rule.neighborhood || '',
        rate: rule.rate || 0,
        minKm: rule.minKm || 0,
        maxKm: rule.maxKm || 0,
        ratePerKm: rule.ratePerKm || 0,
        fixedRate: rule.fixedRate || 0,
        isActive: rule.isActive,
      });
    }
  }, [rule]);

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
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={!!rule}
            >
              <option value="neighborhood">Por Bairro</option>
              <option value="distance">Por Distância</option>
              <option value="fixed">Taxa Fixa</option>
            </select>
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
