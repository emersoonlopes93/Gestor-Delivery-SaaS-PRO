import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { Product, ProductCategory, CreateProductDto } from '@gestor/types';
import { RecipeModal } from '../inventory/RecipeModal';
import { Modal } from '../../components/Modal';

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recipeTarget, setRecipeTarget] = useState<{ id: string, name: string } | null>(null);
  
  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<CreateProductDto>({
    name: '',
    categoryId: '',
    shortDescription: '',
    basePrice: 0,
    isActive: true,
    isAvailable: true,
    sellableOnline: true,
    order: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.get<Product[]>('/catalog/products'),
        api.get<ProductCategory[]>('/catalog/categories')
      ]);
      
      if (prodRes.success) setProducts(prodRes.data);
      if (catRes.success) setCategories(catRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        categoryId: product.categoryId || '',
        shortDescription: product.shortDescription || '',
        basePrice: Number(product.basePrice),
        isActive: product.isActive,
        isAvailable: product.isAvailable,
        sellableOnline: product.sellableOnline,
        order: product.order,
        sku: product.sku || '',
        image: product.image || '',
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        categoryId: categories[0]?.id || '',
        shortDescription: '',
        basePrice: 0,
        isActive: true,
        isAvailable: true,
        sellableOnline: true,
        order: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.basePrice) return;

    try {
      if (editingProduct) {
        await api.patch(`/catalog/products/${editingProduct.id}`, formData);
      } else {
        await api.post('/catalog/products', formData);
      }
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este produto? (Ficará inativo no sistema)')) return;
    try {
      await api.delete(`/catalog/products/${id}`);
      loadData();
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Produtos</h1>
          <p className="text-gray-500 mt-1">Gerencie seu cardápio e fichas técnicas.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
        >
          <span>🍔</span> Novo Produto
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all group">
              <div className="h-44 bg-gray-50 relative">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 font-bold uppercase tracking-widest text-[10px]">Sem Imagem</div>
                )}
                <div className="absolute top-4 right-4 flex gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${product.isActive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                    {product.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                
                {/* Hover Actions Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    onClick={() => handleOpenModal(product)}
                    className="w-10 h-10 bg-white text-gray-700 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-50 hover:text-primary-600 transition-all font-bold"
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="w-10 h-10 bg-white text-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-red-50 transition-all font-bold"
                    title="Excluir"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-primary-600 transition-colors uppercase tracking-tight">{product.name}</h3>
                  <span className="text-primary-600 font-black text-lg">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(product.basePrice))}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 h-10 mb-4 font-medium">{product.shortDescription || 'Sem descrição'}</p>
                
                <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {categories.find(c => c.id === product.categoryId)?.name || 'Sem Categoria'}
                  </span>
                  
                  <button
                    onClick={() => setRecipeTarget({ id: product.id, name: product.name })}
                    className="text-xs font-bold bg-primary-50 text-primary-700 px-4 py-2 rounded-xl hover:bg-primary-100 transition-colors flex items-center gap-1.5"
                  >
                    <span className="text-sm">📝</span> Ficha Técnica
                  </button>
                </div>
              </div>
            </div>
          ))}
          {products.length === 0 && (
            <div className="col-span-full py-16 text-center text-gray-400 font-bold italic">
              Nenhum produto cadastrado ainda no cardápio.
            </div>
          )}
        </div>
      )}

      {/* Modal CRUD */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? 'Editar Produto' : 'Novo Produto'}
        footer={
          <>
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm"
            >
              Salvar Produto
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome do Produto</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="Ex: Burger Clássico"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Categoria</label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">Selecione...</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Preço Base (R$)</label>
              <input
                type="number"
                step="0.01"
                value={formData.basePrice}
                onChange={(e) => setFormData({ ...formData, basePrice: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição Curta</label>
            <textarea
              value={formData.shortDescription}
              onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none h-20 resize-none"
              placeholder="Ex: Pão brioche, carne 180g, queijo cheddar..."
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">URL da Imagem</label>
            <input
              type="text"
              value={formData.image || ''}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="https://exemplo.com/imagem.png"
            />
          </div>
          <div className="flex gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-primary-600"
              />
              <span className="text-sm font-bold text-gray-700">Ativo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.sellableOnline}
                onChange={(e) => setFormData({ ...formData, sellableOnline: e.target.checked })}
                className="w-4 h-4 text-primary-600"
              />
              <span className="text-sm font-bold text-gray-700">Cardápio Online</span>
            </label>
          </div>
        </div>
      </Modal>

      {recipeTarget && (
        <RecipeModal
          isOpen={!!recipeTarget}
          onClose={() => setRecipeTarget(null)}
          entityType="product"
          entityId={recipeTarget.id}
          entityName={recipeTarget.name}
        />
      )}
    </div>
  );
}
