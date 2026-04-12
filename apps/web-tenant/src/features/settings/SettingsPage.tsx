import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { Tenant, TenantSettings } from '@gestor/types';

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
    logoUrl: '',
  });

  useEffect(() => {
    loadSettings();
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await api.patch('/tenant/settings', settings);
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto text-left">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Configurações da Loja</h1>
        <p className="text-gray-500 mt-1 font-medium">Gerencie as informações básicas e preferências do seu estabelecimento.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identidade da Loja */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span className="p-1.5 bg-primary-50 text-primary-600 rounded-lg text-sm">🏪</span>
            Identidade da Loja
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Nome da Unidade</label>
              <input
                type="text"
                disabled
                value={tenant?.name || ''}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-400 font-medium cursor-not-allowed outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Slug (URL)</label>
              <input
                type="text"
                disabled
                value={tenant?.slug || ''}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-400 font-medium cursor-not-allowed outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">URL do Logotipo</label>
              <input
                type="text"
                value={settings.logoUrl || ''}
                onChange={e => setSettings({...settings, logoUrl: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                placeholder="https://suaimagem.com/logo.png"
              />
            </div>
          </div>
        </div>

        {/* Contato e Localização */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span className="p-1.5 bg-green-50 text-green-600 rounded-lg text-sm">📞</span>
            Contato e Localização
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Telefone Comercial</label>
              <input
                type="text"
                value={settings.businessPhone || ''}
                onChange={e => setSettings({...settings, businessPhone: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">E-mail Comercial</label>
              <input
                type="email"
                value={settings.businessEmail || ''}
                onChange={e => setSettings({...settings, businessEmail: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none font-medium"
                placeholder="contato@sualoja.com"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Endereço Completo</label>
              <textarea
                value={settings.address || ''}
                onChange={e => setSettings({...settings, address: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none h-24 resize-none font-medium"
                placeholder="Rua Exemplo, 123 - Bairro - Cidade/UF"
              />
            </div>
          </div>
        </div>

        {/* Preferências Regionais */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg text-sm">🌍</span>
            Regionalização
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Moeda</label>
              <select
                value={settings.currency || 'BRL'}
                onChange={e => setSettings({...settings, currency: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl outline-none font-medium"
              >
                <option value="BRL">Real (BRL)</option>
                <option value="USD">Dólar (USD)</option>
                <option value="EUR">Euro (EUR)</option>
              </select>
            </div>
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
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Idioma</label>
              <select
                value={settings.language || 'pt-BR'}
                onChange={e => setSettings({...settings, language: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl outline-none font-medium"
              >
                <option value="pt-BR">Português (BR)</option>
                <option value="en-US">English (US)</option>
                <option value="es-ES">Español</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={saving}
            className={`bg-primary-600 hover:bg-primary-700 text-white font-black py-3 px-10 rounded-2xl shadow-lg transition-all transform active:scale-95 ${saving ? 'opacity-70 cursor-wait' : ''}`}
          >
            {saving ? 'Guardando...' : '💾 Salvar Configurações'}
          </button>
        </div>
      </form>
    </div>
  );
}
