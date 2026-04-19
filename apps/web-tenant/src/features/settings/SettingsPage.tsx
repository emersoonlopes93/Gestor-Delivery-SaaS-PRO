import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { Tenant, TenantSettings, TenantOperatingHours } from '@gestor/types';
import { Clock, Pause, Save, Copy, Calendar, MapPin, Building2 } from 'lucide-react';

const DAY_NAMES = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'
];

export function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState<Partial<TenantSettings>>({
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    language: 'pt-BR',
    businessPhone: '',
    businessEmail: '',
    address: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: '',
    lat: undefined,
    lng: undefined,
    paymentMethods: ['pix', 'cash', 'card_on_delivery'],
    pixKey: '',
    bankName: '',
    bankAgency: '',
    bankAccount: '',
    logoUrl: '',
    cnpj: '',
    razaoSocial: '',
    inscricaoEstadual: '',
    isStorePaused: false,
    storePauseReason: '',
  });

  const [hours, setHours] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadSettings();
    loadOperatingHours();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get<Tenant & { settings: TenantSettings }>('/tenant/me');
      if (response.success) {
        setTenant(response.data);
        if (response.data.settings) {
          setSettings(response.data.settings);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOperatingHours = async () => {
    try {
      const response = await api.get<any[]>('/tenant/operating-hours');
      if (response.success) {
        if (response.data.length === 0) {
          // Initialize with 7 days
          const initial = Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i,
            isOpen: true,
            openTime: '08:00',
            closeTime: '22:00',
          }));
          setHours(initial);
        } else {
          setHours(response.data);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar horários:', error);
    }
  };

  const handleCepBlur = async () => {
    const cep = settings.zipCode?.replace(/\D/g, '');
    if (cep && cep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          setSettings(prev => ({
            ...prev,
            street: data.logradouro || '',
            neighborhood: data.bairro || '',
            city: data.localidade || '',
            state: data.uf || '',
            complement: data.complemento || ''
          }));
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
      }
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cleanedSettings = {
        timezone: settings.timezone || undefined,
        currency: settings.currency || undefined,
        language: settings.language || undefined,
        businessPhone: settings.businessPhone?.trim() || undefined,
        businessEmail: settings.businessEmail?.trim() || undefined,
        address: settings.address?.trim() || undefined,
        street: settings.street?.trim() || undefined,
        number: settings.number?.trim() || undefined,
        complement: settings.complement?.trim() || undefined,
        neighborhood: settings.neighborhood?.trim() || undefined,
        city: settings.city?.trim() || undefined,
        state: settings.state?.trim() || undefined,
        zipCode: settings.zipCode?.trim() || undefined,
        lat: settings.lat ? Number(settings.lat) : undefined,
        lng: settings.lng ? Number(settings.lng) : undefined,
        paymentMethods: settings.paymentMethods || undefined,
        pixKey: settings.pixKey?.trim() || undefined,
        bankName: settings.bankName?.trim() || undefined,
        bankAgency: settings.bankAgency?.trim() || undefined,
        bankAccount: settings.bankAccount?.trim() || undefined,
        logoUrl: settings.logoUrl?.trim() || undefined,
        cnpj: settings.cnpj?.trim() || undefined,
        razaoSocial: settings.razaoSocial?.trim() || undefined,
        inscricaoEstadual: settings.inscricaoEstadual?.trim() || undefined,
      };
      
      const response = await api.patch('/tenant/settings', cleanedSettings);
      if (response.success) {
        alert('Configurações salvas com sucesso!');
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async () => {
    const newStatus = !settings.isStorePaused;
    try {
      const res = await api.patch('/tenant/store-pause', {
        isStorePaused: newStatus,
        storePauseReason: settings.storePauseReason || '',
      });
      if (res.success) {
        setSettings({ ...settings, isStorePaused: newStatus });
        alert(newStatus ? 'Loja pausada com sucesso!' : 'Loja reaberta com sucesso!');
      }
    } catch (error) {
      alert('Erro ao alterar status da loja.');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter menos de 5MB.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.upload<{ url: string }>('/upload/image', formData);
      if (response.success) {
        setSettings({ ...settings, logoUrl: response.data.url });
      }
    } catch (error: any) {
      console.error('Erro no upload:', error);
      alert(error.message || 'Erro ao fazer upload da imagem.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveHours = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/tenant/operating-hours', { hours });
      if (res.success) {
        alert('Horários de funcionamento atualizados!');
      }
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar horários.');
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (index: number, field: string, value: any) => {
    const newHours = [...hours];
    newHours[index] = { ...newHours[index], [field]: value };
    setHours(newHours);
  };

  const copyFirstDayToAll = () => {
    if (hours.length === 0) return;
    const first = hours[0];
    const newHours = hours.map((h, i) => i === 0 ? h : { ...h, openTime: first.openTime, closeTime: first.closeTime, isOpen: first.isOpen });
    setHours(newHours);
  };

  const applyMonToFri = () => {
    if (hours.length < 6) return;
    const mon = hours[1];
    const newHours = hours.map((h, i) => (i >= 1 && i <= 5) ? { ...h, openTime: mon.openTime, closeTime: mon.closeTime, isOpen: mon.isOpen } : h);
    setHours(newHours);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto text-left space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Configurações da Loja</h1>
        <p className="text-gray-500 mt-1 font-medium">Gerencie o funcionamento e informações do seu estabelecimento.</p>
      </div>

      {/* Pausa Manual */}
      <div className={`bg-white rounded-2xl shadow-sm border p-6 transition-all ${settings.isStorePaused ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${settings.isStorePaused ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
              <Pause className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Pausa Temporária</h2>
              <p className="text-sm text-gray-500 font-medium">Use isso para fechar a loja imediatamente, independente dos horários.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {settings.isStorePaused && (
              <input
                type="text"
                placeholder="Motivo da pausa (opcional)"
                value={settings.storePauseReason || ''}
                onChange={(e) => setSettings({ ...settings, storePauseReason: e.target.value })}
                className="px-4 py-2 bg-white border border-amber-200 rounded-xl outline-none text-sm w-64"
              />
            )}
            <button
              onClick={handleTogglePause}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
                settings.isStorePaused 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              {settings.isStorePaused ? '▶️ Reabrir Loja' : '⏸️ Pausar Agora'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna da Esquerda: Dados Básicos */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="p-1.5 bg-primary-50 text-primary-600 rounded-lg text-sm">🏪</span>
                Identidade e Contato
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Logotipo da Loja</label>
                  <div className="flex items-center gap-6 p-4 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                    <div className="relative w-24 h-24 bg-white border border-gray-100 rounded-xl flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                      {settings.logoUrl ? (
                        <img src={settings.logoUrl} alt="Logo preview" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-gray-300 text-2xl">🖼️</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 text-left">
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer bg-white hover:bg-gray-50 text-gray-700 font-bold py-2 px-4 border border-gray-200 rounded-lg text-sm shadow-sm transition-all active:scale-95">
                          <span>{uploading ? 'Enviando...' : 'Selecionar Imagem'}</span>
                          <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploading} />
                        </label>
                        {settings.logoUrl && (
                          <button 
                            type="button"
                            onClick={() => setSettings({...settings, logoUrl: ''})}
                            className="text-red-500 hover:text-red-600 font-medium text-xs px-2 py-1"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium leading-tight">
                        Formatos aceitos: JPG, PNG ou WEBP. <br />
                        Tamanho recomendado: 512x512 pixels.
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Telefone Comercial</label>
                  <input
                    type="text"
                    value={settings.businessPhone || ''}
                    onChange={e => setSettings({...settings, businessPhone: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">E-mail Comercial</label>
                  <input
                    type="email"
                    value={settings.businessEmail || ''}
                    onChange={e => setSettings({...settings, businessEmail: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm"><MapPin className="w-4 h-4" /></span>
                Endereço da Loja
              </h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">CEP</label>
                    <input
                      type="text"
                      value={settings.zipCode || ''}
                      onChange={e => setSettings({...settings, zipCode: e.target.value.replace(/\D/g, '').slice(0, 8)})}
                      onBlur={handleCepBlur}
                      placeholder="00000-000"
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Rua / Logradouro</label>
                    <input
                      type="text"
                      value={settings.street || ''}
                      onChange={e => setSettings({...settings, street: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Número</label>
                    <input
                      type="text"
                      value={settings.number || ''}
                      onChange={e => setSettings({...settings, number: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Bairro</label>
                    <input
                      type="text"
                      value={settings.neighborhood || ''}
                      onChange={e => setSettings({...settings, neighborhood: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Cidade</label>
                    <input
                      type="text"
                      value={settings.city || ''}
                      onChange={e => setSettings({...settings, city: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Estado (UF)</label>
                    <input
                      type="text"
                      value={settings.state || ''}
                      onChange={e => setSettings({...settings, state: e.target.value.toUpperCase().slice(0, 2)})}
                      placeholder="SP"
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Complemento</label>
                    <input
                      type="text"
                      value={settings.complement || ''}
                      onChange={e => setSettings({...settings, complement: e.target.value})}
                      placeholder="Apto, Bloco, etc."
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Resumo (Legado)</label>
                    <input
                      type="text"
                      value={settings.address || ''}
                      onChange={e => setSettings({...settings, address: e.target.value})}
                      placeholder="Ex: Rua das Flores, 123"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium text-gray-500"
                    />
                  </div>
                </div>

                              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="p-1.5 bg-purple-50 text-purple-600 rounded-lg text-sm"><Building2 className="w-4 h-4" /></span>
                Dados Fiscais
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">CNPJ</label>
                  <input
                    type="text"
                    value={settings.cnpj || ''}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 14);
                      const formatted = raw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
                      setSettings({...settings, cnpj: raw.length > 2 ? formatted : raw});
                    }}
                    placeholder="XX.XXX.XXX/XXXX-XX"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium font-mono tracking-wider"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Razão Social</label>
                  <input
                    type="text"
                    value={settings.razaoSocial || ''}
                    onChange={e => setSettings({...settings, razaoSocial: e.target.value})}
                    placeholder="Nome jurídico da empresa"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Inscrição Estadual</label>
                  <input
                    type="text"
                    value={settings.inscricaoEstadual || ''}
                    onChange={e => setSettings({...settings, inscricaoEstadual: e.target.value})}
                    placeholder="Opcional"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="p-1.5 bg-green-50 text-green-600 rounded-lg text-sm">💰</span>
                Configuração de Pagamento
              </h2>
              <div className="space-y-4">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Métodos aceitos no Checkout</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { id: 'pix', label: 'PIX (Online/Entrega)' },
                    { id: 'cash', label: 'Dinheiro (Na entrega)' },
                    { id: 'card_on_delivery', label: 'Cartão (Na entrega)' },
                  ].map((m) => (
                    <label key={m.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-all">
                      <input
                        type="checkbox"
                        checked={settings.paymentMethods?.includes(m.id) ?? false}
                        onChange={(e) => {
                          const current = settings.paymentMethods || [];
                          const next = e.target.checked
                            ? [...current, m.id]
                            : current.filter((x) => x !== m.id);
                          setSettings({ ...settings, paymentMethods: next });
                        }}
                        className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                      />
                      <span className="text-sm font-bold text-gray-700">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100 space-y-6">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  Dados para Repasse / PIX
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Chave PIX da Loja</label>
                    <input
                      type="text"
                      value={settings.pixKey || ''}
                      onChange={e => setSettings({...settings, pixKey: e.target.value})}
                      placeholder="E-mail, CPF, CNPJ ou Aleatória"
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Nome do Banco</label>
                    <input
                      type="text"
                      value={settings.bankName || ''}
                      onChange={e => setSettings({...settings, bankName: e.target.value})}
                      placeholder="Ex: Nubank, Itaú..."
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Agência</label>
                    <input
                      type="text"
                      value={settings.bankAgency || ''}
                      onChange={e => setSettings({...settings, bankAgency: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Conta com Dígito</label>
                    <input
                      type="text"
                      value={settings.bankAccount || ''}
                      onChange={e => setSettings({...settings, bankAccount: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg text-sm">🌍</span>
                Configurações Regionais
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Fuso Horário</label>
                  <select
                    value={settings.timezone || 'America/Sao_Paulo'}
                    onChange={e => setSettings({...settings, timezone: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl outline-none font-medium"
                  >
                    <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                    <option value="America/Manaus">Manaus (GMT-4)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Moeda</label>
                  <select
                    value={settings.currency || 'BRL'}
                    onChange={e => setSettings({...settings, currency: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl outline-none font-medium"
                  >
                    <option value="BRL">Real (BRL)</option>
                    <option value="USD">Dólar (USD)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-8 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Dados Básicos'}
              </button>
            </div>
          </form>
        </div>

        {/* Coluna da Direita: Horários */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary-500" />
                Horário Semanal
              </h2>
              <div className="flex gap-1">
                <button 
                  onClick={copyFirstDayToAll}
                  title="Copiar Domingo para todos"
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary-600 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button 
                  onClick={applyMonToFri}
                  title="Aplicar Seg a Sex"
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary-600 transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {DAY_NAMES.map((name, i) => {
                const day = hours.find(h => h.dayOfWeek === i) || { dayOfWeek: i, isOpen: false, openTime: '08:00', closeTime: '22:00' };
                return (
                  <div key={i} className="flex flex-col gap-2 p-3 rounded-xl border border-gray-50 hover:border-gray-100 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-700">{name}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={day.isOpen}
                          onChange={(e) => updateDay(i, 'isOpen', e.target.checked)}
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
                      </label>
                    </div>
                    {day.isOpen && (
                      <div className="flex items-center gap-2 mt-1">
                        <input 
                          type="time" 
                          value={day.openTime || '08:00'}
                          onChange={(e) => updateDay(i, 'openTime', e.target.value)}
                          className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-sm outline-none focus:border-primary-300"
                        />
                        <span className="text-gray-300 text-xs">até</span>
                        <input 
                          type="time" 
                          value={day.closeTime || '22:00'}
                          onChange={(e) => updateDay(i, 'closeTime', e.target.value)}
                          className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-sm outline-none focus:border-primary-300"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleSaveHours}
              disabled={saving}
              className="w-full mt-6 bg-gray-900 border border-gray-900 text-white font-bold py-3 px-4 rounded-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
              {saving ? 'Salvando...' : 'Salvar Horários'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
