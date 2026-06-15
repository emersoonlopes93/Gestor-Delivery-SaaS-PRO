import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  FileJson,
  ImageOff,
  Images,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';

type PublicationStatus = 'draft' | 'published' | 'archived';
type ImageStatus = 'linked' | 'missing_lookup' | 'no_published_asset' | 'draft_only';
type ImportStatus = 'success' | 'partial' | 'failed';
type TabId = 'products' | 'images' | 'imports' | 'metadata';

type BaseMenuVersionSummary = {
  id: string;
  versionNumber: number;
  status: PublicationStatus;
  publishedAt: string | null;
  createdAt: string;
};

type BaseMenuListItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  segment: string;
  icon: string | null;
  status: PublicationStatus;
  currentPublishedVersion: BaseMenuVersionSummary | null;
  totalCategories: number;
  totalProducts: number;
  totalProductsWithMediaLookupKey: number;
  totalProductsWithPublishedGlobalImage: number;
  totalProductsWithoutImage: number;
  lastPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PublishedGlobalImage = {
  id: string;
  title: string | null;
  publicUrl: string;
  altText: string | null;
  filename: string;
  publicationStatus: string;
  category: string | null;
  createdAt: string;
};

type BaseMenuProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  sortOrder: number;
  mediaLookupKey: string | null;
  searchTagsJson: string[];
  metadataJson: Record<string, unknown> | null;
  imageStatus: ImageStatus;
  publishedGlobalImage: PublishedGlobalImage | null;
};

type BaseMenuCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  metadataJson: Record<string, unknown> | null;
  products: BaseMenuProduct[];
};

type BaseMenuDetail = {
  template: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    segment: string;
    icon: string | null;
    status: PublicationStatus;
    metadataJson: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  };
  currentPublishedVersion: (BaseMenuVersionSummary & {
    metadataJson: Record<string, unknown> | null;
    updatedAt: string;
  }) | null;
  totals: {
    totalCategories: number;
    totalProducts: number;
    totalProductsWithMediaLookupKey: number;
    totalProductsWithPublishedGlobalImage: number;
    totalProductsWithoutImage: number;
  };
  categories: BaseMenuCategory[];
  versions: Array<BaseMenuVersionSummary & { metadataJson?: Record<string, unknown> | null; updatedAt?: string }>;
};

type ImportLog = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  version: { id: string; versionNumber: number; status: PublicationStatus };
  status: ImportStatus;
  categoriesCreated: number;
  productsCreated: number;
  categoriesSkipped: number;
  productsSkipped: number;
  metadataJson: Record<string, unknown> | null;
  createdAt: string;
};

const statusLabels: Record<PublicationStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};

const imageStatusLabels: Record<ImageStatus, string> = {
  linked: 'Imagem publicada',
  missing_lookup: 'Sem lookup',
  no_published_asset: 'Sem imagem publicada',
  draft_only: 'Somente draft/arquivada',
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'products', label: 'Categorias e produtos' },
  { id: 'images', label: 'Imagens' },
  { id: 'imports', label: 'Importações' },
  { id: 'metadata', label: 'Metadados' },
];

export function BaseMenusPage() {
  const { id } = useParams();
  return id ? <BaseMenuDetailView id={id} /> : <BaseMenuListView />;
}

