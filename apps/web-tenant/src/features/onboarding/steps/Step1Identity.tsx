import React, { useState, useEffect } from 'react';
import { Store, Image as ImageIcon, Phone, ChevronDown } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { maskPhone, unmask } from '@gestor/utils';
import { BUSINESS_SEGMENTS, BUSINESS_SEGMENT_LABELS, type BusinessSegment } from '@gestor/types';

interface Step1Data {
  name: string;
  category: BusinessSegment | '';
  logoUrl: string;
  businessPhone: string;
}

interface Step1Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onMarkValid: (valid: boolean) => void;
}

export function Step1Identity({ onNext, onMarkValid }: Step1Props) {
  const [form, setForm] = useState<Step1Data>({
    name: '',
    category: '',
    logoUrl: '',
    businessPhone: '',
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    onMarkValid(!!(form.name.trim() && form.businessPhone.trim()));
  }, [form.name, form.businessPhone, onMarkValid]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get<{
        name: string;
        settings?: { logoUrl?: string; businessPhone?: string; businessSegment?: BusinessSegment | null };
      }>('/tenant/me');
      if (res.success) {
        setForm({
          name: res.data.name || '',
          category: res.data.settings?.businessSegment || '',
          logoUrl: res.data.settings?.logoUrl || '',
          businessPhone: res.data.settings?.businessPhone || '',
        });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('A imagem deve ter menos de 5MB.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload<{ url: string }>('/upload/image?type=logo', formData);
      if (res.success) setForm(f => ({ ...f, logoUrl: res.data.url }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Não foi possível enviar a imagem.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleNext = () => {
    if (!form.name.trim()) {
      alert('Por favor, informe o nome da sua loja.');
      return;
    }
    if (!form.businessPhone.trim()) {
      alert('Por favor, informe o telefone/WhatsApp da loja.');
      return;
    }
    onNext(async () => {
      await api.patch('/tenant', {
        name: form.name.trim(),
      });
      await api.patch('/tenant/settings', {
        logoUrl: form.logoUrl || undefined,
        businessPhone: unmask(form.businessPhone),
        businessSegment: form.category || undefined,
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
        <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl mb-3">
          <Store className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Identidade da Loja</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Como sua loja será conhecida pelos clientes
        </p>
      </div>

      {/* Logo */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
          Logo da Loja
        </label>
        <div className="flex items-center gap-5">
          <label className="relative w-20 h-20 rounded-2xl bg-white dark:bg-slate-700 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden cursor-pointer group">
            {form.logoUrl ? (
              <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <ImageIcon className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-bold">Alterar</span>
            </div>
            <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} disabled={uploading} />
          </label>
          <div className="flex flex-col gap-2">
            <label className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors cursor-pointer text-center">
              {uploading ? 'Enviando...' : form.logoUrl ? 'Substituir logo' : 'Selecionar arquivo'}
              <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} disabled={uploading} />
            </label>
            {form.logoUrl ? (
              <button type="button" onClick={() => setForm((current) => ({ ...current, logoUrl: '' }))} className="text-xs font-bold text-red-600 dark:text-red-400">
                Remover logo
              </button>
            ) : null}
          </div>
        </div>
        {uploadError ? <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{uploadError}</p> : null}
      </div>

      {/* Nome da Loja */}
      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
          Nome da Loja *
        </label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Ex: Burger do João, Pizzaria da Maria..."
          className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
        />
      </div>

      {/* Categoria */}
      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
          Segmento do negócio
        </label>
        <div className="relative">
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value as Step1Data['category'] }))}
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm appearance-none"
          >
            <option value="">Selecionar depois</option>
            {BUSINESS_SEGMENTS.map((value) => (
              <option key={value} value={value}>{BUSINESS_SEGMENT_LABELS[value]}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Telefone */}
      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
          <Phone className="w-3 h-3" /> Telefone / WhatsApp *
        </label>
        <input
          type="tel"
          value={maskPhone(form.businessPhone)}
          onChange={e => setForm(f => ({ ...f, businessPhone: e.target.value }))}
          placeholder="(11) 99999-9999"
          className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Usado para contato e notificações de pedidos</p>
      </div>

      {/* Next Button */}
      <button
        onClick={handleNext}
        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 text-sm tracking-wide"
      >
        Continuar →
      </button>

    </div>
  );
}
