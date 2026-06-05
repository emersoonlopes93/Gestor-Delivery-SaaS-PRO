import { useState, useEffect } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api-client';

interface Step2Data {
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  deliveryRadiusKm: string;
  deliveryFeeBase: string;
}

interface Step2Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
  onMarkValid: (valid: boolean) => void;
}

async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'Gestor-Delivery-SaaS-PRO-App' },
    });
    const data = await res.json();
    if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* silent */ }
  return null;
}

export function Step2Location({ onNext, onPrev, onMarkValid }: Step2Props) {
  const [form, setForm] = useState<Step2Data>({
    zipCode: '', street: '', number: '', complement: '',
    neighborhood: '', city: '', state: '',
    deliveryRadiusKm: '5', deliveryFeeBase: '5.00',
  });
  const [loading, setLoading] = useState(true);
  const [cepLoading, setCepLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    onMarkValid(!!(form.street.trim() && form.city.trim() && form.number.trim()));
  }, [form.street, form.city, form.number, onMarkValid]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ settings?: Step2Data }>('/tenant/me');
      if (res.success && res.data.settings) {
        const s = res.data.settings;
        setForm(f => ({
          ...f,
          zipCode: s.zipCode || '',
          street: s.street || '',
          number: s.number || '',
          complement: s.complement || '',
          neighborhood: s.neighborhood || '',
          city: s.city || '',
          state: s.state || '',
        }));
      }
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const handleCepBlur = async () => {
    const cep = form.zipCode.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(f => ({
          ...f,
          street: data.logradouro || f.street,
          neighborhood: data.bairro || f.neighborhood,
          city: data.localidade || f.city,
          state: data.uf || f.state,
          complement: data.complemento || f.complement,
        }));
      }
    } catch { /* silent */ } finally { setCepLoading(false); }
  };

  const handleNext = () => {
    if (!form.street.trim() || !form.number.trim() || !form.city.trim()) {
      alert('Por favor, preencha o endereço completo (rua, número e cidade).');
      return;
    }
    onNext(async () => {
      const addressStr = `${form.street}, ${form.number}, ${form.neighborhood || ''}, ${form.city} - ${form.state || ''}, Brasil`;
      const coords = await geocodeNominatim(addressStr);
      const derivedAddress = `${form.street}, ${form.number}${form.complement ? ` - ${form.complement}` : ''}${form.neighborhood ? ` - ${form.neighborhood}` : ''}, ${form.city} - ${form.state}`;
      await api.patch('/tenant/settings', {
        zipCode: form.zipCode || undefined,
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim() || undefined,
        neighborhood: form.neighborhood.trim() || undefined,
        city: form.city.trim(),
        state: form.state.trim() || undefined,
        address: derivedAddress,
        lat: coords?.lat,
        lng: coords?.lng,
      });
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 dark:bg-emerald-900/40 rounded-2xl mb-3">
          <MapPin className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Localização & Entrega</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Onde sua loja está e como você entrega</p>
      </div>

      {/* CEP */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">CEP</label>
          <div className="relative">
            <input
              type="text"
              value={form.zipCode}
              onChange={e => setForm(f => ({ ...f, zipCode: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
              onBlur={handleCepBlur}
              placeholder="00000000"
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
            />
            {cepLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 animate-spin" />}
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Rua / Logradouro *</label>
          <input
            type="text"
            value={form.street}
            onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
            placeholder="Nome da rua"
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Número *</label>
          <input
            type="text"
            value={form.number}
            onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
            placeholder="123"
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Complemento</label>
          <input
            type="text"
            value={form.complement}
            onChange={e => setForm(f => ({ ...f, complement: e.target.value }))}
            placeholder="Apto, Bloco..."
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Bairro</label>
          <input
            type="text"
            value={form.neighborhood}
            onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))}
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Cidade *</label>
          <input
            type="text"
            value={form.city}
            onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">UF</label>
          <input
            type="text"
            value={form.state}
            onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
            placeholder="SP"
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
          />
        </div>
      </div>

      {/* Entrega */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-5 border border-indigo-100 dark:border-indigo-800">
        <p className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest mb-4">Configurações de Entrega</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Raio padrão de entrega (km)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={form.deliveryRadiusKm}
              onChange={e => setForm(f => ({ ...f, deliveryRadiusKm: e.target.value }))}
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Taxa de entrega base (R$)</label>
            <input
              type="number"
              min="0"
              step="0.50"
              value={form.deliveryFeeBase}
              onChange={e => setForm(f => ({ ...f, deliveryFeeBase: e.target.value }))}
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-3">Você pode configurar zonas de entrega detalhadas depois em Entregas → Zonas.</p>
      </div>

      <div className="flex gap-3">
        <button onClick={onPrev} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm">
          ← Voltar
        </button>
        <button onClick={handleNext} className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 text-sm">
          Continuar →
        </button>
      </div>
    </div>
  );
}
