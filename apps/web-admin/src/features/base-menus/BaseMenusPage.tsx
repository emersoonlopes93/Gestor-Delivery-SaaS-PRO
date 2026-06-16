import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileJson,
  ImageOff,
  Images,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import { useAdminPermissions } from '../../hooks/use-admin-auth';

type PublicationStatus = 'draft' | 'published' | 'archived';
type ImageStatus = 'linked_exact' | 'linked_tag' | 'linked_fallback' | 'missing_lookup' | 'no_published_asset' | 'draft_only';
type ImportStatus = 'success' | 'partial' | 'failed';
type TabId = 'products' | 'images' | 'versions' | 'imports' | 'metadata';

type BaseMenuVersionSummary = {
  id: string;
  versionNumber: number;
  status: PublicationStatus;
  publishedAt: string | null;
  createdAt: string;
};

type BaseMenuVersionDetail = BaseMenuVersionSummary & {
  templateId?: string;
  metadataJson?: Record<string, unknown> | null;
  updatedAt?: string;
  isCurrentPublished?: boolean;
  totals?: {
    categories: number;
    products: number;
    linkedImages: number;
    missingImages: number;
    fallbackImages: number;
  };
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
  draftVersion: BaseMenuVersionSummary | null;
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
  draftVersion: (BaseMenuVersionSummary & {
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
  versions: BaseMenuVersionDetail[];
};

type DraftValidation = {
  errors: string[];
  warnings: string[];
  totals: { categories: number; products: number };
  imageSummary: {
    linkedExact: number;
    linkedTag: number;
    linkedFallback: number;
    missingLookup: number;
    noPublishedAsset: number;
    draftOnly: number;
  };
  replacingVersionId: string | null;
  publishingVersionId: string;
  publishingVersionNumber: number;
};

type BaseMenuDraft = {
  template: BaseMenuDetail['template'] & { currentPublishedVersionId: string | null };
  version: BaseMenuVersionSummary & {
    templateId: string;
    metadataJson: Record<string, unknown> | null;
    updatedAt: string;
  };
  validation: DraftValidation;
  categories: BaseMenuCategory[];
};

type DraftActionModalState = {
  draft: BaseMenuDraft;
  mode: 'publish' | 'discard';
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
  linked_exact: 'Imagem exata',
  linked_tag: 'Imagem por tag',
  linked_fallback: 'Imagem fallback',
  missing_lookup: 'Sem lookup',
  no_published_asset: 'Sem imagem publicada',
  draft_only: 'Somente draft/arquivada',
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'products', label: 'Categorias e produtos' },
  { id: 'images', label: 'Imagens' },
  { id: 'versions', label: 'Versoes' },
  { id: 'imports', label: 'Importações' },
  { id: 'metadata', label: 'Metadados' },
];

export function BaseMenusPage() {
  const { id } = useParams();
  const location = useLocation();
  if (!id) return <BaseMenuListView />;
  return location.pathname.endsWith('/draft') ? <BaseMenuDraftEditor id={id} /> : <BaseMenuDetailView id={id} />;
}

function BaseMenuListView() {
  const { has } = useAdminPermissions();
  const canManage = has('saas.base_menu.manage');
  const [items, setItems] = useState<BaseMenuListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [segment, setSegment] = useState('');
  const [onlyImageIssues, setOnlyImageIssues] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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
          {canManage ? (
            <button onClick={() => setCreateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">
              <Plus className="h-4 w-4" />
              Novo Cardápio
            </button>
          ) : null}
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
        <div className="grid grid-cols-[1.4fr_130px_120px_110px_110px_120px_150px_220px] gap-3 border-b border-border px-4 py-3 text-[11px] font-black uppercase text-muted-foreground">
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
          <article key={item.id} className="grid grid-cols-[1.4fr_130px_120px_110px_110px_120px_150px_220px] gap-3 border-b border-border px-4 py-4 last:border-b-0">
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
            <div className="flex flex-wrap gap-2">
              <Link to={`/base-menus/${item.slug}`} className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-xs font-black text-foreground hover:bg-muted">
                Ver detalhes
              </Link>
              {canManage ? <DraftActionButton item={item} onDone={loadItems} /> : null}
            </div>
          </article>
        )) : null}
      </section>

      {createOpen ? <CreateTemplateModal onClose={() => setCreateOpen(false)} onDone={loadItems} /> : null}
    </div>
  );
}

