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
  Image as ImageIcon
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
  StorefrontPreset
} from '@gestor/theme';
import { ProductCategory, Product, Tenant, TenantSettings } from '@gestor/types';

export function StorefrontCustomizationPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      const response = await api.patch('/tenant/storefront-customization', customization);
      if (response.success) {
        setCustomization(response.data as any);
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

      const response = await api.post<any>('/upload/storefront-background', formData);
      if (response.success) {
        updateTheme({ 
          backgroundImageUrl: response.data.publicUrl,
          backgroundImageMediaId: response.data.id
        });
      }
    } catch (error) {
      console.error('Erro no upload:', error);
      alert('Falha ao enviar imagem.');
    } finally {
      setUploading(false);
    }
  };

  const removeBackground = () => {
    updateTheme({ 
      backgroundImageUrl: null,
      backgroundImageMediaId: null
    });
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
          {/* Presets Rápidos */}
          <Card className="p-6 bg-card border-border">
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

          {/* Background Premium */}
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-2 mb-6">
              <ImageIcon className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Background Premium</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Imagem de Fundo</label>
                  <p className="text-xs text-muted-foreground mb-2">JPG, PNG ou WebP. Recomendado: 1920x1080px (Máx 5MB).</p>
                  
                  {customization.theme.backgroundImageUrl ? (
                    <div className="relative group rounded-xl overflow-hidden border-2 border-primary/20 aspect-video bg-muted">
                      <img 
                        src={customization.theme.backgroundImageUrl} 
                        alt="Background Preview" 
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
                            <span className="text-sm font-bold text-muted-foreground">Clique para enviar</span>
                            <span className="text-xs text-muted-foreground/60">ou arraste a imagem aqui</span>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Intensidade do Overlay</label>
                  <p className="text-xs text-muted-foreground mb-4">Ajuste para garantir que os textos fiquem legíveis sobre a imagem.</p>
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
                    <strong>Dica UX:</strong> Se sua imagem for muito colorida ou detalhada, use o overlay <strong>Médio</strong> ou <strong>Forte</strong> para manter o contraste do cardápio.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Aparência */}
          <Card className="p-6 bg-card border-border">
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
                  onChange={(e) => updateTheme({ backgroundStyle: e.target.value as any })}
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
                  onChange={(e) => updateTheme({ fontStyle: e.target.value as any })}
                  className="w-full px-3 py-2 border border-border bg-card text-foreground rounded-lg text-sm"
                >
                  <option value="default">Padrão (Inter)</option>
                  <option value="modern">Moderno (Sans)</option>
                  <option value="rounded">Arredondado (Quicksand)</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Layout do Cardápio */}
          <Card className="p-6 bg-card border-border">
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

            <div 
              className={`rounded-2xl border transition-all duration-500 overflow-hidden shadow-sm ${
                customization.theme.colorMode === 'dark' 
                  ? 'bg-[#0f172a] border-slate-800 text-slate-100' 
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
              style={{
                '--preview-primary': customization.theme.primaryColor,
                '--preview-radius': 
                  customization.theme.borderRadius === 'sm' ? '4px' :
                  customization.theme.borderRadius === 'md' ? '8px' :
                  customization.theme.borderRadius === 'lg' ? '12px' :
                  customization.theme.borderRadius === 'xl' ? '16px' : '24px'
              } as React.CSSProperties}
            >
              {/* Logo e Nome do Tenant Real */}
              <div className={`p-4 border-b flex items-center gap-3 ${
                customization.theme.colorMode === 'dark' ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'
              }`}>
                {tenantLogo ? (
                  <img src={tenantLogo} className="w-10 h-10 rounded-[var(--preview-radius)] flex-shrink-0 object-cover" alt="" />
                ) : (
                  <div className={`w-10 h-10 rounded-[var(--preview-radius)] flex-shrink-0 flex items-center justify-center font-black text-sm text-white ${
                    customization.theme.colorMode === 'dark' ? 'bg-slate-800' : 'bg-slate-350'
                  }`} style={{ backgroundColor: customization.theme.primaryColor }}>
                    {(tenantName || 'G').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs truncate leading-tight">{tenantName || 'Sua Loja'}</div>
                  <div className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mt-0.5">Loja Aberta</div>
                </div>
              </div>

              {/* Categorias Reais do Tenant */}
              <div className="p-4 space-y-4">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {categories.length > 0 ? (
                    categories.slice(0, 4).map((cat, idx) => (
                      <div 
                        key={cat.id} 
                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase whitespace-nowrap transition-colors ${
                          idx === 0 
                            ? 'bg-[var(--preview-primary)] text-white' 
                            : customization.theme.colorMode === 'dark' 
                              ? 'bg-slate-800 text-slate-400' 
                              : 'bg-slate-100 text-slate-450'
                        }`}
                      >
                        {cat.name}
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="px-3 py-1 rounded-full bg-[var(--preview-primary)] text-white text-[9px] font-black uppercase">Burgers</div>
                      <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                        customization.theme.colorMode === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-450'
                      }`}>Bebidas</div>
                    </>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {categories[0]?.name || 'Principais'}
                  </div>
                  
                  {/* Produtos Reais do Tenant baseado no Layout Escolhido */}
                  <div className={`grid gap-3 ${
                    customization.layout.productLayout === 'grid' ? 'grid-cols-2' : 'grid-cols-1'
                  }`}>
                    {products.length > 0 ? (
                      products
                        .filter(p => !p.categoryId || p.categoryId === categories[0]?.id)
                        .slice(0, customization.layout.productLayout === 'grid' ? 2 : 1)
                        .map((product) => (
                          <div 
                            key={product.id}
                            className={`p-3 border rounded-[var(--preview-radius)] transition-all ${
                              customization.theme.colorMode === 'dark' ? 'border-slate-800 bg-slate-900/30' : 'border-slate-200 bg-white'
                            } ${
                              customization.layout.productLayout === 'premium-card' ? 'shadow-lg border-2 border-[var(--preview-primary)]' : 'shadow-sm'
                            }`}
                          >
                            <div className={`flex gap-3 ${
                              ['grid', 'square', 'premium-card'].includes(customization.layout.productLayout) ? 'flex-col' : 'flex-row'
                            }`}>
                              {customization.layout.productImageMode !== 'hidden' && (
                                <div className={`rounded-[calc(var(--preview-radius)-4px)] flex-shrink-0 bg-muted overflow-hidden ${
                                  ['grid', 'square', 'premium-card'].includes(customization.layout.productLayout) ? 'aspect-video w-full' : 'w-16 h-16'
                                }`}>
                                  {product.image ? (
                                    <img src={product.image} className="w-full h-full object-cover" alt="" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-muted-foreground uppercase bg-slate-100 dark:bg-slate-800">
                                      Sem Img
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="font-bold text-xs truncate">{product.name}</div>
                                {customization.layout.showProductDescription && product.shortDescription && (
                                  <div className="text-[10px] text-muted-foreground line-clamp-1">{product.shortDescription}</div>
                                )}
                                <div className="flex justify-between items-center pt-1.5">
                                  <span className="text-xs font-black">
                                    R$ {Number(product.basePrice ?? 0).toFixed(2)}
                                  </span>
                                  <div 
                                    className="h-6 w-12 rounded-[calc(var(--preview-radius)-4px)] flex items-center justify-center text-[9px] font-bold text-white uppercase select-none cursor-pointer" 
                                    style={{ backgroundColor: customization.theme.primaryColor }}
                                  >
                                    Ver
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                    ) : (
                      // Fallback Mock se o banco estiver vazio
                      <div className={`p-3 border rounded-[var(--preview-radius)] transition-all ${
                        customization.theme.colorMode === 'dark' ? 'border-slate-800 bg-slate-900/30' : 'border-slate-200 bg-white'
                      } ${
                        customization.layout.productLayout === 'premium-card' ? 'shadow-lg border-2 border-[var(--preview-primary)]' : ''
                      }`}>
                        <div className={`flex gap-3 ${
                          ['grid', 'square', 'premium-card'].includes(customization.layout.productLayout) ? 'flex-col' : 'flex-row'
                        }`}>
                          {customization.layout.productImageMode !== 'hidden' && (
                            <div className={`rounded-[calc(var(--preview-radius)-4px)] flex-shrink-0 bg-slate-200 dark:bg-slate-800 ${
                              ['grid', 'square', 'premium-card'].includes(customization.layout.productLayout) ? 'aspect-video w-full' : 'w-16 h-16'
                            }`} />
                          )}
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-32 bg-slate-350 dark:bg-slate-700 rounded" />
                            <div className="h-2 w-20 bg-slate-250 dark:bg-slate-800 rounded" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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

              {/* Bottom Action for easier access */}
              <Button onClick={handleSave} className="w-full shadow-lg shadow-primary-100" size="lg" disabled={saving}>
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Todas Alterações
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
