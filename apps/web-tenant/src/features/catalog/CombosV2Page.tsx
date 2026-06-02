import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { Product } from '@gestor/types';
import { Plus } from 'lucide-react';

type ComboListItem = Product & {
  publication?: {
    publicationStatus?: string;
    operationalStatus?: string;
  } | null;
};


export function CombosV2Page() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [combos, setCombos] = useState<ComboListItem[]>([]);

  const setBusy = (key: string, value: boolean) => {
    setSavingMap((prev) => ({ ...prev, [key]: value }));
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const productsRes = await api.get<ComboListItem[]>('/catalog/products');
      if (!productsRes.success) return;

      const comboProducts = productsRes.data.filter((p) => (p.type ?? 'simple') === 'combo');
      setCombos(comboProducts);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const sortedCombos = useMemo(() => {
    return [...combos].sort((a, b) => {
      const byOrder = (a.order ?? 0) - (b.order ?? 0);
      if (byOrder !== 0) return byOrder;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR');
    });
  }, [combos]);

  const handleCreateCombo = async () => {
    navigate('/catalog/combos/new/v2');
  };

  const handleTogglePublication = async (combo: ComboListItem) => {
    const key = `pub-${combo.id}`;
    setBusy(key, true);
    try {
      const nextStatus = combo.publication?.publicationStatus === 'published' ? 'draft' : 'published';
      await api.patch(`/catalog/products/${combo.id}/publication`, { publicationStatus: nextStatus });
      await loadData();
    } finally {
      setBusy(key, false);
    }
  };

  const handleToggleOperational = async (combo: ComboListItem) => {
    const key = `op-${combo.id}`;
    setBusy(key, true);
    try {
      const nextStatus = combo.publication?.operationalStatus === 'active' ? 'inactive' : 'active';
      await api.patch(`/catalog/products/${combo.id}/publication`, { operationalStatus: nextStatus });
      await loadData();
    } finally {
      setBusy(key, false);
    }
  };

  const handleDelete = async (combo: ComboListItem) => {
    if (!window.confirm(`Excluir o combo "${combo.name}"?`)) return;
    const key = `delete-${combo.id}`;
    setBusy(key, true);
    try {
      await api.delete(`/catalog/products/${combo.id}`);
      await loadData();
    } finally {
      setBusy(key, false);
    }
  };

  const handleDuplicate = async (combo: ComboListItem) => {
    const key = `duplicate-${combo.id}`;
    setBusy(key, true);
    try {
      const res = await api.post<Product>(`/catalog/products/${combo.id}/duplicate`);
      if (res.success) {
        await loadData();
        navigate(`/catalog/combos/${res.data.id}/v2`);
      }
    } finally {
      setBusy(key, false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Combos</h1>
          <p className="text-muted-foreground mt-1">Crie e monte combos usando produtos já cadastrados no catálogo.</p>
        </div>
        <button
          type="button"
          onClick={handleCreateCombo}
          disabled={savingMap.create}
          className="btn-primary flex items-center justify-center gap-2 px-4 py-2"
        >
          <Plus className="h-5 w-5" />
          <span>{savingMap.create ? 'Criando...' : 'Novo Combo'}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Imagem</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Combo</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Preço Base</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Publicação</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Operação</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sortedCombos.map((combo) => (
                <tr key={combo.id} className="hover:bg-muted transition-colors group">
                  <td className="px-6 py-4">
                    {combo.image ? (
                      <img src={combo.image} alt={combo.name} className="w-12 h-12 rounded-xl object-cover border border-border" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center text-[10px] font-black text-muted-foreground">
                        SEM IMG
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-foreground">{combo.name}</div>
                    <div className="text-xs text-muted-foreground font-medium">{combo.shortDescription || 'Sem descrição'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm font-black text-foreground">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(combo.basePrice ?? 0))}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${combo.publication?.publicationStatus === 'published' ? 'status-badge-confirmed' : 'status-badge-neutral'}`}>
                      {combo.publication?.publicationStatus === 'published' ? 'Publicado' : 'Rascunho'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${combo.publication?.operationalStatus === 'active' ? 'status-badge-success' : (combo.publication?.operationalStatus === 'inactive' ? 'status-badge-danger' : 'status-badge-warning')}`}>
                      {combo.publication?.operationalStatus === 'active' ? 'Ativo' : (combo.publication?.operationalStatus === 'hidden' ? 'Oculto' : (combo.publication?.operationalStatus === 'sold_out_manual' ? 'Esgotado' : 'Inativo'))}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => navigate(`/catalog/combos/${combo.id}/v2`)}
                        className="btn-ghost text-primary"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePublication(combo)}
                        disabled={savingMap[`pub-${combo.id}`]}
                        className="btn-ghost text-muted-foreground hover:text-foreground"
                      >
                        {combo.publication?.publicationStatus === 'published' ? 'Despublicar' : 'Publicar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleOperational(combo)}
                        disabled={savingMap[`op-${combo.id}`]}
                        className="btn-ghost text-muted-foreground hover:text-foreground"
                      >
                        {combo.publication?.operationalStatus === 'active' ? 'Inativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(combo)}
                        disabled={savingMap[`duplicate-${combo.id}`]}
                        className="btn-ghost text-primary"
                      >
                        Duplicar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(combo)}
                        disabled={savingMap[`delete-${combo.id}`]}
                        className="btn-ghost text-destructive hover:bg-destructive/10"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedCombos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground font-medium italic">
                    Nenhum combo cadastrado ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
