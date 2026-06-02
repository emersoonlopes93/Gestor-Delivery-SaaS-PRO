import { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Search,
  Trash2,
  Edit2,
  Package,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { Modal } from '../../components/Modal';
import {
  Upsell,
  UpsellWithItems,
  CreateUpsellDto,
  Product,
  UpsellPricingType,
} from '@gestor/types';

export function UpsellsPage() {
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isItemsModalOpen, setIsItemsModalOpen] = useState(false);
  const [editingUpsell, setEditingUpsell] = useState<Upsell | null>(null);
  const [selectedUpsell, setSelectedUpsell] = useState<UpsellWithItems | null>(null);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);

  const [formData, setFormData] = useState<CreateUpsellDto>({
    name: '',
    description: '',
    pricingType: 'normal',
    pricingValue: 0,
    displayType: 'both',
    isActive: true,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [upsellsRes, productsRes] = await Promise.all([
        api.get('/upsells'),
        api.get('/catalog/products'),
      ]);
      setUpsells(upsellsRes.data as Upsell[]);
      setAvailableProducts(productsRes.data as Product[]);
    } catch (error) {
      console.error('Error fetching upsells:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreate = () => {
    setEditingUpsell(null);
    setFormData({
      name: '',
      description: '',
      pricingType: 'normal',
      pricingValue: 0,
      displayType: 'both',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (upsell: Upsell) => {
    setEditingUpsell(upsell);
    setFormData({
      name: upsell.name,
      description: upsell.description || '',
      pricingType: upsell.pricingType,
      pricingValue: Number(upsell.pricingValue),
      displayType: upsell.displayType,
      isActive: upsell.isActive,
    });
    setIsModalOpen(true);
  };

  const handleOpenItems = async (upsell: Upsell) => {
    try {
      const res = await api.get(`/upsells/${upsell.id}`);
      setSelectedUpsell(res.data as UpsellWithItems);
      setIsItemsModalOpen(true);
    } catch (error) {
      console.error('Error fetching upsell items:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUpsell) {
        await api.patch(`/upsells/${editingUpsell.id}`, formData);
      } else {
        await api.post('/upsells', formData);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving upsell:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir este upsell?')) return;
    try {
      await api.delete(`/upsells/${id}`);
      fetchData();
    } catch (error) {
      console.error('Error deleting upsell:', error);
    }
  };

  const handleToggleProduct = async (productId: string) => {
    if (!selectedUpsell) return;
    const currentIds = selectedUpsell.items.map((i) => i.productId);
    let nextIds: string[];

    if (currentIds.includes(productId)) {
      nextIds = currentIds.filter((id) => id !== productId);
    } else {
      nextIds = [...currentIds, productId];
    }

    try {
      await api.put(`/upsells/${selectedUpsell.id}/items`, { productIds: nextIds });
      const res = await api.get(`/upsells/${selectedUpsell.id}`);
      setSelectedUpsell(res.data as UpsellWithItems);
    } catch (error) {
      console.error('Error updating upsell items:', error);
    }
  };

  const filteredUpsells = upsells.filter((u) =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Upsells & Ofertas
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Aumente seu ticket médio oferecendo produtos adicionais com descontos especiais.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="btn-primary flex items-center justify-center gap-2 px-4 py-2"
        >
          <Plus className="h-5 w-5" />
          Nova Oferta
        </button>
      </div>

      <div className="card-premium overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar ofertas..."
            className="flex-1 input-premium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-950">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">Oferta</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">Regra de Preço</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">Exibição</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 italic-none">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    Carregando ofertas...
                  </td>
                </tr>
              ) : filteredUpsells.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    Nenhuma oferta encontrada.
                  </td>
                </tr>
              ) : (
                filteredUpsells.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{u.name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{u.description || 'Sem descrição'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                         <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                           u.pricingType === 'fixed_price' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' :
                           u.pricingType.startsWith('discount') ? 'bg-status-success/10 text-status-success border-status-success/20' :
                           'bg-muted text-muted-foreground border-border'
                         }`}>
                           {u.pricingType === 'normal' ? 'Normal' : 
                            u.pricingType === 'fixed_price' ? 'Preço Fixo' :
                            u.pricingType === 'discount_percent' ? `${u.pricingValue}% Desc.` :
                            `R$${u.pricingValue} Desc.`}
                         </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {u.displayType === 'inline' ? 'No Produto' :
                         u.displayType === 'cart' ? 'No Carrinho' :
                         'Ambos'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`h-2 w-2 rounded-full inline-block mr-2 ${u.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="text-xs uppercase font-medium">{u.isActive ? 'Ativa' : 'Inativa'}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenItems(u)}
                          className="btn-ghost"
                          title="Gerenciar Produtos"
                        >
                          <Package className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="btn-ghost"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="btn-ghost text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUpsell ? 'Editar Oferta' : 'Nova Oferta'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da Oferta (ex: Combo de Bebidas)</label>
            <input
              type="text"
              required
              className="input-premium"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição Curta</label>
            <textarea
              className="input-premium h-20 resize-none"
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Preço</label>
              <select
                className="input-premium"
                value={formData.pricingType}
                onChange={(e) => setFormData({ ...formData, pricingType: e.target.value as UpsellPricingType })}
              >
                <option value="normal">Preço Normal</option>
                <option value="fixed_price">Preço Fixo (Promocional)</option>
                <option value="discount_percent">Desconto em %</option>
                <option value="discount_amount">Desconto em R$</option>
              </select>
            </div>
            {formData.pricingType !== 'normal' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {formData.pricingType === 'fixed_price' ? 'Valor Fixo (R$)' : 'Valor do Desconto'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-premium"
                  value={formData.pricingValue}
                  onChange={(e) => setFormData({ ...formData, pricingValue: Number(e.target.value) })}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Local de Exibição</label>
            <div className="grid grid-cols-3 gap-2">
              {(['inline', 'cart', 'both'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFormData({ ...formData, displayType: t })}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                    formData.displayType === t
                      ? 'bg-primary/10 border-primary text-primary ring-1 ring-primary'
                      : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  {t === 'inline' ? 'No Produto' : t === 'cart' ? 'No Carrinho' : 'Ambos'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-primary/50"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">Oferta Ativa</label>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary px-6 py-2">
              {editingUpsell ? 'Salvar Alterações' : 'Criar Oferta'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Items Modal */}
      <Modal
        isOpen={isItemsModalOpen}
        onClose={() => setIsItemsModalOpen(false)}
        title={`Produtos da Oferta: ${selectedUpsell?.name}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Selecione quais produtos fazem parte desta oferta de upsell. 
            O preço final será calculado automaticamente com base na regra definida.
          </p>

          <div className="max-h-[400px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {availableProducts
              .filter(p => !p.deletedAt && (p.type as string) === 'product')
              .map((product) => {
                const isSelected = selectedUpsell?.items.some((i) => i.productId === product.id);
                return (
                  <div key={product.id} className="p-3 flex items-center justify-between hover:bg-muted/50 dark:bg-card">
                    <div className="flex items-center gap-3">
                       <div className="h-10 w-10 bg-muted rounded overflow-hidden flex-shrink-0">
                         {product.image && <img src={product.image} className="h-full w-full object-cover" />}
                       </div>
                       <div>
                         <div className="text-sm font-medium text-foreground">{product.name}</div>
                         <div className="text-xs text-muted-foreground">R${Number(product.basePrice).toFixed(2)}</div>
                       </div>
                    </div>
                    <button
                      onClick={() => handleToggleProduct(product.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isSelected 
                          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20' 
                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                      }`}
                    >
                      {isSelected ? 'Remover' : 'Adicionar'}
                    </button>
                  </div>
                );
              })}
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setIsItemsModalOpen(false)}
              className="btn-primary px-6 py-2"
            >
              Concluir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
