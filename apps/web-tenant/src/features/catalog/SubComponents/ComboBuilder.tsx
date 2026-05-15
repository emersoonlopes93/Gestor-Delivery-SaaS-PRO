import React from 'react';

interface ComboBuilderProps {
  productForm: any;
  bundleItems: any[];
  bundleSummary: any;
  comboModeState: string;
  comboPricingType: string;
  setComboPricingType: (val: any) => void;
  comboPricingValue: number;
  setComboPricingValue: (val: number) => void;
  updateComboPricing: () => void;
  openBundleItemModal: (item?: any) => void;
  deleteBundleItem: (id: string) => void;
  convertComboToBundle: () => void;
  isComboWizard: boolean;
  goNextWizardStep: () => void;
  slots: any[];
  moveSlot: (id: string, dir: -1 | 1) => void;
  openAllowedModal: (slotId: string, item?: any) => void;
  openSlotModal: (slot?: any) => void;
  deleteSlot: (id: string) => void;
  moveAllowed: (slot: any, id: string, dir: -1 | 1) => void;
  deleteAllowed: (slotId: string, id: string) => void;
  savingStates: Record<string, boolean>;
}

export const ComboBuilder: React.FC<ComboBuilderProps> = ({
  productForm,
  bundleItems,
  bundleSummary,
  comboModeState,
  comboPricingType,
  setComboPricingType,
  comboPricingValue,
  setComboPricingValue,
  updateComboPricing,
  openBundleItemModal,
  deleteBundleItem,
  convertComboToBundle,
  isComboWizard,
  goNextWizardStep,
  slots,
  moveSlot,
  openAllowedModal,
  openSlotModal,
  deleteSlot,
  moveAllowed,
  deleteAllowed,
  savingStates,
}) => {
  return (
    <section className="space-y-4 text-left">
      {productForm.type !== 'combo' ? (
        <div className="alert-warning rounded-2xl p-8 text-center shadow-sm">
          <div className="text-3xl mb-4">🍱</div>
          <div className="font-black text-lg mb-2">Este produto não é um Combo</div>
          <div className="text-sm mb-6 mx-auto max-w-md">
            Para configurar itens e slots, você precisa primeiro alterar o <strong>Tipo de Produto</strong> para "Combo" na aba de informações gerais.
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">Montagem do Combo</div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">
                  Vincule itens já cadastrados do cardápio e defina a estratégia de preço do combo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openBundleItemModal()}
                className="px-6 py-2.5 text-sm font-black text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg shadow-primary-100 transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <span>➕</span> Adicionar item do cardápio
              </button>
            </div>
          </div>

          {comboModeState !== 'bundle' ? (
            <div className="alert-warning rounded-2xl p-4">
              <div className="font-black">Este combo está em modo legado (slot)</div>
              <p className="text-sm mt-1">
                Para usar "Itens do Combo" e estratégia de preço, converta este combo para modo bundle.
              </p>
              <button
                type="button"
                onClick={convertComboToBundle}
                disabled={savingStates.convertBundle}
                className="mt-3 px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50 flex items-center gap-2"
              >
                {savingStates.convertBundle && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Converter para bundle
              </button>
            </div>
          ) : null}

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
            <div className="text-sm font-black text-gray-900 dark:text-gray-100 mb-3">Estratégia de preço</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={comboPricingType}
                onChange={(e) => setComboPricingType(e.target.value)}
                className="input-premium"
              >
                <option value="fixed_price">Preço fixo</option>
                <option value="discount_percent">Desconto %</option>
                <option value="discount_amount">Desconto em R$</option>
              </select>
              <input
                type="number"
                step="0.01"
                value={comboPricingValue}
                onChange={(e) => setComboPricingValue(Number(e.target.value || 0))}
                className="input-premium"
                placeholder="Valor da estratégia"
              />
              <button
                type="button"
                onClick={updateComboPricing}
                disabled={savingStates.updateComboPricing || comboModeState !== 'bundle'}
                className="px-4 py-2.5 text-sm font-black text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingStates.updateComboPricing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Aplicar estratégia
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Produto</th>
                    <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Qtd</th>
                    <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Preço unit.</th>
                    <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Subtotal</th>
                    <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {bundleItems.map((item) => {
                    const unit = Number(item.product?.basePrice ?? 0);
                    const subtotal = unit * Math.max(1, item.qty);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900 dark:text-gray-100">{item.product?.name ?? item.productId}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-700 dark:text-gray-300">{Math.max(1, item.qty)}</td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-700 dark:text-gray-300">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unit)}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-gray-900 dark:text-gray-100">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openBundleItemModal(item)}
                              className="px-3 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-all"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteBundleItem(item.id)}
                              disabled={savingStates[`delete-bundle-${item.id}`]}
                              className="px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded disabled:opacity-50 transition-all"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {bundleItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm italic">
                        Nenhum item vinculado no combo.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
            <div className="text-sm font-black text-gray-900 dark:text-gray-100 mb-3">Resumo do combo</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 p-3">
                <div className="text-gray-500 dark:text-gray-400 font-bold">Subtotal dos itens</div>
                <div className="text-lg font-black text-gray-900 dark:text-gray-100 mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(bundleSummary?.subtotal ?? 0))}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 p-3">
                <div className="text-gray-500 dark:text-gray-400 font-bold">Desconto aplicado</div>
                <div className="text-lg font-black text-gray-900 dark:text-gray-100 mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(bundleSummary?.discountTotal ?? 0))}
                </div>
              </div>
              <div className="rounded-xl alert-info p-3">
                <div className="font-bold">Preço final do combo</div>
                <div className="text-lg font-black mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(bundleSummary?.finalPrice ?? productForm.basePrice ?? 0))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {[...slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((s) => (
              <div key={s.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 sm:px-6 py-4 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black text-gray-900 dark:text-gray-100 truncate">{s.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-1">
                      req={String(s.isRequired)} | min={s.minSelect} | max={s.maxSelect}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveSlot(s.id, -1)}
                      disabled={savingStates.reorderSlots}
                      className="px-3 py-2 sm:px-2 sm:py-1 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl sm:rounded disabled:opacity-50 transition-all"
                    >
                      {savingStates.reorderSlots ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↑'}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlot(s.id, 1)}
                      disabled={savingStates.reorderSlots}
                      className="px-3 py-2 sm:px-2 sm:py-1 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl sm:rounded disabled:opacity-50 transition-all"
                    >
                      {savingStates.reorderSlots ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↓'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openAllowedModal(s.id)}
                      className="px-3 py-2 sm:py-1 text-xs font-bold text-primary-700 hover:bg-primary-50 rounded-xl sm:rounded transition-all"
                    >
                      Adicionar produto
                    </button>
                    <button
                      type="button"
                      onClick={() => openSlotModal(s)}
                      className="px-3 py-2 sm:py-1 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl sm:rounded transition-all"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSlot(s.id)}
                      disabled={savingStates[`delete-slot-${s.id}`]}
                      className="col-span-2 sm:col-auto px-3 py-2 sm:py-1 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl sm:rounded disabled:opacity-50 transition-all flex items-center justify-center gap-1"
                    >
                      {savingStates[`delete-slot-${s.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {[...(s.allowedItems ?? [])]
                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                        .map((a) => (
                          <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/40 group">
                            <td className="px-6 py-4">
                              <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{a.product?.name ?? a.productId}</div>
                            </td>
                            <td className="px-6 py-4 text-xs font-black text-gray-900 dark:text-gray-100">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(a.additionalPrice ?? 0))}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2 transition-opacity">
                                <button type="button" onClick={() => moveAllowed(s, a.id, -1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">↑</button>
                                <button type="button" onClick={() => moveAllowed(s, a.id, 1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">↓</button>
                                <button type="button" onClick={() => openAllowedModal(s.id, a)} className="px-2 text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-800 rounded">Editar</button>
                                <button type="button" onClick={() => deleteAllowed(s.id, a.id)} className="px-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded">Excluir</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-8">
            {isComboWizard ? (
              <button
                type="button"
                onClick={goNextWizardStep}
                className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-black rounded-xl shadow-lg transition-all"
              >
                Próximo
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
};
