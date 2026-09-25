import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api-client';
import { OptionGroup, OptionItem } from '@gestor/types';
import { OptionGroupEditorModal } from './SubComponents/OptionGroupEditorModal';
import { OptionGroupCard } from './SubComponents/OptionGroupCard';
import { ConfirmSharedEditModal } from './SubComponents/ConfirmSharedEditModal';
import { ConfirmDeleteGroupModal } from './SubComponents/ConfirmDeleteGroupModal';
import { LinkedProductsModal } from './SubComponents/LinkedProductsModal';
import { Search, Plus, Layers, Filter, RefreshCw, XCircle } from 'lucide-react';

type GroupWithItems = OptionGroup & { items?: OptionItem[]; _count?: { optionGroupLinks: number } };
type FilterType = 'all' | 'required' | 'optional' | 'most_used';

export function OptionGroupsPage() {
  const [groups, setGroups] = useState<GroupWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Modal States
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupWithItems | null>(null);
  const [viewProductsGroup, setViewProductsGroup] = useState<GroupWithItems | null>(null);

  // Guardrail Modals
  const [sharedGroupToEdit, setSharedGroupToEdit] = useState<GroupWithItems | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<GroupWithItems | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await api.get<GroupWithItems[]>('/catalog/option-groups');
      if (res.success) {
        setGroups(res.data);
      } else {
        setHasError(true);
      }
    } catch (err) {
      console.error('Erro ao carregar grupos de opções:', err);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredGroups = useMemo(() => {
    let result = [...groups];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.description && g.description.toLowerCase().includes(q))
      );
    }

    // Filter Chips
    if (activeFilter === 'required') {
      result = result.filter((g) => g.isRequired === true);
    } else if (activeFilter === 'optional') {
      result = result.filter((g) => g.isRequired === false);
    } else if (activeFilter === 'most_used') {
      result.sort((a, b) => (b._count?.optionGroupLinks ?? 0) - (a._count?.optionGroupLinks ?? 0));
    } else {
      // Default order
      result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    return result;
  }, [groups, searchQuery, activeFilter]);

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setIsEditorOpen(true);
  };

  const handleRequestEdit = (group: GroupWithItems) => {
    const usageCount = group._count?.optionGroupLinks ?? 0;
    if (usageCount > 1) {
      setSharedGroupToEdit(group);
    } else {
      setEditingGroup(group);
      setIsEditorOpen(true);
    }
  };

  const handleConfirmSharedEdit = () => {
    if (sharedGroupToEdit) {
      setEditingGroup(sharedGroupToEdit);
      setSharedGroupToEdit(null);
      setIsEditorOpen(true);
    }
  };

  const handleRequestDelete = (group: GroupWithItems) => {
    setGroupToDelete(group);
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/catalog/option-groups/${groupToDelete.id}`);
      setGroupToDelete(null);
      await loadGroups();
    } catch (err) {
      console.error('Erro ao excluir grupo:', err);
      alert('Não foi possível excluir o grupo de opções.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaved = async () => {
    setIsEditorOpen(false);
    await loadGroups();
  };

  const handleOpenViewProducts = (group: GroupWithItems) => {
    setViewProductsGroup(group);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>Cardápio e Produção</span>
            <span>/</span>
            <span className="text-foreground">Grupos de Opções</span>
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Grupos de opções</h1>
          <p className="text-sm text-muted-foreground font-medium mt-1">
            Crie e reutilize tamanhos, sabores e adicionais em vários produtos do cardápio.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="btn-primary px-5 py-2.5 flex items-center gap-2 font-bold shadow-lg shadow-primary/20 shrink-0 self-start md:self-auto"
          type="button"
        >
          <Plus className="w-4 h-4" />
          Novo grupo
        </button>
      </div>

      {/* Search and Filter Chips Bar */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar grupos de opções..."
            className="w-full pl-10 pr-4 py-2 bg-muted/30 text-foreground text-sm font-medium border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs text-muted-foreground font-bold flex items-center gap-1 shrink-0 mr-1">
            <Filter className="w-3 h-3" /> Filtros:
          </span>
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Todos ({groups.length})
          </button>
          <button
            onClick={() => setActiveFilter('required')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeFilter === 'required'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Obrigatórios
          </button>
          <button
            onClick={() => setActiveFilter('optional')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeFilter === 'optional'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Opcionais
          </button>
          <button
            onClick={() => setActiveFilter('most_used')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeFilter === 'most_used'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Mais usados
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col justify-center items-center h-64 space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
          <span className="text-xs text-muted-foreground font-medium">Carregando biblioteca de grupos...</span>
        </div>
      ) : hasError ? (
        <div className="py-12 bg-card border border-destructive/20 rounded-2xl text-center space-y-3">
          <XCircle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-sm font-bold text-foreground">Erro ao carregar os grupos de opções.</p>
          <button
            onClick={loadGroups}
            className="px-4 py-2 text-xs font-bold bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-all inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
          </button>
        </div>
      ) : filteredGroups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredGroups.map((g) => (
            <OptionGroupCard
              key={g.id}
              group={g}
              onEdit={handleRequestEdit}
              onDelete={handleRequestDelete}
              onViewProducts={handleOpenViewProducts}
            />
          ))}
        </div>
      ) : (
        /* Empty States */
        <div className="py-16 bg-card border border-dashed border-border rounded-2xl text-center space-y-4 p-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>

          {groups.length === 0 ? (
            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="font-black text-foreground text-lg">Nenhum grupo de opções criado</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Crie grupos de tamanhos, sabores ou adicionais e reutilize-os nos produtos do seu cardápio.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleOpenCreate}
                  className="btn-primary px-6 py-2.5 text-xs font-bold inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Criar primeiro grupo
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="font-black text-foreground text-lg">Nenhum grupo encontrado</h3>
              <p className="text-xs text-muted-foreground font-medium">
                Tente outro termo na busca ou limpe os filtros selecionados.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveFilter('all');
                  }}
                  className="px-4 py-2 text-xs font-bold bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-all"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor Modal */}
      <OptionGroupEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        groupId={editingGroup?.id || null}
        onSaved={handleSaved}
      />

      {/* Linked Products Inverse Management Modal */}
      {viewProductsGroup && (
        <LinkedProductsModal
          isOpen={Boolean(viewProductsGroup)}
          onClose={() => setViewProductsGroup(null)}
          group={viewProductsGroup}
          onUpdated={loadGroups}
        />
      )}

      {/* Guardrail: Shared Group Edit Confirmation */}
      {sharedGroupToEdit && (
        <ConfirmSharedEditModal
          isOpen={Boolean(sharedGroupToEdit)}
          onClose={() => setSharedGroupToEdit(null)}
          onConfirm={handleConfirmSharedEdit}
          groupName={sharedGroupToEdit.name}
          usageCount={sharedGroupToEdit._count?.optionGroupLinks ?? 0}
        />
      )}

      {/* Guardrail: Delete Group Confirmation */}
      {groupToDelete && (
        <ConfirmDeleteGroupModal
          isOpen={Boolean(groupToDelete)}
          onClose={() => setGroupToDelete(null)}
          onConfirm={handleConfirmDelete}
          groupName={groupToDelete.name}
          usageCount={groupToDelete._count?.optionGroupLinks ?? 0}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
