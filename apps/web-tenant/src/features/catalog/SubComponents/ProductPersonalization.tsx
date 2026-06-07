import React from 'react';

import { useCatalogEditor } from '../CatalogEditorContext';

export const ProductPersonalization: React.FC = () => {
  const {
    isComboMode,
    links,
    moveLink,
    openAddGroupModal,
    setIsCreateComplementModalOpen,
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
            <div className="font-black text-foreground">Complementos vinculados</div>
            <div className="text-sm text-muted-foreground font-medium mt-1">
              Vincule complementos reutilizáveis para personalização deste produto.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openAddGroupModal}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all"
            >
              Vincular complemento
            </button>
            <button
              type="button"
              onClick={() => setIsCreateComplementModalOpen(true)}
              className="px-4 py-2 text-sm font-bold bg-muted text-foreground border border-border hover:bg-muted/80 rounded-xl transition-all"
            >
              Criar novo complemento
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {[...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => (
          <div key={l.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="font-black text-foreground">{l.optionGroup?.name ?? 'Complemento'}</div>
            <div className="text-xs text-muted-foreground font-medium mt-1">
              Base: req={String(l.optionGroup?.isRequired)} min={l.optionGroup?.minSelect} max={l.optionGroup?.maxSelect}
            </div>
            <div className="mt-3 text-xs font-bold text-foreground/80">
              Overrides: req={String(l.overrideIsRequired ?? '-')}
              {' | '}min={l.overrideMinSelect ?? '-'}
              {' | '}max={l.overrideMaxSelect ?? '-'}
            </div>
            <div className="mt-1 text-xs font-black text-foreground/90">Axis: {l.pricingAxis}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
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
                className="px-3 py-2 text-xs font-black bg-muted text-foreground hover:bg-muted/80 rounded-xl transition-all"
              >
                Overrides
              </button>
              <button
                type="button"
                onClick={() => removeGroupLink(l.id)}
                disabled={savingStates[`remove-${l.id}`]}
                className="px-3 py-2 text-xs font-black bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
        {links.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground text-sm italic shadow-sm">
            Nenhum complemento vinculado.
          </div>
        ) : null}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden hidden md:block shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-muted/30 dark:bg-muted/80 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Complemento</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Overrides</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Axis</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border dark:divide-border/60">
            {[...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => (
              <tr key={l.id} className="hover:bg-muted/50 dark:hover:bg-muted/80 dark:bg-card/40 transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-bold text-foreground">{l.optionGroup?.name ?? 'Complemento'}</div>
                  <div className="text-xs text-muted-foreground font-medium mt-1">
                    Base: req={String(l.optionGroup?.isRequired)} min={l.optionGroup?.minSelect} max={l.optionGroup?.maxSelect}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-bold text-foreground/80">
                  req={String(l.overrideIsRequired ?? '-')}
                  {' | '}min={l.overrideMinSelect ?? '-'}
                  {' | '}max={l.overrideMaxSelect ?? '-'}
                </td>
                <td className="px-6 py-4 text-sm font-black text-foreground/90">{l.pricingAxis}</td>
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
                      className="px-3 py-1 text-xs font-bold text-muted-foreground hover:bg-muted/50 dark:hover:bg-muted/80 rounded transition-all"
                    >
                      Overrides
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGroupLink(l.id)}
                      disabled={savingStates[`remove-${l.id}`]}
                      className="px-3 py-1 text-xs font-bold text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 rounded disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                    >
                      {savingStates[`remove-${l.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {links.length === 0 && (
          <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
            <div className="text-3xl mb-4">⚙️</div>
            <div className="font-black text-foreground mb-1">Nenhum adicional vinculado</div>
            <div className="text-sm text-muted-foreground mb-6 mx-auto max-w-sm">
              Vincule um complemento reutilizável (como "Molhos" ou "Ingredientes Extras") para permitir a personalização deste produto.
            </div>
            <button
              type="button"
              onClick={openAddGroupModal}
              className="px-6 py-2.5 text-sm font-black text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all"
            >
              Vincular meu primeiro complemento
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
