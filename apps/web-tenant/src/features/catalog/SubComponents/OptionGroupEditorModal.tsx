import React, { useCallback, useEffect, useState } from 'react';
import { CreateOptionGroupDto, OptionGroup, OptionItem } from '@gestor/types';
import { Modal } from '../../../components/Modal';
import { api } from '../../../lib/api-client';
import { Plus, Trash2, Globe, Info } from 'lucide-react';
import { CurrencyInput } from '@gestor/ui';

type GroupWithItems = OptionGroup & { items?: OptionItem[]; _count?: { optionGroupLinks: number } };

interface OptionGroupEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string | null;
  onSaved: (group: GroupWithItems) => void;
}

export const OptionGroupEditorModal: React.FC<OptionGroupEditorModalProps> = ({
  isOpen,
  onClose,
  groupId,
  onSaved,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [usageCount, setUsageCount] = useState<number | null>(null);

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

  // Items are kept here. Items without an ID are considered "new"
  const [items, setItems] = useState<Array<Partial<OptionItem> & { _tempId?: string }>>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);

  const createEmptyItem = useCallback(() => ({
    _tempId: Math.random().toString(36).substring(7),
    name: '',
    description: '',
    priceImpactType: 'none' as const,
    priceImpactValue: 0,
    isActive: true,
    allowQuantity: false,
    minQty: 1,
    maxQty: 1,
  }), []);

  const loadGroup = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const res = await api.get<GroupWithItems>(`/catalog/option-groups/${id}`);
      if (res.success) {
        const g = res.data;
        setGroupForm({
          name: g.name,
          description: g.description ?? '',
          selectionType: g.selectionType,
          isRequired: g.isRequired,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          isActive: g.isActive,
          order: g.order,
        });
        setUsageCount(g._count?.optionGroupLinks ?? 0);
        const sortedItems = [...(g.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setItems(sortedItems.length > 0 ? sortedItems : [createEmptyItem()]);
        setDeletedItemIds([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [createEmptyItem]);

  useEffect(() => {
    if (isOpen) {
      if (groupId) {
        loadGroup(groupId);
      } else {
        setUsageCount(0);
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
        setItems([createEmptyItem()]);
        setDeletedItemIds([]);
      }
    }
  }, [createEmptyItem, isOpen, groupId, loadGroup]);

  const handleItemChange = (index: number, field: keyof OptionItem, value: unknown) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const addItem = () => setItems([...items, createEmptyItem()]);

  const removeItem = (index: number) => {
    const item = items[index];
    if (item.id) {
      setDeletedItemIds([...deletedItemIds, item.id]);
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === items.length - 1) {
        addItem();
      } else {
        // focus next input if needed, handled organically mostly
      }
    }
  };

  const handleSave = async () => {
    if (!groupForm.name) {
      alert('Preencha o nome do grupo.');
      return;
    }
    setIsSaving(true);
    try {
      let savedGroup: GroupWithItems;

      if (groupId) {
        const res = await api.patch<OptionGroup>(`/catalog/option-groups/${groupId}`, groupForm);
        savedGroup = res.data as GroupWithItems;
      } else {
        const res = await api.post<OptionGroup>('/catalog/option-groups', groupForm);
        savedGroup = res.data as GroupWithItems;
      }

      const gid = savedGroup.id;

      // 1. Delete removed items
      for (const delId of deletedItemIds) {
        await api.delete(`/catalog/option-groups/items/${delId}`);
      }

      // 2. Upsert items
      const validItems = items.filter(it => it.name && it.name.trim() !== '');
      for (let i = 0; i < validItems.length; i++) {
        const it = validItems[i];
        const payload: Record<string, unknown> = {
          name: it.name,
          description: it.description,
          priceImpactType: it.priceImpactType,
          priceImpactValue: Number(it.priceImpactValue ?? 0),
          isActive: Boolean(it.isActive),
          allowQuantity: Boolean(it.allowQuantity),
          minQty: Number(it.minQty ?? 1),
          maxQty: Number(it.maxQty ?? 1),
          order: i,
          sku: it.sku ?? '',
        };

        if (it.id) {
          await api.patch(`/catalog/option-groups/items/${it.id}`, payload);
        } else {
          payload.optionGroupId = gid;
          await api.post('/catalog/option-groups/items', payload);
        }
      }

      // Refresh final state to return
      const finalRes = await api.get<GroupWithItems>(`/catalog/option-groups/${gid}`);
      if (finalRes.success) {
        onSaved(finalRes.data);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar o grupo de opções.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={groupId ? 'Editar grupo/tamanho' : 'Novo grupo/tamanho'}
      maxWidth="max-w-4xl"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg transition-colors" type="button">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={isSaving || isLoading} className="btn-primary px-8 py-2.5 text-sm flex items-center gap-2" type="button">
            {isSaving && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
            Salvar
          </button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Guardrail Usage Banner */}
          {groupId && usageCount !== null && usageCount > 1 && (
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-600 dark:text-amber-400">
              <Globe className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-black uppercase tracking-wider bg-amber-500/20 px-2 py-0.5 rounded-md text-[10px]">
                    Grupo compartilhado
                  </span>
                  <span className="font-bold text-foreground">Usado em {usageCount} produtos</span>
                </div>
                <p className="text-muted-foreground font-medium leading-relaxed">
                  As alterações feitas aqui são aplicadas ao grupo compartilhado e podem aparecer em todos os produtos vinculados.
                </p>
              </div>
            </div>
          )}

          {groupId && usageCount === 1 && (
            <div className="flex items-center gap-2.5 p-3.5 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground font-medium">
              <Info className="w-4 h-4 shrink-0 text-primary" />
              <span>Este grupo está vinculado a 1 produto.</span>
            </div>
          )}

          {groupId && usageCount === 0 && (
            <div className="flex items-center gap-2.5 p-3.5 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground font-medium">
              <Info className="w-4 h-4 shrink-0" />
              <span>Este grupo ainda não está vinculado a nenhum produto.</span>
            </div>
          )}

          {/* Grupo de Opções - Informações Básicas */}
          <div className="bg-muted/30 border border-border p-5 rounded-2xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Nome do Grupo *</label>
                <input
                  value={groupForm.name}
                  onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
                  className="input-premium"
                  placeholder="Ex: Escolha o tamanho"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Descrição</label>
                <input
                  value={groupForm.description ?? ''}
                  onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))}
                  className="input-premium"
                  placeholder="Ex: Selecione apenas 1 opção"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Tipo de Seleção</label>
                <select
                  value={groupForm.selectionType}
                  onChange={(e) => setGroupForm((p) => ({ ...p, selectionType: e.target.value as 'single' | 'multiple' | 'quantity' }))}
                  className="input-premium"
                >
                  <option value="single">Seleção Única</option>
                  <option value="multiple">Seleção Múltipla</option>
                  <option value="quantity">Seleção com Quantidade</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Mínimo</label>
                <input
                  type="number"
                  value={groupForm.minSelect ?? 0}
                  onChange={(e) => setGroupForm((p) => ({ ...p, minSelect: Number(e.target.value || 0) }))}
                  className="input-premium"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Máximo</label>
                <input
                  type="number"
                  value={groupForm.maxSelect ?? 1}
                  onChange={(e) => setGroupForm((p) => ({ ...p, maxSelect: Number(e.target.value || 1) }))}
                  className="input-premium"
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(groupForm.isRequired)}
                  onChange={(e) => setGroupForm((p) => ({ ...p, isRequired: e.target.checked }))}
                  className="w-5 h-5 text-primary border-input rounded"
                />
                <span className="text-sm font-bold text-foreground">Obrigatório</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(groupForm.isActive)}
                  onChange={(e) => setGroupForm((p) => ({ ...p, isActive: e.target.checked }))}
                  className="w-5 h-5 text-primary border-input rounded"
                />
                <span className="text-sm font-bold text-foreground">Grupo ativo</span>
              </label>
            </div>
          </div>

          {/* Opções / Itens Inline Edit Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider">Opções do Grupo</h3>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">Adicione ou edite as opções usando a tabela abaixo. Pressione Enter para adicionar nova linha.</p>
              </div>
              <button onClick={addItem} type="button" className="text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                <Plus className="w-3 h-3" />
                Adicionar Opção
              </button>
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider w-[35%]">Nome da Opção *</th>
                      <th className="px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider w-[20%]">Impacto no Preço</th>
                      <th className="px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider w-[15%]">Valor (R$)</th>
                      <th className="px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider w-[10%] text-center">Status</th>
                      <th className="px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider w-[20%]">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {items.map((it, idx) => (
                      <tr key={it.id || it._tempId} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-4 py-2">
                          <input
                            autoFocus={idx === items.length - 1 && !it.id}
                            value={it.name || ''}
                            onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, idx)}
                            placeholder="Ex: Calabresa"
                            className="w-full px-3 py-2 bg-transparent text-sm font-bold text-foreground border border-transparent focus:border-input focus:bg-background rounded-lg outline-none transition-all placeholder:text-muted-foreground/50 placeholder:font-normal"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={it.priceImpactType || 'none'}
                            onChange={(e) => handleItemChange(idx, 'priceImpactType', e.target.value)}
                            className="w-full px-2 py-2 bg-transparent text-xs font-medium text-foreground border border-transparent focus:border-input focus:bg-background rounded-lg outline-none transition-all"
                          >
                            <option value="none">Nenhum</option>
                            <option value="fixed">Adicional Fixo</option>
                            <option value="replace">Substituir</option>
                            <option value="percentage">% Adicional</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          {(it.priceImpactType as string) === 'percentage' ? (
                            <input
                              type="number"
                              step="0.01"
                              disabled={!it.priceImpactType || it.priceImpactType === 'none'}
                              value={it.priceImpactValue === 0 ? '' : it.priceImpactValue}
                              onChange={(e) => handleItemChange(idx, 'priceImpactValue', Number(e.target.value || 0))}
                              placeholder="0.00"
                              className="w-full px-3 py-2 bg-transparent text-sm font-medium text-foreground border border-transparent focus:border-input focus:bg-background rounded-lg outline-none transition-all disabled:opacity-50"
                            />
                          ) : (
                            <CurrencyInput
                              disabled={!it.priceImpactType || it.priceImpactType === 'none'}
                              value={Number(it.priceImpactValue) || 0}
                              onChange={(val) => handleItemChange(idx, 'priceImpactValue', val || 0)}
                              className="w-full px-3 py-2 bg-transparent text-sm font-medium text-foreground border border-transparent focus:border-input focus:bg-background rounded-lg outline-none transition-all disabled:opacity-50"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={it.isActive !== false}
                            onChange={(e) => handleItemChange(idx, 'isActive', e.target.checked)}
                            className="w-4 h-4 text-primary rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 cursor-pointer text-[10px] text-muted-foreground font-bold hover:text-foreground">
                              <input
                                type="checkbox"
                                checked={Boolean(it.allowQuantity)}
                                onChange={(e) => handleItemChange(idx, 'allowQuantity', e.target.checked)}
                                className="w-3 h-3 rounded"
                              />
                              Permitir Qtd
                            </label>
                            <button
                              onClick={() => removeItem(idx)}
                              type="button"
                              className="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors ml-auto"
                              title="Remover opção"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                          Nenhuma opção adicionada. Clique no botão acima para adicionar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground font-medium mt-2">* Itens sem nome não serão salvos.</p>
          </div>
        </div>
      )}
    </Modal>
  );
};
