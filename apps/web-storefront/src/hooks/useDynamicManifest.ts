import { useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

export function useDynamicManifest(tenantSlug?: string) {
  useEffect(() => {
    if (!tenantSlug) return;

    // Find the manifest link tag
    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    
    const manifestUrl = `${API_URL}/public/storefront/${tenantSlug}/manifest`;

    // Se a tag existir e já estiver apontando para o arquivo dinâmico correto, não faz nada
    if (manifestLink && manifestLink.href === manifestUrl) {
      return;
    }

    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }

    manifestLink.href = manifestUrl;
  }, [tenantSlug]);
}
