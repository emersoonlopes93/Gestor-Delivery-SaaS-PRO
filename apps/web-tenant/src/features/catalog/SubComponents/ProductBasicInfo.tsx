import React, { useMemo, useState } from 'react';
import { Images } from 'lucide-react';
import { ProductCategory, CatalogProductType, CreateProductDto } from '@gestor/types';
import { ImagePickerModal } from '../../../components/ImagePickerModal';
import CreatableSelect from 'react-select/creatable';
import { api } from '../../../lib/api-client';
import { useFormContext } from 'react-hook-form';
import { useCatalogEditor } from '../CatalogEditorContext';
import { CatalogProductFormState } from '../CatalogEditorTypes';

export const ProductBasicInfo: React.FC = () => {
  const { isComboMode, isNew, handleSaveProduct, savingStates, onOpenRecipe, product, goNextWizardStep, isComboWizard } = useCatalogEditor();
  const { watch, setValue } = useFormContext<CatalogProductFormState>();
  
  const productForm = watch('productForm');
  const categories = watch('categories');
  const bundleSummary = watch('bundleSummary');
  const imagePreviewUrl = watch('imagePreviewUrl');
  const pizzaPrices = watch('pizzaPrices');

  const setProductForm = (form: CreateProductDto) => setValue('productForm', form);
  const setImageFile = (file: File | null) => setValue('imageFile', file);
  const setImagePreviewUrl = (url: string | null) => setValue('imagePreviewUrl', url);
  const setPizzaPrices = (prices: Record<string, number>) => setValue('pizzaPrices', prices);

  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);

  const selectedMediaAsset = useMemo(() => {
    if (!productForm.mediaAssetId) return null;
    return { id: productForm.mediaAssetId };
  }, [productForm.mediaAssetId]);

  return (
    <section className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm text-left">
        <h2 className="text-lg font-black text-foreground mb-6">Informações Básicas</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Nome do Produto *</label>
              <input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                className="input-premium"
                placeholder="Ex: Burger de Costela"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {!isComboMode ? (
                <div>
                  <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Preço Base *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.basePrice}
                    onChange={(e) => setProductForm({ ...productForm, basePrice: Number(e.target.value) })}
                    className="input-premium"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Preço Final do Combo</label>
                  <input
                    type="number"
                    step="0.01"
                    value={Number(bundleSummary?.finalPrice ?? productForm.basePrice ?? 0)}
                    disabled
                    className="input-premium opacity-70 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1 font-bold">Preço derivado automaticamente pelos itens + estratégia de preço.</p>
                </div>
              )}
              
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider">Preço de Custo (CMV)</label>
                  {!isNew && (
                    <button
                      type="button"
                      onClick={onOpenRecipe}
                      className="text-[10px] font-black uppercase text-primary hover:text-primary/80 flex items-center gap-1"
                    >
                      <span>Ficha Técnica</span>
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={productForm.costPrice}
                  onChange={(e) => setProductForm({ ...productForm, costPrice: Number(e.target.value) })}
                  className="input-premium border-status-warning/30"
                  placeholder="Ex: 2.50"
                />
                <p className="text-[10px] text-status-warning mt-1 font-bold">Usado para cálculo de lucro se não houver ficha técnica.</p>
              </div>

              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Código do Produto</label>
                <input
                  value={productForm.sku}
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  className="input-premium"
                  placeholder="Código de controle (opcional)"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Categoria</label>
              <CreatableSelect
                isClearable
                placeholder="Selecione ou digite para criar..."
                value={categories.find((c: any) => c.id === productForm.categoryId) ? { value: productForm.categoryId, label: (categories.find((c: any) => c.id === productForm.categoryId) as any)?.name } : null}
                options={categories.map((c: any) => ({ value: c.id, label: c.name }))}
                onChange={(selected) => {
                  setProductForm({ ...productForm, categoryId: selected ? selected.value : '' });
                }}
                onCreateOption={async (inputValue) => {
                  try {
                    const res = await api.post<ProductCategory>('/catalog/categories', { name: inputValue, isActive: true });
                    if (res.success) {
                      const newCategories = [...categories, res.data];
                      setValue('categories', newCategories);
                      setProductForm({ ...productForm, categoryId: res.data.id });
                    }
                  } catch (e) {
                    console.error('Erro ao criar categoria', e);
                  }
                }}
                styles={{
                  control: (base) => ({
                    ...base,
                    borderRadius: '0.75rem',
                    minHeight: '2.875rem',
                    borderColor: 'hsl(var(--input))',
                    backgroundColor: 'hsl(var(--background))',
                    boxShadow: 'none',
                    '&:hover': {
                      borderColor: 'hsl(var(--ring))'
                    }
                  }),
                  option: (base, state) => ({
                    ...base,
                    backgroundColor: state.isSelected ? 'hsl(var(--primary))' : state.isFocused ? 'hsl(var(--primary)/0.1)' : 'transparent',
                    color: state.isSelected ? 'hsl(var(--primary-foreground))' : 'inherit',
                  })
                }}
              />
            </div>

            {!isComboMode ? (
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Tipo de Produto</label>
                <select
                  value={productForm.type}
                  onChange={(e) => setProductForm({ ...productForm, type: e.target.value as CatalogProductType })}
                  className="input-premium"
                >
                  <option value="simple">Produto Simples</option>
                  <option value="configurable">Produto com Opções</option>
                </select>
              </div>
            ) : (
              <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-wider text-primary">Tipo</div>
                <div className="text-sm font-bold text-foreground mt-1">Combo</div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Imagem do Produto</label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsImagePickerOpen(true)}
                  className="w-24 h-24 rounded-2xl bg-muted border border-border overflow-hidden flex items-center justify-center relative group"
                  aria-label="Abrir seletor de imagem"
                >
                  {(imagePreviewUrl || productForm.image) ? (
                    <img src={imagePreviewUrl || productForm.image} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-muted-foreground font-black">IMG</span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/40 text-[10px] text-white uppercase tracking-[0.14em] text-center py-1">
                    Selecionar
                  </div>
                </button>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Clique no quadro para escolher uma imagem do banco ou fazer upload.</p>
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreviewUrl(null); setProductForm({ ...productForm, image: '', mediaAssetId: '' }); }}
                    className="text-[10px] font-black uppercase text-destructive hover:text-destructive/80"
                  >
                    Remover imagem
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Images className="h-4 w-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-wider text-foreground">Banco de Imagens</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setIsImagePickerOpen(true)}
                  className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-black uppercase text-[10px] hover:bg-primary/90 transition-colors"
                >
                  Selecionar Imagem
                </button>
                {selectedMediaAsset && productForm.mediaAssetId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreviewUrl(null);
                      setProductForm({ ...productForm, image: '', mediaAssetId: '' });
                    }}
                    className="px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive font-black uppercase text-[10px] hover:bg-destructive/20 transition-colors"
                  >
                    Remover da Biblioteca
                  </button>
                ) : null}
              </div>
              {selectedMediaAsset && productForm.mediaAssetId ? (
                <p className="text-[10px] font-bold text-muted-foreground">
                  Imagem da biblioteca selecionada: {productForm.mediaAssetId}
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Resumo / Descrição Curta</label>
              <input
                value={productForm.shortDescription}
                onChange={(e) => setProductForm({ ...productForm, shortDescription: e.target.value })}
                className="input-premium"
                placeholder="Breve descrição para o cardápio"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Descrição Longa (Opcional)</label>
              <textarea
                rows={3}
                value={productForm.longDescription}
                onChange={(e) => setProductForm({ ...productForm, longDescription: e.target.value })}
                className="input-premium h-24 resize-none"
                placeholder="Detalhes completos do produto..."
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-6 border-t border-border pt-6">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={productForm.isActive}
              onChange={(e) => setProductForm({ ...productForm, isActive: e.target.checked })}
              className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
            />
            <div>
              <div className="text-sm font-bold text-foreground group-hover:text-foreground transition-colors">Ativo no Sistema</div>
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Controle mestre</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={productForm.isAvailable}
              onChange={(e) => setProductForm({ ...productForm, isAvailable: e.target.checked })}
              className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
            />
            <div>
              <div className="text-sm font-bold text-foreground group-hover:text-foreground transition-colors">Disponível para venda</div>
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Estoque / Pausa</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={productForm.sellableOnline}
              onChange={(e) => setProductForm({ ...productForm, sellableOnline: e.target.checked })}
              className="w-5 h-5 rounded border-input text-primary focus:ring-primary"
            />
            <div>
              <div className="text-sm font-bold text-foreground group-hover:text-foreground transition-colors">Vender Online</div>
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">App / Web</div>
            </div>
          </label>
        </div>

        {/* Configuração Especial para Template Pizza */}
        {(() => {
          const selectedCategory = categories.find((c: any) => c.id === productForm.categoryId);
          const isPizzaTemplate = (selectedCategory as any)?.templateType === 'pizza';
          const pizzaSizesGroup = product?.optionGroupLinks?.find((l: any) => 
            l.optionGroup?.name.includes('Tamanhos [Pizza]')
          )?.optionGroup;
          const pizzaSizes = pizzaSizesGroup?.items || [];

          if (isPizzaTemplate && pizzaSizes.length > 0) {
            return (
              <div className="mt-8 pt-8 border-t border-border animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-primary/10 dark:bg-primary/20 rounded-xl flex items-center justify-center text-xl">🍕</div>
                  <div>
                    <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Configuração de Sabor</h3>
                    <p className="text-[10px] text-primary font-bold uppercase tracking-wider mt-0.5">Preço por tamanho</p>
                  </div>
                </div>

                <div className="bg-muted/40 border border-border rounded-3xl p-6 sm:p-8">
                  <p className="text-sm font-medium mb-8 leading-relaxed text-foreground">
                    Este produto pertence a uma categoria de <strong>Pizzas</strong>. Defina abaixo o valor deste sabor para cada tamanho disponível.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pizzaSizes.map((size: { id: string; name: string }) => (
                      <div key={size.id} className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md hover:scale-[1.02] transition-all group">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 group-hover:text-primary transition-colors">
                          {size.name}
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-base">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={Reflect.get(pizzaPrices, size.id) || ''}
                            onChange={(e) => {
                              const nextPrices = { ...pizzaPrices };
                              if (size.id !== '__proto__' && size.id !== 'constructor') {
                                Reflect.set(nextPrices, size.id, Number(e.target.value));
                              }
                              setPizzaPrices(nextPrices);
                            }}
                            className="w-full pl-12 pr-4 py-3.5 bg-card text-foreground border border-input rounded-xl outline-none text-base font-black focus:ring-2 focus:ring-primary transition-all placeholder:text-muted-foreground"
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
          {isComboWizard || (isNew && !isComboMode) ? (
            <button
              type="button"
              onClick={goNextWizardStep}
              className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl shadow-lg shadow-primary/20 transition-all"
            >
              Próximo
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSaveProduct}
              disabled={savingStates.saveProduct}
              className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl shadow-lg shadow-primary/20 transition-all disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-3"
            >
              {savingStates.saveProduct && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
              {isNew ? 'CRIAR PRODUTO' : 'SALVAR ALTERAÇÕES'}
            </button>
          )}
        </div>
      </div>

      <ImagePickerModal
        isOpen={isImagePickerOpen}
        onClose={() => setIsImagePickerOpen(false)}
        onSelect={(asset) => {
          setImageFile(null);
          setImagePreviewUrl(null);
          setProductForm({ ...productForm, mediaAssetId: asset.id, image: asset.publicUrl });
        }}
        selectedAssetId={productForm.mediaAssetId}
      />
    </section>
  );
};
