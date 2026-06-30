/**
 * @gestor/theme
 * Shared design system tokens, types and safe helpers.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export type StorefrontProductLayout = 
  | 'list' 
  | 'grid' 
  | 'compact' 
  | 'square' 
  | 'premium-card';

export type StorefrontCategoryLayout = 
  | 'tabs' 
  | 'horizontal-scroll' 
  | 'sidebar' 
  | 'sections';

export type StorefrontImageMode = 
  | 'cover' 
  | 'contain' 
  | 'hidden';

export type StorefrontRadius = 
  | 'sm' 
  | 'md' 
  | 'lg' 
  | 'xl' 
  | '2xl';

export type StorefrontThemeSettings = {
  version: number;
  colorMode: ThemeMode;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  heroImageUrl?: string | null;
  heroImageMediaId?: string | null;
  backgroundStyle: 'clean' | 'soft' | 'premium' | 'brand';
  backgroundImageUrl?: string | null;
  backgroundImageMediaId?: string | null;
  backgroundOverlay?: 'none' | 'soft' | 'medium' | 'strong';
  borderRadius: StorefrontRadius;
  fontStyle: 'default' | 'modern' | 'rounded';
};

export type StorefrontLayoutSettings = {
  version: number;
  productLayout: StorefrontProductLayout;
  categoryLayout: StorefrontCategoryLayout;
  heroEnabled: boolean;
  productImageMode: StorefrontImageMode;
  showProductDescription: boolean;
  showBadges: boolean;
  stickyCart: boolean;
};

export type StorefrontPresetId = 
  | 'fast-food' 
  | 'pizza-gourmet' 
  | 'acai-tropical' 
  | 'sushi-premium' 
  | 'burger-dark' 
  | 'executive-clean' 
  | 'minimal-clean';

export type StorefrontPreset = {
  id: StorefrontPresetId;
  name: string;
  description: string;
  theme: StorefrontThemeSettings;
  layout: StorefrontLayoutSettings;
};

/**
 * Validates and sanitizes hex color strings.
 * Falls back to a safe default if invalid.
 */
export function sanitizeHexColor(color: string | undefined | null, fallback = '#0c93e9'): string {
  if (!color) return fallback;
  const hexRegex = /^#([A-Fa-f0-9]{3}){1,2}$/;
  return hexRegex.test(color) ? color : fallback;
}

/**
 * Resolves the effective theme mode based on system preference if set to 'system'.
 */
export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  if (mode === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return mode as 'light' | 'dark';
}

/**
 * Returns an accessible foreground color (white or dark blue) based on background luminance.
 */
export function getAccessibleForegroundColor(bgHex: string): string {
  const hex = bgHex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // standard luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#0f172a' : '#ffffff';
}

/**
 * Maps semantic radius names to CSS values.
 */
export function getStorefrontRadiusValue(radius: StorefrontRadius): string {
  const map: Record<StorefrontRadius, string> = {
    'sm': '0.25rem',
    'md': '0.5rem',
    'lg': '0.75rem',
    'xl': '1rem',
    '2xl': '1.5rem',
  };
  return map[radius] || map.lg;
}

/**
 * Default settings for storefront theme.
 */
export function getDefaultStorefrontThemeSettings(): StorefrontThemeSettings {
  return {
    version: 1,
    colorMode: 'light',
    primaryColor: '#0c93e9',
    backgroundStyle: 'clean',
    borderRadius: 'lg',
    fontStyle: 'default',
  };
}

/**
 * Default settings for storefront layout.
 */
export function getDefaultStorefrontLayoutSettings(): StorefrontLayoutSettings {
  return {
    version: 1,
    productLayout: 'grid',
    categoryLayout: 'sections',
    heroEnabled: true,
    productImageMode: 'cover',
    showProductDescription: true,
    showBadges: true,
    stickyCart: true,
  };
}

/**
 * Commercial presets for quick setup.
 */
