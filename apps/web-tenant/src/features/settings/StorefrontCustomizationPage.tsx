import React, { useState, useEffect, useRef } from 'react';
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
import type { StorefrontPayload, StorefrontPreviewRequest } from '@gestor/types';
import { StorefrontPreview } from './StorefrontPreview';

export function StorefrontCustomizationPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'presets' | 'background' | 'appearance' | 'layout'>('presets');
  const [previewPayload, setPreviewPayload] = useState<StorefrontPayload | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>('delivery');
  const previewRequestSequence = useRef(0);
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
      const customRes = await api.get<{ theme: StorefrontThemeSettings; layout: StorefrontLayoutSettings }>('/tenant/storefront-customization');
      
      if (customRes.success) {
        setCustomization(customRes.data);
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

  useEffect(() => {
    if (loading) return;

    const timeoutId = window.setTimeout(async () => {
      const sequence = ++previewRequestSequence.current;
      setPreviewLoading(true);
      setPreviewError(null);

      const request: StorefrontPreviewRequest = {
        customization: {
          theme: { ...customization.theme },
          layout: { ...customization.layout },
        },
        fulfillmentType,
      };

      try {
        const response = await api.post<StorefrontPayload>('/tenant/storefront-preview', request);
        if (sequence === previewRequestSequence.current && response.success) {
          setPreviewPayload(response.data);
        }
      } catch (error) {
        if (sequence === previewRequestSequence.current) {
          console.error('Erro ao carregar preview canônico:', error);
          setPreviewError('Não foi possível atualizar o preview.');
        }
      } finally {
        if (sequence === previewRequestSequence.current) setPreviewLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [customization, fulfillmentType, loading]);

  const eligibleShowcaseProducts = previewPayload
    ? [...new Map(
        previewPayload.categories
          .flatMap((category) => category.products)
          .filter((product) => product.isAvailable)
          .map((product) => [product.id, product]),
      ).values()]
    : [];
  const orderedShowcaseProducts = customization.layout.showcase.manualProductIds
    .map((id) => eligibleShowcaseProducts.find((product) => product.id === id))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));

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

            <div className="mb-4 flex rounded-lg border border-border bg-muted p-1" aria-label="Canal simulado">
              {(['delivery', 'pickup'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFulfillmentType(option)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition-colors ${
                    fulfillmentType === option ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {option === 'delivery' ? 'Entrega' : 'Retirada'}
                </button>
              ))}
            </div>

            <div className="flex justify-center py-2">
              <div className="relative flex h-[570px] w-[285px] flex-col overflow-hidden rounded-[40px] border-[10px] border-slate-900 bg-slate-950 shadow-2xl ring-4 ring-slate-800/10 ring-offset-2 dark:ring-slate-700/10 dark:ring-offset-slate-950">
                <div className="absolute left-1/2 top-0 z-30 flex h-4 w-32 -translate-x-1/2 items-center justify-center rounded-b-2xl bg-slate-900">
                  <div className="mb-0.5 h-0.5 w-10 rounded-full bg-slate-800" />
                </div>
                <div className="z-20 flex items-center justify-between bg-slate-950 px-5 pb-1 pt-4 text-[8px] font-bold text-slate-400">
                  <span>09:41</span>
                  <span>ADMIN</span>
                </div>
                <div className="flex-1 overflow-y-auto bg-[var(--storefront-background)] no-scrollbar">
                  {previewPayload ? <StorefrontPreview payload={previewPayload} /> : null}
                  {previewLoading && !previewPayload ? (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">Atualizando preview…</div>
                  ) : null}
                  {previewError ? (
                    <div className="m-3 rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700">{previewError}</div>
                  ) : null}
                </div>
                <div className="z-20 flex h-4 w-full items-center justify-center bg-slate-950">
                  <div className="h-0.5 w-20 rounded-full bg-slate-500/35" />
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
