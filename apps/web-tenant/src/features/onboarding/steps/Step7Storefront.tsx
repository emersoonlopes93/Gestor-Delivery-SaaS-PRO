import { useState } from 'react';
import { Palette, Image as ImageIcon, Sun, Moon, Monitor, CheckCircle2 } from 'lucide-react';
import { api } from '../../../lib/api-client';

interface StorefrontDraft {
  bannerUrl: string;
  bannerMediaAssetId: string;
  primaryColor: string;
  colorMode: 'light' | 'dark' | 'system';
  productLayout: 'list' | 'grid' | 'compact';
}

interface Step7Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
}

const PRESET_COLORS = [
  '#e11d48', '#7c3aed', '#2563eb', '#059669',
  '#d97706', '#dc2626', '#0891b2', '#16a34a',
];

const LAYOUT_OPTIONS = [
  { id: 'list', label: 'Lista', desc: 'Produto em linha com imagem lateral' },
  { id: 'grid', label: 'Grade', desc: '2 colunas com imagem em destaque' },
  { id: 'compact', label: 'Compacto', desc: 'Sem imagens, mais rapido' },
] as const;

const COLOR_MODE_OPTIONS = [
  { id: 'light', label: 'Claro', Icon: Sun },
  { id: 'dark', label: 'Escuro', Icon: Moon },
  { id: 'system', label: 'Sistema', Icon: Monitor },
] as const;

function StorefrontHeroPreview({ src }: { src: string | null }) {
  if (!src) {
    return (
      <div className="h-36 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 flex items-center justify-center text-center px-4">
        <div>
          <div className="text-sm font-black text-slate-700 dark:text-slate-200">Hero opcional</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Exibido no topo da vitrine publica, sem virar fundo global.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-36 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
      <img src={src} alt="Banner da vitrine" className="w-full h-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
        <div className="text-white text-xs font-bold">Banner da vitrine</div>
        <div className="text-white/80 text-[11px]">Topo publico da loja</div>
      </div>
    </div>
  );
}

export function Step7Storefront({ onNext, onPrev }: Step7Props) {
  const [draft, setDraft] = useState<StorefrontDraft>({
    bannerUrl: '',
    bannerMediaAssetId: '',
    primaryColor: '#e11d48',
    colorMode: 'light',
    productLayout: 'list',
  });
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBannerError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setBannerError('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setBannerError('A imagem deve ter no máximo 5MB.');
      return;
    }

    setUploadingBanner(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.upload<{ id: string; publicUrl: string }>('/upload/storefront-background', formData);
      if (response.success) {
        setDraft((current) => ({
          ...current,
          bannerUrl: response.data.publicUrl,
          bannerMediaAssetId: response.data.id,
        }));
      }
    } catch (error) {
      setBannerError(error instanceof Error ? error.message : 'Não foi possível enviar o banner.');
    } finally {
      setUploadingBanner(false);
      event.target.value = '';
    }
  };

  const handleNext = () => {
    onNext(async () => {
      setSaving(true);
      try {
        await api.patch('/tenant/storefront-customization', {
          theme: {
            primaryColor: draft.primaryColor,
            colorMode: draft.colorMode,
            borderRadius: 'lg',
            fontStyle: 'default',
            heroImageUrl: draft.bannerUrl || null,
            heroImageMediaId: draft.bannerMediaAssetId || null,
            backgroundStyle: 'clean',
            backgroundOverlay: 'soft',
          },
          layout: {
            productLayout: draft.productLayout,
            categoryLayout: 'tabs',
            heroEnabled: Boolean(draft.bannerUrl),
            showProductDescription: true,
            showBadges: true,
            productImageMode: 'thumbnail',
          },
        });
      } finally {
        setSaving(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-pink-100 dark:bg-pink-900/40 rounded-2xl mb-3">
          <Palette className="w-7 h-7 text-pink-600 dark:text-pink-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Vitrine Visual</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Como sua loja vai aparecer para os clientes</p>
      </div>

      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
          Banner da vitrine
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Imagem opcional exibida no topo do cardapio digital. Nao vira fundo global da pagina.
        </p>
        {draft.bannerUrl ? (
          <div className="relative rounded-2xl overflow-hidden border-2 border-indigo-300 dark:border-indigo-700 aspect-video bg-slate-100 dark:bg-slate-800 group">
            <img src={draft.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <label className="px-4 py-2 bg-white text-slate-900 rounded-xl text-xs font-bold cursor-pointer">
                {uploadingBanner ? 'Enviando...' : 'Substituir'}
                <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleBannerUpload} disabled={uploadingBanner} />
              </label>
              <button
                onClick={() => setDraft(d => ({ ...d, bannerUrl: '', bannerMediaAssetId: '' }))}
                className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold"
              >
                Remover
              </button>
            </div>
            <div className="absolute top-2 right-2">
              <CheckCircle2 className="w-5 h-5 text-white drop-shadow" />
            </div>
          </div>
        ) : (
          <label
            className="w-full aspect-video rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-pink-400 dark:hover:border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/10 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500 hover:text-pink-500 transition-all"
          >
            <ImageIcon className="w-8 h-8" />
            <span className="text-sm font-bold">{uploadingBanner ? 'Enviando...' : 'Selecionar arquivo'}</span>
            <span className="text-xs">Opcional. Da personalidade a sua loja.</span>
            <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleBannerUpload} disabled={uploadingBanner} />
          </label>
        )}
        {bannerError ? <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{bannerError}</p> : null}
      </div>

      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
          Preview do topo publico
        </label>
        <StorefrontHeroPreview src={draft.bannerUrl || null} />
      </div>

      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
          Cor Principal
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESET_COLORS.map(color => (
            <button
              key={color}
              onClick={() => setDraft(d => ({ ...d, primaryColor: color }))}
              className={`w-8 h-8 rounded-xl transition-all ${draft.primaryColor === color ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
              style={{ backgroundColor: color }}
            />
          ))}
          <input
            type="color"
            value={draft.primaryColor}
            onChange={e => setDraft(d => ({ ...d, primaryColor: e.target.value }))}
            className="w-8 h-8 rounded-xl border-none p-0 overflow-hidden cursor-pointer"
            title="Cor personalizada"
          />
        </div>
        <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: draft.primaryColor }} />
          <input
            type="text"
            value={draft.primaryColor}
            onChange={e => setDraft(d => ({ ...d, primaryColor: e.target.value }))}
            className="flex-1 bg-transparent text-slate-900 dark:text-white font-mono text-sm outline-none uppercase"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
          Modo de Cor
        </label>
        <div className="grid grid-cols-3 gap-2">
          {COLOR_MODE_OPTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setDraft(d => ({ ...d, colorMode: id as StorefrontDraft['colorMode'] }))}
              className={`flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all ${
                draft.colorMode === id
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-bold">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
          Layout do Cardapio
        </label>
        <div className="space-y-2">
          {LAYOUT_OPTIONS.map(({ id, label, desc }) => (
            <button
              key={id}
              onClick={() => setDraft(d => ({ ...d, productLayout: id as StorefrontDraft['productLayout'] }))}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                draft.productLayout === id
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                draft.productLayout === id ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 dark:border-slate-600'
              }`}>
                {draft.productLayout === id && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <div className={`font-bold text-sm ${draft.productLayout === id ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>{label}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onPrev} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm">
          Voltar
        </button>
        <button
          onClick={handleNext}
          disabled={saving}
          className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 text-sm"
        >
          {saving ? 'Salvando...' : 'Continuar'}
        </button>
      </div>

    </div>
  );
}
