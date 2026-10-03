import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  ChefHat,
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  LayoutGrid,
  Package,
  ImageIcon,
  Clock,
} from 'lucide-react';
import { api } from '../../../lib/api-client';

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

type ImportPhase = 'choosing' | 'segment-select' | 'confirm' | 'importing' | 'success' | 'error';

interface Step5ImportMenuProps {
  onImportComplete: () => void;
  onSkip: () => void;
  onSkipCompletely?: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function Step5ImportMenu({ onImportComplete, onSkip, onSkipCompletely }: Step5ImportMenuProps) {
  const [phase, setPhase] = useState<ImportPhase>('choosing');
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [recommended, setRecommended] = useState<TemplateSummary | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [animatedCount, setAnimatedCount] = useState({ categories: 0, products: 0, images: 0 });
  const importInFlightRef = useRef(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const [templatesRes, recommendedRes] = await Promise.all([
        api.get<TemplateSummary[]>('/catalog/menu-import/templates').catch(() => ({ success: false, data: [] })),
        api.get<{ recommended: TemplateSummary | null }>('/catalog/menu-import/recommended').catch(() => ({ success: false, data: { recommended: null } })),
      ]);

      if (templatesRes.success) setTemplates(templatesRes.data || []);
      if (recommendedRes.success) setRecommended(recommendedRes.data?.recommended ?? null);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setPhase('confirm');
  };

  const handleStartImport = async () => {
    if (!selectedTemplateId || importInFlightRef.current) return;
    importInFlightRef.current = true;
    setPhase('importing');

    try {
      const res = await api.post<ImportResult>('/catalog/menu-import/execute', {
        templateId: selectedTemplateId,
        skipExisting: true,
      });

      if (res.success && res.data) {
        setImportResult(res.data);
        // Animate counters
        animateCounters(res.data.categoriesCreated, res.data.productsCreated, res.data.imagesLinked);
        setPhase('success');
      } else {
        setPhase('error');
      }
    } catch {
      importInFlightRef.current = false;
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
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      setAnimatedCount({
        categories: Math.round(categories * eased),
        products: Math.round(products * eased),
        images: Math.round(images * eased),
      });

      if (step >= steps) clearInterval(timer);
    }, interval);
  };

  // ── Phase: Choosing ──────────────────────────────────────────────────────────

  if (phase === 'choosing') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-400">
        {/* Header */}
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl mb-3 shadow-lg shadow-indigo-500/25">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            Comece com um cardápio pronto
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
            Escolha um modelo inicial para acelerar a configuração da sua loja.
          </p>
        </div>

        <div className="space-y-3">
          {/* Option 1: Import recommended */}
          <button
            onClick={() => {
              if (recommended) {
                handleSelectTemplate(recommended.id);
              } else {
                setPhase('segment-select');
              }
            }}
            className="group w-full text-left p-5 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative flex items-start gap-4">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/30">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-black text-indigo-900 dark:text-indigo-100">
                    Importar cardápio recomendado
                  </span>
                  <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Recomendado
                  </span>
                </div>
                {recommended ? (
                  <p className="text-sm text-indigo-700 dark:text-indigo-300">
                    <span className="mr-1">{recommended.emoji}</span>
                    <span className="font-bold">{recommended.name}</span>
                    {' '}— {recommended.totalCategories} categorias, {recommended.totalProducts} produtos
                  </p>
                ) : (
                  <p className="text-sm text-indigo-700 dark:text-indigo-300">
                    Selecione seu segmento e importe tudo em segundos
                  </p>
                )}
              </div>
              <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform shrink-0 mt-1" />
            </div>
          </button>

          {/* Option 2: Create from scratch */}
          <button
            onClick={onSkip}
            className="group w-full text-left p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
                <Package className="w-6 h-6 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="flex-1">
                <span className="font-black text-slate-700 dark:text-slate-200 block mb-1">
                  Criar do zero
                </span>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Cadastre seus produtos manualmente no seu próprio ritmo
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:translate-x-1 transition-transform shrink-0 mt-1" />
            </div>
          </button>
          {/* Option 3: Skip */}
          {onSkipCompletely && (
            <button
              onClick={onSkipCompletely}
              className="group w-full text-center p-4 rounded-2xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 font-bold transition-all text-sm"
            >
              Pular esta etapa e adicionar depois
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          Tudo poderá ser editado posteriormente
        </p>
      </div>
    );
  }

