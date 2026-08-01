import React, { useState, useEffect } from 'react';
import { 
  Palette, 
  Layout, 
  Smartphone, 
  RotateCcw, 
  Save,
  Eye,
  MousePointer2,
  Zap,
  Upload,
  Trash2,
  Image as ImageIcon,
  ChevronUp,
  ChevronDown,
  X
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { 
  getStorefrontPresets,
  getDefaultStorefrontThemeSettings,
  getDefaultStorefrontLayoutSettings,
  StorefrontThemeSettings,
  StorefrontLayoutSettings,
  StorefrontProductLayout,
  StorefrontCategoryLayout,
  StorefrontImageMode,
  StorefrontRadius,
  ThemeMode,
  StorefrontPreset,
  StorefrontShowcaseMode,
  StorefrontShowcaseSettings,
  StorefrontShowcaseStrategy
} from '@gestor/theme';
import { ProductCategory, Product, Tenant, TenantSettings } from '@gestor/types';

interface DemoProduct {
  id: string;
  name: string;
  shortDescription: string;
  image?: string;
  basePrice: number;
  isAvailable: boolean;
  isFeatured?: boolean;
}

interface DemoCategory {
  id: string;
  name: string;
  slug: string;
  products: DemoProduct[];
}

interface DemoCombo {
  id: string;
  name: string;
  description: string;
  image?: string;
  basePrice: number;
  isAvailable: boolean;
}

const DEMO_COMBOS: DemoCombo[] = [
  {
    id: 'demo-combo-1',
    name: 'Combo Casal Smash',
    description: '2 Burgers Smash Artesanais + 1 Batata Rústica Grande + 2 Refrigerantes gelados à sua escolha.',
    image: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400&auto=format&fit=crop&q=60',
    basePrice: 69.90,
    isAvailable: true
  }
];

const DEMO_CATEGORIES: DemoCategory[] = [
  {
    id: 'demo-cat-1',
    name: 'Burgers Artesanais',
    slug: 'burgers-artesanais',
    products: [
      {
        id: 'demo-prod-1',
        name: 'Classic Smash Burger',
        shortDescription: 'Dois smash burgers de 80g blend premium, queijo cheddar derretido, alface, tomate e maionese verde artesanal no pão brioche.',
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&auto=format&fit=crop&q=60',
        basePrice: 28.90,
        isAvailable: true,
        isFeatured: true
      },
      {
        id: 'demo-prod-2',
        name: 'Bacon Cheddar Monster',
        shortDescription: 'Burger bovino de 150g grelhado na brasa, tiras crocantes de bacon, cheddar cremoso e cebola caramelizada.',
        image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400&auto=format&fit=crop&q=60',
        basePrice: 34.90,
        isAvailable: true
      }
    ]
  },
  {
    id: 'demo-cat-2',
    name: 'Acompanhamentos',
    slug: 'acompanhamentos',
    products: [
      {
        id: 'demo-prod-3',
        name: 'Batata Rústica da Casa',
        shortDescription: 'Batatas fritas rústicas com casca, temperadas com páprica defumada, alecrim fresco e sal grosso.',
        image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&auto=format&fit=crop&q=60',
        basePrice: 16.00,
        isAvailable: true
      }
    ]
  },
  {
    id: 'demo-cat-3',
    name: 'Bebidas Geladas',
    slug: 'bebidas-geladas',
    products: [
      {
        id: 'demo-prod-4',
        name: 'Soda Italiana Cranberry',
        shortDescription: 'Refrescante xarope artesanal de cranberry com água gaseificada, rodelas de limão siciliano e gelo.',
        image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&auto=format&fit=crop&q=60',
        basePrice: 12.00,
        isAvailable: true
      }
    ]
  }
];

export function StorefrontCustomizationPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'presets' | 'background' | 'appearance' | 'layout'>('presets');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tenantLogo, setTenantLogo] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('');
  const [customization, setCustomization] = useState<{
    theme: StorefrontThemeSettings;
    layout: StorefrontLayoutSettings;
  }>({
    theme: getDefaultStorefrontThemeSettings(),
    layout: getDefaultStorefrontLayoutSettings(),
  });

  useEffect(() => {
    loadCustomization();
  }, []);

  const loadCustomization = async () => {
    setLoading(true);
    try {
      const [customRes, catRes, prodRes, tenantRes] = await Promise.all([
        api.get<{ theme: StorefrontThemeSettings; layout: StorefrontLayoutSettings }>('/tenant/storefront-customization'),
        api.get<ProductCategory[]>('/catalog/categories'),
        api.get<Product[]>('/catalog/products'),
        api.get<Tenant & { settings: TenantSettings }>('/tenant/me')
      ]);
      
      if (customRes.success) {
        setCustomization(customRes.data);
      }
      if (catRes.success) {
        setCategories(catRes.data);
      }
      if (prodRes.success) {
        setProducts(prodRes.data);
      }
      if (tenantRes.success) {
        setTenantLogo(tenantRes.data.settings?.logoUrl || null);
        setTenantName(tenantRes.data.name || '');
      }
    } catch (error) {
      console.error('Erro ao carregar personalização:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.patch<{ theme: StorefrontThemeSettings; layout: StorefrontLayoutSettings }>('/tenant/storefront-customization', customization);
      if (response.success) {
        setCustomization(response.data);
        // Success notification
        alert('Configurações salvas com sucesso! As alterações podem levar até 1 minuto para propagar no cardápio público devido ao cache.');
      }
    } catch (error) {
      console.error('Erro ao salvar personalização:', error);
      alert('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Deseja restaurar todas as configurações para o padrão?')) {
      setCustomization({
        theme: getDefaultStorefrontThemeSettings(),
        layout: getDefaultStorefrontLayoutSettings(),
      });
    }
  };

  const updateTheme = (updates: Partial<StorefrontThemeSettings>) => {
    setCustomization(prev => ({
      ...prev,
      theme: { ...prev.theme, ...updates }
    }));
  };

  const updateLayout = (updates: Partial<StorefrontLayoutSettings>) => {
    setCustomization(prev => ({
      ...prev,
      layout: { ...prev.layout, ...updates }
    }));
  };

  const updateShowcase = (updates: Partial<StorefrontShowcaseSettings>) => {
    updateLayout({
      showcase: { ...customization.layout.showcase, ...updates },
    });
  };

  const toggleShowcaseProduct = (productId: string) => {
    const currentIds = customization.layout.showcase.manualProductIds;
    updateShowcase({
      manualProductIds: currentIds.includes(productId)
        ? currentIds.filter((id) => id !== productId)
        : [...currentIds, productId].slice(0, 12),
    });
  };

  const moveShowcaseProduct = (productId: string, direction: -1 | 1) => {
    const currentIds = [...customization.layout.showcase.manualProductIds];
    const currentIndex = currentIds.indexOf(productId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentIds.length) return;
    [currentIds[currentIndex], currentIds[nextIndex]] = [currentIds[nextIndex], currentIds[currentIndex]];
    updateShowcase({ manualProductIds: currentIds });
  };

  const applyPreset = (preset: StorefrontPreset) => {
    if (window.confirm(`Deseja aplicar o preset "${preset.name}"? Isso substituirá suas configurações atuais.`)) {
      setCustomization({
        theme: { ...preset.theme },
        layout: { ...preset.layout }
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (file.size > 5 * 1024 * 1024) {
      alert('Arquivo muito grande. O limite é 5MB.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post<{ publicUrl: string; id: string }>('/upload/storefront-background', formData);
      if (response.success) {
        updateTheme({ 
          heroImageUrl: response.data.publicUrl,
          heroImageMediaId: response.data.id
        });
      }
    } catch (error) {
      console.error('Erro no upload:', error);
      alert('Falha ao enviar imagem.');
    } finally {
      setUploading(false);
    }
  };

  const removeHero = () => {
    updateTheme({ 
      heroImageUrl: null,
      heroImageMediaId: null
    });
  };

  const removeBackground = () => {
    updateTheme({ 
      backgroundImageUrl: null,
      backgroundImageMediaId: null
    });
  };

  // Normalização e Fallback dos Dados
  const rawNormalized = categories.length > 0
    ? categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        products: products.filter(p => p.categoryId === cat.id)
      })).filter(cat => cat.products.length > 0)
    : [];

  const displayCategories = rawNormalized.length > 0 ? rawNormalized : DEMO_CATEGORIES;
  const displayCombos = categories.length > 0 ? [] : DEMO_COMBOS; // Exibe combos de demonstração se banco estiver vazio
  const eligibleShowcaseProducts = products.filter((product) => {
    const category = categories.find((item) => item.id === product.categoryId);
    return product.isActive && product.isAvailable && product.sellableOnline && !product.deletedAt && category?.isActive;
  });
  const orderedShowcaseProducts = customization.layout.showcase.manualProductIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is Product => Boolean(product))
    .slice(0, customization.layout.showcase.maxItems);
  const previewShowcaseProducts = orderedShowcaseProducts.filter((product) =>
    eligibleShowcaseProducts.some((eligibleProduct) => eligibleProduct.id === product.id),
  );

  // Utilitários de Estilização Reativa em Tempo Real (Real-time updates)
  const primaryHex = customization.theme.primaryColor.startsWith('#') 
    ? customization.theme.primaryColor 
    : '#e11d48';

  const primary10 = `${primaryHex}1a`; // 10%
  const primary5 = `${primaryHex}0d`; // 5%

  const isDark = customization.theme.colorMode === 'dark';
  const showHeroImage = !!customization.theme.heroImageUrl;
  const showBgImage = !!customization.theme.backgroundImageUrl;

  const getBackgroundStyles = () => {
    if (customization.theme.backgroundStyle === 'clean') {
      return isDark ? 'bg-[#09090b]' : 'bg-[#ffffff]';
    }
    if (customization.theme.backgroundStyle === 'soft') {
      return isDark ? 'bg-[#18181b]' : 'bg-[#f4f4f5]';
    }
    if (customization.theme.backgroundStyle === 'premium') {
      return isDark 
        ? 'bg-gradient-to-b from-[#090d16] to-[#1e1b4b]' 
        : 'bg-gradient-to-b from-[#ffffff] to-[#eff6ff]';
    }
    if (customization.theme.backgroundStyle === 'brand') {
      return isDark
        ? `bg-gradient-to-b from-[#09090b] to-[var(--storefront-primary-10)]`
        : `bg-gradient-to-b from-[#ffffff] to-[var(--storefront-primary-5)]`;
    }
    return isDark ? 'bg-[#09090b]' : 'bg-[#ffffff]';
  };

  const getFontStyle = () => {
    if (customization.theme.fontStyle === 'rounded') return 'font-rounded';
    if (customization.theme.fontStyle === 'modern') return 'font-sans';
    return 'font-sans';
  };

  const getProductListClass = () => {
    const layout = customization.layout.productLayout;
    if (layout === 'grid' || layout === 'square') {
      return 'grid grid-cols-2 gap-2.5';
    }
    return 'flex flex-col gap-2.5';
  };

  const renderProductCard = (product: Product | DemoProduct) => {
    const layout = customization.layout.productLayout;
    const imageMode = customization.layout.productImageMode;
    const showDesc = customization.layout.showProductDescription;
    const showBadges = customization.layout.showBadges;
    const isDark = customization.theme.colorMode === 'dark';
    
    const showImage = imageMode !== 'hidden' && product.image;
    
    // Classes de Cores Reativas
    const cardBgClass = isDark 
      ? 'bg-slate-900/60 border-slate-800 text-slate-100' 
      : 'bg-white/80 border-slate-150 text-slate-900';
    
    const cardBorderRadius = 'rounded-[calc(var(--preview-radius)-4px)]';
    
    if (layout === 'grid') {
      return (
        <div 
          key={product.id}
          className={`p-2 border ${cardBorderRadius} ${cardBgClass} flex flex-col shadow-sm transition-all duration-350 hover:scale-[1.01] backdrop-blur-sm`}
        >
          {showImage && (
            <div className={`aspect-video w-full overflow-hidden mb-2 ${cardBorderRadius} bg-muted`}>
              <img src={product.image ?? undefined} className="w-full h-full object-cover" alt={product.name} />
            </div>
          )}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              <h4 className="font-bold text-[9px] truncate text-foreground leading-tight">{product.name}</h4>
              {showBadges && product.isFeatured && (
                <span className="text-[6px] font-black bg-[var(--preview-primary)] text-white px-1 py-0.2 rounded-full uppercase shrink-0 scale-90">Destaque</span>
              )}
            </div>
            {showDesc && product.shortDescription && (
              <p className="text-[7px] text-muted-foreground line-clamp-2 leading-tight mb-2">{product.shortDescription}</p>
            )}
            <div className="mt-auto flex justify-between items-center pt-1 border-t border-border/5">
              <span className="text-[8px] font-black">
                R$ {Number(product.basePrice).toFixed(2)}
              </span>
              <div 
                className="h-4.5 px-2 rounded-full flex items-center justify-center text-[7px] font-bold text-white uppercase select-none"
                style={{ backgroundColor: primaryHex }}
              >
                Ver
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    if (layout === 'square') {
      return (
        <div 
          key={product.id}
          className={`p-2 border ${cardBorderRadius} ${cardBgClass} flex flex-col shadow-sm transition-all duration-300 backdrop-blur-sm`}
        >
          {showImage && (
            <div className={`aspect-square w-full overflow-hidden mb-2 ${cardBorderRadius} bg-muted`}>
              <img src={product.image ?? undefined} className="w-full h-full object-cover" alt={product.name} />
            </div>
          )}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              <h4 className="font-bold text-[9px] truncate text-foreground leading-tight">{product.name}</h4>
            </div>
            {showDesc && product.shortDescription && (
              <p className="text-[7px] text-muted-foreground line-clamp-1 leading-tight mb-1.5">{product.shortDescription}</p>
            )}
            <div className="mt-auto flex justify-between items-center pt-1">
              <span className="text-[8px] font-black">
                R$ {Number(product.basePrice).toFixed(2)}
              </span>
              <div 
                className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-black text-white"
                style={{ backgroundColor: primaryHex }}
              >
                +
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (layout === 'list') {
      return (
        <div 
          key={product.id}
          className={`p-2 border ${cardBorderRadius} ${cardBgClass} flex justify-between items-center gap-2.5 shadow-sm transition-all duration-300 backdrop-blur-sm`}
        >
          <div className="flex-1 min-w-0 space-y-0.5 text-left">
            <div className="flex items-center gap-1">
              <h4 className="font-bold text-[9px] text-foreground truncate leading-tight">{product.name}</h4>
              {showBadges && product.isFeatured && (
                <span className="text-[6px] font-black bg-[var(--preview-primary)] text-white px-1 py-0.2 rounded-full uppercase shrink-0 scale-90">Destaque</span>
              )}
            </div>
            {showDesc && product.shortDescription && (
              <p className="text-[7px] text-muted-foreground line-clamp-2 leading-relaxed">{product.shortDescription}</p>
            )}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[9px] font-black">
                R$ {Number(product.basePrice).toFixed(2)}
              </span>
            </div>
          </div>
          {showImage && (
            <div className="w-12 h-12 rounded-[calc(var(--preview-radius)-4px)] overflow-hidden bg-muted shrink-0 shadow-inner">
              <img src={product.image ?? undefined} className="w-full h-full object-cover" alt={product.name} />
            </div>
          )}
        </div>
      );
    }

    if (layout === 'compact') {
      return (
        <div 
          key={product.id}
          className={`p-1.5 px-2 border ${cardBorderRadius} ${cardBgClass} flex justify-between items-center gap-2 shadow-sm transition-all duration-300 backdrop-blur-sm`}
        >
          <div className="flex-1 min-w-0 text-left">
            <h4 className="font-bold text-[9px] text-foreground truncate">{product.name}</h4>
            {showDesc && product.shortDescription && (
              <p className="text-[7px] text-muted-foreground line-clamp-1 leading-tight">{product.shortDescription}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[9px] font-black">
              R$ {Number(product.basePrice).toFixed(2)}
            </span>
            <div 
              className="h-3.5 px-2 rounded-full flex items-center justify-center text-[7px] font-black text-white"
              style={{ backgroundColor: primaryHex }}
            >
              +
            </div>
          </div>
        </div>
      );
    }

    if (layout === 'premium-card') {
      return (
        <div 
          key={product.id}
          className={`p-2.5 border-2 ${cardBgClass} flex flex-col shadow-md transition-all duration-300 relative overflow-hidden backdrop-blur-sm`}
          style={{ 
            borderColor: primaryHex,
            borderRadius: customization.theme.borderRadius === 'sm' ? '6px' :
                          customization.theme.borderRadius === 'md' ? '12px' :
                          customization.theme.borderRadius === 'lg' ? '16px' :
                          customization.theme.borderRadius === 'xl' ? '20px' : '28px'
          }}
        >
          {showImage && (
            <div className="aspect-video w-full overflow-hidden mb-2 bg-muted rounded shadow-sm">
              <img src={product.image ?? undefined} className="w-full h-full object-cover" alt={product.name} />
            </div>
          )}
          <div className="flex-1 flex flex-col min-w-0 space-y-0.5">
            <div className="flex items-center justify-between gap-1">
              <h4 className="font-black text-[9px] text-foreground uppercase tracking-wide truncate leading-tight">{product.name}</h4>
              {showBadges && product.isFeatured && (
                <span className="text-[6px] font-black bg-[var(--preview-primary)] text-white px-1 py-0.2 rounded uppercase shrink-0 scale-90">Premium</span>
              )}
            </div>
            {showDesc && product.shortDescription && (
              <p className="text-[7.5px] text-muted-foreground leading-normal italic line-clamp-2">{product.shortDescription}</p>
            )}
            <div className="flex justify-between items-center pt-1.5 mt-1 border-t border-border/10">
              <span className="text-[9px] font-black">
                R$ {Number(product.basePrice).toFixed(2)}
              </span>
              <div 
                className="h-4.5 px-2 rounded flex items-center justify-center text-[7px] font-black text-white uppercase tracking-wider"
                style={{ backgroundColor: primaryHex, borderRadius: 'var(--preview-radius)' }}
              >
                + Add
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 text-left">
      <PageHeader 
        title="Personalização da Vitrine" 
        description="Configure a aparência e o comportamento da sua loja pública."
        action={
          <div className="flex gap-2">
            <Button variant="outline" className="border-border text-foreground hover:bg-muted" onClick={handleReset} disabled={saving}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Restaurar Padrão
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar Alterações
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Navegação por Abas */}
          <div className="flex flex-wrap gap-1 p-1 bg-muted/60 dark:bg-slate-900/40 rounded-xl border border-border/80">
            <button
              onClick={() => setActiveTab('presets')}
              className={`flex items-center justify-center gap-2 flex-1 min-w-[130px] px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'presets'
                  ? 'bg-card text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${activeTab === 'presets' ? 'text-amber-500 fill-amber-500/20' : ''}`} />
              Presets Rápidos
            </button>
            <button
              onClick={() => setActiveTab('background')}
              className={`flex items-center justify-center gap-2 flex-1 min-w-[130px] px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'background'
                  ? 'bg-card text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <ImageIcon className={`w-3.5 h-3.5 ${activeTab === 'background' ? 'text-primary' : ''}`} />
              Banner e Fundo
            </button>
            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center justify-center gap-2 flex-1 min-w-[130px] px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'appearance'
                  ? 'bg-card text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <Palette className={`w-3.5 h-3.5 ${activeTab === 'appearance' ? 'text-primary' : ''}`} />
              Aparência
            </button>
            <button
              onClick={() => setActiveTab('layout')}
              className={`flex items-center justify-center gap-2 flex-1 min-w-[130px] px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'layout'
                  ? 'bg-card text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <Layout className={`w-3.5 h-3.5 ${activeTab === 'layout' ? 'text-primary' : ''}`} />
              Layout do Cardápio
            </button>
          </div>

          {/* Conteúdo das Abas */}
          {activeTab === 'presets' && (
            <Card className="p-6 bg-card border-border shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Zap className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-foreground">Presets Rápidos</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {getStorefrontPresets().map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className="flex flex-col p-4 border border-border bg-card hover:border-primary/45 hover:bg-primary/5 transition-all text-left rounded-xl group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div 
                        className="w-8 h-8 rounded-lg shadow-inner" 
                        style={{ backgroundColor: preset.theme.primaryColor }}
                      />
                      <Badge variant="info" className="text-[10px] uppercase font-black">{preset.layout.productLayout}</Badge>
                    </div>
                    <h3 className="font-bold text-sm text-foreground mb-1 group-hover:text-primary">{preset.name}</h3>
                    <p className="text-[11px] text-muted-foreground leading-tight">{preset.description}</p>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {activeTab === 'background' && (
            <Card className="p-6 bg-card border-border shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <ImageIcon className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Banner da vitrine e fundo</h2>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Banner da vitrine</label>
                    <p className="text-xs text-muted-foreground mb-2">Imagem opcional exibida no topo da loja. Nao vira fundo global.</p>
                    
                    {customization.theme.heroImageUrl ? (
                      <div className="relative group rounded-xl overflow-hidden border-2 border-primary/20 aspect-video bg-muted">
                        <img 
                          src={customization.theme.heroImageUrl} 
                          alt="Banner da vitrine" 
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button size="sm" variant="destructive" onClick={removeHero}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remover
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="file"
                          id="hero-upload"
                          className="hidden"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileUpload}
                          disabled={uploading}
                        />
                        <label 
                          htmlFor="hero-upload"
                          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {uploading ? (
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                          ) : (
                            <>
                              <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                              <span className="text-sm font-bold text-muted-foreground">Clique para enviar o banner</span>
                              <span className="text-xs text-muted-foreground/60">ou arraste a imagem aqui</span>
                            </>
                          )}
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-primary" />
                      <label className="text-sm font-medium text-foreground">Fundo premium da página</label>
                    </div>
                    <p className="text-xs text-muted-foreground">Esse fundo fica separado do banner e afeta apenas o pano de fundo da vitrine.</p>

                    {customization.theme.backgroundImageUrl ? (
                      <div className="relative group rounded-xl overflow-hidden border-2 border-primary/20 aspect-video bg-muted">
                        <img
                          src={customization.theme.backgroundImageUrl}
                          alt="Fundo da vitrine"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button size="sm" variant="destructive" onClick={removeBackground}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remover
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="file"
                          id="bg-upload"
                          className="hidden"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileUpload}
                          disabled={uploading}
                        />
                        <label
                          htmlFor="bg-upload"
                          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {uploading ? (
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                          ) : (
                            <>
                              <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                              <span className="text-sm font-bold text-muted-foreground">Clique para enviar o fundo</span>
                              <span className="text-xs text-muted-foreground/60">ou arraste a imagem aqui</span>
                            </>
                          )}
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Intensidade do Overlay</label>
                    <p className="text-xs text-muted-foreground mb-4">Ajuste para garantir que os textos fiquem legíveis sobre o fundo.</p>
                    <div className="grid grid-cols-4 gap-2">
                      {(['none', 'soft', 'medium', 'strong'] as const).map((o) => (
                        <button
                          key={o}
                          onClick={() => updateTheme({ backgroundOverlay: o })}
                          className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${
                            customization.theme.backgroundOverlay === o
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-muted-foreground/30 bg-card text-foreground'
                          }`}
                        >
                          {o === 'none' ? 'Nenhum' : o === 'soft' ? 'Leve' : o === 'medium' ? 'Médio' : 'Forte'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
                    <p className="text-[11px] text-primary leading-relaxed font-medium">
                      <strong>Dica UX:</strong> Use o banner para topo da loja e o fundo premium só se quiser um pano de fundo mais dramático. Assim o banner não vira background global.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'appearance' && (
            <Card className="p-6 bg-card border-border shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Palette className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Aparência</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Modo de Cor</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => updateTheme({ colorMode: mode })}
                        className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all ${
                          customization.theme.colorMode === mode
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-muted-foreground/30 bg-card text-foreground'
                        }`}
                      >
                        {mode === 'light' ? 'Claro' : mode === 'dark' ? 'Escuro' : 'Sistema'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Cor Principal</label>
                  <div className="flex gap-2">
                    <input 
                      type="color" 
                      value={customization.theme.primaryColor}
                      onChange={(e) => updateTheme({ primaryColor: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer border-none p-0 overflow-hidden"
                    />
                    <input 
                      type="text" 
                      value={customization.theme.primaryColor}
                      onChange={(e) => updateTheme({ primaryColor: e.target.value })}
                      className="flex-1 px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm uppercase font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Estilo de Fundo</label>
                  <select 
                    value={customization.theme.backgroundStyle}
                    onChange={(e) => updateTheme({ backgroundStyle: e.target.value as StorefrontThemeSettings['backgroundStyle'] })}
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm"
                  >
                    <option value="clean">Clean (Branco/Preto)</option>
                    <option value="soft">Soft (Cores suaves)</option>
                    <option value="premium">Premium (Gradientes)</option>
                    <option value="brand">Brand (Focado na marca)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Arredondamento (Radius)</label>
                  <div className="grid grid-cols-5 gap-2">
                    {(['sm', 'md', 'lg', 'xl', '2xl'] as StorefrontRadius[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => updateTheme({ borderRadius: r })}
                        className={`px-2 py-2 text-xs font-bold rounded-lg border transition-all ${
                          customization.theme.borderRadius === r
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-muted-foreground/30 bg-card text-foreground'
                        }`}
                      >
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Estilo de Fonte</label>
                  <select 
                    value={customization.theme.fontStyle}
                    onChange={(e) => updateTheme({ fontStyle: e.target.value as StorefrontThemeSettings['fontStyle'] })}
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm"
                  >
                    <option value="default">Padrão (Inter)</option>
                    <option value="modern">Moderno (Sans)</option>
                    <option value="rounded">Arredondado (Quicksand)</option>
                  </select>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'layout' && (
            <>
            <Card className="p-6 bg-card border-border shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Layout className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Layout do Cardápio</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Layout dos Produtos</label>
                  <select 
                    value={customization.layout.productLayout}
                    onChange={(e) => updateLayout({ productLayout: e.target.value as StorefrontProductLayout })}
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm"
                  >
                    <option value="grid">Grade (Padrão)</option>
                    <option value="list">Lista (Econômico)</option>
                    <option value="compact">Compacto (Denso)</option>
                    <option value="square">Quadrado (Visual)</option>
                    <option value="premium-card">Premium (Sofisticado)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Layout das Categorias</label>
                  <select 
                    value={customization.layout.categoryLayout}
                    onChange={(e) => updateLayout({ categoryLayout: e.target.value as StorefrontCategoryLayout })}
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm"
                  >
                    <option value="tabs">Abas superiores</option>
                    <option value="horizontal-scroll">Scroll Horizontal</option>
                    <option value="sections">Seções (Anchor)</option>
                    <option value="sidebar">Barra Lateral (Desktop)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Modo de Imagem</label>
                  <select 
                    value={customization.layout.productImageMode}
                    onChange={(e) => updateLayout({ productImageMode: e.target.value as StorefrontImageMode })}
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm"
                  >
                    <option value="cover">Preencher (Cover)</option>
                    <option value="contain">Conter (Contain)</option>
                    <option value="hidden">Ocultar imagens</option>
                  </select>
                </div>

                <div className="flex flex-col gap-4 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={customization.layout.showProductDescription}
                      onChange={(e) => updateLayout({ showProductDescription: e.target.checked })}
                      className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-primary/50"
                    />
                    <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground">Mostrar descrição dos produtos</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={customization.layout.showBadges}
                      onChange={(e) => updateLayout({ showBadges: e.target.checked })}
                      className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-primary/50"
                    />
                    <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground">Mostrar badges de destaque</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={customization.layout.stickyCart}
                      onChange={(e) => updateLayout({ stickyCart: e.target.checked })}
                      className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-primary/50"
                    />
                    <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground">Carrinho flutuante (Sticky)</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={customization.layout.heroEnabled}
                      onChange={(e) => updateLayout({ heroEnabled: e.target.checked })}
                      className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-primary/50"
                    />
                    <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground">Habilitar Banner (Hero)</span>
                  </label>
                </div>
              </div>
            </Card>
            <Card className="p-6 bg-card border-border shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Vitrine de destaques</h2>
                  <p className="text-sm text-muted-foreground">
                    Uma faixa editorial no topo do cardápio, usando somente produtos disponíveis.
                  </p>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customization.layout.showcase.enabled}
                    onChange={(event) => updateShowcase({ enabled: event.target.checked })}
                    className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-primary/50"
                  />
                  <span className="text-sm font-semibold text-foreground">Ativar vitrine</span>
                </label>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="showcase-title">Título</label>
                  <input
                    id="showcase-title"
                    value={customization.layout.showcase.title}
                    maxLength={80}
                    onChange={(event) => updateShowcase({ title: event.target.value })}
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="showcase-max-items">Quantidade máxima</label>
                  <input
                    id="showcase-max-items"
                    type="number"
                    min={1}
                    max={12}
                    value={customization.layout.showcase.maxItems}
                    onChange={(event) => updateShowcase({ maxItems: Number(event.target.value) })}
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="showcase-mode">Modo</label>
                  <select
                    id="showcase-mode"
                    value={customization.layout.showcase.mode}
                    onChange={(event) => updateShowcase({ mode: event.target.value as StorefrontShowcaseMode })}
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm"
                  >
                    <option value="manual">Manual</option>
                    <option value="automatic">Automático</option>
                    <option value="hybrid">Híbrido</option>
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="showcase-strategy">Estratégia automática</label>
                  <select
                    id="showcase-strategy"
                    value={customization.layout.showcase.automaticStrategy}
                    disabled={customization.layout.showcase.mode === 'manual'}
                    onChange={(event) => updateShowcase({ automaticStrategy: event.target.value as StorefrontShowcaseStrategy })}
                    className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm disabled:opacity-50"
                  >
                    <option value="none">Nenhuma</option>
                    <option value="best_selling">Mais vendidos — últimos 30 dias</option>
                    <option value="promotions">Promoções vigentes</option>
                  </select>
                </div>
              </div>

              {(customization.layout.showcase.mode === 'manual' || customization.layout.showcase.mode === 'hybrid') && (
                <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold text-foreground">Produtos elegíveis</legend>
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                      {eligibleShowcaseProducts.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">Nenhum produto elegível no cardápio.</p>
                      ) : eligibleShowcaseProducts.map((product) => (
                        <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={customization.layout.showcase.manualProductIds.includes(product.id)}
                            onChange={() => toggleShowcaseProduct(product.id)}
                            className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-primary/50"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{product.name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">Ordem manual</p>
                    <div className="min-h-24 space-y-2 rounded-lg border border-border p-2">
                      {orderedShowcaseProducts.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">Selecione produtos para definir a ordem editorial.</p>
                      ) : orderedShowcaseProducts.map((product, index) => (
                        <div key={product.id} className="flex items-center gap-2 rounded-md bg-muted p-2">
                          <span className="w-6 text-center text-xs font-black text-muted-foreground">{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{product.name}</span>
                          <button type="button" onClick={() => moveShowcaseProduct(product.id, -1)} disabled={index === 0} aria-label={`Mover ${product.name} para cima`} className="rounded p-1 hover:bg-background disabled:opacity-30">
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => moveShowcaseProduct(product.id, 1)} disabled={index === orderedShowcaseProducts.length - 1} aria-label={`Mover ${product.name} para baixo`} className="rounded p-1 hover:bg-background disabled:opacity-30">
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => toggleShowcaseProduct(product.id)} aria-label={`Remover ${product.name} da vitrine`} className="rounded p-1 text-red-500 hover:bg-red-500/10">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>
            </>
          )}
        </div>

        {/* Preview Sidebar */}
        <div className="space-y-6">
          <Card className="p-6 sticky top-24 border-2 border-primary/20 shadow-xl overflow-hidden bg-card text-foreground">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Preview</h2>
              </div>
              <Badge variant="info" className="text-[10px]">ADMIN PREVIEW</Badge>
            </div>

            <div className="flex justify-center py-2">
              {/* Smartphone Wrapper Mockup */}
              <div 
                className="relative w-[285px] h-[570px] bg-slate-950 rounded-[40px] border-[10px] border-slate-900 shadow-2xl flex flex-col overflow-hidden ring-4 ring-slate-800/10 dark:ring-slate-700/10 ring-offset-2 dark:ring-offset-slate-950 transition-all duration-500"
                style={{
                  '--preview-primary': primaryHex,
                  '--preview-primary-foreground': '#ffffff',
                  '--storefront-primary': primaryHex,
                  '--storefront-primary-foreground': '#ffffff',
                  '--storefront-primary-5': primary5,
                  '--storefront-primary-10': primary10,
                  '--preview-radius': 
                    customization.theme.borderRadius === 'sm' ? '4px' :
                    customization.theme.borderRadius === 'md' ? '8px' :
                    customization.theme.borderRadius === 'lg' ? '12px' :
                    customization.theme.borderRadius === 'xl' ? '16px' : '24px'
                } as React.CSSProperties}
              >
                {/* Notch / Speaker & Camera */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4 bg-slate-900 rounded-b-2xl z-30 flex items-center justify-center">
                  <div className="w-10 h-0.5 bg-slate-800 rounded-full mb-0.5" />
                  <div className="w-1.5 h-1.5 bg-slate-950 rounded-full border border-slate-800/50 absolute right-3 top-1" />
                </div>

                {/* Status Bar */}
                <div className={`px-5 pt-4 pb-1 flex justify-between items-center text-[8px] font-bold z-20 select-none transition-all duration-500 ${
                  isDark ? 'text-slate-400 bg-[#0f172a]' : 'text-slate-500 bg-white'
                }`}>
                  <span>09:41</span>
                  <div className="flex items-center gap-1 select-none">
                    <span>📶</span>
                    <span>🔋 85%</span>
                  </div>
                </div>

                {/* Screen Content Wrapper */}
                <div 
                  className={`flex-1 overflow-y-auto no-scrollbar transition-all duration-500 flex flex-col relative ${getFontStyle()} ${getBackgroundStyles()}`}
                  style={{
                    fontFamily: customization.theme.fontStyle === 'rounded'
                      ? '"Quicksand", "Nunito", system-ui, -apple-system, sans-serif'
                      : customization.theme.fontStyle === 'modern'
                        ? 'system-ui, -apple-system, sans-serif'
                        : '"Inter", system-ui, sans-serif'
                  }}
                >
                  {/* Background Premium Image and Overlay */}
                  {showBgImage && (
                    <div 
                      className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-500"
                      style={{ backgroundImage: `url(${customization.theme.backgroundImageUrl})` }}
                    />
                  )}
                  {showBgImage && (
                    <div 
                      className={`absolute inset-0 z-0 transition-all duration-500 ${
                        isDark ? 'bg-black' : 'bg-white'
                      }`}
                      style={{ 
                        opacity: 
                          customization.theme.backgroundOverlay === 'none' ? 0 :
                          customization.theme.backgroundOverlay === 'soft' ? 0.2 :
                          customization.theme.backgroundOverlay === 'medium' ? 0.5 : 0.8
                      }}
                    />
                  )}

                  {/* Real Content container */}
                  <div className="z-10 relative flex-1 flex flex-col pb-16">
                    {customization.layout.heroEnabled && showHeroImage ? (
                      <div className="px-3 pt-3">
                        <div className="relative overflow-hidden rounded-2xl border border-[var(--storefront-border)] bg-[var(--storefront-card)] shadow-sm">
                          <div className="aspect-[16/6] min-h-24 max-h-36">
                            <img
                              src={customization.theme.heroImageUrl || undefined}
                              alt="Banner da vitrine"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Logo e Nome do Tenant Real */}
                    <div className={`p-3.5 border-b flex items-center gap-2.5 transition-all duration-500 ${
                      isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'
                    }`}>
                      {tenantLogo ? (
                        <img src={tenantLogo} className="w-8 h-8 rounded-[var(--preview-radius)] flex-shrink-0 object-cover" alt="" />
                      ) : (
                        <div className="w-8 h-8 rounded-[var(--preview-radius)] flex-shrink-0 flex items-center justify-center font-black text-xs text-white" style={{ backgroundColor: primaryHex }}>
                          {(tenantName || 'G').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 text-left">
                        <div className="font-bold text-[11px] truncate leading-tight">{tenantName || 'Sua Loja'}</div>
                        <div className="flex items-center gap-1 mt-0.5 select-none">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                          <span className="text-[7.5px] text-muted-foreground uppercase font-black tracking-widest">Aberto agora</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <div className={`px-2 py-0.5 rounded-full border text-[7.5px] font-black uppercase ${
                          isDark ? 'border-slate-800 text-slate-300 bg-slate-900/20' : 'border-slate-200 text-slate-650 bg-white/50'
                        }`}>
                          Entrar
                        </div>
                      </div>
                    </div>

                    {/* Categorias Navigation (Tabs horizontal layout) */}
                    <div className={`p-3 pb-1 border-b flex gap-1.5 overflow-x-auto no-scrollbar select-none transition-all duration-500 ${
                      isDark ? 'border-slate-800 bg-slate-900/20' : 'border-slate-100 bg-slate-50/20'
                    }`}>
                      {displayCategories.map((cat, idx) => (
                        <div 
                          key={cat.id} 
                          className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase whitespace-nowrap transition-all duration-300 ${
                            idx === 0 
                              ? 'bg-[var(--preview-primary)] text-white shadow-sm' 
                              : isDark 
                                ? 'bg-slate-800/60 text-slate-400 hover:text-slate-200' 
                                : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {cat.name}
                        </div>
                      ))}
                    </div>

                    {customization.layout.showcase.enabled && previewShowcaseProducts.length > 0 && (
                      <div className="border-b p-3">
                        <p className="text-[7px] font-black uppercase tracking-[0.18em] text-[var(--preview-primary)]">Seleção da casa</p>
                        <h3 className="mb-2 text-left text-[10px] font-black text-foreground">{customization.layout.showcase.title}</h3>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar">
                          {previewShowcaseProducts.map((product) => (
                            <div key={product.id} className="w-36 shrink-0">
                              {renderProductCard(product)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Content Section (Combos and Products) */}
                    <div className="p-3 space-y-5">
                      {/* Combos Especiais */}
                      {displayCombos.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-[9px] font-black text-white bg-[var(--preview-primary)] mb-2 px-2 py-1.5 rounded flex items-center shadow-sm uppercase tracking-wider text-left">
                            Combos Especiais
                          </h3>
                          <div className="flex flex-col gap-2">
                            {displayCombos.map((combo) => (
                              <div
                                key={combo.id}
                                className={`p-2 border border-dashed rounded-[var(--preview-radius)] flex gap-2 transition-all duration-300 ${
                                  isDark ? 'border-slate-800 bg-slate-900/10' : 'border-slate-250 bg-slate-50/30'
                                }`}
                              >
                                <div className="flex-1 text-left min-w-0 flex flex-col justify-between">
                                  <div>
                                    <h4 className="font-bold text-[9px] text-foreground truncate">{combo.name}</h4>
                                    <p className="text-[7px] text-muted-foreground line-clamp-2 leading-snug mt-0.5 italic">{combo.description}</p>
                                  </div>
                                  <span className="text-[9px] font-black text-foreground pt-1 block">
                                    R$ {combo.basePrice.toFixed(2)}
                                  </span>
                                </div>
                                {combo.image && (
                                  <div className="w-14 h-14 rounded-[calc(var(--preview-radius)-4px)] overflow-hidden shrink-0 shadow-sm bg-muted">
                                    <img src={combo.image} className="w-full h-full object-cover" alt={combo.name} />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Categorias e Produtos */}
                      {displayCategories.map((category) => (
                        <div key={category.id} className="space-y-2.5">
                          <h3 className="text-[9px] font-black text-white bg-[var(--preview-primary)] mb-2 px-2 py-1.5 rounded flex items-center shadow-sm uppercase tracking-wider text-left">
                            {category.name}
                          </h3>
                          
                          <div className={getProductListClass()}>
                            {category.products.map((product) => renderProductCard(product))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sticky Floating Cart */}
                {customization.layout.stickyCart && (
                  <div className="absolute bottom-6 left-0 right-0 px-3.5 z-30 pointer-events-none select-none">
                    <div 
                      className="w-full h-11 text-white rounded-xl shadow-lg flex items-center justify-between px-4 pointer-events-auto active:scale-95 transition-transform"
                      style={{ backgroundColor: primaryHex }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative text-xs">
                          <span>🛍️</span>
                          <span className="absolute -top-1.5 -right-2.5 bg-white text-[7px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center text-slate-900 shadow-sm">
                            1
                          </span>
                        </div>
                        <span className="font-bold text-[8.5px] uppercase tracking-wider">Ver sacola</span>
                      </div>
                      <span className="font-black text-[9.5px]">R$ 28,90</span>
                    </div>
                  </div>
                )}

                {/* Home Indicator */}
                <div className={`h-4 w-full flex items-center justify-center z-20 transition-all duration-500 ${
                  isDark ? 'bg-[#0f172a]' : 'bg-white'
                }`}>
                  <div className="w-20 h-0.5 bg-slate-500/35 rounded-full" />
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed italic">
                <MousePointer2 className="w-3 h-3 inline mr-1 mb-0.5" />
                Preview com dados reais do seu cardápio. Para ver o resultado público, salve e acesse sua loja.
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <Smartphone className="w-3 h-3" />
                <span>As alterações podem levar alguns segundos para propagar.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