export function getStorefrontPresets(): StorefrontPreset[] {
  const defaultTheme = getDefaultStorefrontThemeSettings();
  const defaultLayout = getDefaultStorefrontLayoutSettings();

  return [
    {
      id: 'fast-food',
      name: 'Fast Food',
      description: 'Cores vibrantes e layout focado em conversão rápida.',
      theme: { ...defaultTheme, primaryColor: '#e11d48', borderRadius: 'xl' },
      layout: { ...defaultLayout, productLayout: 'grid', categoryLayout: 'horizontal-scroll' }
    },
    {
      id: 'pizza-gourmet',
      name: 'Pizzaria Gourmet',
      description: 'Elegância e destaque para fotos de alta qualidade.',
      theme: { ...defaultTheme, primaryColor: '#991b1b', borderRadius: '2xl' },
      layout: { ...defaultLayout, productLayout: 'premium-card', categoryLayout: 'sections' }
    },
    {
      id: 'acai-tropical',
      name: 'Açaí Tropical',
      description: 'Visual refrescante e layout em mosaico.',
      theme: { ...defaultTheme, primaryColor: '#7e22ce', borderRadius: 'lg' },
      layout: { ...defaultLayout, productLayout: 'square', categoryLayout: 'horizontal-scroll' }
    },
    {
      id: 'sushi-premium',
      name: 'Sushi Premium',
      description: 'Sofisticação no modo escuro para experiências exclusivas.',
      theme: { ...defaultTheme, colorMode: 'dark', primaryColor: '#dc2626', borderRadius: '2xl', backgroundStyle: 'premium' },
      layout: { ...defaultLayout, productLayout: 'premium-card', categoryLayout: 'sidebar' }
    },
    {
      id: 'burger-dark',
      name: 'Burger Dark',
      description: 'Foco na fotografia com alto contraste.',
      theme: { ...defaultTheme, colorMode: 'dark', primaryColor: '#f59e0b', borderRadius: 'xl' },
      layout: { ...defaultLayout, productLayout: 'grid' }
    },
    {
      id: 'executive-clean',
      name: 'Executivo Clean',
      description: 'Leitura fácil e foco na descrição dos pratos.',
      theme: { ...defaultTheme, primaryColor: '#0f172a', borderRadius: 'md' },
      layout: { ...defaultLayout, productLayout: 'list', categoryLayout: 'sections' }
    },
    {
      id: 'minimal-clean',
      name: 'Minimal Clean',
      description: 'Otimizado para velocidade e clareza total.',
      theme: { ...defaultTheme, primaryColor: '#334155', borderRadius: 'sm' },
      layout: { ...defaultLayout, productLayout: 'compact', showProductDescription: false, showBadges: false }
    }
  ];
}

/**
 * Get a specific preset by ID with fallback to default.
 */
export function getStorefrontPresetById(id: string): StorefrontPreset | undefined {
  return getStorefrontPresets().find(p => p.id === id);
}

/**
 * Safely normalizes and fallbacks storefront theme settings.
 * Ensures no invalid values break the UI.
 */
export function normalizeStorefrontTheme(input: any): StorefrontThemeSettings {
  const defaults = getDefaultStorefrontThemeSettings();
  if (!input || typeof input !== 'object') return defaults;

  const validModes: ThemeMode[] = ['light', 'dark', 'system'];
  const validBackgrounds = ['clean', 'soft', 'premium', 'brand'];
  const validOverlays = ['none', 'soft', 'medium', 'strong'];
  const validRadius: StorefrontRadius[] = ['sm', 'md', 'lg', 'xl', '2xl'];
  const validFonts = ['default', 'modern', 'rounded'];

  return {
    version: 1,
    colorMode: validModes.includes(input.colorMode) ? input.colorMode : defaults.colorMode,
    primaryColor: sanitizeHexColor(input.primaryColor, defaults.primaryColor),
    secondaryColor: input.secondaryColor ? sanitizeHexColor(input.secondaryColor) : undefined,
    accentColor: input.accentColor ? sanitizeHexColor(input.accentColor) : undefined,
    heroImageUrl: typeof input.heroImageUrl === 'string' ? input.heroImageUrl : null,
    heroImageMediaId: typeof input.heroImageMediaId === 'string' ? input.heroImageMediaId : null,
    backgroundStyle: validBackgrounds.includes(input.backgroundStyle) ? input.backgroundStyle : defaults.backgroundStyle,
    backgroundImageUrl: typeof input.backgroundImageUrl === 'string' ? input.backgroundImageUrl : null,
    backgroundImageMediaId: typeof input.backgroundImageMediaId === 'string' ? input.backgroundImageMediaId : null,
    backgroundOverlay: validOverlays.includes(input.backgroundOverlay) ? input.backgroundOverlay : 'none',
    borderRadius: validRadius.includes(input.borderRadius) ? input.borderRadius : defaults.borderRadius,
    fontStyle: validFonts.includes(input.fontStyle) ? input.fontStyle : defaults.fontStyle,
  };
}