  // ── Phase: Segment Select ────────────────────────────────────────────────────

  if (phase === 'segment-select') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-400">
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl mb-3 shadow-lg shadow-indigo-500/25">
            <ChefHat className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            Qual é o seu segmento?
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Escolha o modelo mais próximo do seu negócio
          </p>
        </div>

        {loadingTemplates ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelectTemplate(t.id)}
                className="group p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all text-left"
              >
                <div className="text-3xl mb-2">{t.emoji}</div>
                <div className="font-black text-sm text-slate-900 dark:text-white mb-1">{t.name}</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  {t.totalCategories} cat. · {t.totalProducts} prod.
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setPhase('choosing')}
          className="w-full py-3 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          ← Voltar
        </button>
      </div>
    );
  }

  // ── Phase: Importing ─────────────────────────────────────────────────────────

  if (phase === 'confirm') {
    const template = templates.find((item) => item.id === selectedTemplateId) ?? recommended;
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="text-center">
          <div className="text-4xl mb-3">{template?.emoji ?? '🍽️'}</div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Confirmar importacao</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {template?.name ?? 'Cardapio base'} criara {template?.totalCategories ?? 0} categorias e {template?.totalProducts ?? 0} produtos.
          </p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setPhase('choosing')} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black rounded-2xl">
            Voltar
          </button>
          <button type="button" onClick={() => void handleStartImport()} className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl">
            Importar
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'importing') {
    const template = templates.find((t) => t.id === selectedTemplateId);

    return (
      <div className="space-y-8 animate-in fade-in duration-400">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl mb-3 shadow-lg shadow-indigo-500/25">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            Criando seu cardápio...
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {template ? `${template.emoji} ${template.name}` : 'Aguarde um instante'}
          </p>
        </div>

        {/* Animated progress bar */}
        <div className="space-y-3">
          {[
            { label: 'Criando categorias', icon: LayoutGrid, color: 'from-violet-500 to-purple-500' },
            { label: 'Adicionando produtos', icon: Package, color: 'from-indigo-500 to-blue-500' },
            { label: 'Vinculando imagens', icon: ImageIcon, color: 'from-emerald-500 to-teal-500' },
          ].map((item, i) => (
            <div
              key={item.label}
              className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700"
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                <item.icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {item.label}
                </div>
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
    );
  }

  // ── Phase: Success ───────────────────────────────────────────────────────────

  if (phase === 'success' && importResult) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl mb-3 shadow-lg shadow-emerald-500/25">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            Cardápio criado com sucesso! 🎉
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Seu cardápio inicial está pronto para receber pedidos
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              value: animatedCount.categories,
              label: 'Categorias',
              icon: LayoutGrid,
              color: 'text-violet-600 dark:text-violet-400',
              bg: 'bg-violet-100 dark:bg-violet-900/40',
            },
            {
              value: animatedCount.products,
              label: 'Produtos',
              icon: Package,
              color: 'text-indigo-600 dark:text-indigo-400',
              bg: 'bg-indigo-100 dark:bg-indigo-900/40',
            },
            {
              value: animatedCount.images,
              label: 'Imagens',
              icon: ImageIcon,
              color: 'text-emerald-600 dark:text-emerald-400',
              bg: 'bg-emerald-100 dark:bg-emerald-900/40',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`${stat.bg} rounded-2xl p-4 text-center`}
            >
              <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
              <div className={`text-3xl font-black ${stat.color} tabular-nums`}>
                {stat.value}
              </div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Duration */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          <span>Concluído em {(importResult.durationMs / 1000).toFixed(1)}s</span>
        </div>

        {importResult.errors.length > 0 && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-bold mb-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {importResult.errors.length} item(s) ignorado(s)
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Alguns itens não puderam ser criados (possivelmente já existem).
            </p>
          </div>
        )}

        <button
          onClick={onImportComplete}
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/25 text-sm"
        >
          Continuar →
        </button>
      </div>
    );
  }

  // ── Phase: Error ─────────────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <div className="space-y-6 animate-in fade-in duration-400">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 dark:bg-red-900/40 rounded-2xl mb-3">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            Não foi possível importar
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Ocorreu um erro durante a importação. Você pode tentar novamente ou criar manualmente.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm"
          >
            Criar manualmente
          </button>
          <button
            onClick={() => {
              importInFlightRef.current = false;
              setPhase('choosing');
            }}
            className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 text-sm"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return null;
}
