import React from 'react';
import { ProductCategory, ProductDetails } from '@gestor/types';

interface ProductBasicInfoProps {
  product: ProductDetails | null;
  productForm: any; // Will be typed later
  setProductForm: (form: any) => void;
  categories: ProductCategory[];
  isComboMode: boolean;
  bundleSummary: any;
  imagePreviewUrl: string | null;
  handleSelectImageFile: (file: File | null) => void;
  setImageFile: (file: File | null) => void;
  setImagePreviewUrl: (url: string | null) => void;
  pizzaPrices: Record<string, number>;
  setPizzaPrices: (prices: Record<string, number>) => void;
  isComboWizard: boolean;
  goNextWizardStep: () => void;
  handleSaveProduct: () => void;
  savingStates: Record<string, boolean>;
  isNew: boolean;
}

export const ProductBasicInfo: React.FC<ProductBasicInfoProps> = ({
  product,
  productForm,
  setProductForm,
  categories,
  isComboMode,
  bundleSummary,
  imagePreviewUrl,
  handleSelectImageFile,
  setImageFile,
  setImagePreviewUrl,
  pizzaPrices,
  setPizzaPrices,
  isComboWizard,
  goNextWizardStep,
  handleSaveProduct,
  savingStates,
  isNew,
}) => {
  return (
    <section className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-left">
        <h2 className="text-lg font-black text-gray-900 mb-6">Informações Básicas</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome do Produto *</label>
              <input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                placeholder="Ex: Burger de Costela"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {!isComboMode ? (
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Preço Base *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.basePrice}
                    onChange={(e) => setProductForm({ ...productForm, basePrice: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Preço Final do Combo</label>
                  <input
                    type="number"
                    step="0.01"
                    value={Number(bundleSummary?.finalPrice ?? productForm.basePrice ?? 0)}
                    disabled
                    className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl outline-none text-sm font-bold text-gray-700"
                  />
                  <p className="text-[10px] text-gray-500 mt-1 font-bold">Preço derivado automaticamente pelos itens + estratégia de preço.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">SKU / Cód. Interno</label>
                <input
                  value={productForm.sku}
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                  placeholder="Identificador opcional"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Categoria</label>
              <select
                value={productForm.categoryId}
                onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
              >
                <option value="">Selecione uma categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {!isComboMode ? (
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Tipo de Produto</label>
                <select
                  value={productForm.type}
                  onChange={(e) => setProductForm({ ...productForm, type: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                >
                  <option value="simple">Simples</option>
                  <option value="configurable">Configurável (com variações)</option>
                </select>
              </div>
            ) : (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-wider text-indigo-700">Tipo</div>
                <div className="text-sm font-bold text-indigo-900 mt-1">Combo</div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Imagem do Produto</label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center relative group">
                  {(imagePreviewUrl || productForm.image) ? (
                    <img src={imagePreviewUrl || productForm.image} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gray-300 font-black">IMG</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSelectImageFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium mb-2">Clique na imagem para enviar um novo arquivo.</p>
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreviewUrl(null); setProductForm({ ...productForm, image: '' }); }}
                    className="text-[10px] font-black uppercase text-red-500 hover:text-red-700"
                  >
                    Remover imagem
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Resumo / Descrição Curta</label>
              <input
                value={productForm.shortDescription}
                onChange={(e) => setProductForm({ ...productForm, shortDescription: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                placeholder="Breve descrição para o cardápio"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição Longa (Opcional)</label>
              <textarea
                rows={3}
                value={productForm.longDescription}
                onChange={(e) => setProductForm({ ...productForm, longDescription: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                placeholder="Detalhes completos do produto..."
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-6 border-t border-gray-100 pt-6">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={productForm.isActive}
              onChange={(e) => setProductForm({ ...productForm, isActive: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <div className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">Ativo no Sistema</div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Controle mestre</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={productForm.isAvailable}
              onChange={(e) => setProductForm({ ...productForm, isAvailable: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <div className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">Disponível para venda</div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Estoque / Pausa</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={productForm.sellableOnline}
              onChange={(e) => setProductForm({ ...productForm, sellableOnline: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <div className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">Vender Online</div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">App / Web</div>
            </div>
          </label>
        </div>

        {/* Configuração Especial para Template Pizza */}
        {(() => {
          const selectedCategory = categories.find(c => c.id === productForm.categoryId);
          const isPizzaTemplate = selectedCategory?.templateType === 'pizza';
          const pizzaSizesGroup = product?.optionGroupLinks?.find(l => 
            l.optionGroup?.name.includes('Tamanhos [Pizza]')
          )?.optionGroup;
          const pizzaSizes = pizzaSizesGroup?.items || [];

          if (isPizzaTemplate && pizzaSizes.length > 0) {
            return (
              <div className="mt-8 pt-8 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center text-xl">🍕</div>
                  <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Configuração de Sabor</h3>
                    <p className="text-[10px] text-primary-600 font-bold uppercase tracking-wider mt-0.5">Preço por tamanho</p>
                  </div>
                </div>

                <div className="bg-primary-50/50 border border-primary-100 rounded-3xl p-6 sm:p-8">
                  <p className="text-sm text-primary-800 font-medium mb-8 leading-relaxed">
                    Este produto pertence a uma categoria de <strong>Pizzas</strong>. Defina abaixo o valor deste sabor para cada tamanho disponível.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pizzaSizes.map(size => (
                      <div key={size.id} className="bg-white p-6 rounded-2xl border border-primary-100/50 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-hover:text-primary-600 transition-colors">
                          {size.name}
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={pizzaPrices[size.id] || ''}
                            onChange={(e) => setPizzaPrices({...pizzaPrices, [size.id]: Number(e.target.value)})}
                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl outline-none text-base font-black focus:ring-2 focus:ring-primary-500 transition-all placeholder:text-gray-300"
                            placeholder={productForm.basePrice.toString()}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        <div className="mt-8 flex justify-end">
          {isComboWizard ? (
            <button
              type="button"
              onClick={goNextWizardStep}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-black rounded-xl shadow-lg shadow-primary-200 transition-all"
            >
              Próximo
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSaveProduct}
              disabled={savingStates.saveProduct}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-black rounded-xl shadow-lg shadow-primary-200 transition-all disabled:opacity-50 flex items-center gap-3"
            >
              {savingStates.saveProduct && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isNew ? 'CRIAR PRODUTO' : 'SALVAR ALTERAÇÕES'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
