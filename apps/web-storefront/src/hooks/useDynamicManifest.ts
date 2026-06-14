import { useEffect } from 'react';

export function useDynamicManifest(tenantSlug?: string) {
  useEffect(() => {
    if (!tenantSlug) return;

    // Find the manifest link tag
    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    
    // Se a tag existir e já estiver apontando para o arquivo dinâmico correto, não faz nada
    if (manifestLink && manifestLink.href.includes(`/manifest/${tenantSlug}.webmanifest`)) {
      return;
    }

    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }

    manifestLink.href = `/manifest/${tenantSlug}.webmanifest`;
  }, [tenantSlug]);
}
