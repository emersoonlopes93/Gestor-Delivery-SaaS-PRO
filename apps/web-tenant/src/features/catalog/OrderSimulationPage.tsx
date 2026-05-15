import { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api-client';
import { ProductCategory, Product, OptionGroup } from '@gestor/types';

interface SimulationResult {
  sizeId: string;
  sizeName: string;
  flavors: {
    productId: string;
    name: string;
    fraction: number;
    priceAtSize: number;
  }[];
  strategy: string;
  calculatedPrice: number;
}

export function OrderSimulationPage() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allGroups, setAllGroups] = useState<OptionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selections
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedSizeId, setSelectedSizeId] = useState('');
  const [mounting, setMounting] = useState<'inteira' | 'meio'>('inteira');
  const [flavor1Id, setFlavor1Id] = useState('');
  const [flavor2Id, setFlavor2Id] = useState('');

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [catRes, prodRes, groupRes] = await Promise.all([
        api.get<ProductCategory[]>('/catalog/categories'),
        api.get<Product[]>('/catalog/products'),
        api.get<OptionGroup[]>('/catalog/option-groups'),
      ]);

      if (catRes.success) setCategories(catRes.data.filter(c => (c as any).templateType === 'pizza'));
      if (prodRes.success) setProducts(prodRes.data);
      if (groupRes.success) setAllGroups(groupRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCategory = useMemo(() => 
    categories.find(c => c.id === selectedCategoryId),
    [categories, selectedCategoryId]
  );

  const categoryFlavors = useMemo(() => 
    products.filter(p => p.categoryId === selectedCategoryId),
    [products, selectedCategoryId]
  );

  const pizzaSizeGroup = useMemo(() => 
    allGroups.find(g => g.name.includes('Tamanhos [Pizza]')),
    [allGroups]
  );

  const sizes = useMemo(() => 
    (pizzaSizeGroup as any)?.items || [],
    [pizzaSizeGroup]
  );

  useEffect(() => {
    if (categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (sizes.length > 0 && !selectedSizeId) {
      setSelectedSizeId(sizes[0].id);
    }
  }, [sizes, selectedSizeId]);

  const handleSimulate = async () => {
    setError(null);
    if (!selectedCategoryId || !selectedSizeId || !flavor1Id) {
      setError('Selecione categoria, tamanho e pelo menos um sabor.');
      return;
    }

    const flavors = [];
    if (mounting === 'inteira') {
      flavors.push({ productId: flavor1Id, fraction: 1 });
    } else {
      if (!flavor2Id) {
        setError('Selecione o segundo sabor para meio a meio.');
        return;
      }
      flavors.push({ productId: flavor1Id, fraction: 0.5 });
      flavors.push({ productId: flavor2Id, fraction: 0.5 });
    }

    try {
      const res = await api.post<SimulationResult>('/catalog/pizza/simulate', {
        categoryId: selectedCategoryId,
        sizeId: selectedSizeId,
        flavors
      });
      if (res.success) {
        setResult(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'Erro na simulação');
    }
  };

  const getStrategyLabel = (strategy: string) => {
    switch (strategy) {
      case 'highest': return 'Maior Valor';
      case 'average': return 'Média';
      case 'lowest': return 'Menor Valor';
      case 'sum_halves': return 'Soma das Metades';
      default: return strategy;
    }
  };

  const getStrategyExplanation = (strategy: string) => {
    switch (strategy) {
      case 'highest': return 'Esta pizza será cobrada pelo sabor de maior valor entre os escolhidos.';
      case 'average': return 'O preço será a média aritmética dos valores de cada sabor (no tamanho selecionado).';
      case 'lowest': return 'Esta pizza será cobrada pelo sabor de menor valor (promoção do dia, etc).';
      case 'sum_halves': return 'O preço será a soma proporcional das metades (Metade A + Metade B).';
      default: return '';
    }
  };

  if (isLoading) return <div className="p-8 text-center text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest animate-pulse">Carregando Simulador...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto text-left">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Simulador de Pizza 🍕</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">Valide em tempo real as regras de precificação e montagem.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* CONFIGURAÇÃO */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-sm space-y-6">
            <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center text-base">🛠️</span>
              Configuração
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Categoria (Template Pizza)</label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="input-premium"
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {selectedCategory && (
                  <div className="mt-2 text-[10px] font-black text-primary-600 uppercase">
                    Estratégia Atual: {getStrategyLabel((selectedCategory as any).templateConfig?.pricingStrategy)}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Tamanho</label>
                <div className="grid grid-cols-3 gap-2">
                  {sizes.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSizeId(s.id)}
                      className={`px-3 py-2 text-xs font-black rounded-xl border transition-all ${selectedSizeId === s.id ? 'bg-primary-600 border-primary-600 text-white shadow-lg' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-primary-200'}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Montagem</label>
                <div className="flex bg-gray-100 dark:bg-gray-950 p-1 rounded-xl border border-gray-200 dark:border-gray-800">
                  <button
                    onClick={() => setMounting('inteira')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${mounting === 'inteira' ? 'bg-white dark:bg-gray-900 text-primary-600 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                  >
                    Inteira
                  </button>
                  <button
                    onClick={() => setMounting('meio')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${mounting === 'meio' ? 'bg-white dark:bg-gray-900 text-primary-600 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                  >
                    Meio a Meio
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Sabores</label>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold mb-1 block">Sabor A</label>
                  <select
                    value={flavor1Id}
                    onChange={(e) => setFlavor1Id(e.target.value)}
                    className="input-premium"
                  >
                    <option value="">Selecione...</option>
                    {categoryFlavors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>

                {mounting === 'meio' && (
                  <div className="animate-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] text-gray-400 font-bold mb-1 block">Sabor B</label>
                    <select
                      value={flavor2Id}
                      onChange={(e) => setFlavor2Id(e.target.value)}
                      className="input-premium"
                    >
                      <option value="">Selecione...</option>
                      {categoryFlavors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="p-4 alert-danger text-xs font-bold rounded-xl animate-shake">
                ⚠️ {error}
              </div>
            )}

            <button
              onClick={handleSimulate}
              className="btn-primary w-full py-4 rounded-2xl"
            >
              SIMULAR PREÇO
            </button>
          </div>
        </div>

        {/* RESULTADO */}
        <div className="space-y-6">
          <div className={`bg-gray-900 rounded-3xl p-8 text-white h-full transition-all ${result ? 'scale-100 opacity-100' : 'scale-95 opacity-50 blur-[2px]'}`}>
            {!result ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
                <div className="text-4xl">🧾</div>
                <div className="text-sm font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Aguardando Simulação</div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Preencha os dados ao lado para ver o cálculo.</p>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[10px] font-black text-primary-400 uppercase tracking-widest mb-1">Total do Item</div>
                    <div className="text-5xl font-black tracking-tighter">
                      R$ {result.calculatedPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-900/10 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider backdrop-blur-md">
                    {result.sizeName}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest border-b border-white/10 pb-2">Composição</div>
                  {result.flavors.map((f, i) => (
                    <div key={i} className="flex justify-between items-center bg-white dark:bg-gray-900/5 p-4 rounded-2xl border border-white/5">
                      <div>
                        <div className="font-black text-sm">{f.name}</div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">
                          {(f.fraction * 100).toFixed(0)}% da pizza
                        </div>
                      </div>
                      <div className="text-sm font-black">
                        R$ {f.priceAtSize.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-primary-600/20 border border-primary-500/30 p-6 rounded-3xl space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚖️</span>
                    <div className="text-[10px] font-black uppercase tracking-widest text-primary-300">Regra Aplicada</div>
                  </div>
                  <div className="text-sm font-black text-white">
                    {getStrategyLabel(result.strategy)}
                  </div>
                  <p className="text-xs text-primary-100/70 font-medium leading-relaxed italic">
                    "{getStrategyExplanation(result.strategy)}"
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-900/5 p-4 rounded-xl space-y-2">
                   <div className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Payload Compatível (V2 Checkout)</div>
                   <pre className="text-[10px] font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap leading-tight">
                    {JSON.stringify({
                      lineType: 'product',
                      productId: result.flavors[0].productId,
                      quantity: 1,
                      pizzaComposition: {
                        sizeId: result.sizeId,
                        flavors: result.flavors.map(f => ({ productId: f.productId, fraction: f.fraction }))
                      }
                    }, null, 2)}
                   </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
