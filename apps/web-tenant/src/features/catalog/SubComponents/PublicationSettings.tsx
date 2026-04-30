import React from 'react';

interface PublicationSettingsProps {
  publication: any;
  patchPublication: (payload: any) => void;
  rules: any[];
  openRuleModal: (rule?: any) => void;
  deleteRule: (id: string) => void;
  formatChannelLabel: (channel: string) => string;
  formatDaysLabel: (days: number[]) => string;
  isComboWizard: boolean;
  isProductWizard?: boolean;
  goPrevWizardStep: () => void;
  handleSaveProduct: () => void;
  savingStates: Record<string, boolean>;
}

export const PublicationSettings: React.FC<PublicationSettingsProps> = ({
  publication,
  patchPublication,
  rules,
  openRuleModal,
  deleteRule,
  formatChannelLabel,
  formatDaysLabel,
  isComboWizard,
  isProductWizard = false,
  goPrevWizardStep,
  handleSaveProduct,
  savingStates,
}) => {
  return (
    <section className="space-y-6 text-left">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">Status de Venda</div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">Defina como e quando este produto aparece para o cliente.</p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <button
              type="button"
              onClick={() => patchPublication({ publicationStatus: 'draft' })}
              disabled={savingStates.patchPublication}
              className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-gray-700 border-t-transparent rounded-full animate-spin" />}
              Rascunho
            </button>
            <button
              type="button"
              onClick={() => patchPublication({ publicationStatus: 'published' })}
              disabled={savingStates.patchPublication}
              className="px-3 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Publicar
            </button>
            <button
              type="button"
              onClick={() => patchPublication({ operationalStatus: 'active' })}
              disabled={savingStates.patchPublication}
              className="px-3 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Ativo
            </button>
            <button
              type="button"
              onClick={() => patchPublication({ operationalStatus: 'hidden' })}
              disabled={savingStates.patchPublication}
              className="px-3 py-2 text-sm font-bold text-amber-700 hover:bg-amber-50 rounded-xl border border-amber-200 bg-white dark:bg-gray-900 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-amber-700 border-t-transparent rounded-full animate-spin" />}
              Oculto
            </button>
            <button
              type="button"
              onClick={() => patchPublication({ operationalStatus: 'sold_out_manual' })}
              disabled={savingStates.patchPublication}
              className="px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 rounded-xl border border-red-200 bg-white dark:bg-gray-900 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-red-700 border-t-transparent rounded-full animate-spin" />}
              Esgotado
            </button>
            <button
              type="button"
              onClick={() => patchPublication({ operationalStatus: 'inactive' })}
              disabled={savingStates.patchPublication}
              className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-gray-700 border-t-transparent rounded-full animate-spin" />}
              Inativo
            </button>
          </div>
        </div>

        <div className="mt-4 text-sm font-bold text-gray-700 dark:text-gray-300">
          Status atual: <span className="font-black">{(publication as any)?.publicationStatus === 'published' ? 'Publicado' : 'Rascunho'}</span>
          {' | '}Operação: <span className="font-black">{(publication as any)?.operationalStatus === 'active' ? 'Ativo' : ((publication as any)?.operationalStatus === 'inactive' ? 'Inativo' : ((publication as any)?.operationalStatus === 'sold_out_manual' ? 'Esgotado' : 'Oculto'))}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-black text-gray-900 dark:text-gray-100">Regras de disponibilidade</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">Janela por canal e dias da semana.</div>
          </div>
          <button
            type="button"
            onClick={() => openRuleModal()}
            className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg transition-all"
          >
            Nova regra
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden hidden md:block shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 dark:bg-gray-900/50/50 border-b border-gray-100 dark:border-gray-800">
            <tr>
              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Canal</th>
              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Dias</th>
              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Horário</th>
              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Ativo</th>
              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rules.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50/30 transition-colors group">
                <td className="px-6 py-4 font-bold text-gray-900 dark:text-gray-100">{formatChannelLabel(r.channel)}</td>
                <td className="px-6 py-4 text-sm font-bold text-gray-700 dark:text-gray-300">{formatDaysLabel(r.daysOfWeek ?? [])}</td>
                <td className="px-6 py-4 text-sm font-black text-gray-900 dark:text-gray-100">
                  {r.startTime} - {r.endTime}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {r.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => openRuleModal(r)}
                      className="px-3 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-all"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(r.id)}
                      disabled={savingStates[`delete-rule-${r.id}`]}
                      className="px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-all flex items-center gap-1"
                    >
                      {savingStates[`delete-rule-${r.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rules.length === 0 && (
          <div className="px-6 py-10 text-center text-gray-400 text-sm italic">
            Nenhuma regra cadastrada.
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        {(isComboWizard || isProductWizard) ? (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={goPrevWizardStep}
              className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:text-gray-300 font-black rounded-xl transition-all"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleSaveProduct}
              disabled={savingStates.saveProduct}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-black rounded-xl shadow-lg transition-all flex items-center gap-2"
            >
              {savingStates.saveProduct && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isComboWizard ? 'Finalizar Combo' : 'Finalizar Produto'}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
};
