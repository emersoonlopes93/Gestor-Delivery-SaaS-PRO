import React, { useMemo, useState } from 'react';
import { OptionGroup, OptionItem } from '@gestor/types';
import { Modal } from '../../../components/Modal';
import {
  formatUsageCount,
  formatSelectionType,
  formatSelectionRules,
} from '../utils/optionGroupHelpers';
import { Search, Plus, Layers, Loader2, Check } from 'lucide-react';

type GroupWithDetails = OptionGroup & {
  items?: OptionItem[];
  _count?: { optionGroupLinks: number };
};

interface LinkExistingGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  availableGroups: GroupWithDetails[];
  onLinkGroup: (groupId: string) => Promise<void>;
  isLinking: boolean;
  onOpenCreateGroup: () => void;
}

export const LinkExistingGroupDialog: React.FC<LinkExistingGroupDialogProps> = ({
  isOpen,
  onClose,
  availableGroups,
  onLinkGroup,
  isLinking,
  onOpenCreateGroup,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return availableGroups;
    return availableGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q))
    );
  }, [availableGroups, searchQuery]);

  const handleSelectGroup = async (groupId: string) => {
    setLinkingId(groupId);
    try {
      await onLinkGroup(groupId);
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Vincular grupo de opções ao produto"
      maxWidth="max-w-xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCreateGroup();
            }}
            className="px-4 py-2 text-sm font-bold text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-primary" />
            Criar novo grupo
          </button>
        </>
      }
    >
      <div className="space-y-4 text-left">
        <p className="text-xs text-muted-foreground font-medium leading-relaxed">
          Selecione um grupo de opções reutilizável da sua biblioteca para vinculá-lo a este produto.
        </p>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar grupos de opções disponíveis..."
            className="w-full pl-10 pr-4 py-2.5 bg-card text-foreground text-sm font-medium border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary transition-all placeholder:text-muted-foreground"
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

        {/* Available Groups List */}
        {filteredGroups.length > 0 ? (
          <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border/60 max-h-80 overflow-y-auto custom-scrollbar">
            {filteredGroups.map((g) => {
              const usageCount = g._count?.optionGroupLinks ?? 0;
              const isThisLinking = linkingId === g.id;

              return (
                <div
                  key={g.id}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm truncate">{g.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          usageCount > 0
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        {formatUsageCount(usageCount)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <span>{formatSelectionType(g.selectionType)}</span>
                      <span>•</span>
                      <span>{g.isRequired ? 'Obrigatório' : 'Opcional'}</span>
                      <span>•</span>
                      <span>
                        {formatSelectionRules({
                          isRequired: g.isRequired,
                          minSelect: g.minSelect,
                          maxSelect: g.maxSelect,
                          selectionType: g.selectionType,
                        })}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectGroup(g.id)}
                    disabled={isLinking}
                    className="btn-primary py-2 px-4 text-xs font-bold shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isThisLinking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-foreground" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Vincular
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 bg-card border border-dashed border-border rounded-xl text-center space-y-3 p-6">
            <Layers className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-bold text-foreground">
              {availableGroups.length === 0
                ? 'Nenhum grupo disponível para vínculo.'
                : 'Nenhum grupo encontrado com esse termo.'}
            </p>
            <p className="text-xs text-muted-foreground font-medium">
              {availableGroups.length === 0
                ? 'Todos os grupos criados já estão vinculados ou você ainda não possui grupos na biblioteca.'
                : 'Tente outro termo na busca.'}
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCreateGroup();
                }}
                className="btn-primary px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar novo grupo agora
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
