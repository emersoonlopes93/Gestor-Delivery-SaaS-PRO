import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ImagePlus, RefreshCw, Search, UploadCloud } from 'lucide-react';
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

type LibrarySourceFilter = 'all' | 'mine' | 'global';
type PickerTab = 'upload' | 'library';

interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  selectedAssetId?: string | null;
}

const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/webp';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function ImagePickerModal({
  isOpen,
  onClose,
  onSelect,
  selectedAssetId,
}: ImagePickerModalProps) {
  const [activeTab, setActiveTab] = useState<PickerTab>('upload');
  const [libraryAssets, setLibraryAssets] = useState<MediaAsset[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter>('all');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [justUploadedAssetId, setJustUploadedAssetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadLibraryAssets = useCallback(async () => {
    setIsLoadingLibrary(true);
    try {
      const response = await api.get<MediaAsset[]>('/media/assets?origin=all');
      setLibraryAssets(response.data);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadLibraryAssets();
  }, [isOpen, loadLibraryAssets]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(selectedAssetId ? 'library' : 'upload');
    setSearchQuery('');
    setSourceFilter('all');
    setUploadError(null);
    setDragActive(false);
    setJustUploadedAssetId(null);
  }, [isOpen, selectedAssetId]);

  const sourceCounts = useMemo(() => {
    return libraryAssets.reduce(
      (acc, asset) => {
        if (asset.scope === 'tenant_library') acc.mine += 1;
        if (asset.scope === 'system_gallery') acc.global += 1;
        return acc;
      },
      { mine: 0, global: 0 },
    );
  }, [libraryAssets]);

  const filteredAssets = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return libraryAssets.filter((asset) => {
      const matchesSource =
        sourceFilter === 'all' ||
        (sourceFilter === 'mine' && asset.scope === 'tenant_library') ||
        (sourceFilter === 'global' && asset.scope === 'system_gallery');

      if (!matchesSource) return false;
      if (!term) return true;

      return [asset.title, asset.originalName, asset.altText, asset.category]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [libraryAssets, searchQuery, sourceFilter]);

  const validateFile = useCallback((file: File | null) => {
    if (!file) {
      setUploadError(null);
      return false;
    }

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      setUploadError('Formato invalido. Use JPG, PNG ou WEBP.');
      return false;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError('A imagem deve ter no maximo 10 MB.');
      return false;
    }

    setUploadError(null);
    return true;
  }, []);

  const handleChooseFile = useCallback((file: File | null) => {
    if (!validateFile(file)) {
      setUploadFile(null);
      return;
    }
    setUploadFile(file);
    setUploadTitle((current) => current || file?.name.replace(/\.[^.]+$/, '') || '');
  }, [validateFile]);

  const handleUpload = useCallback(async () => {
    if (!uploadFile || !validateFile(uploadFile)) return;

    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.set('file', uploadFile);
      formData.set('title', uploadTitle.trim() || uploadFile.name);
      formData.set('altText', uploadTitle.trim() || uploadFile.name);

      const response = await api.upload<MediaAsset>('/media/upload', formData);
      const uploadedAsset = response.data;

      setUploadFile(null);
      setUploadTitle('');
      setUploadError(null);
      setSourceFilter('all');
      setSearchQuery('');
      setJustUploadedAssetId(uploadedAsset.id);
      setActiveTab('library');

      await loadLibraryAssets();
    } catch (error) {
      console.error('Erro ao enviar imagem para a biblioteca:', error);
      setUploadError(error instanceof Error ? error.message : 'Falha ao enviar a imagem.');
    } finally {
      setIsUploadingFile(false);
    }
  }, [loadLibraryAssets, uploadFile, uploadTitle, validateFile]);

  const isLibraryEmpty = filteredAssets.length === 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Adicionar foto" maxWidth="max-w-5xl">
      <div className="space-y-5">
        <div className="border-b border-border">
          <div className="flex items-center gap-6">
            {([
              { id: 'upload', label: 'Novo arquivo' },
              { id: 'library', label: 'Biblioteca' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 pb-2 text-base font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'upload' ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Envie uma imagem para a sua biblioteca</p>
                <p className="text-xs text-muted-foreground">
                  Toda imagem enviada aqui fica salva na aba Biblioteca para reutilizar no cardapio.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-primary">
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="font-semibold">Dicas de imagem</span>
              </div>
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                handleChooseFile(event.dataTransfer.files?.[0] ?? null);
              }}
              className={`rounded-2xl border border-dashed px-6 py-10 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/20'
              }`}
            >
              <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ImagePlus className="h-8 w-8" />
                </div>

                <div className="space-y-1">
                  <p className="text-2xl font-bold text-foreground">Adicione ou arraste uma foto pra ca</p>
                  <p className="text-sm text-muted-foreground">Formatos: JPG, JPEG, PNG e WEBP</p>
                  <p className="text-sm text-muted-foreground">Peso maximo: 10 MB</p>
                  <p className="text-sm text-muted-foreground">Recomendamos usar uma foto quadrada.</p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={(event) => handleChooseFile(event.target.files?.[0] ?? null)}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Adicionar
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Nome da imagem
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(event) => setUploadTitle(event.target.value)}
                  placeholder="Ex: X-Bacon principal"
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-h-5 text-sm text-muted-foreground">
                  {uploadFile ? `Arquivo selecionado: ${uploadFile.name}` : 'Nenhum arquivo selecionado ainda.'}
                </div>
                <button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={!uploadFile || isUploadingFile}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UploadCloud className="h-4 w-4" />
                  {isUploadingFile ? 'Enviando...' : 'Salvar na biblioteca'}
                </button>
              </div>

              {uploadError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {uploadError}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Buscar
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Nome, descricao ou categoria"
                    className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'all', label: `Todas (${libraryAssets.length})` },
                  { id: 'mine', label: `Minha biblioteca (${sourceCounts.mine})` },
                  { id: 'global', label: `Banco global (${sourceCounts.global})` },
                ] as const).map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setSourceFilter(filter.id)}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                      sourceFilter === filter.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void loadLibraryAssets()}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card transition-colors hover:bg-muted"
                title="Atualizar biblioteca"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingLibrary ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              {isLoadingLibrary ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">Carregando biblioteca...</p>
                  </div>
                </div>
              ) : isLibraryEmpty ? (
                <div className="flex items-center justify-center py-16">
                  <div className="max-w-sm text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ImagePlus className="h-6 w-6" />
                    </div>
                    <p className="text-base font-semibold text-foreground">Nenhuma imagem encontrada.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {libraryAssets.length === 0
                        ? 'Envie sua primeira imagem na aba Novo arquivo.'
                        : 'Tente limpar a busca ou trocar o filtro da biblioteca.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredAssets.map((asset) => {
                    const isSelected = selectedAssetId === asset.id;
                    const isNewlyUploaded = justUploadedAssetId === asset.id;
                    const sourceLabel = asset.scope === 'tenant_library' ? 'Biblioteca' : 'Global';

                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => {
                          onSelect(asset);
                          onClose();
                        }}
                        className={`group overflow-hidden rounded-2xl border bg-card text-left transition-all ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/25'
                            : isNewlyUploaded
                              ? 'border-primary/60 ring-2 ring-primary/15'
                              : 'border-border hover:border-primary/40'
                        }`}
                        title={asset.title ?? asset.originalName ?? 'Imagem'}
                      >
                        <div className="relative aspect-square overflow-hidden">
                          <img
                            src={asset.publicUrl}
                            alt={asset.altText ?? asset.title ?? 'Imagem'}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                          />

                          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2">
                            <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                              {sourceLabel}
                            </span>
                            {isNewlyUploaded && (
                              <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                                Nova
                              </span>
                            )}
                          </div>

                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20" />
                          )}
                        </div>

                        <div className="space-y-1 p-3">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {asset.title ?? asset.originalName ?? 'Imagem sem nome'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {asset.category || (asset.scope === 'tenant_library' ? 'Sua biblioteca' : 'Banco global')}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
