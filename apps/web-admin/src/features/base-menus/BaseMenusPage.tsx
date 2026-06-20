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
type TabId = 'products' | 'imports' | 'advanced';

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
  categoryId: string;
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

type ProductModalMode = 'create' | 'edit' | 'duplicate';

type ProductModalState = {
  mode: ProductModalMode;
  categoryId: string;
  product: BaseMenuProduct | null;
};

type GalleryAsset = PublishedGlobalImage & {
  tagsJson: string[];
  metadataJson: Record<string, unknown>;
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
  { id: 'products', label: 'Produtos' },
  { id: 'imports', label: 'Importações' },
  { id: 'advanced', label: 'Mais opções' },
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

      <section className="hidden rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-bold text-muted-foreground">
          Apenas templates publicados aparecem para tenants. Imagens em draft não são usadas na importação.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Templates" value={kpis.total} />
        <Kpi label="Publicados" value={kpis.published} tone="success" />
        <Kpi label="Drafts" value={kpis.draft} tone="warning" />
        <Kpi label="Arquivados" value={kpis.archived} />
        <Kpi label="Produtos" value={kpis.products} />
        <Kpi label="Sem imagem" value={kpis.imageIssues} tone={kpis.imageIssues > 0 ? 'danger' : 'success'} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[1fr_170px_180px_210px]">
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
          <label className="flex h-10 items-center gap-2 rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground whitespace-nowrap">
            <input type="checkbox" checked={onlyImageIssues} onChange={(event) => setOnlyImageIssues(event.target.checked)} />
            com pendência de imagem
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1.4fr_130px_120px_110px_110px_120px_150px_220px] gap-3 border-b border-border px-4 py-3 text-[11px] font-black uppercase text-muted-foreground">
              <span>Nome</span>
              <span>Segmento</span>
              <span>Status</span>
              <span>Versão</span>
              <span>Categorias</span>
              <span>Produtos</span>
              <span>Cobertura</span>
              <span>Ações</span>
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
          </div>
        </div>
      </section>

      {createOpen ? <CreateTemplateModal onClose={() => setCreateOpen(false)} onDone={loadItems} /> : null}
    </div>
  );
}

function DraftActionButton({ item, className }: { item: BaseMenuListItem; onDone?: () => void | Promise<void>; className?: string }) {
  const navigate = useNavigate();

  return (
    <button aria-label="Editar cardápio" onClick={() => navigate(`/base-menus/${item.slug}/draft`)} className={className ?? 'inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground'}>
      <Plus className="h-3.5 w-3.5" />
      Editar cardápio
    </button>
  );
}

type OptionItemDraft = {
  name: string;
  description: string;
  priceImpactValue: string;
  allowQuantity: boolean;
  minQty: string;
  maxQty: string;
  order: string;
  isActive: boolean;
};

type OptionGroupDraft = {
  name: string;
  description: string;
  selectionType: 'single' | 'multiple';
  isRequired: boolean;
  minSelect: string;
  maxSelect: string;
  order: string;
  isActive: boolean;
  items: OptionItemDraft[];
};

type BaseMediaPickerItem = {
  id: string;
  title: string | null;
  category: string | null;
  categoryName: string | null;
  publicUrl: string;
  altText: string | null;
  tagsJson: string[];
  publicationStatus: 'draft' | 'published' | 'archived';
  productName: string | null;
  mediaLookupKey: string | null;
};

function BaseMenuDraftEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const { has } = useAdminPermissions();
  const canManage = has('saas.base_menu.manage');
  const [draft, setDraft] = useState<BaseMenuDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<DraftActionModalState | null>(null);
  const [productModal, setProductModal] = useState<ProductModalState | null>(null);
  const [imagePickerProduct, setImagePickerProduct] = useState<BaseMenuProduct | null>(null);
  const [optionsProduct, setOptionsProduct] = useState<BaseMenuProduct | null>(null);

  async function loadDraft() {
    setLoading(true);
    setError(null);
    try {
      const response = canManage
        ? await api.post<BaseMenuDraft>(`/admin/base-menus/${id}/draft-version`)
        : await api.get<BaseMenuDraft>(`/admin/base-menus/${id}/draft`);
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
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-sm font-bold text-destructive">{error ?? 'Draft não encontrado.'}</div>
      </div>
    );
  }

  const orderedCategories = [...draft.categories].sort((left, right) => left.sortOrder - right.sortOrder);
  const primaryDraft = canManage ? (
    <DraftActionButton
      item={{
        id: draft.template.id,
        slug: draft.template.slug,
        name: draft.template.name,
        description: draft.template.description,
        segment: draft.template.segment,
        icon: draft.template.icon,
        status: draft.template.status,
        currentPublishedVersion: null,
        draftVersion: null,
        totalCategories: draft.validation.totals.categories,
        totalProducts: draft.validation.totals.products,
        totalProductsWithMediaLookupKey: 0,
        totalProductsWithPublishedGlobalImage: 0,
        totalProductsWithoutImage: 0,
        lastPublishedAt: draft.version.publishedAt,
        createdAt: draft.template.createdAt,
        updatedAt: draft.template.updatedAt,
      }}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
    />
  ) : null;

  return (
    <div className="relative isolate space-y-5 pb-10 lg:space-y-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.14),_transparent_44%),radial-gradient(circle_at_top_right,_rgba(15,23,42,0.08),_transparent_38%)]" />

      <button onClick={() => navigate(`/base-menus/${draft.template.slug}`)} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2 text-sm font-black text-muted-foreground backdrop-blur transition-colors hover:bg-background hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Voltar para detalhes
      </button>

      <section className="overflow-hidden rounded-[28px] border border-border/60 bg-card/95 p-5 shadow-[0_24px_80px_-45px_rgba(15,23,42,0.45)] backdrop-blur lg:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_360px] lg:items-stretch">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Cardápio em edição</span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-muted-foreground">{draft.validation.totals.products} produtos</span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-muted-foreground">{draft.validation.totals.categories} categorias</span>
            </div>
            <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-[3rem] lg:leading-[0.95]">{draft.template.icon ? `${draft.template.icon} ` : ''}{draft.template.name}</h1>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{draft.template.slug} · {draft.template.segment}</p>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">Edite produtos, imagens e complementos com uma experiência direta, sem expor a estrutura técnica do rascunho.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
              <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1">Alterações salvas no rascunho</span>
              <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1">Não afeta tenants existentes</span>
            </div>
          </div>
          <div className="rounded-[24px] border border-border/70 bg-background/85 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Ações rápidas</p>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">Fluxo simples</span>
            </div>
            <div className="mt-4 space-y-2">
              {primaryDraft}
              <Link to="/base-media" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-black text-foreground transition-colors hover:bg-muted">
                <ExternalLink className="h-4 w-4" />
                Abrir Galeria Base
              </Link>
              <button onClick={loadDraft} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-black text-foreground transition-colors hover:bg-muted">
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
              {canManage ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button aria-label="Descartar alterações" onClick={() => setModal({ draft, mode: 'discard' })} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-background px-3 text-xs font-black text-destructive transition-colors hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                    Descartar
                  </button>
                  <button aria-label="Publicar alterações" onClick={() => setModal({ draft, mode: 'publish' })} disabled={draft.validation.errors.length > 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-emerald-700 disabled:opacity-50">
                    <Send className="h-4 w-4" />
                    Publicar
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <p className="text-[11px] font-black uppercase tracking-wide">Alterações não publicadas</p>
        <p className="mt-1 text-sm font-bold">
          {draft.validation.errors.length > 0
            ? 'Existem erros que precisam ser corrigidos antes de publicar.'
            : draft.validation.warnings.length > 0
              ? 'A edição está pronta para publicar, com alguns avisos.'
              : 'A edição está pronta para publicar.'}
        </p>
        <p className="mt-2 text-xs font-semibold text-amber-900/80">Alterações aqui afetam apenas futuras importações deste Cardápio Pronto.</p>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Estrutura do cardápio</p>
              <h2 className="mt-1 text-lg font-black text-foreground">Categorias e produtos</h2>
            </div>
            {canManage ? <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">Edição ativa</span> : null}
          </div>
          <div className="mt-4">
            <TemplateForm draft={draft} onSaved={loadDraft} />
          </div>
        </div>

        {orderedCategories.map((category) => {
          const categoryProducts = [...category.products].sort((left, right) => left.sortOrder - right.sortOrder);
          const categoryIndex = orderedCategories.findIndex((item) => item.id === category.id);
          return (
            <div key={category.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-col gap-3 border-b border-border/70 bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black tracking-tight text-foreground">{category.name}</p>
                  <p className="text-xs font-bold text-muted-foreground">{categoryProducts.length} produtos nesta categoria</p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={categoryIndex <= 0} onClick={() => void moveCategoryInDraft(draft, category, -1)} className="rounded-full border border-border bg-background px-3 py-2 text-xs font-black text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                      Mover para cima
                    </button>
                    <button type="button" disabled={categoryIndex >= orderedCategories.length - 1} onClick={() => void moveCategoryInDraft(draft, category, 1)} className="rounded-full border border-border bg-background px-3 py-2 text-xs font-black text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                      Mover para baixo
                    </button>
                  </div>
                ) : null}
              </div>
              <CategoryEditor draft={draft} category={category} canManage={canManage} onSaved={loadDraft} />
              <div className="divide-y divide-border">
                {categoryProducts.map((product) => {
                  const groups = readOptionGroups(product);
                  const optionsLabel = groups.length === 0 ? 'Sem complementos' : `${groups.length} grupo${groups.length === 1 ? '' : 's'} de complementos`;
                  const imageLabel = product.imageStatus === 'linked_exact' || product.imageStatus === 'linked_tag' ? 'Imagem ok' : product.imageStatus === 'linked_fallback' ? 'Imagem fallback' : 'Sem imagem';
                  return (
                    <article key={product.id} className="grid gap-4 px-4 py-4 transition-colors hover:bg-muted/20 lg:grid-cols-[92px_minmax(0,1fr)_minmax(260px,320px)]">
                      <div className="flex items-start justify-start">
                        {product.publishedGlobalImage ? (
                          <img src={product.publishedGlobalImage.publicUrl} alt={product.publishedGlobalImage.altText ?? product.name} className="h-20 w-20 rounded-2xl object-cover bg-muted ring-1 ring-border/70" />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border/70">
                            <ImageOff className="h-7 w-7" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 self-center">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black tracking-tight text-foreground sm:text-base">{product.name}</p>
                            <p className="mt-1 text-xs font-bold leading-5 text-muted-foreground sm:text-sm">{product.description ?? 'Sem descrição'}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-xs font-black text-muted-foreground">{category.name}</span>
                            <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-black ${imageLabel === 'Sem imagem' ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>{imageLabel}</span>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
                          <span className="rounded-full bg-muted px-3 py-1">{formatMoney(product.basePrice)}</span>
                          {product.compareAtPrice !== null ? <span className="rounded-full bg-muted px-3 py-1">Promo: {formatMoney(product.compareAtPrice)}</span> : null}
                          <span className="rounded-full bg-muted px-3 py-1">{optionsLabel}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 self-center">
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                          <button type="button" onClick={() => setProductModal({ mode: 'edit', categoryId: product.categoryId, product })} className="rounded-full bg-primary px-3 py-2 text-xs font-black text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5">Editar</button>
                          <button type="button" onClick={() => setImagePickerProduct(product)} className="rounded-full border border-border bg-background px-3 py-2 text-xs font-black text-foreground transition-colors hover:bg-muted">Trocar imagem</button>
                          <button type="button" onClick={() => setOptionsProduct(product)} className="rounded-full border border-border bg-background px-3 py-2 text-xs font-black text-foreground transition-colors hover:bg-muted">Complementos</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                          <button type="button" onClick={() => setProductModal({ mode: 'duplicate', categoryId: product.categoryId, product })} className="rounded-full border border-border bg-background px-3 py-2 text-xs font-black text-foreground transition-colors hover:bg-muted">Duplicar</button>
                          <button type="button" onClick={() => void deleteProduct(draft, product, loadDraft)} className="rounded-full border border-destructive/30 bg-background px-3 py-2 text-xs font-black text-destructive transition-colors hover:bg-destructive/10">Excluir</button>
                          <button type="button" onClick={() => void moveProductInDraft(draft, product, -1)} className="rounded-full border border-border bg-background px-3 py-2 text-xs font-black text-foreground transition-colors hover:bg-muted">Mover para cima</button>
                          <button type="button" onClick={() => void moveProductInDraft(draft, product, 1)} className="rounded-full border border-border bg-background px-3 py-2 text-xs font-black text-foreground transition-colors hover:bg-muted">Mover para baixo</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {canManage ? <ProductCreateForm draft={draft} category={category} onSaved={loadDraft} /> : null}
            </div>
          );
        })}

        {canManage ? <DraftValidationPanel validation={draft.validation} /> : null}
      </section>

      {modal ? <DraftActionModal state={modal} onClose={() => setModal(null)} onDone={loadDraft} /> : null}
      {productModal ? <ProductEditorModal draft={draft} state={productModal} onClose={() => setProductModal(null)} onSaved={loadDraft} /> : null}
      {imagePickerProduct ? <ProductImagePickerModal draft={draft} product={imagePickerProduct} onClose={() => setImagePickerProduct(null)} onSaved={loadDraft} /> : null}
      {optionsProduct ? <ProductOptionsModal draft={draft} product={optionsProduct} onClose={() => setOptionsProduct(null)} onSaved={loadDraft} /> : null}
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

  return (
    <div className="relative isolate space-y-5 pb-10 lg:space-y-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.12),_transparent_42%),radial-gradient(circle_at_top_right,_rgba(15,23,42,0.08),_transparent_36%)]" />

      <button onClick={() => navigate('/base-menus')} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2 text-sm font-black text-muted-foreground backdrop-blur transition-colors hover:bg-background hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Voltar para Cardápios Base
      </button>

      <section className="overflow-hidden rounded-[28px] border border-border/60 bg-card/95 p-5 shadow-[0_24px_80px_-45px_rgba(15,23,42,0.45)] backdrop-blur lg:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_360px] lg:items-stretch">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Cardápio Base</span>
              <StatusPill status={detail.template.status} />
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-muted-foreground">{detail.currentPublishedVersion ? `v${detail.currentPublishedVersion.versionNumber}` : 'sem versão publicada'}</span>
            </div>
            <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-[3rem] lg:leading-[0.95]">{detail.template.icon ? `${detail.template.icon} ` : ''}{detail.template.name}</h1>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{detail.template.slug} · {detail.template.segment}</p>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">Este modelo é usado como ponto de partida. Alterações futuras no modelo não alteram cardápios já importados.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
              <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1">Alterações salvas no rascunho</span>
              <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1">Não afeta tenants existentes</span>
            </div>
          </div>
          <div className="rounded-[24px] border border-border/70 bg-background/85 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Ações rápidas</p>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">Fluxo simples</span>
            </div>
            <div className="mt-4 space-y-2">
              {canManage ? (
                <DraftActionButton
                  item={{
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
                  }}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
                />
              ) : null}
              <Link to="/base-media" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-black text-foreground transition-colors hover:bg-muted">
                <ExternalLink className="h-4 w-4" />
                Abrir Galeria Base
              </Link>
              <button onClick={loadDetail} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-black text-foreground transition-colors hover:bg-muted">
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
              {canManage ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button aria-label="Duplicar cardápio" onClick={() => setDuplicateOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 text-xs font-black text-foreground transition-colors hover:bg-muted">
                    <Copy className="h-4 w-4" />
                    Duplicar
                  </button>
                  {detail.template.status === 'archived' ? (
                    <button aria-label="Restaurar cardápio" onClick={() => void handleRestore()} disabled={actionBusy} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 text-xs font-black text-foreground transition-colors hover:bg-muted disabled:opacity-60">
                      <Undo2 className="h-4 w-4" />
                      Restaurar
                    </button>
                  ) : (
                    <button aria-label="Arquivar cardápio" onClick={() => void handleArchive()} disabled={actionBusy} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 text-xs font-black text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60">
                      <Archive className="h-4 w-4" />
                      Arquivar
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <p className="text-[11px] font-black uppercase tracking-wide">Alterações não publicadas</p>
        <p className="mt-1 text-sm font-bold">
          {detail.draftVersion
            ? 'Existe uma versão em edição. Você pode alterar produtos, imagens e complementos e publicar quando estiver pronto.'
            : 'Nenhuma alteração pendente no momento. Clique em Editar cardápio para abrir ou continuar a edição.'}
        </p>
        <p className="mt-2 text-xs font-semibold text-amber-900/80">Alterações aqui afetam apenas futuras importações deste Cardápio Pronto.</p>
      </section>

      <nav className="flex gap-2 overflow-x-auto border-b border-border pb-1 pl-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-black transition-colors ${tab === item.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'products' ? <ProductsTab categories={detail.categories} /> : null}
      {tab === 'imports' ? <ImportsTab logs={logs} /> : null}
      {tab === 'advanced' ? <AdvancedTab detail={detail} versions={versions} imageGroups={imageGroups} /> : null}

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
          {[...validation.errors, ...validation.warnings].slice(0, 8).map((item) => <p key={item}>- {item}</p>)}
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
      <section className="my-3 w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:my-6">
        <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase text-muted-foreground">{isPublish ? 'Confirmar publicacao' : 'Confirmar descarte'}</p>
            <h2 className="mt-1 text-xl font-black text-foreground">{state.draft.template.name}</h2>
            <p className="mt-1 text-sm font-bold text-muted-foreground">Confirme a acao para alterar o Cardapio Base.</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground hover:bg-muted">Fechar</button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:bg-muted">Cancelar</button>
          <button aria-label={isPublish ? 'Confirmar publicacao' : 'Confirmar descarte'} onClick={() => void submit()} disabled={!canSubmit || busy} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${isPublish ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-destructive hover:bg-destructive/90'}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isPublish ? <Send className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            {isPublish ? 'Publicar alterações' : 'Descartar alterações'}
          </button>
        </div>
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

async function moveProductInDraft(draft: BaseMenuDraft, product: BaseMenuProduct, direction: -1 | 1) {
  const category = draft.categories.find((item) => item.id === product.categoryId);
  if (!category) return;
  const products = [...category.products].sort((left, right) => left.sortOrder - right.sortOrder);
  const index = products.findIndex((item) => item.id === product.id);
  const targetIndex = index + direction;
  const target = products[targetIndex];
  if (!target) return;

  await Promise.all([
    api.patch(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/products/${product.id}`, {
      sortOrder: target.sortOrder,
    }),
    api.patch(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/products/${target.id}`, {
      sortOrder: product.sortOrder,
    }),
  ]);
}

async function duplicateProductInDraft(draft: BaseMenuDraft, product: BaseMenuProduct) {
  const category = draft.categories.find((item) => item.id === product.categoryId);
  if (!category) return;
  await api.post(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/categories/${category.id}/products`, {
    name: `${product.name} - cópia`,
    description: product.description,
    basePrice: product.basePrice,
    compareAtPrice: product.compareAtPrice,
    sortOrder: product.sortOrder + 1,
    mediaLookupKey: product.mediaLookupKey,
    searchTagsJson: product.searchTagsJson,
    metadataJson: product.metadataJson,
  });
}

async function moveCategoryInDraft(draft: BaseMenuDraft, category: BaseMenuCategory, direction: -1 | 1) {
  const categories = [...draft.categories].sort((left, right) => left.sortOrder - right.sortOrder);
  const index = categories.findIndex((item) => item.id === category.id);
  const targetIndex = index + direction;
  const target = categories[targetIndex];
  if (!target) return;

  await Promise.all([
    api.patch(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/categories/${category.id}`, {
      name: category.name,
      description: category.description,
      sortOrder: target.sortOrder,
    }),
    api.patch(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/categories/${target.id}`, {
      name: target.name,
      description: target.description,
      sortOrder: category.sortOrder,
    }),
  ]);
}

function readOptionGroups(product: BaseMenuProduct): OptionGroupDraft[] {
  const metadata = isRecord(product.metadataJson) ? product.metadataJson : null;
  const optionGroups = metadata && Array.isArray(metadata.optionGroups) ? metadata.optionGroups : [];
  if (!Array.isArray(optionGroups)) return [];

  return optionGroups
    .map((group): OptionGroupDraft | null => {
      if (!isRecord(group) || typeof group.name !== 'string') return null;
      const items = Array.isArray(group.items) ? group.items : [];
      return {
        name: group.name,
        description: typeof group.description === 'string' ? group.description : '',
        selectionType: group.selectionType === 'single' ? 'single' : 'multiple',
        isRequired: group.isRequired === true,
        minSelect: numberValue(group.minSelect, '0'),
        maxSelect: numberValue(group.maxSelect, '1'),
        order: numberValue(group.order, '0'),
        isActive: group.isActive !== false,
        items: items
          .map((item): OptionItemDraft | null => {
            if (!isRecord(item) || typeof item.name !== 'string') return null;
            return {
              name: item.name,
              description: typeof item.description === 'string' ? item.description : '',
              priceImpactValue: String(typeof item.priceImpactValue === 'number' || typeof item.priceImpactValue === 'string' ? item.priceImpactValue : 0),
              allowQuantity: item.allowQuantity === true,
              minQty: typeof item.minQty === 'number' ? String(item.minQty) : '',
              maxQty: typeof item.maxQty === 'number' ? String(item.maxQty) : '',
              order: numberValue(item.order, '0'),
              isActive: item.isActive !== false,
            };
          })
          .filter((item): item is OptionItemDraft => item !== null),
      };
    })
    .filter((group): group is OptionGroupDraft => group !== null);
}

function buildOptionGroupsPayload(groups: OptionGroupDraft[]): Record<string, unknown> {
  return {
    optionGroups: groups.map((group, groupIndex) => ({
      name: group.name,
      description: group.description || undefined,
      selectionType: group.selectionType,
      isRequired: group.isRequired,
      minSelect: Math.max(0, Number(group.minSelect) || 0),
      maxSelect: Math.max(1, Number(group.maxSelect) || 1),
      order: Number(group.order) || groupIndex + 1,
      isActive: group.isActive,
      items: group.items.map((item, itemIndex) => ({
        name: item.name,
        description: item.description || undefined,
        priceImpactValue: Number(item.priceImpactValue) || 0,
        allowQuantity: item.allowQuantity,
        minQty: item.minQty.trim() ? Number(item.minQty) : undefined,
        maxQty: item.maxQty.trim() ? Number(item.maxQty) : undefined,
        order: Number(item.order) || itemIndex + 1,
        isActive: item.isActive,
      })),
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown, fallback: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback;
}

function blankOptionGroup(index: number): OptionGroupDraft {
  return {
    name: '',
    description: '',
    selectionType: 'multiple',
    isRequired: false,
    minSelect: '0',
    maxSelect: '1',
    order: String(index + 1),
    isActive: true,
    items: [blankOptionItem(1)],
  };
}

function blankOptionItem(index: number): OptionItemDraft {
  return {
    name: '',
    description: '',
    priceImpactValue: '0',
    allowQuantity: false,
    minQty: '',
    maxQty: '',
    order: String(index),
    isActive: true,
  };
}

function ProductEditorModal({
  draft,
  state,
  onClose,
  onSaved,
}: {
  draft: BaseMenuDraft;
  state: ProductModalState;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const product = state.product;
  const [name, setName] = useState(product ? (state.mode === 'duplicate' ? `${product.name} - cópia` : product.name) : '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [basePrice, setBasePrice] = useState(product ? String(product.basePrice) : '');
  const [compareAtPrice, setCompareAtPrice] = useState(product?.compareAtPrice === null || product?.compareAtPrice === undefined ? '' : String(product.compareAtPrice));
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? state.categoryId);
  const [sortOrder, setSortOrder] = useState(product ? String(product.sortOrder) : '1');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = {
        name,
        description: description.trim() || undefined,
        basePrice: Number(basePrice),
        compareAtPrice: compareAtPrice.trim() ? Number(compareAtPrice) : null,
        sortOrder: Number(sortOrder),
        categoryId,
      };
      if (state.mode === 'edit' && product) {
        await api.patch(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/products/${product.id}`, body);
      } else {
        await api.post(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/categories/${categoryId}/products`, {
          ...body,
          name: state.mode === 'duplicate' && product ? body.name : body.name,
          mediaLookupKey: product?.mediaLookupKey ?? null,
          searchTagsJson: product?.searchTagsJson ?? [],
          metadataJson: product?.metadataJson ?? null,
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
      <form onSubmit={(event) => void submit(event)} className="my-3 w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:my-6">
        <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="border-b border-border p-5">
          <p className="text-[11px] font-black uppercase text-muted-foreground">
            {state.mode === 'edit' ? 'Editar produto' : state.mode === 'duplicate' ? 'Duplicar produto' : 'Novo produto'}
          </p>
          <h2 className="mt-1 text-xl font-black text-foreground">{product?.name ?? 'Produto novo'}</h2>
          <p className="mt-1 text-sm font-bold text-muted-foreground">Imagem e complementos são editados pelos atalhos próprios na lista.</p>
        </div>
        <div className="grid gap-4 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome" value={name} onChange={setName} />
            <label className="block">
              <span className="text-[11px] font-black uppercase text-muted-foreground">Categoria</span>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                {draft.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Field label="Descricao" value={description} onChange={setDescription} />
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Preco" value={basePrice} onChange={setBasePrice} type="number" step="0.01" />
            <Field label="Preco promocional" value={compareAtPrice} onChange={setCompareAtPrice} type="number" step="0.01" />
            <Field label="Ordem" value={sortOrder} onChange={setSortOrder} type="number" />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/20 p-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:bg-muted">
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-50">
            <Save className="h-4 w-4" />
            {state.mode === 'edit' ? 'Salvar alterações' : 'Criar produto'}
          </button>
        </div>
        </div>
      </form>
    </div>
  );
}

function ProductImagePickerModal({
  draft,
  product,
  onClose,
  onSaved,
}: {
  draft: BaseMenuDraft;
  product: BaseMenuProduct;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [items, setItems] = useState<BaseMediaPickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '24', status: 'published' });
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      const response = await api.get<{ items: BaseMediaPickerItem[]; totalPages: number }>(`/admin/base-media?${params.toString()}`);
      setItems(response.data.items);
      setTotalPages(response.data.totalPages || 1);
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, search, category]);

  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.categoryName ?? item.category).filter((value): value is string => Boolean(value)))).sort(), [items]);

  async function saveImage(asset: BaseMediaPickerItem | null) {
    try {
      await api.patch(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/products/${product.id}`, {
        mediaLookupKey: asset?.mediaLookupKey ?? null,
        searchTagsJson: asset?.tagsJson ?? [],
      });
      await onSaved();
      onClose();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
      <section className="my-3 w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:my-6">
        <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="border-b border-border p-5">
          <p className="text-[11px] font-black uppercase text-muted-foreground">Trocar imagem</p>
          <h2 className="mt-1 text-xl font-black text-foreground">{product.name}</h2>
          <p className="mt-1 text-sm font-bold text-muted-foreground">Selecione uma imagem publicada da Galeria Base.</p>
        </div>
        <div className="grid gap-3 border-b border-border p-5 md:grid-cols-[1fr_220px_140px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Buscar na Galeria Base" />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
            <option value="">Todas categorias</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void load()} className="h-10 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground">
            Filtrar
          </button>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          <button type="button" onClick={() => void saveImage(null)} className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" />
            <span className="mt-2 text-sm font-black text-foreground">Remover imagem</span>
            <span className="mt-1 text-xs font-bold text-muted-foreground">Volta para placeholder</span>
          </button>
          {loading ? <div className="col-span-full py-8 text-center text-sm font-bold text-muted-foreground">Carregando imagens...</div> : null}
          {!loading && items.map((item) => (
            <button key={item.id} type="button" onClick={() => void saveImage(item)} className="overflow-hidden rounded-xl border border-border bg-background text-left hover:bg-muted">
              <img src={item.publicUrl} alt={item.altText ?? item.title ?? 'Imagem'} className="h-48 w-full object-cover" />
              <div className="space-y-1 p-3">
                <p className="truncate text-sm font-black text-foreground">{item.productName ?? item.title ?? 'Sem nome'}</p>
                <p className="truncate text-xs font-bold text-muted-foreground">{item.mediaLookupKey ?? 'Sem lookup'}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground disabled:opacity-50">Anterior</button>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= totalPages} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground disabled:opacity-50">Próxima</button>
            <button type="button" onClick={onClose} className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground">Fechar</button>
          </div>
        </div>
        </div>
      </section>
    </div>
  );
}

function ProductOptionsModal({
  draft,
  product,
  onClose,
  onSaved,
}: {
  draft: BaseMenuDraft;
  product: BaseMenuProduct;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [groups, setGroups] = useState<OptionGroupDraft[]>(() => {
    const initial = readOptionGroups(product);
    return initial.length > 0 ? initial : [blankOptionGroup(0)];
  });
  const [busy, setBusy] = useState(false);

  function updateGroup(index: number, patch: Partial<OptionGroupDraft>) {
    setGroups((current) => current.map((group, groupIndex) => (groupIndex === index ? { ...group, ...patch } : group)));
  }

  function updateItem(groupIndex: number, itemIndex: number, patch: Partial<OptionItemDraft>) {
    setGroups((current) =>
      current.map((group, currentGroupIndex) => {
        if (currentGroupIndex !== groupIndex) return group;
        return {
          ...group,
          items: group.items.map((item, currentItemIndex) => (currentItemIndex === itemIndex ? { ...item, ...patch } : item)),
        };
      }),
    );
  }

  function moveGroup(index: number, direction: -1 | 1) {
    setGroups((current) => {
      const next = [...current];
      const target = index + direction;
      if (!next[target]) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function moveItem(groupIndex: number, itemIndex: number, direction: -1 | 1) {
    setGroups((current) =>
      current.map((group, currentGroupIndex) => {
        if (currentGroupIndex !== groupIndex) return group;
        const nextItems = [...group.items];
        const target = itemIndex + direction;
        if (!nextItems[target]) return group;
        [nextItems[itemIndex], nextItems[target]] = [nextItems[target], nextItems[itemIndex]];
        return { ...group, items: nextItems };
      }),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/admin/base-menus/${draft.template.slug}/versions/${draft.version.id}/products/${product.id}`, {
        metadataJson: buildOptionGroupsPayload(groups),
      });
      await onSaved();
      onClose();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
      <form onSubmit={(event) => void submit(event)} className="my-3 w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:my-6">
        <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="border-b border-border p-5">
          <p className="text-[11px] font-black uppercase text-muted-foreground">Complementos do produto</p>
          <h2 className="mt-1 text-xl font-black text-foreground">{product.name}</h2>
          <p className="mt-1 text-sm font-bold text-muted-foreground">Edite grupos e itens sem ver JSON cru.</p>
        </div>
        <div className="space-y-4 p-5">
          {groups.map((group, groupIndex) => (
            <div key={`${groupIndex}-${group.name || 'grupo'}`} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="grid flex-1 gap-3 md:grid-cols-2">
                  <Field label="Grupo" value={group.name} onChange={(value) => updateGroup(groupIndex, { name: value })} />
                  <Field label="Descricao" value={group.description} onChange={(value) => updateGroup(groupIndex, { description: value })} />
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button type="button" onClick={() => moveGroup(groupIndex, -1)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-black text-foreground hover:bg-muted">Mover para cima</button>
                  <button type="button" onClick={() => moveGroup(groupIndex, 1)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-black text-foreground hover:bg-muted">Mover para baixo</button>
                  <button type="button" onClick={() => setGroups((current) => current.filter((_, currentIndex) => currentIndex !== groupIndex))} className="rounded-xl border border-destructive/30 bg-background px-3 py-2 text-xs font-black text-destructive hover:bg-destructive/10">Remover grupo</button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <label className="block">
                  <span className="text-[11px] font-black uppercase text-muted-foreground">Selecao</span>
                  <select value={group.selectionType} onChange={(event) => updateGroup(groupIndex, { selectionType: event.target.value === 'single' ? 'single' : 'multiple' })} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="single">Escolha única</option>
                    <option value="multiple">Múltipla escolha</option>
                  </select>
                </label>
                <label className="flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-bold text-foreground">
                  <input type="checkbox" checked={group.isRequired} onChange={(event) => updateGroup(groupIndex, { isRequired: event.target.checked })} />
                  Obrigatório
                </label>
                <Field label="Minimo" value={group.minSelect} onChange={(value) => updateGroup(groupIndex, { minSelect: value })} type="number" />
                <Field label="Maximo" value={group.maxSelect} onChange={(value) => updateGroup(groupIndex, { maxSelect: value })} type="number" />
                <Field label="Ordem" value={group.order} onChange={(value) => updateGroup(groupIndex, { order: value })} type="number" />
                <label className="flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-bold text-foreground">
                  <input type="checkbox" checked={group.isActive} onChange={(event) => updateGroup(groupIndex, { isActive: event.target.checked })} />
                  Ativo
                </label>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-foreground">Itens</p>
                  <button type="button" onClick={() => updateGroup(groupIndex, { items: [...group.items, blankOptionItem(group.items.length + 1)] })} className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground">Adicionar item</button>
                </div>
                <div className="space-y-3">
                  {group.items.map((item, itemIndex) => (
                    <div key={`${groupIndex}-${itemIndex}-${item.name || 'item'}`} className="rounded-xl border border-border bg-card p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Item" value={item.name} onChange={(value) => updateItem(groupIndex, itemIndex, { name: value })} />
                        <Field label="Descricao" value={item.description} onChange={(value) => updateItem(groupIndex, itemIndex, { description: value })} />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <Field label="Preco adicional" value={item.priceImpactValue} onChange={(value) => updateItem(groupIndex, itemIndex, { priceImpactValue: value })} type="number" step="0.01" />
                        <Field label="Ordem" value={item.order} onChange={(value) => updateItem(groupIndex, itemIndex, { order: value })} type="number" />
                        <Field label="Qtd minima" value={item.minQty} onChange={(value) => updateItem(groupIndex, itemIndex, { minQty: value })} type="number" />
                        <Field label="Qtd maxima" value={item.maxQty} onChange={(value) => updateItem(groupIndex, itemIndex, { maxQty: value })} type="number" />
                        <label className="flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-bold text-foreground">
                          <input type="checkbox" checked={item.allowQuantity} onChange={(event) => updateItem(groupIndex, itemIndex, { allowQuantity: event.target.checked })} />
                          Permite quantidade
                        </label>
                        <label className="flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-bold text-foreground">
                          <input type="checkbox" checked={item.isActive} onChange={(event) => updateItem(groupIndex, itemIndex, { isActive: event.target.checked })} />
                          Ativo
                        </label>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => moveItem(groupIndex, itemIndex, -1)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-black text-foreground hover:bg-muted">Mover para cima</button>
                        <button type="button" onClick={() => moveItem(groupIndex, itemIndex, 1)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-black text-foreground hover:bg-muted">Mover para baixo</button>
                        <button type="button" onClick={() => updateGroup(groupIndex, { items: group.items.filter((_, currentIndex) => currentIndex !== itemIndex) })} className="rounded-xl border border-destructive/30 bg-background px-3 py-2 text-xs font-black text-destructive hover:bg-destructive/10">Remover item</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={() => setGroups((current) => [...current, blankOptionGroup(current.length)])} className="rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm font-black text-foreground hover:bg-muted">
            + Adicionar grupo
          </button>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/20 p-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:bg-muted">Cancelar</button>
          <button type="submit" disabled={busy} className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-50">
            <Save className="mr-2 inline h-4 w-4" />
            Salvar complementos
          </button>
        </div>
        </div>
      </form>
    </div>
  );
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

function AdvancedTab({ detail, versions, imageGroups }: { detail: BaseMenuDetail; versions: BaseMenuVersionDetail[]; imageGroups: { linked: BaseMenuProduct[]; draftOnly: BaseMenuProduct[]; noAsset: BaseMenuProduct[]; noLookup: BaseMenuProduct[] } }) {

  return (
    <section className="space-y-4">
      <details className="rounded-xl border border-border bg-card p-4" open>
        <summary className="cursor-pointer text-sm font-black text-foreground">Imagens</summary>
        <div className="mt-4">
          <ImagesTab groups={imageGroups} />
        </div>
      </details>
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-black text-foreground">Versões</summary>
        <div className="mt-4">
          <VersionsTab versions={versions} currentVersionId={detail.currentPublishedVersion?.id ?? null} />
        </div>
      </details>
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-black text-foreground">Metadados</summary>
        <div className="mt-4">
          <MetadataTab detail={detail} />
        </div>
      </details>
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

function getErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { status?: unknown };
  return typeof candidate.status === 'number' ? candidate.status : null;
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
      <form onSubmit={(event) => void submit(event)} className="my-3 w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-xl sm:my-6">
        <div className="border-b border-border p-5">
          <h2 className="text-xl font-black text-foreground">Novo Cardápio Base</h2>
          <p className="mt-1 text-sm font-bold text-muted-foreground">Cria um rascunho em branco.</p>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Nome" value={name} onChange={setName} />
          <Field label="Slug (opcional)" value={slug} onChange={setSlug} />
          <Field label="Segmento (ex: acai)" value={segment} onChange={setSegment} />
        </div>
        <div className="flex flex-col gap-2 border-t border-border bg-muted/40 p-5 sm:flex-row">
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
  const [name, setName] = useState(`${sourceTemplateName} (cópia)`);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
      <form onSubmit={(event) => void submit(event)} className="my-3 w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-xl sm:my-6">
        <div className="border-b border-border p-5">
          <h2 className="text-xl font-black text-foreground">Duplicar Cardápio Base</h2>
          <p className="mt-1 text-sm font-bold text-muted-foreground">Isso criará uma cópia independente de todas as categorias e produtos.</p>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Novo Nome" value={name} onChange={setName} />
          <Field label="Novo Slug (opcional)" value={slug} onChange={setSlug} />
        </div>
        <div className="flex flex-col gap-2 border-t border-border bg-muted/40 p-5 sm:flex-row">
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

