import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, UploadCloud } from 'lucide-react';
import { api } from '../lib/api-client';
import { Modal } from './Modal';

type MediaAsset = {
  id: string;
  title: string | null;
  originalName: string | null;
  publicUrl: string;
  altText: string | null;
  scope: string;
  category?: string | null;
  categoryId?: string | null;
};

type MediaCategory = {
  id: string;
  name: string;
  slug: string;
};

interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  selectedAssetId?: string | null;
}

export function ImagePickerModal({
  isOpen,
  onClose,
  onSelect,
  selectedAssetId,
}: ImagePickerModalProps) {
  const [activeTab, setActiveTab] = useState<'mine' | 'global'>('mine');
  const [mineAssets, setMineAssets] = useState<MediaAsset[]>([]);
  const [globalAssets, setGlobalAssets] = useState<MediaAsset[]>([]);
  const [categories, setCategories] = useState<MediaCategory[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');

  // Load categories for global tab
  const loadCategories = useCallback(async () => {
    try {
      const response = await api.get<MediaCategory[]>('/media/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, []);

  // Load tenant assets
  const loadMineAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    try {
      const response = await api.get<MediaAsset[]>('/media/assets?origin=tenant');
      setMineAssets(response.data);
    } finally {
      setIsLoadingAssets(false);
    }
  }, []);

  // Load global assets with optional category filter
  const loadGlobalAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    try {
      const params = new URLSearchParams({
        origin: 'system',
      });
      if (selectedCategory) {
        params.append('categoryId', selectedCategory);
      }
      const response = await api.get<MediaAsset[]>(`/media/assets?${params.toString()}`);
      // Filter out unpublished assets
      const filtered = response.data.filter(
        (asset) => asset.scope === 'system_gallery'
      );
      setGlobalAssets(filtered);
    } finally {
      setIsLoadingAssets(false);
    }
  }, [selectedCategory]);

  // Initial load
  useEffect(() => {
    if (!isOpen) return;
    void loadMineAssets();
    void loadGlobalAssets();
    void loadCategories();
  }, [isOpen, loadMineAssets, loadGlobalAssets, loadCategories]);

  // Reload global assets when category changes
  useEffect(() => {
    if (activeTab === 'global' && isOpen) {
      void loadGlobalAssets();
    }
  }, [selectedCategory, activeTab, isOpen, loadGlobalAssets]);

  // Handle upload
  async function handleUpload() {
    if (!uploadFile) return;
    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.set('file', uploadFile);
      formData.set('title', uploadTitle || uploadFile.name);
      formData.set('altText', uploadTitle || uploadFile.name);
      await api.upload('/media/upload', formData);
      setUploadFile(null);
      setUploadTitle('');
      await loadMineAssets();
    } finally {
      setIsUploadingFile(false);
    }
  }

  // Filter assets based on search
  const currentAssets = activeTab === 'mine' ? mineAssets : globalAssets;
  const filteredAssets = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return currentAssets;
    return currentAssets.filter((asset) =>
      [asset.title, asset.originalName, asset.altText]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [currentAssets, searchQuery]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Selecionar Imagem" maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Tab Navigation */}
        <div className="flex rounded-xl bg-muted p-1">
          {(['mine', 'global'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSearchQuery('');
                setSelectedCategory('');
              }}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-black uppercase transition-all ${
                activeTab === tab
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'mine' ? 'Minhas Imagens' : 'Banco de Imagens'}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="space-y-4">
          {/* Upload Section (Mine Tab Only) */}
          {activeTab === 'mine' && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <UploadCloud className="h-4 w-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-wider text-foreground">
                  Upload
                </span>
              </div>

              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-black file:text-primary-foreground"
                />

                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Nome/descrição da imagem (opcional)"
                  className="w-full h-9 px-3 bg-background border border-input rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring"
                />

                <button
                  onClick={handleUpload}
                  disabled={!uploadFile || isUploadingFile}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-60 hover:bg-primary/90 transition-colors"
                >
                  <UploadCloud className="h-4 w-4" />
                  {isUploadingFile ? 'Enviando...' : 'Enviar Imagem'}
                </button>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
              <div className="flex-1">
                <label className="text-xs font-black uppercase text-muted-foreground mb-1.5 block">
                  Buscar
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nome, descrição..."
                    className="w-full h-9 pl-9 pr-3 bg-card border border-input rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex-1">
                <label className="text-xs font-black uppercase text-muted-foreground mb-1.5 block">
                  Categoria
                </label>
                {activeTab === 'global' && categories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('')}
                      className={`rounded-full px-3 py-2 text-[10px] font-black uppercase transition-all ${
                        selectedCategory === '' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Todas
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`rounded-full px-3 py-2 text-[10px] font-black uppercase transition-all ${
                          selectedCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-9 rounded-lg border border-input bg-card" />
                )}
              </div>

              <button
                onClick={() => {
                  if (activeTab === 'mine') {
                    void loadMineAssets();
                  } else {
                    void loadGlobalAssets();
                  }
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                title="Atualizar"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoadingAssets ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Image Gallery */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            {isLoadingAssets ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                  <p className="mt-2 text-sm text-muted-foreground font-medium">
                    Carregando imagens...
                  </p>
                </div>
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center text-muted-foreground">
                  {activeTab === 'mine' ? (
                    <>
                      <p className="text-sm font-bold">Nenhuma imagem encontrada.</p>
                      <p className="text-xs mt-1">Comece fazendo upload de uma imagem acima.</p>
                    </>
                  ) : globalAssets.length === 0 ? (
                    <div className="mt-2 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                        <Search className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm font-black text-foreground">Banco de imagens em preparação</p>
                      <p className="text-xs text-muted-foreground">
                        Em breve, imagens curadas de alta qualidade estarão disponíveis aqui.
                      </p>
                      <button
                        onClick={() => {
                          setActiveTab('mine');
                          setSearchQuery('');
                          setSelectedCategory('');
                        }}
                        className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Usar Minhas Imagens
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-bold">Nenhuma imagem encontrada.</p>
                      <p className="text-xs mt-1">
                        Tente mudar a categoria ou limpar sua busca.
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {filteredAssets.map((asset) => {
                  const isSelected = selectedAssetId === asset.id;
                  return (
                    <button
                      key={asset.id}
                      onClick={() => {
                        onSelect(asset);
                        onClose();
                      }}
                      className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/30 ring-offset-2'
                          : 'border-border hover:border-primary/50'
                      }`}
                      title={asset.title ?? asset.originalName ?? 'Imagem'}
                    >
                      <img
                        src={asset.publicUrl}
                        alt={asset.altText ?? asset.title ?? 'Media'}
                        className="h-full w-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <svg
                              className="h-3 w-3 text-primary-foreground"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
