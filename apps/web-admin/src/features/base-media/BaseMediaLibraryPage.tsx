import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Eye,
  FileClock,
  Image,
  RefreshCw,
  RotateCcw,
  Search,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { useAdminPermissions } from '../../hooks/use-admin-auth';

type PublicationStatus = 'draft' | 'published' | 'archived';

type BaseMediaItem = {
  id: string;
  title: string | null;
  category: string | null;
  categoryName: string | null;
  filename: string;
  publicUrl: string;
  altText: string | null;
  tagsJson: string[];
  metadataJson: Record<string, unknown>;
  publicationStatus: PublicationStatus;
  createdAt: string;
  updatedAt: string;
  productName: string | null;
  prompt: string | null;
  negativePrompt: string | null;
  mediaLookupKey: string | null;
  usage_count: number;
};

type BaseMediaHistory = {
  id: string;
  action: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userType: string;
  ip: string | null;
  createdAt: string;
  details: Record<string, unknown> | null;
};

type BaseMediaDetail = BaseMediaItem & {
  history: BaseMediaHistory[];
};

type PaginatedResponse = {
  items: BaseMediaItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

const statusLabels: Record<PublicationStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};

export function BaseMediaLibraryPage() {
  const { has } = useAdminPermissions();
  const canManage = has('saas.base_media.manage');
  const [items, setItems] = useState<BaseMediaItem[]>([]);
  const [detail, setDetail] = useState<BaseMediaDetail | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const categories = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.categoryName ?? item.category).filter((value): value is string => Boolean(value)))).sort();
  }, [items]);

  async function loadItems() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '24',
      });
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      if (status) params.set('status', status);
      if (tag.trim()) params.set('tag', tag.trim());

      const response = await api.get<PaginatedResponse>(`/admin/base-media?${params.toString()}`);
      setItems(response.data.items);
      setTotalPages(response.data.totalPages || 1);
      setTotal(response.data.total);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    const response = await api.get<BaseMediaDetail>(`/admin/base-media/${id}`);
    setDetail(response.data);
  }

  async function action(id: string, name: 'publish' | 'unpublish' | 'archive' | 'restore') {
    await api.post(`/admin/base-media/${id}/${name}`);
    await loadItems();
    await loadDetail(id).catch(() => setDetail(null));
  }

  async function bulk(name: 'bulk-publish' | 'bulk-unpublish' | 'bulk-archive') {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Confirmar ação em ${selectedIds.length} imagens selecionadas?`)) return;
    await api.post(`/admin/base-media/${name}`, { ids: selectedIds });
    setSelectedIds([]);
    await loadItems();
  }

  async function replaceSelected() {
    if (!detail || !replaceFile) return;
    const form = new FormData();
    form.set('file', replaceFile);
    await api.upload(`/admin/base-media/${detail.id}/replace`, form);
    setReplaceFile(null);
    await loadItems();
    await loadDetail(detail.id).catch(() => setDetail(null));
  }

  useEffect(() => {
    void loadItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadItems]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Galeria Base</h1>
          <p className="mt-1 text-sm font-bold text-muted-foreground">
            Revisão e publicação das imagens importadas para o Cardápio Base.
          </p>
        </div>
        <button
          type="button"
          onClick={loadItems}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-black text-foreground hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[1fr_180px_170px_180px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Buscar por produto, lookup, categoria..."
            />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
            <option value="">Todas categorias</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
            <option value="">Todos status</option>
            <option value="draft">Rascunho</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado</option>
          </select>
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="tag exata"
          />
          <button type="button" onClick={() => { setPage(1); void loadItems(); }} className="h-10 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground">
            Filtrar
          </button>
        </div>
      </section>

      {canManage && selectedIds.length > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-4">
          <span className="text-sm font-black text-primary">{selectedIds.length} selecionadas</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => bulk('bulk-publish')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Publicar selecionadas</button>
            <button onClick={() => bulk('bulk-unpublish')} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-amber-950">Despublicar selecionadas</button>
            <button onClick={() => bulk('bulk-archive')} className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-black text-white">Arquivar selecionadas</button>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_420px]">
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[42px_84px_1fr_150px_120px_90px_110px] gap-3 border-b border-border px-4 py-3 text-[11px] font-black uppercase text-muted-foreground">
                <span />
                <span>Preview</span>
                <span>Produto</span>
                <span>Categoria</span>
                <span>Status</span>
                <span>Uso</span>
                <span>Ações</span>
              </div>
              {items.map((item) => (
                <article key={item.id} className="grid grid-cols-[42px_84px_1fr_150px_120px_90px_110px] gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="mt-8 h-4 w-4" />
                  <img src={item.publicUrl} alt={item.altText ?? item.productName ?? 'Imagem'} className="h-20 w-20 rounded-xl object-cover bg-muted" />
                  <div className="min-w-0 py-1">
                    <p className="truncate text-sm font-black text-foreground">{item.productName ?? item.title ?? 'Sem nome'}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{item.mediaLookupKey}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.tagsJson.slice(0, 4).map((entry) => (
                        <span key={entry} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{entry}</span>
                      ))}
                    </div>
                  </div>
                  <div className="py-1 text-sm font-bold text-foreground">{item.categoryName ?? item.category ?? '-'}</div>
                  <StatusPill status={item.publicationStatus} />
                  <div className="py-1 text-sm font-black text-foreground">{item.usage_count}</div>
                  <div className="flex items-start gap-2 py-1">
                    <button onClick={() => loadDetail(item.id)} className="rounded-lg bg-muted p-2 text-foreground hover:bg-primary hover:text-primary-foreground" title="Detalhes">
                      <Eye className="h-4 w-4" />
                    </button>
                    {canManage ? <ActionButtons item={item} onAction={action} /> : null}
                  </div>
                </article>
              ))}
              {items.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  <Image className="mx-auto mb-3 h-10 w-10 opacity-50" />
                  <p className="text-sm font-bold">Nenhuma imagem base encontrada.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-border bg-card p-5">
          {detail ? (
            <div className="space-y-5">
              <img src={detail.publicUrl} alt={detail.altText ?? detail.productName ?? 'Imagem'} className="aspect-square w-full rounded-2xl object-cover bg-muted" />
              <div>
                <p className="text-lg font-black text-foreground">{detail.productName ?? detail.title}</p>
                <p className="font-mono text-xs text-muted-foreground">{detail.mediaLookupKey}</p>
              </div>
              <StatusPill status={detail.publicationStatus} />
              <DetailBlock title="Prompt" text={detail.prompt ?? '-'} />
              <DetailBlock title="Negative prompt" text={detail.negativePrompt ?? '-'} />
              <DetailBlock title="Metadata" text={JSON.stringify(detail.metadataJson, null, 2)} mono />
              {canManage ? (
                <div className="space-y-2 rounded-xl border border-border p-3">
                  <p className="text-xs font-black uppercase text-muted-foreground">Substituir imagem</p>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setReplaceFile(event.target.files?.[0] ?? null)} className="w-full text-xs" />
                  <button disabled={!replaceFile} onClick={replaceSelected} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-50">
                    <UploadCloud className="h-4 w-4" />
                    Enviar nova versão
                  </button>
                </div>
              ) : null}
              <div>
                <p className="mb-2 text-xs font-black uppercase text-muted-foreground">Histórico</p>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {detail.history.map((entry) => (
                    <div key={entry.id} className="rounded-xl bg-muted/50 p-3">
                      <p className="text-xs font-black text-foreground">{entry.action}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString('pt-BR')} · {entry.userName ?? entry.userEmail ?? entry.userId ?? 'system'} · {entry.ip ?? 'sem IP'}
                      </p>
                    </div>
                  ))}
                  {detail.history.length === 0 ? <p className="text-xs text-muted-foreground">Sem histórico administrativo.</p> : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center text-muted-foreground">
              <FileClock className="mb-3 h-10 w-10 opacity-50" />
              <p className="text-sm font-bold">Selecione uma imagem para revisar detalhes, prompt e histórico.</p>
            </div>
          )}
        </aside>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} imagens · página {page} de {totalPages}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(value - 1, 1))} className="rounded-xl border border-border px-3 py-2 font-bold disabled:opacity-50">Anterior</button>
          <button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-border px-3 py-2 font-bold disabled:opacity-50">Próxima</button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: PublicationStatus }) {
  const color = status === 'published'
    ? 'bg-emerald-500/10 text-emerald-600'
    : status === 'archived'
      ? 'bg-slate-500/10 text-slate-500'
      : 'bg-amber-500/10 text-amber-600';
  return <span className={`inline-flex h-8 items-center justify-center rounded-xl px-3 text-xs font-black ${color}`}>{statusLabels[status]}</span>;
}

function ActionButtons({ item, onAction }: { item: BaseMediaItem; onAction: (id: string, action: 'publish' | 'unpublish' | 'archive' | 'restore') => void }) {
  if (item.publicationStatus === 'published') {
    return (
      <>
        <button onClick={() => onAction(item.id, 'unpublish')} className="rounded-lg bg-amber-500/10 p-2 text-amber-600" title="Despublicar"><XCircle className="h-4 w-4" /></button>
        <button onClick={() => onAction(item.id, 'archive')} className="rounded-lg bg-slate-500/10 p-2 text-slate-600" title="Arquivar"><Archive className="h-4 w-4" /></button>
      </>
    );
  }
  if (item.publicationStatus === 'archived') {
    return <button onClick={() => onAction(item.id, 'restore')} className="rounded-lg bg-blue-500/10 p-2 text-blue-600" title="Restaurar"><RotateCcw className="h-4 w-4" /></button>;
  }
  return <button onClick={() => onAction(item.id, 'publish')} className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600" title="Publicar"><CheckCircle2 className="h-4 w-4" /></button>;
}

function DetailBlock({ title, text, mono }: { title: string; text: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-black uppercase text-muted-foreground">{title}</p>
      <pre className={`max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-xs text-foreground ${mono ? 'font-mono' : 'font-sans'}`}>{text}</pre>
    </div>
  );
}
