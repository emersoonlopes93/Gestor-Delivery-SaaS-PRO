import { useEffect } from 'react';

export function useDynamicManifest(tenantSlug?: string) {
  useEffect(() => {
    // Find the manifest link tag
    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    
    // We proxy /manifest/:slug.webmanifest to the backend via vercel.json
    // or intercept it locally via Vite plugin.
    const manifestUrl = tenantSlug ? `/manifest/${tenantSlug}.webmanifest` : `/manifest.webmanifest`;

    if (manifestLink && manifestLink.href.includes(manifestUrl)) {
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
