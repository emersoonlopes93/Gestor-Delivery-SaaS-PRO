import { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { ProductCategory } from '@gestor/types';
import { Modal } from '../../components/Modal';
import { useNavigate } from 'react-router-dom';

type CategoryWithCount = ProductCategory & { productCount: number };

export function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const navigate = useNavigate();

  const [formData, setFormData] = useState<any>({
    name: '',
    description: '',
    isActive: true,
    isFeatured: false,
    order: 0,
    templateType: 'none' as any,
    templateConfig: {} as any,
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
        templateType: (category as any).templateType || 'none',
        templateConfig: (category as any).templateConfig || {},
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
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Categorias</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Organize seus produtos por grupos lógicos.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
        >
          <span>➕</span> Nova Categoria
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-900/50/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">Produtos</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">Ordem</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 dark:text-gray-100">{category.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{category.description || 'Sem descrição'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 font-bold">
                    {category.productCount ?? 0}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {category.order}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${category.isActive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                      {category.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                    {category.isFeatured && (
                      <span className="ml-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                        Destaque
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => navigate(`/catalog/products?categoryId=${encodeURIComponent(category.id)}`)}
                        className="p-2 text-gray-400 hover:text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
                        title="Ver produtos"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => handleOpenModal(category)}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(category.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-medium italic">
                    Nenhuma categoria cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm transition-all"
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
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
              placeholder="Ex: Pizzas, Bebidas, Sobremesas"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição (Opcional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none h-24 resize-none"
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
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
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
                    templateType: e.target.value,
                    templateConfig: e.target.value === 'pizza' ? { pricingStrategy: 'highest', allowHalfHalf: true } : {}
                  })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-sm font-bold"
                >
                  <option value="none">Nenhum (Padrão)</option>
                  <option value="pizza">🍕 Pizza (Meio a Meio / Tamanhos)</option>
                </select>
              </div>

              {formData.templateType === 'pizza' && (
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Regra de Preço (Meio a Meio)</label>
                  <select
                    value={formData.templateConfig?.pricingStrategy || 'highest'}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      templateConfig: { ...formData.templateConfig, pricingStrategy: e.target.value }
                    })}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-sm font-bold"
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
              <div className="mt-4 p-4 bg-primary-50 rounded-xl border border-primary-100">
                <p className="text-xs text-primary-700 leading-relaxed font-medium">
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
