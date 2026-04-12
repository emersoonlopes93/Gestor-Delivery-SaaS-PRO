import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { ProductCombo, CreateProductComboDto } from '@gestor/types';
import { RecipeModal } from '../inventory/RecipeModal';
import { Modal } from '../../components/Modal';

export function CombosPage() {
  const [combos, setCombos] = useState<ProductCombo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recipeTarget, setRecipeTarget] = useState<{ id: string, name: string } | null>(null);

  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ProductCombo | null>(null);
  const [formData, setFormData] = useState<CreateProductComboDto>({
    name: '',
    description: '',
    basePrice: 0,
    isActive: true,
    isFeatured: false,
    order: 0,
  });

  useEffect(() => {
    loadCombos();
  }, []);

  const loadCombos = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<ProductCombo[]>('/catalog/combos');
      if (response.success) {
        setCombos(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar combos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (combo?: ProductCombo) => {
    if (combo) {
      setEditingCombo(combo);
      setFormData({
        name: combo.name,
        description: combo.description || '',
        basePrice: Number(combo.basePrice),
        isActive: combo.isActive,
        isFeatured: combo.isFeatured,
        order: combo.order,
        image: combo.image || '',
      });
    } else {
      setEditingCombo(null);
      setFormData({
        name: '',
        description: '',
        basePrice: 0,
        isActive: true,
        isFeatured: false,
        order: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.basePrice) return;

    try {
      if (editingCombo) {
        await api.patch(`/catalog/combos/${editingCombo.id}`, formData);
      } else {
        await api.post('/catalog/combos', formData);
      }
      setIsModalOpen(false);
      loadCombos();
    } catch (error) {
      console.error('Erro ao salvar combo:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este combo?')) return;
    try {
      await api.delete(`/catalog/combos/${id}`);
      loadCombos();
    } catch (error) {
      console.error('Erro ao excluir combo:', error);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Combos & Ofertas</h1>
          <p className="text-gray-500 mt-1">Gerencie ofertas combinadas e fichas técnicas fixas.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
        >
          <span>🍱</span> Novo Combo
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {combos.map((combo) => (
            <div key={combo.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all group">
              <div className="h-44 bg-gray-50 relative">
                {combo.image ? (
                  <img src={combo.image} alt={combo.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 font-bold uppercase tracking-widest text-[10px]">Sem Imagem</div>
                )}
                <div className="absolute top-4 right-4 flex gap-2">
                   <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${combo.isActive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                    {combo.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                 {/* Hover Actions Overlay */}
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    onClick={() => handleOpenModal(combo)}
                    className="w-10 h-10 bg-white text-gray-700 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-50 hover:text-primary-600 transition-all font-bold"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(combo.id)}
                    className="w-10 h-10 bg-white text-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-red-50 transition-all font-bold"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-primary-600 transition-colors uppercase tracking-tight">{combo.name}</h3>
                  <span className="text-primary-600 font-black text-lg">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(combo.basePrice))}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 h-10 mb-4 font-medium">{combo.description || 'Sem descrição'}</p>
                
                <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded">Combo</span>
                    {combo.isFeatured && <span className="text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-600 px-2 py-0.5 rounded">Destaque</span>}
                  </div>
                  
                  <button
                    onClick={() => setRecipeTarget({ id: combo.id, name: combo.name })}
                    className="text-xs font-bold text-primary-700 px-3 py-1.5 rounded-lg border border-primary-100 hover:bg-primary-50 transition-colors"
                  >
                    📝 Ficha Técnica
                  </button>
                </div>
              </div>
            </div>
          ))}
           {combos.length === 0 && (
            <div className="col-span-full py-16 text-center text-gray-400 font-bold italic">
              Nenhum combo cadastrado ainda.
            </div>
          )}
        </div>
      )}

      {/* Modal CRUD */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCombo ? 'Editar Combo' : 'Novo Combo'}
        footer={
          <>
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm">Salvar Combo</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome da Oferta</label>
            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Preço Base (R$)</label>
              <input type="number" step="0.01" value={formData.basePrice} onChange={e => setFormData({...formData, basePrice: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Ordem</label>
              <input type="number" value={formData.order} onChange={e => setFormData({...formData, order: parseInt(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição</label>
            <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none h-20 resize-none" />
          </div>
           <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">URL da Imagem</label>
            <input
              type="text"
              value={formData.image || ''}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            />
          </div>
          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4 text-primary-600 rounded" />
              <span className="text-sm font-bold text-gray-700">Ativo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.isFeatured} onChange={e => setFormData({...formData, isFeatured: e.target.checked})} className="w-4 h-4 text-primary-600 rounded" />
              <span className="text-sm font-bold text-gray-700">Destaque</span>
            </label>
          </div>
        </div>
      </Modal>

      {recipeTarget && (
        <RecipeModal
          isOpen={!!recipeTarget}
          onClose={() => setRecipeTarget(null)}
          entityType="combo"
          entityId={recipeTarget.id}
          entityName={recipeTarget.name}
        />
      )}
    </div>
  );
}
