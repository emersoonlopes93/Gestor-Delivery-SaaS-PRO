import React from 'react';
import { ProductOptionGroupLink } from '@gestor/types';

interface ProductPersonalizationProps {
  isComboMode: boolean;
  links: any[];
  isNew: boolean;
  moveLink: (id: string, direction: -1 | 1) => void;
  openAddGroupModal: () => void;
  setIsCreateComplementModalOpen: (open: boolean) => void;
  openEditLinkModal: (link: any) => void;
  removeGroupLink: (id: string) => void;
  savingStates: Record<string, boolean>;
  isProductWizard?: boolean;
  goPrevWizardStep?: () => void;
  goNextWizardStep?: () => void;
}

export const ProductPersonalization: React.FC<ProductPersonalizationProps> = ({
  isComboMode,
  links,
  isNew,
  moveLink,
  openAddGroupModal,
  setIsCreateComplementModalOpen,
  openEditLinkModal,
  removeGroupLink,
  savingStates,
  isProductWizard = false,
  goPrevWizardStep,
  goNextWizardStep,
}) => {
  if (isComboMode) return null;

  return (
    <section className="space-y-4 text-left">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-black text-gray-900 dark:text-gray-100">Complementos vinculados</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">
              Vincule complementos reutilizáveis para personalização deste produto.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openAddGroupModal}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all"
            >
              Vincular complemento
            </button>
            <button
              type="button"
              onClick={() => setIsCreateComplementModalOpen(true)}
              className="px-4 py-2 text-sm font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl border border-primary-200 transition-all"
            >
              Criar novo complemento
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {[...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => (
          <div key={l.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
            <div className="font-black text-gray-900 dark:text-gray-100">{l.optionGroup?.name ?? 'Complemento'}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">
              Base: req={String(l.optionGroup?.isRequired)} min={l.optionGroup?.minSelect} max={l.optionGroup?.maxSelect}
            </div>
            <div className="mt-3 text-xs font-bold text-gray-700 dark:text-gray-300">
              Overrides: req={String(l.overrideIsRequired ?? '-')}
              {' | '}min={l.overrideMinSelect ?? '-'}
              {' | '}max={l.overrideMaxSelect ?? '-'}
            </div>
            <div className="mt-1 text-xs font-black text-gray-800 dark:text-gray-200">Axis: {l.pricingAxis}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => moveLink(l.id, -1)}
                disabled={savingStates.reorderLinks}
                className="px-3 py-2 text-xs font-black text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 disabled:opacity-50 transition-all"
              >
                Subir
              </button>
              <button
                type="button"
                onClick={() => moveLink(l.id, 1)}
                disabled={savingStates.reorderLinks}
                className="px-3 py-2 text-xs font-black text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 disabled:opacity-50 transition-all"
              >
                Descer
              </button>
              <button
                type="button"
                onClick={() => openEditLinkModal(l)}
                className="px-3 py-2 text-xs font-black text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl border border-primary-200 transition-all"
              >
                Overrides
              </button>
              <button
                type="button"
                onClick={() => removeGroupLink(l.id)}
                disabled={savingStates[`remove-${l.id}`]}
                className="px-3 py-2 text-xs font-black text-red-700 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 disabled:opacity-50 transition-all"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
        {links.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 text-center text-gray-400 text-sm italic shadow-sm">
            Nenhum complemento vinculado.
          </div>
        ) : null}
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden hidden md:block shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 dark:bg-gray-900/50/50 border-b border-gray-100 dark:border-gray-800">
            <tr>
              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Complemento</th>
              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Overrides</th>
              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Axis</th>
              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {[...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => (
              <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50/30 transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-900 dark:text-gray-100">{l.optionGroup?.name ?? 'Complemento'}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">
                    Base: req={String(l.optionGroup?.isRequired)} min={l.optionGroup?.minSelect} max={l.optionGroup?.maxSelect}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-bold text-gray-700 dark:text-gray-300">
                  req={String(l.overrideIsRequired ?? '-')}
                  {' | '}min={l.overrideMinSelect ?? '-'}
                  {' | '}max={l.overrideMaxSelect ?? '-'}
                </td>
                <td className="px-6 py-4 text-sm font-black text-gray-800 dark:text-gray-200">{l.pricingAxis}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => moveLink(l.id, -1)}
                      disabled={savingStates.reorderLinks}
                      className="px-2 py-1 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 transition-all"
                      title="Subir"
                    >
                      {savingStates.reorderLinks ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↑'}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLink(l.id, 1)}
                      disabled={savingStates.reorderLinks}
                      className="px-2 py-1 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 transition-all"
                      title="Descer"
                    >
                      {savingStates.reorderLinks ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↓'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditLinkModal(l)}
                      className="px-3 py-1 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-all"
                    >
                      Overrides
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGroupLink(l.id)}
                      disabled={savingStates[`remove-${l.id}`]}
                      className="px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-all flex items-center gap-1"
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
          <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-12 text-center">
            <div className="text-3xl mb-4">⚙️</div>
            <div className="font-black text-gray-900 dark:text-gray-100 mb-1">Nenhum adicional vinculado</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-6 mx-auto max-w-sm">
              Vincule um complemento reutilizável (como "Molhos" ou "Ingredientes Extras") para permitir a personalização deste produto.
            </div>
            <button
              type="button"
              onClick={openAddGroupModal}
              className="px-6 py-2.5 text-sm font-black text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-all"
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
            className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:text-gray-300 font-black rounded-xl transition-all"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={goNextWizardStep}
            className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-black rounded-xl shadow-lg shadow-primary-200 transition-all"
          >
            Próximo
          </button>
        </div>
      )}
    </section>
  );
};
