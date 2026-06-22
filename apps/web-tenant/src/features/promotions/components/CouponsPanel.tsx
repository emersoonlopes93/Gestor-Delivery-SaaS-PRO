import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { Modal } from '@/components/Modal';

interface CouponListItem {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt: string | null;
}

export function CouponsPanel() {
  const [coupons, setCoupons] = useState<CouponListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'percentage',
    value: 0,
    usageLimit: '',
  });

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/promotions/coupons');
      setCoupons(res.data as CouponListItem[]);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar cupons');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        code: form.code.toUpperCase(),
        name: form.name,
        type: form.type,
        value: Number(form.value),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
      };
      await api.post('/promotions/coupons', payload);
      setShowModal(false);
      loadCoupons();
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Erro ao criar cupom';
      alert(message);
    }
  };

  const turnOffCoupon = async (id: string) => {
    if (!confirm('Desativar este cupom?')) return;
    try {
      await api.patch(`/promotions/coupons/${id}`, { isActive: false });
      loadCoupons();
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar status');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">Cupons Ativos</h2>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary"
        >
          + Novo Cupom
        </button>
      </div>

      <div className="card-premium overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <th className="p-4">Código</th>
              <th className="p-4">Nome</th>
              <th className="p-4">Regra</th>
              <th className="p-4 text-center">Uso</th>
              <th className="p-4 text-center">Status</th>
              <th className="p-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400 animate-pulse font-medium">
                  Carregando...
                </td>
              </tr>
            ) : coupons.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400 italic font-medium">
                  Nenhum cupom cadastrado.
                </td>
              </tr>
            ) : (
              coupons.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="p-4 font-black text-gray-900 dark:text-gray-100">{c.code}</td>
                  <td className="p-4 text-gray-700 dark:text-gray-300 font-medium">{c.name}</td>
                  <td className="p-4">
                    <span className="status-badge-indigo text-[10px]">
                      {c.type === 'percentage' && `${c.value}% OFF`}
                      {c.type === 'fixed_amount' && `R$ ${c.value.toFixed(2)} OFF`}
                      {c.type === 'free_shipping' && `Frete Grátis`}
                    </span>
                  </td>
                  <td className="p-4 text-center text-gray-500 dark:text-gray-400 font-bold">
                    {c.usedCount} / {c.usageLimit || '∞'}
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        c.isActive
                          ? 'status-badge-success'
                          : 'status-badge-danger'
                      }`}
                    >
                      {c.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {c.isActive && (
                      <button
                        onClick={() => turnOffCoupon(c.id)}
                        className="text-red-600 hover:text-red-700 font-bold text-xs uppercase"
                      >
                        Inativar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Novo Cupom"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="couponForm"
              className="px-6 py-2 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-900/20"
            >
              Salvar Cupom
            </button>
          </>
        }
      >
        <form id="couponForm" onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Código (Ex: BEMVINDO)</label>
            <input
              type="text"
              required
              maxLength={20}
              className="input-premium uppercase"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome/Descrição</label>
            <input
              type="text"
              required
              className="input-premium"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
              <select
                className="input-premium"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="percentage">Porcentagem (%)</option>
                <option value="fixed_amount">Valor Fixo (R$)</option>
                <option value="free_shipping">Frete Grátis</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Valor</label>
              <input
                type="number"
                step="0.01"
                required={form.type !== 'free_shipping'}
                disabled={form.type === 'free_shipping'}
                className="input-premium"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Limite de Usos (Opcional)</label>
            <input
              type="number"
              className="input-premium"
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
