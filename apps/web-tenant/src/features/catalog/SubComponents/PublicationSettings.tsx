import React from 'react';

import { useCatalogEditor } from '../CatalogEditorContext';

export const PublicationSettings: React.FC = () => {
  const {
    rules,
    openRuleModal,
    deleteRule,
    formatChannelLabel,
    formatDaysLabel,
    isComboWizard,
    isProductWizard,
    goPrevWizardStep,
    handleSaveProduct,
    savingStates,
  } = useCatalogEditor();

  return (
    <section className="space-y-6 text-left">
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-lg font-black text-foreground uppercase tracking-tight">Horarios de venda</div>
            <p className="text-sm text-muted-foreground font-medium mt-1">
              Defina janelas em que este item pode ser vendido por canal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openRuleModal()}
            className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl shadow-lg transition-all"
          >
            Nova regra
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden hidden md:block shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-muted/30 dark:bg-muted/80 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Canal</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Dias</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Horario</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border dark:divide-border/60">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-muted/50 dark:hover:bg-muted/80 dark:bg-card/40 transition-colors group">
                <td className="px-6 py-4 font-bold text-foreground">{formatChannelLabel(rule.channel)}</td>
                <td className="px-6 py-4 text-sm font-bold text-foreground/80">{formatDaysLabel(rule.daysOfWeek ?? [])}</td>
                <td className="px-6 py-4 text-sm font-black text-foreground">
                  {rule.startTime} - {rule.endTime}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                      rule.isActive
                        ? 'bg-status-success/10 text-status-success border-status-success/20'
                        : 'bg-status-warning/10 text-status-warning border-status-warning/20'
                    }`}
                  >
                    {rule.isActive ? 'Ativa' : 'Pausada'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => openRuleModal(rule)}
                      className="px-3 py-1 text-xs font-bold text-foreground/80 hover:bg-muted/50 dark:hover:bg-muted/80 rounded transition-all"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(rule.id)}
                      disabled={savingStates[`delete-rule-${rule.id}`]}
                      className="px-3 py-1 text-xs font-bold text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 rounded disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                    >
                      {savingStates[`delete-rule-${rule.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rules.length === 0 && (
          <div className="px-6 py-10 text-center text-muted-foreground text-sm italic">
            Nenhuma regra cadastrada.
          </div>
        )}
      </div>

      <div className="md:hidden space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-foreground">{formatChannelLabel(rule.channel)}</div>
                <div className="text-xs font-bold text-muted-foreground mt-1">
                  {formatDaysLabel(rule.daysOfWeek ?? [])} | {rule.startTime} - {rule.endTime}
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  rule.isActive
                    ? 'bg-status-success/10 text-status-success border-status-success/20'
                    : 'bg-status-warning/10 text-status-warning border-status-warning/20'
                }`}
              >
                {rule.isActive ? 'Ativa' : 'Pausada'}
              </span>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => openRuleModal(rule)} className="px-3 py-1 text-xs font-bold text-foreground hover:bg-muted rounded">
                Editar
              </button>
              <button type="button" onClick={() => deleteRule(rule.id)} className="px-3 py-1 text-xs font-bold text-destructive hover:bg-destructive/10 rounded">
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        {isComboWizard || isProductWizard ? (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={goPrevWizardStep}
              className="px-8 py-3 bg-card border border-border text-foreground hover:bg-muted font-black rounded-xl transition-all"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleSaveProduct}
              disabled={savingStates.saveProduct}
              className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl shadow-lg shadow-primary/20 transition-all disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveProduct && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
              {isComboWizard ? 'Finalizar Combo' : 'Finalizar Produto'}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
};
