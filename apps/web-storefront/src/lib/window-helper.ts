/**
 * Helper para manipulação segura do objeto global window em integrações externas
 */

/**
 * Registra um callback global temporário no window de forma segura
 */
export function registerGlobalCallback(name: string, callback: () => void): void {
  const win = window as unknown as Record<string, unknown>;
  win[name] = callback;
}

/**
 * Remove um callback global do window
 */
export function removeGlobalCallback(name: string): void {
  const win = window as unknown as Record<string, unknown>;
  if (name in win) {
    delete win[name];
  }
}

/**
 * Verifica se o Google Maps já está carregado no objeto global
 */
export function isGoogleMapsLoaded(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as Record<string, unknown>;
  return !!(win.google && typeof win.google === 'object' && (win.google as Record<string, unknown>).maps);
}