/**
 * Safely normalizes and fallbacks storefront layout settings.
 */
export function normalizeStorefrontLayout(input: any): StorefrontLayoutSettings {
  const defaults = getDefaultStorefrontLayoutSettings();
  if (!input || typeof input !== 'object') return defaults;

  const validProductLayouts: StorefrontProductLayout[] = ['list', 'grid', 'compact', 'square', 'premium-card'];
  const validCategoryLayouts: StorefrontCategoryLayout[] = ['tabs', 'horizontal-scroll', 'sidebar', 'sections'];
  const validImageModes: StorefrontImageMode[] = ['cover', 'contain', 'hidden'];

  return {
    version: 1,
    productLayout: validProductLayouts.includes(input.productLayout) ? input.productLayout : defaults.productLayout,
    categoryLayout: validCategoryLayouts.includes(input.categoryLayout) ? input.categoryLayout : defaults.categoryLayout,
    heroEnabled: typeof input.heroEnabled === 'boolean' ? input.heroEnabled : defaults.heroEnabled,
    productImageMode: validImageModes.includes(input.productImageMode) ? input.productImageMode : defaults.productImageMode,
    showProductDescription: typeof input.showProductDescription === 'boolean' ? input.showProductDescription : defaults.showProductDescription,
    showBadges: typeof input.showBadges === 'boolean' ? input.showBadges : defaults.showBadges,
    stickyCart: typeof input.stickyCart === 'boolean' ? input.stickyCart : defaults.stickyCart,
  };
}

/**
 * Safely generates CSS variables for the storefront based on tenant settings.
 * This avoids dynamic tailwind classes and keeps branding isolated.
 */
export function applyStorefrontThemeVariables(settings: Partial<StorefrontThemeSettings>) {
  const mode = settings.colorMode || 'light';
  const primary = sanitizeHexColor(settings.primaryColor, '#0c93e9');
  const radius = getStorefrontRadiusValue(settings.borderRadius || 'lg');
  
  const isDark = mode === 'dark';

  const overlayOpacity = {
    none: '0',
    soft: '0.2',
    medium: '0.4',
    strong: '0.6'
  }[settings.backgroundOverlay || 'none'];

  return {
    '--storefront-primary': primary,
    '--storefront-primary-foreground': getAccessibleForegroundColor(primary),
    '--storefront-radius': radius,
    
    // Background Image
    '--storefront-background-image': settings.backgroundImageUrl ? `url("${settings.backgroundImageUrl}")` : 'none',
    '--storefront-background-overlay': isDark ? `rgba(0,0,0,${overlayOpacity})` : `rgba(255,255,255,${overlayOpacity})`,
    
    // Semantic backgrounds
    '--storefront-background': isDark ? '#020617' : '#ffffff',
    '--storefront-foreground': isDark ? '#f8fafc' : '#0f172a',
    
    // Cards
    '--storefront-card': isDark ? '#0f172a' : '#ffffff',
    '--storefront-card-foreground': isDark ? '#f8fafc' : '#0f172a',
    
    // Muted
    '--storefront-muted': isDark ? '#1e293b' : '#f1f5f9',
    '--storefront-muted-foreground': isDark ? '#94a3b8' : '#64748b',
    
    // Borders
    '--storefront-border': isDark ? '#1e293b' : '#e2e8f0',
  } as any;
}
