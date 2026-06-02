import { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { ProductCategory } from '@gestor/types';
import { Modal } from '../../components/Modal';
import { useNavigate } from 'react-router-dom';

type CategoryWithCount = ProductCategory & { productCount: number };

interface CategoryFormData {
  name: string;
  description: string;
  isActive: boolean;
  isFeatured: boolean;
  order: number;
  templateType: 'none' | 'pizza' | 'combo';
  templateConfig: Record<string, unknown>;
}

export function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const navigate = useNavigate();

  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    isActive: true,
    isFeatured: false,
    order: 0,
    templateType: 'none',
    templateConfig: {},
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<CategoryWithCount[]>('/catalog/categories/with-product-count');
      if (response.success) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (category?: ProductCategory) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || '',
        isActive: category.isActive,
        isFeatured: category.isFeatured,
        order: category.order,
        templateType: category.templateType || 'none',
        templateConfig: category.templateConfig || {},
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: '',
        description: '',
        isActive: true,
        isFeatured: false,
        order: 0,
        templateType: 'none',
        templateConfig: {
          pricingStrategy: 'highest',
          allowHalfHalf: true
        },
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) return;

    try {
      if (editingCategory) {
        await api.patch(`/catalog/categories/${editingCategory.id}`, formData);
      } else {
        await api.post('/catalog/categories', formData);
      }
      setIsModalOpen(false);
      loadCategories();
    } catch (error) {
      console.error('Erro ao salvar categoria:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta categoria?')) return;
    try {
      await api.delete(`/catalog/categories/${id}`);
      loadCategories();
    } catch (error) {
      console.error('Erro ao excluir categoria:', error);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto text-left transition-colors">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight uppercase">Categorias</h1>
          <p className="text-muted-foreground mt-1 text-sm">Organize seus produtos por grupos lógicos.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary w-full md:w-auto h-12 md:h-11 px-6 text-sm flex items-center justify-center gap-2"
        >
          <span>➕</span> Nova Categoria
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop View */}
          <div className="hidden md:block bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Nome</th>
                  <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">Produtos</th>
                  <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">Ordem</th>
                  <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {categories.map((category) => (
                  <tr key={category.id} className="hover:bg-muted transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-foreground">{category.name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-xs">{category.description || 'Sem descrição'}</div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-foreground font-bold">
                      {category.productCount ?? 0}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-foreground font-medium">
                      {category.order}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${category.isActive ? 'bg-status-success text-white border-status-success' : 'bg-status-danger text-white border-status-danger'}`}>
                          {category.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                        {category.isFeatured && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-status-warning text-white border border-status-warning">
                            Destaque
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/catalog/products?categoryId=${encodeURIComponent(category.id)}`)}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
                          title="Ver produtos"
                        >
                          👁️
                        </button>
                        <button
                          onClick={() => handleOpenModal(category)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                          title="Excluir"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-3">
            {categories.map((category) => (
              <div key={category.id} className="bg-card rounded-2xl p-4 border border-border shadow-sm active:scale-[0.98] transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-foreground text-lg truncate">{category.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{category.description || 'Sem descrição'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${category.isActive ? 'bg-status-success text-white border-status-success' : 'bg-status-danger text-white border-status-danger'}`}>
                      {category.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-muted p-2 rounded-xl border border-border">
                    <span className="block text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Produtos</span>
                    <span className="text-sm font-bold text-foreground">{category.productCount ?? 0} itens</span>
                  </div>
                  <div className="bg-muted p-2 rounded-xl border border-border">
                    <span className="block text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Ordem</span>
                    <span className="text-sm font-bold text-foreground">Posição {category.order}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex gap-1">
                    {category.isFeatured && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-status-warning text-white border border-status-warning">
                        Destaque
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/catalog/products?categoryId=${encodeURIComponent(category.id)}`)}
                      className="w-9 h-9 flex items-center justify-center text-muted-foreground bg-muted rounded-xl"
                    >
                      👁️
                    </button>
                    <button
                      onClick={() => handleOpenModal(category)}
                      className="w-9 h-9 flex items-center justify-center text-primary bg-primary/10 rounded-xl"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(category.id)}
                      className="w-9 h-9 flex items-center justify-center text-destructive bg-destructive/10 rounded-xl"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {categories.length === 0 && (
            <div className="card-premium py-16 text-center">
              <span className="text-4xl mb-4 block">📂</span>
              <p className="text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest text-xs">Nenhuma categoria cadastrada ainda.</p>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
        footer={
          <>
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="btn-primary px-6 py-2"
            >
              Salvar Categoria
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome da Categoria</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-premium"
              placeholder="Ex: Pizzas, Bebidas, Sobremesas"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição (Opcional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input-premium h-24 resize-none"
              placeholder="Breve descrição da categoria..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Ordem de Exibição</label>
              <input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                className="input-premium"
              />
            </div>
            <div className="flex flex-col justify-end gap-3">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 dark:border-gray-700 rounded focus:ring-primary-500"
                />
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:text-gray-100 transition-colors">Ativo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={formData.isFeatured}
                  onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 dark:border-gray-700 rounded focus:ring-primary-500"
                />
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:text-gray-100 transition-colors">Destaque</span>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <label className="block text-[10px] font-black text-primary-600 uppercase tracking-widest mb-3">Template da Categoria</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Tipo de Template</label>
                <select
                  value={formData.templateType}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    templateType: e.target.value as 'none' | 'pizza' | 'combo',
                    templateConfig: e.target.value === 'pizza' ? { pricingStrategy: 'highest', allowHalfHalf: true } : {}
                  })}
                  className="input-premium text-sm font-bold"
                >
                  <option value="none">Nenhum (Padrão)</option>
                  <option value="pizza">🍕 Pizza (Meio a Meio / Tamanhos)</option>
                </select>
              </div>

              {formData.templateType === 'pizza' && (
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Regra de Preço (Meio a Meio)</label>
                  <select
                    value={(formData.templateConfig?.pricingStrategy as string) || 'highest'}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      templateConfig: { ...formData.templateConfig, pricingStrategy: e.target.value }
                    })}
                    className="input-premium text-sm font-bold"
                  >
                    <option value="highest">Maior Valor</option>
                    <option value="average">Média de Valores</option>
                    <option value="lowest">Menor Valor</option>
                    <option value="sum_halves">Soma das Metades</option>
                  </select>
                </div>
              )}
            </div>

            {formData.templateType === 'pizza' && (
              <div className="mt-4 p-4 bg-primary/10 rounded-xl border border-primary/20">
                <p className="text-xs text-primary leading-relaxed font-medium">
                  <strong>💡 Template Pizza Ativado:</strong> Novos produtos nesta categoria serão configurados automaticamente como Sabores e vinculados aos grupos de Tamanhos e Montagem.
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
