import React, { useState } from 'react';

import { ProductCategory, CatalogProductType, CreateProductDto } from '@gestor/types';
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
