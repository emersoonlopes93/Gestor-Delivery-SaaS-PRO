import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api-client';
import {
  OptionGroup,
  OptionItem,
} from '@gestor/types';
import { InfoTooltip } from '../../components/InfoTooltip';
import { OptionGroupEditorModal } from './SubComponents/OptionGroupEditorModal';

type GroupWithItems = OptionGroup & { items?: OptionItem[] };


export function OptionGroupsPage() {
  const [groups, setGroups] = useState<GroupWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupWithItems | null>(null);

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
    setEditingGroup(group || null);
    setIsEditorOpen(true);
  };

  const handleSaved = async () => {
    setIsEditorOpen(false);
    await loadGroups();
  };

  const deleteGroup = async (id: string) => {
    if (!window.confirm('Excluir este grupo e seus itens?')) return;
    await api.delete(`/catalog/option-groups/${id}`);
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
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Complementos e Adicionais</h1>
          <p className="text-muted-foreground mt-1">Gerencie os grupos de opções, tamanhos e adicionais que podem ser vinculados aos produtos.</p>
        </div>
        <button
          onClick={() => openGroupModal()}
          className="btn-primary px-5 py-2.5 flex items-center gap-2"
          type="button"
        >
          Novo Grupo/Tamanho
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {groupsSorted.map((g) => {
            const items = [...(g.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            return (
              <section key={g.id} className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                <div className="px-6 py-4 bg-muted/50 border-b border-border flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="font-black text-foreground uppercase tracking-wider text-sm truncate">{g.name}</div>
                    <div className="text-xs text-muted-foreground font-bold mt-1">
                      Seleção: {g.selectionType === 'single' ? 'Única' : g.selectionType === 'multiple' ? 'Múltipla' : 'Quantidade'} | {g.isRequired ? 'Obrigatório' : 'Opcional'} | Mín {g.minSelect} / Máx {g.maxSelect}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openGroupModal(g)}
                      className="px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      type="button"
                    >
                      Editar Opções
                    </button>
                    <button
                      onClick={() => deleteGroup(g.id)}
                      className="px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      type="button"
                    >
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-card border-b border-border">
                      <tr>
                        <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Item</th>
                        <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">
                          Impacto no Preço
                          <InfoTooltip text="Define como este item altera o valor base do produto." />
                        </th>
                        <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {items.map((it) => (
                        <tr key={it.id} className="hover:bg-muted transition-colors group">
                          <td className="px-6 py-4">
                            <div className="font-bold text-foreground">{it.name}</div>
                            <div className="text-xs text-muted-foreground font-medium">{it.description || ''}</div>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-foreground whitespace-nowrap">
                            {it.priceImpactType === 'none' ? 'Nenhum' : 
                             it.priceImpactType === 'fixed' ? 'Adicional Fixo' : 
                             it.priceImpactType === 'percentage' ? 'Porcentagem' : 'Substituir Preço'}
                            {Number(it.priceImpactValue ?? 0) ? ` (${it.priceImpactValue})` : ''}
                            {it.allowQuantity ? ' | Permite Qtd' : ''}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${it.isActive ? 'status-badge-success' : 'status-badge-danger'}`}>
                              {it.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => moveItem(g, it.id, -1)}
                                className="px-2 py-1 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                type="button"
                                title="Subir"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveItem(g, it.id, 1)}
                                className="px-2 py-1 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                type="button"
                                title="Descer"
                              >
                                ↓
                              </button>
                              <button
                                onClick={() => openGroupModal(g)}
                                className="px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                type="button"
                              >
                                Editar na tabela
                              </button>
                              <button
                                onClick={() => deleteItem(it.id)}
                                className="px-3 py-1 text-xs font-bold text-destructive hover:bg-destructive/10 rounded transition-colors"
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
                          <td colSpan={4} className="px-6 py-10 text-center text-muted-foreground text-sm italic">
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
            <div className="py-16 text-center text-muted-foreground font-bold italic">Nenhum grupo cadastrado ainda.</div>
          )}
        </div>
      )}

      <OptionGroupEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        groupId={editingGroup?.id || null}
        onSaved={handleSaved}
      />
    </div>
  );
}
