import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, CircleDot, Loader2, Plus, Store } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { api, ApiError } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import type { CreateBranchRequest, TenantNetworkContext } from '@gestor/types';

function statusLabel(role: TenantNetworkContext['role']) {
  return role === 'headquarters' ? 'Matriz' : 'Filial';
}

export function StoreNetworkPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [branchName, setBranchName] = useState('');
  const [branchSlug, setBranchSlug] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-network'],
    queryFn: async () => {
      const res = await api.get<TenantNetworkContext>('/tenant/network');
      return res.data;
    },
    staleTime: 1000 * 60,
  });

  const createBranchMutation = useMutation({
    mutationFn: async (payload: CreateBranchRequest) => {
      const res = await api.post<TenantNetworkContext>('/tenant/network/branches', payload);
      return res.data;
    },
    onSuccess: async () => {
      setBranchName('');
      setBranchSlug('');
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant-network'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-settings'] }),
      ]);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.message);
        return;
      }
      setError('Nao foi possivel criar a filial agora.');
    },
  });

  const isOwner = useMemo(
    () => Boolean(user?.roles?.includes('tenant_owner')),
    [user?.roles],
  );

  const canCreateBranch = isOwner && data?.role === 'headquarters';

  const handleCreateBranch = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!branchName.trim()) {
      setError('Informe o nome da nova filial.');
      return;
    }

    await createBranchMutation.mutateAsync({
      name: branchName.trim(),
      slug: branchSlug.trim() || undefined,
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Rede de Lojas"
        description="Gerencie matriz, filiais e a expansao da mesma conta para outras unidades."
        icon={Building2}
      />

      {isLoading || !data ? (
        <div className="rounded-2xl border border-border bg-card p-8 flex items-center justify-center text-sm font-bold text-muted-foreground gap-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando rede da conta
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-6">
            <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estrutura da rede</div>
                  <h2 className="mt-2 text-2xl font-black text-foreground">{data.groupName}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Esta conta esta operando como <span className="font-black text-foreground">{statusLabel(data.role)}</span> dentro da rede.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1.5 text-xs font-black uppercase tracking-widest">
                  <CircleDot className="w-3.5 h-3.5" />
                  {statusLabel(data.role)}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Conta dona</div>
                  <div className="mt-2 text-sm font-bold text-foreground break-all">{data.ownerEmail}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lojas na rede</div>
                  <div className="mt-2 text-sm font-bold text-foreground">{data.stores.length}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Loja atual</div>
                  <div className="mt-2 text-sm font-bold text-foreground">
                    {data.stores.find((store) => store.id === data.currentTenantId)?.name ?? 'Loja atual'}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lojas vinculadas</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.stores.map((store) => (
                    <div
                      key={store.id}
                      className={`rounded-2xl border p-4 ${store.id === data.currentTenantId ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-black text-foreground truncate">{store.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">{store.slug}</div>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${store.isHeadquarters ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'}`}>
                          {store.isHeadquarters ? 'Matriz' : 'Filial'}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                        <span className="text-muted-foreground">
                          {store.city || store.state ? `${store.city ?? 'Cidade'}${store.state ? ` - ${store.state}` : ''}` : 'Endereco a configurar'}
                        </span>
                        <span className="font-bold text-foreground">{String(store.status)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <aside className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Expansao</div>
                <h3 className="mt-2 text-xl font-black text-foreground">Criar nova filial</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  A nova unidade entra na mesma rede e fica acessivel pela mesma conta dona.
                </p>
              </div>

              {canCreateBranch ? (
                <form onSubmit={handleCreateBranch} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Nome da filial</label>
                    <input
                      type="text"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      className="input-premium"
                      placeholder="Ex: Xeque-Mate Centro"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Slug da loja</label>
                    <input
                      type="text"
                      value={branchSlug}
                      onChange={(e) => setBranchSlug(e.target.value)}
                      className="input-premium"
                      placeholder="Opcional. Ex: xeque-mate-centro"
                    />
                  </div>

                  {error ? (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={createBranchMutation.isPending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {createBranchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Criar filial
                  </button>
                </form>
              ) : (
                <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  {isOwner
                    ? 'Somente a matriz cria novas filiais. Se esta conta estiver em uma filial, a criacao acontece pela loja principal.'
                    : 'A criacao de filiais fica disponivel apenas para a conta dona da rede.'}
                </div>
              )}

              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  Como funciona
                </div>
                <div className="text-sm text-muted-foreground">A matriz cria a nova loja, a conta dona e mantida e o seletor de lojas passa a exibir a unidade automaticamente.</div>
              </div>
            </aside>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 text-primary p-3">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="font-black text-foreground">Proximo passo apos criar a filial</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Entre na nova unidade pelo seletor de lojas e finalize configuracoes como endereco, horarios, impressoras e integracoes locais.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
