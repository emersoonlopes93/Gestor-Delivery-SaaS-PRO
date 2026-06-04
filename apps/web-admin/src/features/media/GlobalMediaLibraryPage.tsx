import { useEffect, useMemo, useState } from 'react';
import { Image, RefreshCw, Search, Trash2, UploadCloud } from 'lucide-react';
import { api } from '../../lib/api-client';

type MediaAsset = {
  id: string;
  title: string | null;
  originalName: string | null;
  publicUrl: string;
  altText: string | null;
  publicationStatus: string;
  status: string;
  createdAt: string;
  category?: string | null;
  categoryId?: string | null;
};

type MediaCategory = {
  id: string;
  name: string;
  slug: string;
};

export function GlobalMediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [categories, setCategories] = useState<MediaCategory[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>('');
  const [publicationStatus, setPublicationStatus] = useState<'published' | 'draft'>('published');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function loadCategories() {
    try {
      const response = await api.get<MediaCategory[]>('/admin/media/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }

  const filteredAssets = useMemo(() => {
    let filtered = [...assets];

    // Search filter
    const term = search.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((asset) => {
        return [asset.title, asset.originalName, asset.altText]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(term));
      });
    }

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter((asset) => asset.categoryId === selectedCategory);
    }

    // Status filter
    if (selectedStatus) {
      filtered = filtered.filter((asset) => asset.publicationStatus === selectedStatus);
    }

    return filtered;
  }, [assets, search, selectedCategory, selectedStatus]);

  async function loadAssets() {
    setIsLoading(true);
    try {
      const response = await api.get<MediaAsset[]>('/admin/media/gallery');
      setAssets(response.data);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('title', title || file.name);
      formData.set('categoryId', uploadCategory);
      formData.set('publicationStatus', publicationStatus);
      formData.set('altText', title || file.name);
      await api.upload<MediaAsset>('/admin/media/gallery/upload', formData);
      setFile(null);
      setTitle('');
      setUploadCategory('');
      await loadAssets();
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await api.delete<MediaAsset>(`/admin/media/gallery/${id}`);
    await loadAssets();
  }

  useEffect(() => {
    void loadAssets();
    void loadCategories();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Biblioteca Global</h1>
          <p className="text-sm font-bold text-muted-foreground mt-1">Imagens publicadas aqui ficam disponíveis para todos os tenants.</p>
        </div>
        <button
          type="button"
          onClick={loadAssets}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-card border border-border px-4 py-2 text-sm font-black text-foreground hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-foreground uppercase tracking-wider">
            <UploadCloud className="h-4 w-4 text-primary" />
            Upload
          </div>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-black file:text-primary-foreground"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Titulo / alt text *"
          />
          <select
            value={uploadCategory}
            onChange={(event) => setUploadCategory(event.target.value)}
            className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Selecionar Categoria *</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            {(['published', 'draft'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setPublicationStatus(status)}
                className={`rounded-xl px-3 py-2 text-xs font-black uppercase ${
                  publicationStatus === status ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {status === 'published' ? 'Publicado' : 'Rascunho'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || !uploadCategory || isUploading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-60"
          >
            <UploadCloud className="h-4 w-4" />
            {isUploading ? 'Enviando...' : 'Enviar imagem'}
          </button>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-3">
            <div className="flex-1">
              <label className="text-xs font-black uppercase text-muted-foreground mb-1.5 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full h-10 pl-10 pr-3 bg-card border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Nome, descrição..."
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-muted-foreground mb-1.5 block">Categoria</label>
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                className="h-10 px-3 bg-card border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring min-w-[200px]"
              >
                <option value="">Todas</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-muted-foreground mb-1.5 block">Status</label>
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                className="h-10 px-3 bg-card border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring min-w-[150px]"
              >
                <option value="">Todos</option>
                <option value="published">Publicado</option>
                <option value="draft">Rascunho</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-4">
            {filteredAssets.map((asset) => {
              const categoryName = categories.find((c) => c.id === asset.categoryId)?.name;
              return (
                <article key={asset.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="aspect-square bg-muted">
                    <img src={asset.publicUrl} alt={asset.altText ?? asset.title ?? 'Media'} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-3 space-y-2">
                    <div>
                      <p className="text-sm font-black text-foreground truncate">{asset.title ?? asset.originalName ?? 'Imagem'}</p>
                      {categoryName && (
                        <p className="text-[10px] font-bold text-muted-foreground">Categoria: {categoryName}</p>
                      )}
                      <p className="text-[10px] font-black uppercase text-muted-foreground">{asset.publicationStatus}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(asset.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              );
            })}
            {!isLoading && filteredAssets.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                <Image className="mx-auto h-8 w-8 mb-3" />
                <p className="text-sm font-bold">Nenhuma imagem encontrada.</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