function DraftActionButton({ item, onDone }: { item: BaseMenuListItem; onDone: () => void | Promise<void> }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function createOrContinue() {
    if (item.draftVersion) {
      navigate(`/base-menus/${item.slug}/draft`);
      return;
    }
    setBusy(true);
    try {
      await api.post<BaseMenuDraft>(`/admin/base-menus/${item.slug}/draft-version`);
      await onDone();
      navigate(`/base-menus/${item.slug}/draft`);
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button aria-label={item.draftVersion ? 'Continuar edicao' : 'Criar draft'} onClick={() => void createOrContinue()} disabled={busy} className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      {item.draftVersion ? 'Continuar edicao' : 'Criar draft'}
    </button>
  );
}

function BaseMenuDraftEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const { has } = useAdminPermissions();
  const canManage = has('saas.base_menu.manage');
  const [draft, setDraft] = useState<BaseMenuDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<DraftActionModalState | null>(null);

  async function loadDraft() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<BaseMenuDraft>(`/admin/base-menus/${id}/draft`);
      setDraft(response.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDraft();
  }, [id]);

  if (loading) return <div className="flex min-h-[480px] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando draft...</div>;

  if (error || !draft) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(`/base-menus/${id}`)} className="inline-flex items-center gap-2 text-sm font-black text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-sm font-bold text-destructive">{error ?? 'Draft nao encontrado.'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(`/base-menus/${draft.template.slug}`)} className="inline-flex items-center gap-2 text-sm font-black text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Voltar para detalhes
      </button>

      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">
        Voce esta editando uma versao draft. Tenants so verao esta versao apos publicacao. Cardapios ja importados por tenants nao serao alterados. A Galeria Base continua sendo o local para publicar ou substituir imagens.
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-2xl font-black text-foreground">{draft.template.icon ? `${draft.template.icon} ` : ''}{draft.template.name}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Publicada atual: {draft.template.currentPublishedVersionId ?? '-'} · Draft: v{draft.version.versionNumber}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/base-media" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:bg-muted">
              <ExternalLink className="h-4 w-4" />
              Galeria Base
            </Link>
            {canManage ? (
              <>
                <button aria-label="Descartar draft" onClick={() => setModal({ draft, mode: 'discard' })} className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-background px-4 py-2 text-sm font-black text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                  Descartar draft
                </button>
                <button aria-label="Publicar draft" onClick={() => setModal({ draft, mode: 'publish' })} disabled={draft.validation.errors.length > 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                  <Send className="h-4 w-4" />
                  Revisar e publicar
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <DraftValidationPanel validation={draft.validation} />

      {canManage ? <TemplateForm draft={draft} onSaved={loadDraft} /> : <ReadOnlyNotice />}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-foreground">Categorias e produtos</h2>
          {canManage ? <CategoryCreateForm draft={draft} onSaved={loadDraft} /> : null}
        </div>
        {draft.categories.map((category) => (
          <div key={category.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <CategoryEditor draft={draft} category={category} canManage={canManage} onSaved={loadDraft} />
            <div className="divide-y divide-border">
              {category.products.map((product) => <ProductEditor key={product.id} draft={draft} product={product} canManage={canManage} onSaved={loadDraft} />)}
            </div>
            {canManage ? <ProductCreateForm draft={draft} category={category} onSaved={loadDraft} /> : null}
          </div>
        ))}
      </section>

      {modal ? (
        <DraftActionModal
          state={modal}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            navigate(`/base-menus/${draft.template.slug}`);
          }}
        />
      ) : null}
    </div>
  );
}

function BaseMenuDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const { has } = useAdminPermissions();
  const canManage = has('saas.base_menu.manage');
  const [detail, setDetail] = useState<BaseMenuDetail | null>(null);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [versions, setVersions] = useState<BaseMenuVersionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('products');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  async function loadDetail() {
    setLoading(true);
    setError(null);
    try {
      const [detailResponse, logsResponse, versionsResponse] = await Promise.all([
        api.get<BaseMenuDetail>(`/admin/base-menus/${id}`),
        api.get<ImportLog[]>(`/admin/base-menus/${id}/import-logs`),
        api.get<BaseMenuVersionDetail[]>(`/admin/base-menus/${id}/versions`),
      ]);
      setDetail(detailResponse.data);
      setLogs(logsResponse.data);
      setVersions(versionsResponse.data);
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
    linked: products.filter((product) => ['linked_exact', 'linked_tag', 'linked_fallback'].includes(product.imageStatus)),
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
            {canManage ? (
              <>
                <DraftActionButton item={{
                  id: detail.template.id,
                  slug: detail.template.slug,
                  name: detail.template.name,
                  description: detail.template.description,
                  segment: detail.template.segment,
                  icon: detail.template.icon,
                  status: detail.template.status,
                  currentPublishedVersion: detail.currentPublishedVersion,
                  draftVersion: detail.draftVersion,
                  totalCategories: detail.totals.totalCategories,
                  totalProducts: detail.totals.totalProducts,
                  totalProductsWithMediaLookupKey: detail.totals.totalProductsWithMediaLookupKey,
                  totalProductsWithPublishedGlobalImage: detail.totals.totalProductsWithPublishedGlobalImage,
                  totalProductsWithoutImage: detail.totals.totalProductsWithoutImage,
                  lastPublishedAt: detail.currentPublishedVersion?.publishedAt ?? null,
                  createdAt: detail.template.createdAt,
                  updatedAt: detail.template.updatedAt,
                }} onDone={loadDetail} />
                {detail.draftVersion ? (
                  <Link to={`/base-menus/${detail.template.slug}/draft`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">
                    <Send className="h-4 w-4" />
                    Revisar/Publicar draft
                  </Link>
                ) : null}
                <button aria-label="Duplicar cardápio" onClick={() => setDuplicateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:bg-muted">
                  <Copy className="h-4 w-4" />
                  Duplicar
                </button>
                {detail.template.status === 'archived' ? (
                  <button aria-label="Restaurar cardápio" onClick={() => void handleRestore()} disabled={actionBusy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:bg-muted">
                    <Undo2 className="h-4 w-4" />
                    Restaurar
                  </button>
                ) : (
                  <button aria-label="Arquivar cardápio" onClick={() => void handleArchive()} disabled={actionBusy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-destructive hover:bg-muted">
                    <Archive className="h-4 w-4" />
                    Arquivar
                  </button>
                )}
              </>
            ) : null}
            <button onClick={loadDetail} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-black uppercase text-muted-foreground">VersÃ£o publicada atual</p>
            <p className="mt-1 text-sm font-black text-foreground">{detail.currentPublishedVersion ? `v${detail.currentPublishedVersion.versionNumber}` : 'Nenhuma'}</p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase text-muted-foreground">Draft em ediÃ§Ã£o</p>
            <p className="mt-1 text-sm font-black text-foreground">{detail.draftVersion ? `v${detail.draftVersion.versionNumber}` : 'Sem draft aberto'}</p>
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
      {tab === 'versions' ? <VersionsTab versions={versions} currentVersionId={detail.currentPublishedVersion?.id ?? null} /> : null}
      {tab === 'imports' ? <ImportsTab logs={logs} /> : null}
      {tab === 'metadata' ? <MetadataTab detail={detail} /> : null}

      {duplicateOpen && canManage ? (
        <DuplicateTemplateModal
          sourceTemplateId={detail.template.id}
          sourceTemplateName={detail.template.name}
          onClose={() => setDuplicateOpen(false)}
          onDone={(newSlug) => {
            setDuplicateOpen(false);
            navigate(`/base-menus/${newSlug}`);
          }}
        />
      ) : null}
    </div>
  );

  async function handleArchive() {
    if (!window.confirm('Tem certeza que deseja arquivar este cardápio base? Ele deixará de aparecer para novos tenants.')) return;
    setActionBusy(true);
    try {
      await api.post(`/admin/base-menus/${detail!.template.slug}/archive`);
      await loadDetail();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRestore() {
    if (!window.confirm('Tem certeza que deseja restaurar este cardápio base?')) return;
    setActionBusy(true);
    try {
      await api.post(`/admin/base-menus/${detail!.template.slug}/restore`);
      await loadDetail();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }
}

function ReadOnlyNotice() {
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-sm font-bold text-muted-foreground">
      Seu usuario possui apenas leitura. A edicao do draft exige saas.base_menu.manage.
    </section>
  );
}

function PublishSummary({ validation }: { validation: DraftValidation }) {
  return (
    <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[11px] font-black uppercase text-muted-foreground">Resumo</p>
        <p className="mt-2 text-sm font-black text-foreground">{validation.totals.categories} categorias · {validation.totals.products} produtos</p>
        <p className="mt-1 text-xs font-bold text-muted-foreground">Sera publicada a v{validation.publishingVersionNumber}</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[11px] font-black uppercase text-muted-foreground">Imagens</p>
        <p className="mt-2 text-sm font-black text-foreground">{validation.imageSummary.linkedExact + validation.imageSummary.linkedTag + validation.imageSummary.linkedFallback} com imagem</p>
        <p className="mt-1 text-xs font-bold text-muted-foreground">{validation.imageSummary.noPublishedAsset + validation.imageSummary.missingLookup + validation.imageSummary.draftOnly} pendencias</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[11px] font-black uppercase text-muted-foreground">Validacao antes de publicar</p>
        <p className={`mt-2 text-sm font-black ${validation.errors.length > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
          {validation.errors.length} erros · {validation.warnings.length} avisos
        </p>
        <div className="mt-2 max-h-24 overflow-auto text-xs font-bold text-muted-foreground">
          {[...validation.errors, ...validation.warnings].slice(0, 8).map((item) => <p key={item}>• {item}</p>)}
        </div>
      </div>
    </section>
  );
}

function DraftValidationPanel({ validation }: { validation: DraftValidation }) {
  const status = validation.errors.length > 0
    ? { label: 'Bloqueado por erros', tone: 'danger' as const }
    : validation.warnings.length > 0
      ? { label: 'Publicavel com avisos', tone: 'warning' as const }
      : { label: 'Pronto para publicar', tone: 'success' as const };
  const linkedImages = validation.imageSummary.linkedExact + validation.imageSummary.linkedTag + validation.imageSummary.linkedFallback;
  const missingImages = validation.imageSummary.noPublishedAsset + validation.imageSummary.missingLookup + validation.imageSummary.draftOnly;

  return (
    <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[11px] font-black uppercase text-muted-foreground">Status geral</p>
        <p className={`mt-2 text-lg font-black ${status.tone === 'danger' ? 'text-destructive' : status.tone === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`}>{status.label}</p>
        <p className="mt-2 text-xs font-bold text-muted-foreground">Produtos sem imagem nao bloqueiam publicacao, mas aparecerao com placeholder no tenant.</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[11px] font-black uppercase text-muted-foreground">Impacto do draft</p>
        <p className="mt-2 text-sm font-black text-foreground">{validation.totals.categories} categorias - {validation.totals.products} produtos</p>
        <p className="mt-1 text-xs font-bold text-muted-foreground">A v{validation.publishingVersionNumber} sera oficial apenas para futuras importacoes.</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[11px] font-black uppercase text-muted-foreground">Imagens</p>
        <p className="mt-2 text-sm font-black text-foreground">{linkedImages} com imagem - {missingImages} sem imagem pronta - {validation.imageSummary.linkedFallback} fallback</p>
        <p className="mt-1 text-xs font-bold text-muted-foreground">A Galeria Base continua sendo o local para publicar/substituir imagens.</p>
      </div>
      <ValidationList title="Erros bloqueantes" items={validation.errors} emptyText="Nenhum erro bloqueante." tone="danger" />
      <ValidationList title="Warnings" items={validation.warnings} emptyText="Nenhum aviso." tone="warning" wide />
    </section>
  );
}

function ValidationList({ title, items, emptyText, tone, wide }: { title: string; items: string[]; emptyText: string; tone: 'danger' | 'warning'; wide?: boolean }) {
  const color = tone === 'danger' ? 'text-destructive' : 'text-amber-600';
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <p className="text-[11px] font-black uppercase text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm font-bold text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="mt-2 max-h-44 space-y-1 overflow-auto text-xs font-bold">
          {items.map((item) => <p key={item} className={color}>- {item}</p>)}
        </div>
      )}
    </div>
  );
}

function DraftActionModal({ state, onClose, onDone }: { state: DraftActionModalState; onClose: () => void; onDone: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const isPublish = state.mode === 'publish';
  const expected = isPublish ? 'PUBLICAR' : 'DESCARTAR';
  const validation = state.draft.validation;
  const linkedImages = validation.imageSummary.linkedExact + validation.imageSummary.linkedTag + validation.imageSummary.linkedFallback;
  const missingImages = validation.imageSummary.noPublishedAsset + validation.imageSummary.missingLookup + validation.imageSummary.draftOnly;
  const canSubmit = confirmation.trim().toUpperCase() === expected && (!isPublish || validation.errors.length === 0);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (isPublish) {
        await api.post(`/admin/base-menus/${state.draft.template.slug}/publish-draft`);
      } else {
        await api.post(`/admin/base-menus/${state.draft.template.slug}/discard-draft`);
      }
      onDone();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase text-muted-foreground">{isPublish ? 'Confirmar publicacao' : 'Confirmar descarte'}</p>
            <h2 className="mt-1 text-xl font-black text-foreground">{state.draft.template.name}</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{state.draft.template.slug} - draft v{state.draft.version.versionNumber}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground hover:bg-muted">Fechar</button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Kpi label="Categorias" value={validation.totals.categories} />
          <Kpi label="Produtos" value={validation.totals.products} />
          <Kpi label="Sem imagem" value={missingImages} tone={missingImages > 0 ? 'warning' : 'success'} />
        </div>

        <div className="mt-4 rounded-xl border border-border bg-background p-4 text-sm font-bold text-muted-foreground">
          {isPublish ? (
            <>
              <p>Tenants novos passarao a importar esta nova versao.</p>
              <p>Tenants que ja importaram versoes antigas nao serao alterados.</p>
              <p>Esta acao nao edita cardapios reais de lojas.</p>
              <p>Imagens fallback: {validation.imageSummary.linkedFallback}. Imagens prontas: {linkedImages}.</p>
            </>
          ) : (
            <>
              <p>Todas as alteracoes desta versao draft serao perdidas.</p>
              <p>A versao publicada atual continuara ativa.</p>
              <p>Esta acao nao altera tenants nem cardapios reais de lojas.</p>
            </>
          )}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ValidationList title="Erros bloqueantes" items={validation.errors} emptyText="Nenhum erro bloqueante." tone="danger" />
          <ValidationList title="Warnings" items={validation.warnings} emptyText="Nenhum aviso." tone="warning" />
        </div>

        <label className="mt-4 block">
          <span className="text-[11px] font-black uppercase text-muted-foreground">Digite {expected} para confirmar</span>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:bg-muted">Cancelar</button>
          <button aria-label={isPublish ? 'Confirmar publicacao do draft' : 'Confirmar descarte do draft'} onClick={() => void submit()} disabled={!canSubmit || busy} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${isPublish ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-destructive hover:bg-destructive/90'}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isPublish ? <Send className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            {isPublish ? 'Publicar draft' : 'Descartar draft'}
          </button>
        </div>
      </section>
    </div>
  );
}

function TemplateForm({ draft, onSaved }: { draft: BaseMenuDraft; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(draft.template.name);
  const [description, setDescription] = useState(draft.template.description ?? '');
  const [segment, setSegment] = useState(draft.template.segment);
  const [icon, setIcon] = useState(draft.template.icon ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/admin/base-menus/${draft.template.slug}`, { name, description, segment, icon });
      await onSaved();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-xl border border-border bg-card p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_120px]">
        <Field label="Nome" value={name} onChange={setName} />
        <Field label="Segmento" value={segment} onChange={setSegment} />
        <Field label="Icone" value={icon} onChange={setIcon} />
      </div>
      <div className="mt-3">
        <Field label="Descricao" value={description} onChange={setDescription} />
      </div>
      <button disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar template
      </button>
    </form>
  );
}

function CategoryCreateForm({ draft, onSaved }: { draft: BaseMenuDraft; onSaved: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground"><Plus className="h-4 w-4" /> Categoria</button>;
  return (
    <form onSubmit={(event) => void submitCategoryCreate(event, draft, name, sortOrder, onSaved, () => { setName(''); setOpen(false); })} className="flex flex-wrap items-end gap-2">
      <Field label="Nova categoria" value={name} onChange={setName} />
      <Field label="Ordem" value={sortOrder} onChange={setSortOrder} type="number" />
      <button className="h-10 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground">Criar</button>
    </form>
  );
}

function CategoryEditor({ draft, category, canManage, onSaved }: { draft: BaseMenuDraft; category: BaseMenuCategory; canManage: boolean; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));

  return (
    <form onSubmit={(event) => void submitCategoryUpdate(event, draft, category, { name, description, sortOrder }, onSaved)} className="border-b border-border px-4 py-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_100px_190px]">
        <Field label="Categoria" value={name} onChange={setName} disabled={!canManage} />
        <Field label="Descricao" value={description} onChange={setDescription} disabled={!canManage} />
        <Field label="Ordem" value={sortOrder} onChange={setSortOrder} type="number" disabled={!canManage} />
        <div className="flex items-end gap-2">
          <button disabled={!canManage} className="h-10 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-50">Salvar</button>
          <button type="button" disabled={!canManage} onClick={() => void deleteCategory(draft, category, onSaved)} className="inline-flex h-10 items-center rounded-xl border border-destructive/30 px-3 text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </form>
  );
}

function ProductCreateForm({ draft, category, onSaved }: { draft: BaseMenuDraft; category: BaseMenuCategory; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState('');
  const [basePrice, setBasePrice] = useState('0');
  return (
    <form onSubmit={(event) => void submitProductCreate(event, draft, category, name, basePrice, onSaved, () => setName(''))} className="flex flex-wrap items-end gap-2 border-t border-border p-4">
      <Field label="Novo produto" value={name} onChange={setName} />
      <Field label="Preco" value={basePrice} onChange={setBasePrice} type="number" step="0.01" />
      <button className="h-10 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground">Criar produto</button>
    </form>
  );
}

function ProductEditor({ draft, product, canManage, onSaved }: { draft: BaseMenuDraft; product: BaseMenuProduct; canManage: boolean; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [basePrice, setBasePrice] = useState(String(product.basePrice));
  const [compareAtPrice, setCompareAtPrice] = useState(product.compareAtPrice === null ? '' : String(product.compareAtPrice));
  const [mediaLookupKey, setMediaLookupKey] = useState(product.mediaLookupKey ?? '');
  const [tags, setTags] = useState(product.searchTagsJson.join(', '));
  const [sortOrder, setSortOrder] = useState(String(product.sortOrder));

  return (
    <form onSubmit={(event) => void submitProductUpdate(event, draft, product, { name, description, basePrice, compareAtPrice, mediaLookupKey, tags, sortOrder }, onSaved)} className="grid gap-3 px-4 py-4 lg:grid-cols-[72px_1fr_140px_160px_150px]">
      <div>
        {product.publishedGlobalImage ? <img src={product.publishedGlobalImage.publicUrl} alt={product.publishedGlobalImage.altText ?? product.name} className="h-16 w-16 rounded-xl bg-muted object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-muted-foreground"><ImageOff className="h-6 w-6" /></div>}
      </div>
      <div className="grid gap-2">
        <Field label="Produto" value={name} onChange={setName} disabled={!canManage} />
        <Field label="Descricao" value={description} onChange={setDescription} disabled={!canManage} />
        <Field label="Tags" value={tags} onChange={setTags} disabled={!canManage} />
      </div>
      <div className="grid gap-2">
        <Field label="Preco" value={basePrice} onChange={setBasePrice} type="number" step="0.01" disabled={!canManage} />
        <Field label="Compare" value={compareAtPrice} onChange={setCompareAtPrice} type="number" step="0.01" disabled={!canManage} />
      </div>
      <div className="grid gap-2">
        <Field label="Lookup" value={mediaLookupKey} onChange={setMediaLookupKey} disabled={!canManage} />
        <Field label="Ordem" value={sortOrder} onChange={setSortOrder} type="number" disabled={!canManage} />
      </div>
      <div className="flex flex-col gap-2">
        <ImageStatusBadge status={product.imageStatus} />
        <button disabled={!canManage} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" /> Salvar</button>
        <button type="button" disabled={!canManage} onClick={() => void deleteProduct(draft, product, onSaved)} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-destructive/30 px-3 text-xs font-black text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /> Remover</button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, type = 'text', step, disabled }: { label: string; value: string; onChange: (value: string) => void; type?: string; step?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase text-muted-foreground">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} step={step} disabled={disabled} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
    </label>
  );
}

async function submitCategoryCreate(event: FormEvent, draft: BaseMenuDraft, name: string, sortOrder: string, onSaved: () => void | Promise<void>, afterSaved: () => void) {
  event.preventDefault();
  try {
    await api.post(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/categories`, { name, sortOrder: Number(sortOrder) });
    afterSaved();
    await onSaved();
  } catch (err) {
    window.alert(errorMessage(err));
  }
}

async function submitCategoryUpdate(event: FormEvent, draft: BaseMenuDraft, category: BaseMenuCategory, values: { name: string; description: string; sortOrder: string }, onSaved: () => void | Promise<void>) {
  event.preventDefault();
  try {
    await api.patch(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/categories/${category.id}`, { name: values.name, description: values.description, sortOrder: Number(values.sortOrder) });
    await onSaved();
  } catch (err) {
    window.alert(errorMessage(err));
  }
}

async function submitProductCreate(event: FormEvent, draft: BaseMenuDraft, category: BaseMenuCategory, name: string, basePrice: string, onSaved: () => void | Promise<void>, afterSaved: () => void) {
  event.preventDefault();
  try {
    await api.post(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/categories/${category.id}/products`, { name, basePrice: Number(basePrice) });
    afterSaved();
    await onSaved();
  } catch (err) {
    window.alert(errorMessage(err));
  }
}

async function submitProductUpdate(event: FormEvent, draft: BaseMenuDraft, product: BaseMenuProduct, values: { name: string; description: string; basePrice: string; compareAtPrice: string; mediaLookupKey: string; tags: string; sortOrder: string }, onSaved: () => void | Promise<void>) {
  event.preventDefault();
  try {
    await api.patch(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/products/${product.id}`, {
      name: values.name,
      description: values.description,
      basePrice: Number(values.basePrice),
      compareAtPrice: values.compareAtPrice.trim() ? Number(values.compareAtPrice) : null,
      mediaLookupKey: values.mediaLookupKey.trim() || null,
      searchTagsJson: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      sortOrder: Number(values.sortOrder),
    });
    await onSaved();
  } catch (err) {
    window.alert(errorMessage(err));
  }
}

async function deleteCategory(draft: BaseMenuDraft, category: BaseMenuCategory, onSaved: () => void | Promise<void>) {
  const force = category.products.length > 0;
  if (!window.confirm(force ? 'Remover categoria e seus produtos apenas deste draft?' : 'Remover categoria deste draft?')) return;
  try {
    await api.delete(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/categories/${category.id}${force ? '?force=true' : ''}`);
    await onSaved();
  } catch (err) {
    window.alert(errorMessage(err));
  }
}

async function deleteProduct(draft: BaseMenuDraft, product: BaseMenuProduct, onSaved: () => void | Promise<void>) {
  if (!window.confirm('Remover produto apenas deste draft?')) return;
  try {
    await api.delete(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/products/${product.id}`);
    await onSaved();
  } catch (err) {
    window.alert(errorMessage(err));
  }
}

function VersionsTab({ versions, currentVersionId }: { versions: BaseMenuVersionDetail[]; currentVersionId: string | null }) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 text-sm font-bold text-muted-foreground">
        Versoes antigas ficam como historico. Restaurar versao antiga sera um fluxo futuro.
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[100px_150px_150px_130px_130px_150px_180px] gap-3 border-b border-border px-4 py-3 text-[11px] font-black uppercase text-muted-foreground">
          <span>Versao</span>
          <span>Status</span>
          <span>Publicacao</span>
          <span>Categorias</span>
          <span>Produtos</span>
          <span>Cobertura</span>
          <span>Observacao</span>
        </div>
        {versions.map((version) => {
          const isCurrent = version.id === currentVersionId || version.isCurrentPublished;
          const totals = version.totals ?? { categories: 0, products: 0, linkedImages: 0, missingImages: 0, fallbackImages: 0 };
          return (
            <article key={version.id} className="grid grid-cols-[100px_150px_150px_130px_130px_150px_180px] gap-3 border-b border-border px-4 py-4 last:border-b-0">
              <span className="text-sm font-black text-foreground">v{version.versionNumber}</span>
              <div className="flex flex-wrap gap-1">
                <StatusPill status={version.status} />
                {isCurrent ? <span className="inline-flex h-8 items-center rounded-xl bg-emerald-500/10 px-3 text-xs font-black text-emerald-600">current</span> : null}
              </div>
              <span className="text-xs font-bold text-muted-foreground">{formatDate(version.publishedAt)}</span>
              <span className="text-sm font-black text-foreground">{totals.categories}</span>
              <span className="text-sm font-black text-foreground">{totals.products}</span>
              <CoverageBadge linked={totals.linkedImages} total={totals.products} />
              <span className="text-xs font-bold text-muted-foreground">{totals.fallbackImages} fallback</span>
            </article>
          );
        })}
        {versions.length === 0 ? <TableMessage icon={<ListChecks className="h-8 w-8" />} text="Nenhuma versao encontrada." /> : null}
      </div>
    </section>
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
      <ImageGroup title="Com imagem publicada" products={groups.linked} status="linked_exact" />
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
  const isLinked = ['linked_exact', 'linked_tag', 'linked_fallback'].includes(status);
  const color = isLinked
    ? 'bg-emerald-500/10 text-emerald-600'
    : status === 'draft_only'
      ? 'bg-amber-500/10 text-amber-600'
      : 'bg-destructive/10 text-destructive';
  return (
    <span className={`inline-flex h-8 items-center justify-center rounded-xl px-3 text-xs font-black ${color}`}>
      {isLinked ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
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

function CreateTemplateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [segment, setSegment] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post<{ template: { slug: string } }>('/admin/base-menus', {
        name,
        slug: slug.trim() || undefined,
        segment: segment.trim() || undefined,
      });
      await onDone();
      navigate(`/base-menus/${response.data.template.slug}/draft`);
      onClose();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-xl">
        <div className="border-b border-border p-5">
          <h2 className="text-xl font-black text-foreground">Novo Cardápio Base</h2>
          <p className="mt-1 text-sm font-bold text-muted-foreground">Cria um rascunho em branco.</p>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Nome" value={name} onChange={setName} />
          <Field label="Slug (opcional)" value={slug} onChange={setSlug} />
          <Field label="Segmento (ex: acai)" value={segment} onChange={setSegment} />
        </div>
        <div className="flex gap-2 border-t border-border bg-muted/40 p-5">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-border bg-background py-2 text-sm font-black text-foreground hover:bg-muted disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={busy || !name.trim()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2 text-sm font-black text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar
          </button>
        </div>
      </form>
    </div>
  );
}

function DuplicateTemplateModal({ sourceTemplateId, sourceTemplateName, onClose, onDone }: { sourceTemplateId: string; sourceTemplateName: string; onClose: () => void; onDone: (slug: string) => void }) {
  const [name, setName] = useState(`${sourceTemplateName} (Cópia)`);
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post<{ template: { slug: string } }>(`/admin/base-menus/${sourceTemplateId}/duplicate`, {
        name,
        slug: slug.trim() || undefined,
      });
      onDone(response.data.template.slug);
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-xl">
        <div className="border-b border-border p-5">
          <h2 className="text-xl font-black text-foreground">Duplicar Cardápio Base</h2>
          <p className="mt-1 text-sm font-bold text-muted-foreground">Isso criará uma cópia independente de todas as categorias e produtos.</p>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Novo Nome" value={name} onChange={setName} />
          <Field label="Novo Slug (opcional)" value={slug} onChange={setSlug} />
        </div>
        <div className="flex gap-2 border-t border-border bg-muted/40 p-5">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-border bg-background py-2 text-sm font-black text-foreground hover:bg-muted disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={busy || !name.trim()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2 text-sm font-black text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Duplicar
          </button>
        </div>
      </form>
    </div>
  );
}
