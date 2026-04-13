import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import {
  CreateProductComboBlockDto,
  CreateProductComboBlockItemDto,
  CreateProductComboDto,
  Product,
  ProductCombo,
  ProductComboBlock,
  ProductComboBlockItem,
  UpdateProductComboBlockDto,
  UpdateProductComboBlockItemDto,
} from '@gestor/types';
import { RecipeModal } from '../inventory/RecipeModal';
import { Modal } from '../../components/Modal';

type ComboBlockWithItems = ProductComboBlock & {
  items: Array<ProductComboBlockItem & { product?: Product }>;
};

type ComboWithBlocks = ProductCombo & {
  blocks: ComboBlockWithItems[];
};

export function CombosPage() {
  const [combos, setCombos] = useState<ProductCombo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recipeTarget, setRecipeTarget] = useState<{ id: string, name: string } | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);

  // Blocks/Items Editor State
  const [isBlocksModalOpen, setIsBlocksModalOpen] = useState(false);
  const [blocksTargetCombo, setBlocksTargetCombo] = useState<ComboWithBlocks | null>(null);
  const [blocksEditorError, setBlocksEditorError] = useState<string | null>(null);

  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ProductComboBlock | null>(null);
  const [blockFormData, setBlockFormData] = useState<Omit<CreateProductComboBlockDto, 'comboId'>>({
    name: '',
    description: '',
    minSelect: 1,
    maxSelect: 1,
    order: 0,
  });

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductComboBlockItem | null>(null);
  const [itemTargetBlockId, setItemTargetBlockId] = useState<string>('');
  const [itemFormData, setItemFormData] = useState<Omit<CreateProductComboBlockItemDto, 'blockId'>>({
    productId: '',
    additionalPrice: 0,
    order: 0,
  });

  useEffect(() => {
    if (!isItemModalOpen) return;
    if (itemFormData.productId) return;
    if (products.length === 0) return;

    setItemFormData((prev) => ({
      ...prev,
      productId: products[0]?.id ?? '',
    }));
  }, [isItemModalOpen, itemFormData.productId, products]);

  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ProductCombo | null>(null);
  const [formData, setFormData] = useState<CreateProductComboDto>({
    name: '',
    description: '',
    basePrice: 0,
    isActive: true,
    isFeatured: false,
    order: 0,
  });

  useEffect(() => {
    loadCombos();
  }, []);

  const loadCombos = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<ProductCombo[]>('/catalog/combos');
      if (response.success) {
        setCombos(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar combos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const ensureProductsLoaded = async () => {
    if (products.length > 0) return;
    const res = await api.get<Product[]>('/catalog/products');
    if (res.success) {
      setProducts(res.data);
    }
  };

  const loadComboDetailsForBlocks = async (comboId: string) => {
    const res = await api.get<ComboWithBlocks>(`/catalog/combos/${comboId}`);
    if (res.success) {
      setBlocksTargetCombo(res.data);
    }
  };

  const handleOpenBlocksEditor = async (combo: ProductCombo) => {
    setIsBlocksModalOpen(true);
    setBlocksTargetCombo(null);
    setBlocksEditorError(null);
    await loadComboDetailsForBlocks(combo.id);
  };

  const handleOpenBlockModal = (block?: ProductComboBlock) => {
    if (!blocksTargetCombo) return;

    if (block) {
      setEditingBlock(block);
      setBlockFormData({
        name: block.name,
        description: block.description ?? '',
        minSelect: block.minSelect,
        maxSelect: block.maxSelect,
        order: block.order,
      });
    } else {
      setEditingBlock(null);
      setBlockFormData({
        name: '',
        description: '',
        minSelect: 1,
        maxSelect: 1,
        order: 0,
      });
    }

    setIsBlockModalOpen(true);
  };

  const handleSaveBlock = async () => {
    if (!blocksTargetCombo) return;
    if (!blockFormData.name) return;

    const comboId = blocksTargetCombo.id;

    try {
      setBlocksEditorError(null);
      if (editingBlock) {
        const payload: UpdateProductComboBlockDto = {
          ...blockFormData,
        };
        await api.patch(`/catalog/combos/${comboId}/blocks/${editingBlock.id}`, payload);
      } else {
        const payload: Omit<CreateProductComboBlockDto, 'comboId'> = {
          ...blockFormData,
        };
        await api.post(`/catalog/combos/${comboId}/blocks`, payload);
      }

      setIsBlockModalOpen(false);
      await loadComboDetailsForBlocks(comboId);
      await loadCombos();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar bloco';
      setBlocksEditorError(message);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!blocksTargetCombo) return;
    if (!window.confirm('Excluir este bloco e todos os seus itens?')) return;

    try {
      setBlocksEditorError(null);
      const comboId = blocksTargetCombo.id;
      await api.delete(`/catalog/combos/${comboId}/blocks/${blockId}`);
      await loadComboDetailsForBlocks(comboId);
      await loadCombos();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao remover bloco';
      setBlocksEditorError(message);
    }
  };

  const handleOpenItemModal = async (blockId: string, item?: ProductComboBlockItem) => {
    if (!blocksTargetCombo) return;
    await ensureProductsLoaded();

    setItemTargetBlockId(blockId);

    if (item) {
      setEditingItem(item);
      setItemFormData({
        productId: item.productId,
        additionalPrice: Number(item.additionalPrice),
        order: item.order,
      });
    } else {
      setEditingItem(null);
      setItemFormData({
        productId: products[0]?.id ?? '',
        additionalPrice: 0,
        order: 0,
      });
    }

    setIsItemModalOpen(true);
  };

  const handleSaveItem = async () => {
    if (!blocksTargetCombo) return;
    if (!itemTargetBlockId) return;
    if (!itemFormData.productId) return;

    const comboId = blocksTargetCombo.id;
    const blockId = itemTargetBlockId;

    try {
      setBlocksEditorError(null);
      if (editingItem) {
        const payload: UpdateProductComboBlockItemDto = {
          ...itemFormData,
        };
        await api.patch(`/catalog/combos/${comboId}/blocks/${blockId}/items/${editingItem.id}`, payload);
      } else {
        const payload: Omit<CreateProductComboBlockItemDto, 'blockId'> = {
          ...itemFormData,
        };
        await api.post(`/catalog/combos/${comboId}/blocks/${blockId}/items`, payload);
      }

      setIsItemModalOpen(false);
      await loadComboDetailsForBlocks(comboId);
      await loadCombos();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar item';
      setBlocksEditorError(message);
    }
  };

  const handleDeleteItem = async (blockId: string, itemId: string) => {
    if (!blocksTargetCombo) return;
    if (!window.confirm('Excluir este item do bloco?')) return;

    try {
      setBlocksEditorError(null);
      const comboId = blocksTargetCombo.id;
      await api.delete(`/catalog/combos/${comboId}/blocks/${blockId}/items/${itemId}`);
      await loadComboDetailsForBlocks(comboId);
      await loadCombos();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao remover item';
      setBlocksEditorError(message);
    }
  };

  const handleOpenModal = (combo?: ProductCombo) => {
    if (combo) {
      setEditingCombo(combo);
      setFormData({
        name: combo.name,
        description: combo.description || '',
        basePrice: Number(combo.basePrice),
        isActive: combo.isActive,
        isFeatured: combo.isFeatured,
        order: combo.order,
        image: combo.image || '',
      });
      setImageFile(null);
      setImagePreviewUrl(combo.image || null);
    } else {
      setEditingCombo(null);
      setFormData({
        name: '',
        description: '',
        basePrice: 0,
        isActive: true,
        isFeatured: false,
        order: 0,
      });
      setImageFile(null);
      setImagePreviewUrl(null);
    }
    setIsModalOpen(true);
  };

  const handleSelectImageFile = (file: File | null) => {
    setImageFile(file);
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    if (file) {
      setImagePreviewUrl(URL.createObjectURL(file));
    } else {
      setImagePreviewUrl(formData.image || null);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.basePrice) return;

    try {
      let finalImageUrl: string | undefined = formData.image;
      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        const uploadRes = await api.upload<{ url: string }>('/upload/image', fd);
        if (uploadRes.success) {
          finalImageUrl = uploadRes.data.url;
        }
      }

      const payload: CreateProductComboDto = {
        ...formData,
        image: finalImageUrl,
      };

      if (editingCombo) {
        await api.patch(`/catalog/combos/${editingCombo.id}`, payload);
      } else {
        await api.post('/catalog/combos', payload);
      }
      setIsModalOpen(false);
      loadCombos();
    } catch (error) {
      console.error('Erro ao salvar combo:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este combo?')) return;
    try {
      await api.delete(`/catalog/combos/${id}`);
      loadCombos();
    } catch (error) {
      console.error('Erro ao excluir combo:', error);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Combos & Ofertas</h1>
          <p className="text-gray-500 mt-1">Gerencie ofertas combinadas e fichas técnicas fixas.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
        >
          <span>🍱</span> Novo Combo
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {combos.map((combo) => (
            <div key={combo.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all group">
              <div className="h-44 bg-gray-50 relative">
                {combo.image ? (
                  <img src={combo.image} alt={combo.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 font-bold uppercase tracking-widest text-[10px]">Sem Imagem</div>
                )}
                <div className="absolute top-4 right-4 flex gap-2">
                   <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${combo.isActive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                    {combo.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                 {/* Hover Actions Overlay */}
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    onClick={() => handleOpenModal(combo)}
                    className="w-10 h-10 bg-white text-gray-700 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-50 hover:text-primary-600 transition-all font-bold"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(combo.id)}
                    className="w-10 h-10 bg-white text-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-red-50 transition-all font-bold"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-primary-600 transition-colors uppercase tracking-tight">{combo.name}</h3>
                  <span className="text-primary-600 font-black text-lg">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(combo.basePrice))}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 h-10 mb-4 font-medium">{combo.description || 'Sem descrição'}</p>
                
                <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded">Combo</span>
                    {combo.isFeatured && <span className="text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-600 px-2 py-0.5 rounded">Destaque</span>}
                  </div>
                  
                  <button
                    onClick={() => setRecipeTarget({ id: combo.id, name: combo.name })}
                    className="text-xs font-bold text-primary-700 px-3 py-1.5 rounded-lg border border-primary-100 hover:bg-primary-50 transition-colors"
                  >
                    📝 Ficha Técnica
                  </button>
                  <button
                    onClick={() => handleOpenBlocksEditor(combo)}
                    className="text-xs font-bold text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    🧩 Blocos
                  </button>
                </div>
              </div>
            </div>
          ))}
           {combos.length === 0 && (
            <div className="col-span-full py-16 text-center text-gray-400 font-bold italic">
              Nenhum combo cadastrado ainda.
            </div>
          )}
        </div>
      )}

      {/* Modal CRUD */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCombo ? 'Editar Combo' : 'Novo Combo'}
        footer={
          <>
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm">Salvar Combo</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome da Oferta</label>
            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Preço Base (R$)</label>
              <input type="number" step="0.01" value={formData.basePrice} onChange={e => setFormData({...formData, basePrice: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Ordem</label>
              <input type="number" value={formData.order} onChange={e => setFormData({...formData, order: parseInt(e.target.value) || 0})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição</label>
            <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none h-20 resize-none" />
          </div>
           <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">URL da Imagem</label>
            <input
              type="text"
              value={formData.image || ''}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Upload de Imagem</label>
            <div className="space-y-3">
              {imagePreviewUrl ? (
                <div className="w-full h-44 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                  <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-full h-44 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center justify-center text-gray-400 text-xs font-black uppercase tracking-widest">
                  Sem imagem
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleSelectImageFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <button
                  type="button"
                  onClick={() => handleSelectImageFile(null)}
                  className="px-3 py-2 text-xs font-black uppercase tracking-wider text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Remover
                </button>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Upload é o modo principal. A URL acima funciona como fallback.
              </p>
            </div>
          </div>
          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4 text-primary-600 rounded" />
              <span className="text-sm font-bold text-gray-700">Ativo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.isFeatured} onChange={e => setFormData({...formData, isFeatured: e.target.checked})} className="w-4 h-4 text-primary-600 rounded" />
              <span className="text-sm font-bold text-gray-700">Destaque</span>
            </label>
          </div>
        </div>
      </Modal>

      {/* Modal Editor de Blocos/Itens */}
      <Modal
        isOpen={isBlocksModalOpen}
        onClose={() => {
          setIsBlocksModalOpen(false);
          setBlocksTargetCombo(null);
        }}
        title={blocksTargetCombo ? `Blocos — ${blocksTargetCombo.name}` : 'Blocos — Carregando...'}
        footer={
          <>
            <button
              onClick={() => setIsBlocksModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Fechar
            </button>
            <button
              onClick={() => handleOpenBlockModal()}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm"
            >
              Novo Bloco
            </button>
          </>
        }
      >
        {!blocksTargetCombo ? (
          <div className="text-sm text-gray-500 font-medium">Carregando...</div>
        ) : (
          <div className="space-y-4">
            {blocksEditorError && (
              <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 font-bold">
                {blocksEditorError}
              </div>
            )}
            {blocksTargetCombo.blocks
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((block) => (
                <div key={block.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-black text-gray-900 uppercase tracking-wider text-xs">
                        {block.name}
                      </div>
                      <div className="text-xs text-gray-500 font-medium">
                        Min: {block.minSelect} | Max: {block.maxSelect} | Ordem: {block.order}
                      </div>
                      {block.description && (
                        <div className="text-xs text-gray-600 mt-1">{block.description}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenItemModal(block.id)}
                        className="text-xs font-bold text-primary-700 px-3 py-1.5 rounded-lg border border-primary-100 hover:bg-primary-50 transition-colors"
                      >
                        ➕ Item
                      </button>
                      <button
                        onClick={() => handleOpenBlockModal(block)}
                        className="px-3 py-1.5 text-xs font-bold text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-100"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteBlock(block.id)}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 rounded-lg border border-red-100 hover:bg-red-50"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {block.items
                      ?.slice()
                      .sort((a, b) => a.order - b.order)
                      .map((item) => (
                        <div key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-gray-800">
                              {item.product?.name ?? item.productId}
                            </div>
                            <div className="text-xs text-gray-500 font-medium">
                              +{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.additionalPrice))}
                              {' '}| Ordem: {item.order}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleOpenItemModal(block.id, item)}
                              className="px-3 py-1.5 text-xs font-bold text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-100"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteItem(block.id, item.id)}
                              className="px-3 py-1.5 text-xs font-bold text-red-600 rounded-lg border border-red-100 hover:bg-red-50"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}

                    {(block.items?.length ?? 0) === 0 && (
                      <div className="px-4 py-6 text-center text-gray-400 text-sm italic">
                        Nenhum item neste bloco.
                      </div>
                    )}
                  </div>
                </div>
              ))}

            {blocksTargetCombo.blocks.length === 0 && (
              <div className="py-10 text-center text-gray-400 text-sm italic">
                Nenhum bloco configurado.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal CRUD Bloco */}
      <Modal
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        title={editingBlock ? 'Editar Bloco' : 'Novo Bloco'}
        footer={
          <>
            <button
              onClick={() => setIsBlockModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveBlock}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm"
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome do Bloco</label>
            <input
              type="text"
              value={blockFormData.name}
              onChange={(e) => setBlockFormData({ ...blockFormData, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição</label>
            <textarea
              value={blockFormData.description ?? ''}
              onChange={(e) => setBlockFormData({ ...blockFormData, description: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 h-20 resize-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Mínimo</label>
              <input
                type="number"
                value={blockFormData.minSelect ?? 1}
                onChange={(e) => setBlockFormData({ ...blockFormData, minSelect: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Máximo</label>
              <input
                type="number"
                value={blockFormData.maxSelect ?? 1}
                onChange={(e) => setBlockFormData({ ...blockFormData, maxSelect: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Ordem</label>
              <input
                type="number"
                value={blockFormData.order ?? 0}
                onChange={(e) => setBlockFormData({ ...blockFormData, order: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal CRUD Item */}
      <Modal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        title={editingItem ? 'Editar Item do Bloco' : 'Novo Item do Bloco'}
        footer={
          <>
            <button
              onClick={() => setIsItemModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveItem}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm"
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Produto</label>
            <select
              value={itemFormData.productId}
              onChange={(e) => setItemFormData({ ...itemFormData, productId: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Preço adicional (R$)</label>
              <input
                type="number"
                step="0.01"
                value={itemFormData.additionalPrice ?? 0}
                onChange={(e) =>
                  setItemFormData({ ...itemFormData, additionalPrice: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Ordem</label>
              <input
                type="number"
                value={itemFormData.order ?? 0}
                onChange={(e) => setItemFormData({ ...itemFormData, order: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      {recipeTarget && (
        <RecipeModal
          isOpen={!!recipeTarget}
          onClose={() => setRecipeTarget(null)}
          entityType="combo"
          entityId={recipeTarget.id}
          entityName={recipeTarget.name}
        />
      )}
    </div>
  );
}
