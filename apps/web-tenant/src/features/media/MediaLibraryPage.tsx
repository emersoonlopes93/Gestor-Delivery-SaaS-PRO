import { useEffect, useMemo, useState } from 'react';
import { Image, RefreshCw, Search, Trash2, UploadCloud } from 'lucide-react';
import { api } from '../../lib/api-client';

type MediaOrigin = 'all' | 'tenant' | 'system';

type MediaAsset = {
  id: string;
  title: string | null;
  originalName: string | null;
  publicUrl: string;
  altText: string | null;
  scope: string;
  imageSource?: string;
  createdAt: string;
};

export function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [origin, setOrigin] = useState<MediaOrigin>('all');
  const [search, setSearch] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return assets;
    return assets.filter((asset) =>
      [asset.title, asset.originalName, asset.altText]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [assets, search]);

  async function loadAssets(nextOrigin = origin) {
    setIsLoading(true);
    try {
      const response = await api.get<MediaAsset[]>(`/media/assets?origin=${nextOrigin}`);
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
      formData.set('altText', title || file.name);
      await api.upload<MediaAsset>('/media/upload', formData);
      setFile(null);
      setTitle('');
      setOrigin('tenant');
      await loadAssets('tenant');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(asset: MediaAsset) {
    if (asset.scope !== 'tenant_library') return;
    await api.delete<MediaAsset>(`/media/assets/${asset.id}`);
    await loadAssets();
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Biblioteca de Midia</h1>
          <p className="text-sm font-bold text-muted-foreground mt-1">Gerencie imagens proprias e consulte a galeria global liberada pelo SaaS.</p>
        </div>
        <button
          type="button"
          onClick={() => loadAssets()}
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
            Upload proprio
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
            className="input-premium"
            placeholder="Titulo / alt text"
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-60"
          >
            <UploadCloud className="h-4 w-4" />
            {isUploading ? 'Enviando...' : 'Enviar imagem'}
          </button>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex rounded-xl bg-muted p-1">
              {(['all', 'tenant', 'system'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setOrigin(item);
                    void loadAssets(item);
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-black uppercase ${
                    origin === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {item === 'all' ? 'Todas' : item === 'tenant' ? 'Proprias' : 'Globais'}
                </button>
              ))}
            </div>
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="input-premium pl-10"
                placeholder="Buscar imagem"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-4">
            {filteredAssets.map((asset) => (
              <article key={asset.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="aspect-square bg-muted">
                  <img src={asset.publicUrl} alt={asset.altText ?? asset.title ?? 'Media'} className="h-full w-full object-cover" />
                </div>
                <div className="p-3 space-y-3">
                  <div>
                    <p className="text-sm font-black text-foreground truncate">{asset.title ?? asset.originalName ?? 'Imagem'}</p>
                    <p className="text-[10px] font-black uppercase text-muted-foreground">
                      {asset.scope === 'system_gallery' ? 'Global' : 'Propria'}
                    </p>
                  </div>
                  {asset.scope === 'tenant_library' ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(asset)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
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
