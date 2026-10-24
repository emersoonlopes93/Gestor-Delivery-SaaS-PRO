import React, { useMemo } from 'react';
import { StorefrontThemeSettings, applyStorefrontThemeVariables } from '@gestor/theme';

interface StorefrontThemeProviderProps {
  settings: Partial<StorefrontThemeSettings>;
  children: React.ReactNode;
  className?: string;
}

/**
 * StorefrontThemeProvider - Applies theme variables and data attributes for storefront isolation.
 * Uses CSS variables for branding instead of dynamic Tailwind classes.
 */
export function StorefrontThemeProvider({ settings, children, className }: StorefrontThemeProviderProps) {
  const cssVars = useMemo(() => applyStorefrontThemeVariables(settings), [settings]);

  return (
    <div 
      data-storefront-theme={settings.colorMode || 'light'}
      style={cssVars}
      className={className}
    >
      {children}
    </div>
  );
}
