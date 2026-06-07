import React from 'react';
import { useCatalogEditor } from '../CatalogEditorContext';
import { useFormContext } from 'react-hook-form';
import { CatalogProductFormState } from '../CatalogEditorTypes';

import { ComboPricingType } from '@gestor/types';

export const ComboBuilder: React.FC = () => {
  const { watch } = useFormContext<CatalogProductFormState>();
  const productForm = watch('productForm');

  const {
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
  } = useCatalogEditor();
  return (
    <section className="space-y-4 text-left">
      {productForm.type !== 'combo' ? (
        <div className="bg-status-warning/10 border border-status-warning/20 text-status-warning rounded-2xl p-8 text-center shadow-sm">
          <div className="text-3xl mb-4">🍱</div>
          <div className="font-black text-lg mb-2">Este produto não é um Combo</div>
          <div className="text-sm mb-6 mx-auto max-w-md">
            Para configurar itens e slots, você precisa primeiro alterar o <strong>Tipo de Produto</strong> para "Combo" na aba de informações gerais.
          </div>
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-lg font-black text-foreground uppercase tracking-tight">Montagem do Combo</div>
                <p className="text-sm text-muted-foreground font-medium mt-1">
                  Vincule itens já cadastrados do cardápio e defina a estratégia de preço do combo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openBundleItemModal()}
                className="px-6 py-2.5 text-sm font-black text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <span>➕</span> Adicionar item do cardápio
              </button>
            </div>
          </div>

          {comboModeState !== 'bundle' ? (
            <div className="bg-status-warning/10 border border-status-warning/20 text-status-warning rounded-2xl p-4">
              <div className="font-black">Este combo está em modo legado (slot)</div>
              <p className="text-sm mt-1">
                Para usar "Itens do Combo" e estratégia de preço, converta este combo para modo bundle.
              </p>
              <button
                type="button"
                onClick={convertComboToBundle}
                disabled={savingStates.convertBundle}
                className="mt-3 px-4 py-2 text-sm font-bold text-white bg-status-warning hover:bg-status-warning/90 rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingStates.convertBundle && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Converter para bundle
              </button>
            </div>
          ) : null}

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="text-sm font-black text-foreground mb-3">Estratégia de preço</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={comboPricingType}
                onChange={(e) => setComboPricingType(e.target.value as ComboPricingType)}
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
                className="px-4 py-2.5 text-sm font-black text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {savingStates.updateComboPricing && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
                Aplicar estratégia
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-muted/30 dark:bg-muted/80 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Produto</th>
                    <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Qtd</th>
                    <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Preço unit.</th>
                    <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Subtotal</th>
                    <th className="px-6 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-border/60">
                  {bundleItems.map((item) => {
                    const unit = Number(item.product?.basePrice ?? 0);
                    const subtotal = unit * Math.max(1, item.qty);
                    return (
                      <tr key={item.id} className="hover:bg-muted/50 dark:hover:bg-muted/80 dark:bg-card/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-foreground">{item.product?.name ?? item.productId}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-foreground/80">{Math.max(1, item.qty)}</td>
                        <td className="px-6 py-4 text-sm font-bold text-foreground/80">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unit)}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-foreground">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openBundleItemModal(item)}
                              className="px-3 py-1 text-xs font-bold text-foreground/80 hover:bg-muted/50 dark:hover:bg-muted/80 rounded transition-all"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteBundleItem(item.id)}
                              disabled={savingStates[`delete-bundle-${item.id}`]}
                              className="px-3 py-1 text-xs font-bold text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 rounded disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all"
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
                      <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground text-sm italic">
                        Nenhum item vinculado no combo.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="text-sm font-black text-foreground mb-3">Resumo do combo</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-muted/50 dark:bg-muted/80 border border-border p-3">
                <div className="text-muted-foreground font-bold">Subtotal dos itens</div>
                <div className="text-lg font-black text-foreground mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(bundleSummary?.subtotal ?? 0))}
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 dark:bg-muted/80 border border-border p-3">
                <div className="text-muted-foreground font-bold">Desconto aplicado</div>
                <div className="text-lg font-black text-foreground mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(bundleSummary?.discountTotal ?? 0))}
                </div>
              </div>
              <div className="rounded-xl bg-primary/10 border border-primary/20 text-primary p-3">
                <div className="font-bold">Preço final do combo</div>
                <div className="text-lg font-black mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(bundleSummary?.finalPrice ?? productForm.basePrice ?? 0))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {[...slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((s) => (
              <div key={s.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 sm:px-6 py-4 bg-muted/30 dark:bg-muted/80 border-b border-border flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black text-foreground truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground font-bold mt-1">
                      req={String(s.isRequired)} | min={s.minSelect} | max={s.maxSelect}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveSlot(s.id, -1)}
                      disabled={savingStates.reorderSlots}
                      className="px-3 py-2 sm:px-2 sm:py-1 text-xs font-bold text-muted-foreground hover:bg-muted/50 dark:hover:bg-muted/80 rounded-xl sm:rounded disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                    >
                      {savingStates.reorderSlots ? <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" /> : '↑'}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlot(s.id, 1)}
                      disabled={savingStates.reorderSlots}
                      className="px-3 py-2 sm:px-2 sm:py-1 text-xs font-bold text-muted-foreground hover:bg-muted/50 dark:hover:bg-muted/80 rounded-xl sm:rounded disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                    >
                      {savingStates.reorderSlots ? <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" /> : '↓'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openAllowedModal(s.id)}
                      className="px-3 py-2 sm:py-1 text-xs font-bold text-primary hover:bg-primary/10 rounded-xl sm:rounded transition-all"
                    >
                      Adicionar produto
                    </button>
                    <button
                      type="button"
                      onClick={() => openSlotModal(s)}
                      className="px-3 py-2 sm:py-1 text-xs font-bold text-foreground/80 hover:bg-muted/50 dark:hover:bg-muted/80 rounded-xl sm:rounded transition-all"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSlot(s.id)}
                      disabled={savingStates[`delete-slot-${s.id}`]}
                      className="col-span-2 sm:col-auto px-3 py-2 sm:py-1 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl sm:rounded disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1"
                    >
                      {savingStates[`delete-slot-${s.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-border dark:divide-border/60">
                      {[...(s.allowedItems ?? [])]
                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                        .map((a) => (
                          <tr key={a.id} className="hover:bg-muted/50 dark:hover:bg-muted/80 dark:bg-card/40 group">
                            <td className="px-6 py-4">
                              <div className="font-bold text-foreground text-sm">{a.product?.name ?? a.productId}</div>
                            </td>
                            <td className="px-6 py-4 text-xs font-black text-foreground">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(a.additionalPrice ?? 0))}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2 transition-opacity">
                                <button type="button" onClick={() => moveAllowed(s, a.id, -1)} className="p-1 hover:bg-muted/50 dark:hover:bg-muted/80 rounded">↑</button>
                                <button type="button" onClick={() => moveAllowed(s, a.id, 1)} className="p-1 hover:bg-muted/50 dark:hover:bg-muted/80 rounded">↓</button>
                                <button type="button" onClick={() => openAllowedModal(s.id, a)} className="px-2 text-xs font-bold hover:bg-muted/50 dark:hover:bg-muted/80 rounded">Editar</button>
                                <button type="button" onClick={() => deleteAllowed(s.id, a.id)} className="px-2 text-xs font-bold text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 rounded">Excluir</button>
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
                className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl shadow-lg transition-all"
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