function BaseMenuListView() {
  const [items, setItems] = useState<BaseMenuListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [segment, setSegment] = useState('');
  const [onlyImageIssues, setOnlyImageIssues] = useState(false);

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<BaseMenuListItem[]>('/admin/base-menus');
      setItems(response.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  const segments = useMemo(() => Array.from(new Set(items.map((item) => item.segment))).sort(), [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (term && ![item.name, item.slug, item.segment].some((value) => value.toLowerCase().includes(term))) return false;
      if (status && item.status !== status) return false;
      if (segment && item.segment !== segment) return false;
      if (onlyImageIssues && item.totalProductsWithoutImage === 0) return false;
      return true;
    });
  }, [items, onlyImageIssues, search, segment, status]);

  const kpis = useMemo(() => ({
    total: items.length,
    published: items.filter((item) => item.status === 'published').length,
    draft: items.filter((item) => item.status === 'draft').length,
    archived: items.filter((item) => item.status === 'archived').length,
    products: items.reduce((sum, item) => sum + item.totalProducts, 0),
    imageIssues: items.reduce((sum, item) => sum + item.totalProductsWithoutImage, 0),
  }), [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Cardápios Base</h1>
          <p className="mt-1 max-w-3xl text-sm font-bold text-muted-foreground">
            Modelos globais usados pelos tenants ao importar um cardápio inicial. Ao importar, o tenant recebe uma cópia independente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/base-media" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-black text-foreground hover:bg-muted">
            <Images className="h-4 w-4" />
            Galeria Base
          </Link>
          <button onClick={loadItems} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-bold text-muted-foreground">
          Apenas templates publicados aparecem para tenants. Imagens em draft não são usadas na importação.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Templates" value={kpis.total} />
        <Kpi label="Publicados" value={kpis.published} tone="success" />
        <Kpi label="Drafts" value={kpis.draft} tone="warning" />
        <Kpi label="Arquivados" value={kpis.archived} />
        <Kpi label="Produtos" value={kpis.products} />
        <Kpi label="Sem imagem" value={kpis.imageIssues} tone={kpis.imageIssues > 0 ? 'danger' : 'success'} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_170px_180px_210px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Buscar por nome, slug ou segmento"
            />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
            <option value="">Todos status</option>
            <option value="published">Publicado</option>
            <option value="draft">Rascunho</option>
            <option value="archived">Arquivado</option>
          </select>
          <select value={segment} onChange={(event) => setSegment(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
            <option value="">Todos segmentos</option>
            {segments.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground">
            <input type="checkbox" checked={onlyImageIssues} onChange={(event) => setOnlyImageIssues(event.target.checked)} />
            com pendência de imagem
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[1.4fr_130px_120px_110px_110px_160px_150px_120px] gap-3 border-b border-border px-4 py-3 text-[11px] font-black uppercase text-muted-foreground">
          <span>Nome</span>
          <span>Segmento</span>
          <span>Status</span>
          <span>Versão</span>
          <span>Categorias</span>
          <span>Produtos</span>
          <span>Cobertura</span>
          <span>Ação</span>
        </div>
        {loading ? <TableMessage icon={<Loader2 className="h-8 w-8 animate-spin" />} text="Carregando modelos..." /> : null}
        {!loading && error ? <TableMessage icon={<AlertTriangle className="h-8 w-8" />} text={error} /> : null}
        {!loading && !error && filtered.length === 0 ? <TableMessage icon={<BookOpenCheck className="h-8 w-8" />} text="Nenhum modelo encontrado." /> : null}
        {!loading && !error ? filtered.map((item) => (
          <article key={item.id} className="grid grid-cols-[1.4fr_130px_120px_110px_110px_160px_150px_120px] gap-3 border-b border-border px-4 py-4 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-foreground">{item.icon ? `${item.icon} ` : ''}{item.name}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{item.slug}</p>
            </div>
            <span className="py-1 text-sm font-bold text-foreground">{item.segment}</span>
            <StatusPill status={item.status} />
            <span className="py-1 text-sm font-black text-foreground">{item.currentPublishedVersion ? `v${item.currentPublishedVersion.versionNumber}` : '-'}</span>
            <span className="py-1 text-sm font-black text-foreground">{item.totalCategories}</span>
            <span className="py-1 text-sm font-black text-foreground">{item.totalProducts}</span>
            <CoverageBadge linked={item.totalProductsWithPublishedGlobalImage} total={item.totalProducts} />
            <Link to={`/base-menus/${item.slug}`} className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground">
              Ver detalhes
            </Link>
          </article>
        )) : null}
      </section>
    </div>
  );
}

function BaseMenuDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<BaseMenuDetail | null>(null);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('products');

  async function loadDetail() {
    setLoading(true);
    setError(null);
    try {
      const [detailResponse, logsResponse] = await Promise.all([
        api.get<BaseMenuDetail>(`/admin/base-menus/${id}`),
        api.get<ImportLog[]>(`/admin/base-menus/${id}/import-logs`),
      ]);
      setDetail(detailResponse.data);
      setLogs(logsResponse.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [id]);

  const products = useMemo(() => detail?.categories.flatMap((category) => category.products) ?? [], [detail]);
  const imageGroups = useMemo(() => ({
    linked: products.filter((product) => product.imageStatus === 'linked'),
    draftOnly: products.filter((product) => product.imageStatus === 'draft_only'),
    noAsset: products.filter((product) => product.imageStatus === 'no_published_asset'),
    noLookup: products.filter((product) => product.imageStatus === 'missing_lookup'),
  }), [products]);

  if (loading) {
    return <div className="flex min-h-[480px] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando modelo...</div>;
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/base-menus')} className="inline-flex items-center gap-2 text-sm font-black text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-sm font-bold text-destructive">{error ?? 'Modelo não encontrado.'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/base-menus')} className="inline-flex items-center gap-2 text-sm font-black text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Voltar para Cardápios Base
      </button>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black text-foreground">{detail.template.icon ? `${detail.template.icon} ` : ''}{detail.template.name}</h1>
              <StatusPill status={detail.template.status} />
              <span className="rounded-xl bg-muted px-3 py-1 text-xs font-black text-muted-foreground">
                {detail.currentPublishedVersion ? `v${detail.currentPublishedVersion.versionNumber}` : 'sem versão publicada'}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{detail.template.slug} · {detail.template.segment}</p>
            <p className="mt-3 max-w-4xl text-sm font-bold text-muted-foreground">{detail.template.description}</p>
            <p className="mt-3 max-w-4xl text-sm text-muted-foreground">
              Este modelo é usado como ponto de partida. Alterações futuras no modelo não alteram cardápios já importados.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/base-media" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:bg-muted">
              <ExternalLink className="h-4 w-4" />
              Abrir Galeria Base
            </Link>
            <button onClick={loadDetail} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Categorias" value={detail.totals.totalCategories} />
        <Kpi label="Produtos" value={detail.totals.totalProducts} />
        <Kpi label="Com lookup" value={detail.totals.totalProductsWithMediaLookupKey} />
        <Kpi label="Com imagem" value={detail.totals.totalProductsWithPublishedGlobalImage} tone="success" />
        <Kpi label="Pendências" value={detail.totals.totalProductsWithoutImage} tone={detail.totals.totalProductsWithoutImage > 0 ? 'danger' : 'success'} />
      </section>

      <nav className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`border-b-2 px-3 py-3 text-sm font-black transition-colors ${tab === item.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'products' ? <ProductsTab categories={detail.categories} /> : null}
      {tab === 'images' ? <ImagesTab groups={imageGroups} /> : null}
      {tab === 'imports' ? <ImportsTab logs={logs} /> : null}
      {tab === 'metadata' ? <MetadataTab detail={detail} /> : null}
    </div>
  );
}

function ProductsTab({ categories }: { categories: BaseMenuCategory[] }) {
  return (
    <section className="space-y-4">
      {categories.map((category) => (
        <div key={category.id} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-black text-foreground">{category.name}</p>
            <p className="text-xs font-bold text-muted-foreground">{category.products.length} produtos · ordem {category.sortOrder}</p>
          </div>
          <div className="divide-y divide-border">
            {category.products.map((product) => <ProductRow key={product.id} product={product} />)}
          </div>
        </div>
      ))}
    </section>
  );
}

function ProductRow({ product }: { product: BaseMenuProduct }) {
  return (
    <article className="grid grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[72px_1fr_130px_180px_160px]">
      <div>
        {product.publishedGlobalImage ? (
          <img src={product.publishedGlobalImage.publicUrl} alt={product.publishedGlobalImage.altText ?? product.name} className="h-16 w-16 rounded-xl object-cover bg-muted" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-muted-foreground"><ImageOff className="h-6 w-6" /></div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-foreground">{product.name}</p>
        <p className="mt-1 text-xs font-bold text-muted-foreground">{product.description ?? 'Sem descrição'}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {product.searchTagsJson.map((tag) => <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{tag}</span>)}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-black uppercase text-muted-foreground">Preço sugerido</p>
        <p className="text-sm font-black text-foreground">{formatMoney(product.basePrice)}</p>
      </div>
      <div>
        <p className="text-[11px] font-black uppercase text-muted-foreground">Lookup</p>
        <p className="break-all font-mono text-xs text-foreground">{product.mediaLookupKey ?? '-'}</p>
      </div>
      <ImageStatusBadge status={product.imageStatus} />
    </article>
  );
}

function ImagesTab({ groups }: { groups: { linked: BaseMenuProduct[]; draftOnly: BaseMenuProduct[]; noAsset: BaseMenuProduct[]; noLookup: BaseMenuProduct[] } }) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ImageGroup title="Com imagem publicada" products={groups.linked} status="linked" />
      <ImageGroup title="Somente draft/arquivada" products={groups.draftOnly} status="draft_only" />
      <ImageGroup title="Sem imagem publicada" products={groups.noAsset} status="no_published_asset" />
      <ImageGroup title="Sem lookup" products={groups.noLookup} status="missing_lookup" />
    </section>
  );
}

function ImageGroup({ title, products, status }: { title: string; products: BaseMenuProduct[]; status: ImageStatus }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-foreground">{title}</p>
          <p className="text-xs font-bold text-muted-foreground">{products.length} produtos</p>
        </div>
        <ImageStatusBadge status={status} compact />
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {products.map((product) => (
          <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-foreground">{product.name}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{product.mediaLookupKey ?? 'sem lookup'}</p>
            </div>
            <Link to="/base-media" className="shrink-0 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-black text-foreground hover:bg-muted">
              Galeria
            </Link>
          </div>
        ))}
        {products.length === 0 ? <p className="py-8 text-center text-sm font-bold text-muted-foreground">Nenhum produto nesta condição.</p> : null}
      </div>
    </div>
  );
}

function ImportsTab({ logs }: { logs: ImportLog[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-[1.2fr_150px_120px_130px_130px_180px] gap-3 border-b border-border px-4 py-3 text-[11px] font-black uppercase text-muted-foreground">
        <span>Tenant</span>
        <span>Data</span>
        <span>Status</span>
        <span>Criados</span>
        <span>Pulados</span>
        <span>Versão</span>
      </div>
      {logs.map((log) => (
        <article key={log.id} className="grid grid-cols-[1.2fr_150px_120px_130px_130px_180px] gap-3 border-b border-border px-4 py-4 last:border-b-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">{log.tenant.name}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{log.tenant.slug}</p>
          </div>
          <span className="text-xs font-bold text-muted-foreground">{formatDate(log.createdAt)}</span>
          <ImportStatusPill status={log.status} />
          <span className="text-sm font-black text-foreground">{log.categoriesCreated} cat · {log.productsCreated} prod</span>
          <span className="text-sm font-black text-foreground">{log.categoriesSkipped} cat · {log.productsSkipped} prod</span>
          <span className="text-sm font-black text-foreground">v{log.version.versionNumber} · {statusLabels[log.version.status]}</span>
        </article>
      ))}
      {logs.length === 0 ? <TableMessage icon={<ListChecks className="h-8 w-8" />} text="Nenhuma importação registrada para este modelo." /> : null}
    </section>
  );
}

function MetadataTab({ detail }: { detail: BaseMenuDetail }) {
  const metadata = {
    template: detail.template.metadataJson,
    currentPublishedVersion: detail.currentPublishedVersion?.metadataJson ?? null,
    products: detail.categories.flatMap((category) => category.products.map((product) => ({
      category: category.name,
      product: product.name,
      mediaLookupKey: product.mediaLookupKey,
      tags: product.searchTagsJson,
      metadata: product.metadataJson,
    }))),
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-black text-foreground">
        <FileJson className="h-4 w-4" />
        Metadados úteis do modelo
      </div>
      <pre className="max-h-[620px] overflow-auto rounded-xl bg-muted/50 p-4 text-xs text-foreground">{JSON.stringify(metadata, null, 2)}</pre>
    </section>
  );
}

function Kpi({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const color = tone === 'success' ? 'text-emerald-600' : tone === 'warning' ? 'text-amber-600' : tone === 'danger' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-black uppercase text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: PublicationStatus }) {
  const color = status === 'published' ? 'bg-emerald-500/10 text-emerald-600' : status === 'draft' ? 'bg-amber-500/10 text-amber-600' : 'bg-slate-500/10 text-slate-500';
  return <span className={`inline-flex h-8 items-center justify-center rounded-xl px-3 text-xs font-black ${color}`}>{statusLabels[status]}</span>;
}

function ImportStatusPill({ status }: { status: ImportStatus }) {
  const label = status === 'success' ? 'Sucesso' : status === 'partial' ? 'Parcial' : 'Falhou';
  const color = status === 'success' ? 'bg-emerald-500/10 text-emerald-600' : status === 'partial' ? 'bg-amber-500/10 text-amber-600' : 'bg-destructive/10 text-destructive';
  return <span className={`inline-flex h-8 items-center justify-center rounded-xl px-3 text-xs font-black ${color}`}>{label}</span>;
}

function CoverageBadge({ linked, total }: { linked: number; total: number }) {
  const pending = total - linked;
  const color = pending > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600';
  return <span className={`inline-flex h-8 items-center justify-center rounded-xl px-3 text-xs font-black ${color}`}>{linked}/{total} com imagem</span>;
}

function ImageStatusBadge({ status, compact }: { status: ImageStatus; compact?: boolean }) {
  const color = status === 'linked'
    ? 'bg-emerald-500/10 text-emerald-600'
    : status === 'draft_only'
      ? 'bg-amber-500/10 text-amber-600'
      : 'bg-destructive/10 text-destructive';
  return (
    <span className={`inline-flex h-8 items-center justify-center rounded-xl px-3 text-xs font-black ${color}`}>
      {status === 'linked' ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
      {compact ? imageStatusLabels[status].replace(' publicada', '') : imageStatusLabels[status]}
    </span>
  );
}

function TableMessage({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      {icon}
      <p className="text-sm font-bold">{text}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Falha ao carregar dados.';
}
