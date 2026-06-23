import { useEffect } from 'react';

export function useDynamicManifest(tenantSlug?: string, tenant?: { name: string, description?: string }) {
  useEffect(() => {
    // Find the manifest link tag
    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }

    if (tenant && tenantSlug) {
      const manifest = {
        id: `/${tenantSlug}`,
        name: tenant.name,
        short_name: tenant.name.substring(0, 12),
        description: tenant.description || "Cardápio, pedidos, carteira, fidelidade e tracking em tempo real.",
        start_url: `/${tenantSlug}`,
        scope: `/${tenantSlug}`,
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: "#111827",
        icons: [
          { src: "/icons/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icons/app-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
        ]
      };
      
      const jsonStr = JSON.stringify(manifest);
      const blob = new Blob([jsonStr], { type: 'application/manifest+json' });
      const url = URL.createObjectURL(blob);
      manifestLink.href = url;

      return () => {
        if (url) URL.revokeObjectURL(url);
      };
    } else if (tenantSlug) {
      // Fallback
      manifestLink.href = `/manifest/${tenantSlug}.webmanifest`;
    } else {
      manifestLink.href = `/manifest.webmanifest`;
    }
  }, [tenantSlug, tenant]);
}
