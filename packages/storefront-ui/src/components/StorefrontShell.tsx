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
    <StorefrontThemeProvider settings={settings} className={cn('min-h-screen bg-[var(--storefront-background)] text-[var(--storefront-foreground)] transition-colors duration-300', className)}>
      {children}
    </StorefrontThemeProvider>
  );
}
