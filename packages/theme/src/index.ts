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
  colorMode: ThemeMode;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundStyle: 'clean' | 'soft' | 'premium' | 'brand';
  borderRadius: StorefrontRadius;
  fontStyle: 'default' | 'modern' | 'rounded';
};

export type StorefrontLayoutSettings = {
  productLayout: StorefrontProductLayout;
  categoryLayout: StorefrontCategoryLayout;
  heroEnabled: boolean;
  productImageMode: StorefrontImageMode;
  showProductDescription: boolean;
  showBadges: boolean;
  stickyCart: boolean;
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
 * Safely generates CSS variables for the storefront based on tenant settings.
 * This avoids dynamic tailwind classes and keeps branding isolated.
 */
export function applyStorefrontThemeVariables(settings: Partial<StorefrontThemeSettings>) {
  const mode = settings.colorMode || 'light';
  const primary = sanitizeHexColor(settings.primaryColor, '#0c93e9');
  const radius = getStorefrontRadiusValue(settings.borderRadius || 'lg');
  
  const isDark = mode === 'dark';

  return {
    '--storefront-primary': primary,
    '--storefront-primary-foreground': getAccessibleForegroundColor(primary),
    '--storefront-radius': radius,
    
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
  } as React.CSSProperties;
}
