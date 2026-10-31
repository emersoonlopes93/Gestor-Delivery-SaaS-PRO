import React from 'react';
import { StorefrontThemeProvider } from './StorefrontThemeProvider';
import { StorefrontThemeSettings } from '@gestor/theme';
import { cn } from '../cn';

interface StorefrontShellProps {
  settings: Partial<StorefrontThemeSettings>;
  children: React.ReactNode;
  className?: string;
}

/**
 * StorefrontShell - The root wrapper for the storefront.
 * Ensures the theme is applied and provides a consistent background.
 */
export function StorefrontShell({ settings, children, className }: StorefrontShellProps) {
  return (
    <StorefrontThemeProvider settings={settings} className={cn('min-h-screen bg-[var(--storefront-background)] text-[var(--storefront-foreground)] transition-colors duration-300 relative', className)}>
      {/* Background Layer */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center bg-no-repeat transition-all duration-700"
        style={{ backgroundImage: 'var(--storefront-background-image)' }}
      />
      {/* Overlay Layer */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none transition-colors duration-700"
        style={{ backgroundColor: 'var(--storefront-background-overlay)' }}
      />
      {/* Content Layer */}
      <div className="relative z-10">
        {children}
      </div>
    </StorefrontThemeProvider>
  );
}
