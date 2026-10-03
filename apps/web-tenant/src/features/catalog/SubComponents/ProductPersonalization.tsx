import React from 'react';
import { useCatalogEditor } from '../CatalogEditorContext';
import { formatSelectionRules, formatSelectionType } from '../utils/optionGroupHelpers';

export const ProductPersonalization: React.FC = () => {
  const {
    isComboMode,
    links,
    moveLink,
    openAddGroupModal,
    setIsCreateComplementModalOpen,
    openGlobalGroupEditor,
    openEditLinkModal,
    removeGroupLink,
    savingStates,
    isProductWizard,
    goPrevWizardStep,
    goNextWizardStep,
  } = useCatalogEditor();

  if (isComboMode) return null;

  return (
    <section className="space-y-4 text-left">
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-black text-foreground">Grupos de Opções vinculados</div>
            <div className="text-sm text-muted-foreground font-medium mt-1">
              Vincule grupos de opções reutilizáveis da Biblioteca para personalização deste produto.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openAddGroupModal}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm"
            >
              + Vincular grupo existente
            </button>
            <button
              type="button"
              onClick={() => setIsCreateComplementModalOpen(true)}
              className="px-4 py-2 text-sm font-bold bg-muted text-foreground border border-border hover:bg-muted/80 rounded-xl transition-all"
            >
              + Criar novo grupo
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {[...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => {
          const pausedCount = (l.optionGroup?.items || []).filter(
            (i) => i.isActive && (i.effectiveIsActive === false || i.override?.isActive === false),
          ).length;

          return (
            <div key={l.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
              <div>
                <div className="font-black text-foreground">{l.overrideName || l.optionGroup?.name || 'Opções'}</div>
                <div className="text-xs text-muted-foreground font-medium mt-1">
                  {l.optionGroup && (
                    <>
                      {formatSelectionType(l.optionGroup.selectionType)} • {l.optionGroup.isRequired ? 'Obrigatório' : 'Opcional'} • {formatSelectionRules({
                        isRequired: l.optionGroup.isRequired,
                        minSelect: l.optionGroup.minSelect,
                        maxSelect: l.optionGroup.maxSelect,
                        selectionType: l.optionGroup.selectionType,
                      })}
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(l.overrideName || l.overrideIsRequired !== null || l.overrideMinSelect !== null || l.overrideMaxSelect !== null) && (
                  <span className="text-xs font-medium text-primary bg-primary/10 p-2 rounded-lg border border-primary/20">
                    Regras customizadas
                  </span>
                )}
                {pausedCount > 0 && (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                    {pausedCount} {pausedCount === 1 ? 'item pausado neste produto' : 'itens pausados neste produto'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => moveLink(l.id, -1)}
                  disabled={savingStates.reorderLinks}
                  className="px-3 py-2 text-xs font-black text-foreground bg-card hover:bg-muted rounded-xl border border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                >
                  Subir
                </button>
                <button
                  type="button"
                  onClick={() => moveLink(l.id, 1)}
                  disabled={savingStates.reorderLinks}
                  className="px-3 py-2 text-xs font-black text-foreground bg-card hover:bg-muted rounded-xl border border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                >
                  Descer
                </button>
                <button
                  type="button"
                  onClick={() => openEditLinkModal(l)}
                  className="px-3 py-2 text-xs font-bold bg-muted text-foreground hover:bg-muted/80 rounded-xl transition-all col-span-2"
                >
                  Configurar neste produto
                </button>
                {l.optionGroup && (
                  <button
                    type="button"
                    onClick={() => openGlobalGroupEditor(l.optionGroup)}
                    className="px-3 py-2 text-xs font-bold bg-muted text-foreground border border-border hover:bg-muted/80 rounded-xl transition-all col-span-2"
                  >
                    Editar grupo compartilhado
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeGroupLink(l.id)}
                  disabled={savingStates[`remove-${l.id}`]}
                  className="px-3 py-2 text-xs font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all col-span-2"
                >
                  Desvincular do produto
                </button>
              </div>
            </div>
          );
        })}
        {links.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground text-sm italic shadow-sm">
            Nenhum grupo de opções vinculado a este produto.
          </div>
        ) : null}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden hidden md:block shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-muted/30 dark:bg-muted/80 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Grupo de Opções</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Regras do Grupo</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Configuração Local</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border dark:divide-border/60">
            {[...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => {
              const hasOverride = Boolean(
                l.overrideName ||
                l.overrideDescription ||
                l.overrideIsRequired !== null ||
                l.overrideMinSelect !== null ||
                l.overrideMaxSelect !== null
              );
              const pausedCount = (l.optionGroup?.items || []).filter(
                (i) => i.isActive && (i.effectiveIsActive === false || i.override?.isActive === false),
              ).length;

              return (
                <tr key={l.id} className="hover:bg-muted/50 dark:hover:bg-muted/80 dark:bg-card/40 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-foreground">{l.overrideName || l.optionGroup?.name || 'Grupo de Opções'}</div>
                    {l.overrideName && l.optionGroup?.name && (
                      <div className="text-[11px] text-muted-foreground italic">
                        (Nome original: {l.optionGroup.name})
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-muted-foreground">
                    {l.optionGroup ? (
                      <div className="space-y-0.5">
                        <div className="font-bold text-foreground">
                          {formatSelectionType(l.optionGroup.selectionType)}
                        </div>
                        <div>
                          {l.optionGroup.isRequired ? 'Obrigatório' : 'Opcional'} • {formatSelectionRules({
                            isRequired: l.optionGroup.isRequired,
                            minSelect: l.optionGroup.minSelect,
                            maxSelect: l.optionGroup.maxSelect,
                            selectionType: l.optionGroup.selectionType,
                          })}
                        </div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium">
                    <div className="flex flex-col gap-1 items-start">
                      {hasOverride ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                          Regras customizadas
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Padrão do grupo</span>
                      )}
                      {pausedCount > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          {pausedCount} {pausedCount === 1 ? 'item pausado' : 'itens pausados'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => moveLink(l.id, -1)}
                        disabled={savingStates.reorderLinks}
                        className="px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-muted/50 dark:hover:bg-muted/80 rounded disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                        title="Subir"
                      >
                        {savingStates.reorderLinks ? <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" /> : '↑'}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLink(l.id, 1)}
                        disabled={savingStates.reorderLinks}
                        className="px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-muted/50 dark:hover:bg-muted/80 rounded disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                        title="Descer"
                      >
                        {savingStates.reorderLinks ? <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" /> : '↓'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditLinkModal(l)}
                        className="px-3 py-1 text-xs font-bold text-foreground bg-muted hover:bg-muted/80 rounded transition-all"
                      >
                        Configurar neste produto
                      </button>
                      {l.optionGroup && (
                        <button
                          type="button"
                          onClick={() => openGlobalGroupEditor(l.optionGroup)}
                          className="px-3 py-1 text-xs font-bold text-foreground bg-muted border border-border hover:bg-muted/80 rounded transition-all"
                        >
                          Editar grupo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeGroupLink(l.id)}
                        disabled={savingStates[`remove-${l.id}`]}
                        className="px-3 py-1 text-xs font-bold text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 rounded disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                      >
                        {savingStates[`remove-${l.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                        Desvincular
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {links.length === 0 && (
          <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
            <div className="text-3xl mb-4">⚙️</div>
            <div className="font-black text-foreground mb-1">Nenhum adicional vinculado</div>
            <div className="text-sm text-muted-foreground mb-6 mx-auto max-w-sm">
              Vincule um grupo de opções reutilizável (como "Molhos" ou "Ingredientes Extras") para permitir a personalização deste produto.
            </div>
            <button
              type="button"
              onClick={openAddGroupModal}
              className="px-6 py-2.5 text-sm font-black text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all"
            >
              Vincular primeiro grupo de opções
            </button>
          </div>
        )}
      </div>

      {isProductWizard && (
        <div className="mt-8 flex justify-between">
          <button
            type="button"
            onClick={goPrevWizardStep}
            className="px-8 py-3 bg-card border border-border text-foreground hover:bg-muted font-black rounded-xl transition-all"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={goNextWizardStep}
            className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl shadow-lg shadow-primary/20 transition-all"
          >
            Próximo
          </button>
        </div>
      )}
    </section>
  );
};
