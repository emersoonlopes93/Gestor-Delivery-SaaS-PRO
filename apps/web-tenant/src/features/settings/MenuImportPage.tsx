import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChefHat,
  Sparkles,
  ArrowLeft,
  LayoutGrid,
  Package,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../lib/api-client';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  businessSegment: string;
  emoji: string;
  totalCategories: number;
  totalProducts: number;
}

interface ImportResult {
  success: boolean;
  templateId: string;
  categoriesCreated: number;
  categoriesSkipped: number;
  productsCreated: number;
  productsSkipped: number;
  imagesLinked: number;
  durationMs: number;
  errors: string[];
}

type PagePhase = 'idle' | 'confirm' | 'importing' | 'success' | 'error';

// ─── Component ─────────────────────────────────────────────────────────────────

export function MenuImportPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [recommended, setRecommended] = useState<TemplateSummary | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSummary | null>(null);
  const [phase, setPhase] = useState<PagePhase>('idle');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [animatedCount, setAnimatedCount] = useState({ categories: 0, products: 0, images: 0 });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const [templatesRes, recommendedRes] = await Promise.all([
        api.get<TemplateSummary[]>('/catalog/menu-import/templates'),
        api.get<{ recommended: TemplateSummary | null }>('/catalog/menu-import/recommended').catch(() => ({ success: true, data: { recommended: null } })),
      ]);

      if (templatesRes.success) setTemplates(templatesRes.data || []);
      if (recommendedRes.success) setRecommended(recommendedRes.data?.recommended ?? null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = (template: TemplateSummary) => {
    setSelectedTemplate(template);
    setPhase('confirm');
  };

  const handleConfirmImport = async () => {
    if (!selectedTemplate) return;
    setPhase('importing');

    try {
      const res = await api.post<ImportResult>('/catalog/menu-import/execute', {
        templateId: selectedTemplate.id,
        skipExisting: true,
      });

      if (res.success && res.data) {
        setImportResult(res.data);
        animateCounters(res.data.categoriesCreated, res.data.productsCreated, res.data.imagesLinked);
        setPhase('success');
      } else {
        setPhase('error');
      }
    } catch {
      setPhase('error');
    }
  };

  const animateCounters = (categories: number, products: number, images: number) => {
    const duration = 1200;
    const steps = 30;
    const interval = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedCount({
        categories: Math.round(categories * eased),
        products: Math.round(products * eased),
        images: Math.round(images * eased),
      });
      if (step >= steps) clearInterval(timer);
    }, interval);
  };

  const handleReset = () => {
    setPhase('idle');
    setSelectedTemplate(null);
    setImportResult(null);
    setAnimatedCount({ categories: 0, products: 0, images: 0 });
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back button */}
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Configurações
      </button>

      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/20">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">
              Importar Cardápio Base
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Adicione um conjunto inicial de categorias e produtos
            </p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Duplicidade:</strong> Categorias e produtos com o mesmo nome serão ignorados automaticamente. 
              Nenhum conteúdo existente será substituído ou removido.
            </div>
          </div>
        </div>
      </div>

      {/* ── Phase: Idle / Template Selection ── */}
      {phase === 'idle' && (
        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <>
              {/* Recommended */}
              {recommended && (
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    Recomendado para você
                  </p>
                  <button
                    onClick={() => handleSelectTemplate(recommended)}
                    className="group w-full text-left p-5 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-4xl">{recommended.emoji}</span>
                      <div className="flex-1">
                        <div className="font-black text-indigo-900 dark:text-indigo-100 mb-0.5">
                          {recommended.name}
                        </div>
                        <div className="text-sm text-indigo-700 dark:text-indigo-400">
                          {recommended.description}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full">
                            {recommended.totalCategories} categorias
                          </span>
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full">
                            {recommended.totalProducts} produtos
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {/* All templates */}
              <div className="space-y-2">
                <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Todos os modelos
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {templates
                    .filter((t) => t.id !== recommended?.id)
                    .map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        className="group p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md transition-all text-left"
                      >
                        <div className="text-3xl mb-2">{template.emoji}</div>
                        <div className="font-black text-sm text-slate-900 dark:text-white mb-0.5">
                          {template.name}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 mb-2 line-clamp-2">
                          {template.description}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          {template.totalCategories} cat · {template.totalProducts} prod
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Phase: Confirm ── */}
      {phase === 'confirm' && selectedTemplate && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="p-6 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-4xl">{selectedTemplate.emoji}</span>
              <div>
                <div className="font-black text-slate-900 dark:text-white text-lg">
                  {selectedTemplate.name}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {selectedTemplate.description}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: LayoutGrid, label: `${selectedTemplate.totalCategories} categorias`, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
                { icon: Package, label: `${selectedTemplate.totalProducts} produtos`, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
              ].map((item) => (
                <div key={item.label} className={`${item.bg} rounded-xl p-3 flex items-center gap-2`}>
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                  <span className={`text-sm font-bold ${item.color}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
            Itens com o mesmo nome serão <strong>ignorados</strong> automaticamente.
            <br />Todo o conteúdo criado poderá ser editado.
          </p>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmImport}
              className="flex-[2] py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/25 text-sm"
            >
              Importar agora →
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Importing ── */}
      {phase === 'importing' && selectedTemplate && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-500/25">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">
              Importando {selectedTemplate.emoji} {selectedTemplate.name}...
            </h2>
            <p className="text-sm text-slate-400 dark:text-slate-500">Isso levará apenas alguns segundos</p>
          </div>

          <div className="space-y-3">
            {[
              { label: 'Criando categorias', icon: LayoutGrid, color: 'from-violet-500 to-purple-500' },
              { label: 'Adicionando produtos', icon: Package, color: 'from-indigo-500 to-blue-500' },
              { label: 'Vinculando imagens', icon: ImageIcon, color: 'from-emerald-500 to-teal-500' },
            ].map((item, i) => (
              <div
                key={item.label}
                className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700"
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                  <item.icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">{item.label}</div>
                  <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${item.color} rounded-full animate-pulse`}
                      style={{ width: `${(i + 1) * 33}%` }}
                    />
                  </div>
                </div>
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Phase: Success ── */}
      {phase === 'success' && importResult && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl mb-4 shadow-lg shadow-emerald-500/25">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">
              Cardápio importado com sucesso! 🎉
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Seu cardápio inicial foi criado com sucesso.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { value: animatedCount.categories, label: 'Criadas', sublabel: 'Categorias', icon: LayoutGrid, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
              { value: animatedCount.products, label: 'Criados', sublabel: 'Produtos', icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
              { value: animatedCount.images, label: 'Vinculadas', sublabel: 'Imagens', icon: ImageIcon, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
            ].map((stat) => (
              <div key={stat.sublabel} className={`${stat.bg} rounded-2xl p-4 text-center`}>
                <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
                <div className={`text-3xl font-black ${stat.color} tabular-nums`}>{stat.value}</div>
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">{stat.sublabel}</div>
              </div>
            ))}
          </div>

          {importResult.categoriesSkipped > 0 || importResult.productsSkipped > 0 ? (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400">
              <strong>{importResult.categoriesSkipped + importResult.productsSkipped}</strong> item(s) ignorado(s) por já existirem no seu catálogo.
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            Concluído em {(importResult.durationMs / 1000).toFixed(1)}s
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Importar outro
            </button>
            <button
              onClick={() => navigate('/catalog/products')}
              className="flex-[2] py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/25 text-sm"
            >
              Ver produtos →
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Error ── */}
      {phase === 'error' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-2xl mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">
              Erro na importação
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Não foi possível completar a importação. Tente novamente.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmImport}
              className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 text-sm"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
