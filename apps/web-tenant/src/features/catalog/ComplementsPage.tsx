import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { ProductComplementItem, ProductComplementGroup } from '@gestor/types';
import { RecipeModal } from '../inventory/RecipeModal';
import { Modal } from '../../components/Modal';

export function ComplementsPage() {
  const [groups, setGroups] = useState<ProductComplementGroup[]>([]);
  const [items, setItems] = useState<ProductComplementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recipeTarget, setRecipeTarget] = useState<{ id: string, name: string } | null>(null);

  // Group Modal State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ProductComplementGroup | null>(null);
  const [groupFormData, setGroupFormData] = useState({
    name: '',
    minSelect: 0,
    maxSelect: 1,
    isRequired: false,
    isActive: true,
  });

  // Item Modal State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductComplementItem | null>(null);
  const [itemFormData, setItemFormData] = useState({
    groupId: '',
    name: '',
    additionalPrice: 0,
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [groupRes, itemRes] = await Promise.all([
        api.get<ProductComplementGroup[]>('/catalog/complements/groups'),
        api.get<ProductComplementItem[]>('/catalog/complements/groups/items')
      ]);
      if (groupRes.success) setGroups(groupRes.data);
      if (itemRes.success) setItems(itemRes.data);
    } catch (error) {
      console.error('Erro ao carregar complementos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Group Handlers
  const handleOpenGroupModal = (group?: ProductComplementGroup) => {
    if (group) {
      setEditingGroup(group);
      setGroupFormData({
        name: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        isRequired: group.isRequired,
        isActive: group.isActive,
      });
    } else {
      setEditingGroup(null);
      setGroupFormData({ name: '', minSelect: 0, maxSelect: 1, isRequired: false, isActive: true });
    }
    setIsGroupModalOpen(true);
  };

  const handleSaveGroup = async () => {
    try {
      if (editingGroup) {
        await api.patch(`/catalog/complements/groups/${editingGroup.id}`, groupFormData);
      } else {
        await api.post('/catalog/complements/groups', groupFormData);
      }
      setIsGroupModalOpen(false);
      loadData();
    } catch (error) { console.error(error); }
  };

  // Item Handlers
  const handleOpenItemModal = (item?: ProductComplementItem, groupId?: string) => {
    if (item) {
      setEditingItem(item);
      setItemFormData({
        groupId: item.groupId,
        name: item.name,
        additionalPrice: Number(item.additionalPrice),
        isActive: item.isActive,
      });
    } else {
      setEditingItem(null);
      setItemFormData({
        groupId: groupId || (groups[0]?.id || ''),
        name: '',
        additionalPrice: 0,
        isActive: true,
      });
    }
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async () => {
    try {
      if (editingItem) {
        await api.patch(`/catalog/complements/groups/items/${editingItem.id}`, itemFormData);
      } else {
        await api.post('/catalog/complements/groups/items', itemFormData);
      }
      setIsItemModalOpen(false);
      loadData();
    } catch (error) { console.error(error); }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!window.confirm('Excluir este grupo e todos os seus itens?')) return;
    await api.delete(`/catalog/complements/groups/${id}`);
    loadData();
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Excluir este complemento?')) return;
    await api.delete(`/catalog/complements/groups/items/${id}`);
    loadData();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Complementos</h1>
          <p className="text-gray-500 mt-1">Gerencie adicionais e suas fichas técnicas.</p>
        </div>
        <button
          onClick={() => handleOpenGroupModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
        >
          <span>➕</span> Novo Grupo
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h3 className="font-black text-gray-900 uppercase tracking-wider text-sm flex items-center gap-2">
                    {group.name}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${group.isRequired ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'}`}>
                      {group.isRequired ? 'Obrigatório' : 'Opcional'}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium">
                      (Min: {group.minSelect} / Max: {group.maxSelect})
                    </span>
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleOpenItemModal(undefined, group.id)} className="text-xs font-bold text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors">
                    ➕ Add Item
                  </button>
                  <button onClick={() => handleOpenGroupModal(group)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg">✏️</button>
                  <button onClick={() => handleDeleteGroup(group.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg">🗑️</button>
                </div>
              </div>
              
              <table className="w-full text-left border-collapse">
                <tbody className="divide-y divide-gray-100">
                  {items.filter(i => i.groupId === group.id).map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-800">{item.name}</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-primary-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.additionalPrice))}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${item.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {item.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setRecipeTarget({ id: item.id, name: item.name })}
                            className="text-[10px] font-black uppercase text-gray-400 hover:text-primary-600"
                          >
                            📝 Ficha Técnica
                          </button>
                          <button onClick={() => handleOpenItemModal(item)} className="text-gray-400 hover:text-gray-600">✏️</button>
                          <button onClick={() => handleDeleteItem(item.id)} className="text-gray-400 hover:text-red-500">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.filter(i => i.groupId === group.id).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-400 text-sm italic">Nenhum item neste grupo.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Group Modal */}
      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} title={editingGroup ? 'Editar Grupo' : 'Novo Grupo'}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome do Grupo</label>
            <input type="text" value={groupFormData.name} onChange={e => setGroupFormData({...groupFormData, name: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ex: Escolha o Ponto da Carne" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Mínimo</label>
              <input type="number" value={groupFormData.minSelect} onChange={e => setGroupFormData({...groupFormData, minSelect: parseInt(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Máximo</label>
              <input type="number" value={groupFormData.maxSelect} onChange={e => setGroupFormData({...groupFormData, maxSelect: parseInt(e.target.value) || 1})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none" />
            </div>
          </div>
          <div className="flex gap-4">
             <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={groupFormData.isRequired} onChange={e => setGroupFormData({...groupFormData, isRequired: e.target.checked})} className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-bold text-gray-700">Obrigatório</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={groupFormData.isActive} onChange={e => setGroupFormData({...groupFormData, isActive: e.target.checked})} className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-bold text-gray-700">Ativo</span>
            </label>
          </div>
          <button onClick={handleSaveGroup} className="w-full bg-primary-600 text-white font-bold py-3 rounded-xl mt-4 shadow-sm hover:bg-primary-700 transition-colors">Salvar Grupo</button>
        </div>
      </Modal>

      {/* Item Modal */}
      <Modal isOpen={isItemModalOpen} onClose={() => setIsItemModalOpen(false)} title={editingItem ? 'Editar Complemento' : 'Novo Complemento'}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome</label>
            <input type="text" value={itemFormData.name} onChange={e => setItemFormData({...itemFormData, name: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Preço Adicional (R$)</label>
            <input type="number" step="0.01" value={itemFormData.additionalPrice} onChange={e => setItemFormData({...itemFormData, additionalPrice: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={itemFormData.isActive} onChange={e => setItemFormData({...itemFormData, isActive: e.target.checked})} className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-bold text-gray-700">Ativo</span>
          </label>
          <button onClick={handleSaveItem} className="w-full bg-primary-600 text-white font-bold py-3 rounded-xl mt-4 shadow-sm hover:bg-primary-700 transition-colors">Salvar Complemento</button>
        </div>
      </Modal>

      {recipeTarget && (
        <RecipeModal
          isOpen={!!recipeTarget}
          onClose={() => setRecipeTarget(null)}
          entityType="complement"
          entityId={recipeTarget.id}
          entityName={recipeTarget.name}
        />
      )}
    </div>
  );
}
