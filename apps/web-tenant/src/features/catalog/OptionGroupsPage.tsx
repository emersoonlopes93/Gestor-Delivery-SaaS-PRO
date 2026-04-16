import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api-client';
import {
  CreateOptionGroupDto,
  CreateOptionItemDto,
  OptionGroup,
  OptionItem,
  UpdateOptionGroupDto,
  UpdateOptionItemDto,
} from '@gestor/types';
import { Modal } from '../../components/Modal';

type GroupWithItems = OptionGroup & { items?: OptionItem[] };

export function OptionGroupsPage() {
  const [groups, setGroups] = useState<GroupWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupWithItems | null>(null);
  const [groupForm, setGroupForm] = useState<CreateOptionGroupDto>({
    name: '',
    description: '',
    selectionType: 'multiple',
    isRequired: false,
    minSelect: 0,
    maxSelect: 1,
    isActive: true,
    order: 0,
  });

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OptionItem | null>(null);
  const [itemForm, setItemForm] = useState<CreateOptionItemDto>({
    optionGroupId: '',
    name: '',
    description: '',
    sku: '',
    isActive: true,
    order: 0,
    priceImpactType: 'none',
    priceImpactValue: 0,
    allowQuantity: false,
    minQty: 1,
    maxQty: 1,
  });

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<GroupWithItems[]>('/catalog/option-groups');
      if (res.success) setGroups(res.data);
    } finally {
      setIsLoading(false);
    }
  };

  const groupsSorted = useMemo(() => {
    return [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [groups]);

  const openGroupModal = (group?: GroupWithItems) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({
        name: group.name,
        description: group.description ?? '',
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        isActive: group.isActive,
        order: group.order,
      });
    } else {
      setEditingGroup(null);
      setGroupForm({
        name: '',
        description: '',
        selectionType: 'multiple',
        isRequired: false,
        minSelect: 0,
        maxSelect: 1,
        isActive: true,
        order: 0,
      });
    }
    setIsGroupModalOpen(true);
  };

  const saveGroup = async () => {
    const payload: CreateOptionGroupDto | UpdateOptionGroupDto = groupForm;
    if (editingGroup) {
      await api.patch(`/catalog/option-groups/${editingGroup.id}`, payload);
    } else {
      await api.post('/catalog/option-groups', payload);
    }
    setIsGroupModalOpen(false);
    await loadGroups();
  };

  const deleteGroup = async (id: string) => {
    if (!window.confirm('Excluir este grupo e seus itens?')) return;
    await api.delete(`/catalog/option-groups/${id}`);
    await loadGroups();
  };

  const openItemModal = (groupId: string, item?: OptionItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        optionGroupId: groupId,
        name: item.name,
        description: item.description ?? '',
        sku: item.sku ?? '',
        isActive: item.isActive,
        order: item.order,
        priceImpactType: item.priceImpactType,
        priceImpactValue: Number(item.priceImpactValue ?? 0),
        allowQuantity: item.allowQuantity,
        minQty: item.minQty ?? 1,
        maxQty: item.maxQty ?? 1,
      });
    } else {
      setEditingItem(null);
      setItemForm({
        optionGroupId: groupId,
        name: '',
        description: '',
        sku: '',
        isActive: true,
        order: 0,
        priceImpactType: 'none',
        priceImpactValue: 0,
        allowQuantity: false,
        minQty: 1,
        maxQty: 1,
      });
    }
    setIsItemModalOpen(true);
  };

  const saveItem = async () => {
    const payload: CreateOptionItemDto | UpdateOptionItemDto = itemForm;
    if (editingItem) {
      await api.patch(`/catalog/option-groups/items/${editingItem.id}`, payload);
    } else {
      await api.post('/catalog/option-groups/items', payload);
    }
    setIsItemModalOpen(false);
    await loadGroups();
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm('Excluir este item?')) return;
    await api.delete(`/catalog/option-groups/items/${id}`);
    await loadGroups();
  };

  const moveItem = async (group: GroupWithItems, itemId: string, direction: -1 | 1) => {
    const items = [...(group.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;

    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= items.length) return;

    const swapped = [...items];
    const tmp = swapped[idx];
    swapped[idx] = swapped[nextIdx];
    swapped[nextIdx] = tmp;

    await api.post(`/catalog/option-groups/${group.id}/items/reorder`, {
      orderedItemIds: swapped.map((i) => i.id),
    });
    await loadGroups();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Grupos de Opções (V2)</h1>
          <p className="text-gray-500 mt-1">Gerencie personalização do produto (Option Groups / Items).</p>
        </div>
        <button
          onClick={() => openGroupModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
          type="button"
        >
          Novo Grupo
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {groupsSorted.map((g) => {
            const items = [...(g.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            return (
              <section key={g.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="font-black text-gray-900 uppercase tracking-wider text-sm truncate">{g.name}</div>
                    <div className="text-xs text-gray-500 font-bold mt-1">
                      Tipo: {g.selectionType} | {g.isRequired ? 'Obrigatório' : 'Opcional'} | Min {g.minSelect} / Max {g.maxSelect}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openItemModal(g.id)}
                      className="text-xs font-bold text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors"
                      type="button"
                    >
                      Add Item
                    </button>
                    <button
                      onClick={() => openGroupModal(g)}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => deleteGroup(g.id)}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg"
                      type="button"
                    >
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-white border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Item</th>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Impacto</th>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((it) => (
                        <tr key={it.id} className="hover:bg-gray-50/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-800">{it.name}</div>
                            <div className="text-xs text-gray-500 font-medium">{it.description || ''}</div>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-gray-700 whitespace-nowrap">
                            {it.priceImpactType} {Number(it.priceImpactValue ?? 0) ? `(${it.priceImpactValue})` : ''}
                            {it.allowQuantity ? ' | qty' : ''}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${it.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {it.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => moveItem(g, it.id, -1)}
                                className="px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded"
                                type="button"
                                title="Subir"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveItem(g, it.id, 1)}
                                className="px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded"
                                type="button"
                                title="Descer"
                              >
                                ↓
                              </button>
                              <button
                                onClick={() => openItemModal(g.id, it)}
                                className="px-3 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded"
                                type="button"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => deleteItem(it.id)}
                                className="px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded"
                                type="button"
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm italic">
                            Nenhum item neste grupo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          {groupsSorted.length === 0 && (
            <div className="py-16 text-center text-gray-400 font-bold italic">Nenhum grupo criado ainda.</div>
          )}
        </div>
      )}

      <Modal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        title={editingGroup ? 'Editar Grupo (V2)' : 'Novo Grupo (V2)'}
        footer={
          <>
            <button
              onClick={() => setIsGroupModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
              type="button"
            >
              Cancelar
            </button>
            <button
              onClick={saveGroup}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm"
              type="button"
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome</label>
            <input
              value={groupForm.name}
              onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição</label>
            <input
              value={groupForm.description ?? ''}
              onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Tipo</label>
              <select
                value={groupForm.selectionType}
                onChange={(e) => setGroupForm((p) => ({ ...p, selectionType: e.target.value as any }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              >
                <option value="single">Single</option>
                <option value="multiple">Multiple</option>
                <option value="quantity">Quantity</option>
              </select>
            </div>
            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(groupForm.isRequired)}
                  onChange={(e) => setGroupForm((p) => ({ ...p, isRequired: e.target.checked }))}
                  className="w-4 h-4 text-primary-600"
                />
                <span className="text-sm font-bold text-gray-700">Obrigatório</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(groupForm.isActive)}
                  onChange={(e) => setGroupForm((p) => ({ ...p, isActive: e.target.checked }))}
                  className="w-4 h-4 text-primary-600"
                />
                <span className="text-sm font-bold text-gray-700">Ativo</span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Min</label>
              <input
                type="number"
                value={groupForm.minSelect ?? 0}
                onChange={(e) => setGroupForm((p) => ({ ...p, minSelect: Number(e.target.value || 0) }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Max</label>
              <input
                type="number"
                value={groupForm.maxSelect ?? 1}
                onChange={(e) => setGroupForm((p) => ({ ...p, maxSelect: Number(e.target.value || 1) }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        title={editingItem ? 'Editar Item (V2)' : 'Novo Item (V2)'}
        footer={
          <>
            <button
              onClick={() => setIsItemModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
              type="button"
            >
              Cancelar
            </button>
            <button
              onClick={saveItem}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm"
              type="button"
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome</label>
            <input
              value={itemForm.name}
              onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição</label>
            <input
              value={itemForm.description ?? ''}
              onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Impacto</label>
              <select
                value={itemForm.priceImpactType ?? 'none'}
                onChange={(e) => setItemForm((p) => ({ ...p, priceImpactType: e.target.value as any }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              >
                <option value="none">None</option>
                <option value="fixed">Fixed</option>
                <option value="replace">Replace</option>
                <option value="percentage">Percentage</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Valor</label>
              <input
                type="number"
                step="0.01"
                value={Number(itemForm.priceImpactValue ?? 0)}
                onChange={(e) => setItemForm((p) => ({ ...p, priceImpactValue: Number(e.target.value || 0) }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(itemForm.isActive)}
                onChange={(e) => setItemForm((p) => ({ ...p, isActive: e.target.checked }))}
                className="w-4 h-4 text-primary-600"
              />
              <span className="text-sm font-bold text-gray-700">Ativo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(itemForm.allowQuantity)}
                onChange={(e) => setItemForm((p) => ({ ...p, allowQuantity: e.target.checked }))}
                className="w-4 h-4 text-primary-600"
              />
              <span className="text-sm font-bold text-gray-700">Permitir qty</span>
            </label>
          </div>
          {itemForm.allowQuantity ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Min qty</label>
                <input
                  type="number"
                  value={Number(itemForm.minQty ?? 1)}
                  onChange={(e) => setItemForm((p) => ({ ...p, minQty: Number(e.target.value || 1) }))}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Max qty</label>
                <input
                  type="number"
                  value={Number(itemForm.maxQty ?? 1)}
                  onChange={(e) => setItemForm((p) => ({ ...p, maxQty: Number(e.target.value || 1) }))}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
                />
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
