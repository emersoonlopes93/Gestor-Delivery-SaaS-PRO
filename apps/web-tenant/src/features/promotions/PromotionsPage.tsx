import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';

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

export function PromotionsPage() {
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
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.message || 'Erro ao criar cupom');
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
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🎁 Cupons & Promoções</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 transition"
        >
          + Novo Cupom
        </button>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
            <tr>
              <th className="p-4 font-semibold">Código</th>
              <th className="p-4 font-semibold">Nome</th>
              <th className="p-4 font-semibold">Regra</th>
              <th className="p-4 font-semibold text-center">Uso</th>
              <th className="p-4 font-semibold text-center">Status</th>
              <th className="p-4 font-semibold text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : coupons.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Nenhum cupom cadastrado.
                </td>
              </tr>
            ) : (
              coupons.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-black text-gray-900">{c.code}</td>
                  <td className="p-4 text-gray-700">{c.name}</td>
                  <td className="p-4 text-gray-600">
                    {c.type === 'percentage' && `${c.value}% OFF`}
                    {c.type === 'fixed_amount' &&
                      `R$ ${c.value.toFixed(2)} OFF`}
                    {c.type === 'free_shipping' && `Frete Grátis`}
                  </td>
                  <td className="p-4 text-center text-gray-500">
                    {c.usedCount} / {c.usageLimit || '∞'}
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        c.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {c.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {c.isActive && (
                      <button
                        onClick={() => turnOffCoupon(c.id)}
                        className="text-red-600 hover:text-red-900 font-medium"
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden flex flex-col max-h-full">
            <div className="p-4 border-b">
              <h2 className="text-xl font-bold">Novo Cupom</h2>
            </div>
            <div className="p-4 overflow-y-auto">
              <form id="couponForm" onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Código (Ex: BEMVINDO)</label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    className="w-full border rounded-lg px-3 py-2 uppercase"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nome/Descrição</label>
                  <input
                    type="text"
                    required
                    className="w-full border rounded-lg px-3 py-2"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Tipo</label>
                    <select
                      className="w-full border rounded-lg px-3 py-2"
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                    >
                      <option value="percentage">Porcentagem (%)</option>
                      <option value="fixed_amount">Valor Fixo (R$)</option>
                      <option value="free_shipping">Frete Grátis</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Valor</label>
                    <input
                      type="number"
                      step="0.01"
                      required={form.type !== 'free_shipping'}
                      disabled={form.type === 'free_shipping'}
                      className="w-full border rounded-lg px-3 py-2"
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Limite de Usos (Opcional)</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-3 py-2"
                    value={form.usageLimit}
                    onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  />
                </div>
              </form>
            </div>
            <div className="p-4 border-t flex justify-end space-x-2 bg-gray-50">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded-lg font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="couponForm"
                className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
