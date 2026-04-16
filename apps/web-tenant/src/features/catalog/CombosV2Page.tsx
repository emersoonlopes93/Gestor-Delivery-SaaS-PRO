import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { CatalogPublication, ComboSlot, ComboSlotAllowedItem, Product } from '@gestor/types';

type ComboListItem = Product & {
  publication?: CatalogPublication | null;
};

type SlotWithAllowed = ComboSlot & {
  allowedItems?: Array<ComboSlotAllowedItem>;
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
      const withPublication = await Promise.all(
        comboProducts.map(async (combo) => {
          try {
            const pubRes = await api.get<CatalogPublication>(`/catalog/products/${combo.id}/publication`);
            return { ...combo, publication: pubRes.success ? pubRes.data : null };
          } catch {
            return { ...combo, publication: null };
          }
        }),
      );

      setCombos(withPublication);
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
    setBusy('create', true);
    try {
      const now = new Date();
      const suggestedName = `Novo Combo ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const res = await api.post<Product>('/catalog/products', {
        name: suggestedName,
        type: 'combo',
        basePrice: 1,
        shortDescription: 'Combo em montagem',
        isActive: true,
        isAvailable: true,
        sellableOnline: true,
      });
      if (!res.success) return;
      navigate(`/catalog/combos/${res.data.id}/v2`);
    } finally {
      setBusy('create', false);
    }
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
      const [productRes, slotsRes] = await Promise.all([
        api.get<Product>(`/catalog/products/${combo.id}`),
        api.get<SlotWithAllowed[]>(`/catalog/products/${combo.id}/combo-slots`),
      ]);
      if (!productRes.success) return;

      const createdComboRes = await api.post<Product>('/catalog/products', {
        name: `${productRes.data.name} (Cópia)`,
        categoryId: productRes.data.categoryId,
        type: 'combo',
        basePrice: Number(productRes.data.basePrice),
        shortDescription: productRes.data.shortDescription ?? '',
        longDescription: productRes.data.longDescription ?? '',
        image: productRes.data.image ?? '',
        isActive: productRes.data.isActive,
        isAvailable: productRes.data.isAvailable,
        sellableOnline: productRes.data.sellableOnline,
        sku: productRes.data.sku ?? '',
        order: productRes.data.order,
      });
      if (!createdComboRes.success) return;

      const newComboId = createdComboRes.data.id;
      const sourceSlots = slotsRes.success ? [...slotsRes.data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];

      for (const slot of sourceSlots) {
        const createdSlotRes = await api.post<ComboSlot>(`/catalog/products/${newComboId}/combo-slots`, {
          name: slot.name,
          description: slot.description ?? '',
          isRequired: slot.isRequired,
          minSelect: slot.minSelect,
          maxSelect: slot.maxSelect,
          order: slot.order,
        });
        if (!createdSlotRes.success) continue;

        const createdSlotId = createdSlotRes.data.id;
        const sourceAllowed = [...(slot.allowedItems ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        for (const allowed of sourceAllowed) {
          await api.post(`/catalog/products/${newComboId}/combo-slots/${createdSlotId}/allowed-items`, {
            productId: allowed.productId,
            additionalPrice: Number(allowed.additionalPrice ?? 0),
            order: allowed.order,
          });
        }
      }

      await api.patch(`/catalog/products/${newComboId}/publication`, {
        publicationStatus: 'draft',
        operationalStatus: 'inactive',
      });

      await loadData();
      navigate(`/catalog/combos/${newComboId}/v2`);
    } finally {
      setBusy(key, false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Combos</h1>
          <p className="text-gray-500 mt-1">Crie e monte combos usando produtos já cadastrados no catálogo.</p>
        </div>
        <button
          type="button"
          onClick={handleCreateCombo}
          disabled={savingMap.create}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingMap.create ? 'Criando...' : 'Novo Combo'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Combo</th>
                <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Preço Base</th>
                <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Publicação</th>
                <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Operação</th>
                <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedCombos.map((combo) => (
                <tr key={combo.id} className="hover:bg-gray-50/40 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{combo.name}</div>
                    <div className="text-xs text-gray-500 font-medium">{combo.shortDescription || 'Sem descrição'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm font-black text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(combo.basePrice ?? 0))}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${combo.publication?.publicationStatus === 'published' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {combo.publication?.publicationStatus ?? 'draft'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${combo.publication?.operationalStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {combo.publication?.operationalStatus ?? 'inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => navigate(`/catalog/combos/${combo.id}/v2`)}
                        className="px-3 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50 rounded"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePublication(combo)}
                        disabled={savingMap[`pub-${combo.id}`]}
                        className="px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
                      >
                        {combo.publication?.publicationStatus === 'published' ? 'Despublicar' : 'Publicar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleOperational(combo)}
                        disabled={savingMap[`op-${combo.id}`]}
                        className="px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
                      >
                        {combo.publication?.operationalStatus === 'active' ? 'Inativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(combo)}
                        disabled={savingMap[`duplicate-${combo.id}`]}
                        className="px-3 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50 rounded disabled:opacity-50"
                      >
                        Duplicar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(combo)}
                        disabled={savingMap[`delete-${combo.id}`]}
                        className="px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedCombos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-medium italic">
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
