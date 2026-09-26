import React, { useState } from 'react';
import { OptionGroup, OptionItem } from '@gestor/types';
import {
  formatUsageCount,
  formatSelectionType,
  formatSelectionRules,
  formatPriceImpact,
} from '../utils/optionGroupHelpers';
import { Archive, Layers, ChevronDown, ChevronUp, MoreVertical, Edit3, RotateCcw } from 'lucide-react';

type GroupWithItems = OptionGroup & { items?: OptionItem[]; _count?: { optionGroupLinks: number } };

interface OptionGroupCardProps {
  group: GroupWithItems;
  onEdit: (group: GroupWithItems) => void;
  onDelete: (group: GroupWithItems) => void;
  onRestore?: (group: GroupWithItems) => void;
  onViewProducts: (group: GroupWithItems) => void;
}

export const OptionGroupCard: React.FC<OptionGroupCardProps> = ({
  group,
  onEdit,
  onDelete,
  onRestore,
  onViewProducts,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const usageCount = group._count?.optionGroupLinks ?? 0;
  const isArchived = Boolean(group.deletedAt);
  const items = [...(group.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const maxVisibleItems = 4;
  const hasMoreItems = items.length > maxVisibleItems;
  const visibleItems = isExpanded ? items : items.slice(0, maxVisibleItems);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
      {/* Top Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-foreground text-lg tracking-tight truncate" title={group.name}>
              {group.name}
            </h3>
            {group.description && (
              <p className="text-xs text-muted-foreground font-medium mt-0.5 line-clamp-2">
                {group.description}
              </p>
            )}
          </div>

          {/* Usage Badge (MANDATORY & CLICKABLE) */}
          <button
            type="button"
            onClick={() => onViewProducts(group)}
            title="Ver produtos que utilizam este grupo"
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 ${
              usageCount > 0
                ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
                : 'bg-muted text-muted-foreground border border-border hover:bg-muted/80'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{formatUsageCount(usageCount)}</span>
          </button>
        </div>

        {/* Rule Badges */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-muted text-foreground border border-border">
            {formatSelectionType(group.selectionType)}
          </span>

          <span
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider ${
              group.isRequired
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30'
            }`}
          >
            {group.isRequired ? 'Obrigatório' : 'Opcional'}
          </span>

          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-muted/60 text-muted-foreground border border-border/60">
            {formatSelectionRules({
              isRequired: group.isRequired,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              selectionType: group.selectionType,
            })}
          </span>
        </div>
      </div>

      {/* Items List Preview */}
      <div className="border border-border/60 rounded-xl overflow-hidden bg-muted/20">
        <div className="px-3.5 py-2 bg-muted/50 border-b border-border/60 flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <span>Opções ({items.length})</span>
          {hasMoreItems && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[11px] text-primary hover:underline flex items-center gap-0.5 normal-case font-bold"
            >
              {isExpanded ? (
                <>
                  Ver menos <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  + {items.length - maxVisibleItems} opções <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>

        <div className="divide-y divide-border/40">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-muted/40 transition-colors"
            >
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="font-bold text-foreground truncate">{item.name}</span>
                {item.allowQuantity && (
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium shrink-0">
                    Qtd
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold text-foreground">
                  {formatPriceImpact(item.priceImpactType, item.priceImpactValue)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    item.isActive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-muted text-muted-foreground border border-border'
                  }`}
                >
                  {item.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="px-3.5 py-6 text-center text-xs text-muted-foreground italic font-medium">
              Nenhuma opção cadastrada neste grupo.
            </div>
          )}
        </div>
      </div>

      {/* Card Footer / Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewProducts(group)}
            className="px-3 py-2 text-xs font-bold text-foreground bg-muted hover:bg-muted/80 rounded-xl transition-all flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-primary" />
            Ver produtos
          </button>
          <button
            type="button"
            onClick={() => onEdit(group)}
            disabled={isArchived}
            className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Editar grupo
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="Mais opções"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute right-0 bottom-full mb-1 w-48 bg-card border border-border rounded-xl shadow-xl z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {isArchived ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onRestore?.(group);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-bold text-foreground hover:bg-muted flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-primary" />
                    Restaurar grupo
                  </button>
                ) : (
                  <>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onViewProducts(group);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-bold text-foreground hover:bg-muted flex items-center gap-2"
                >
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  Ver produtos vinculados
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onEdit(group);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-bold text-foreground hover:bg-muted flex items-center gap-2"
                >
                  <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                  Editar grupo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onDelete(group);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-bold text-destructive hover:bg-destructive/10 flex items-center gap-2"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Arquivar grupo
                </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
