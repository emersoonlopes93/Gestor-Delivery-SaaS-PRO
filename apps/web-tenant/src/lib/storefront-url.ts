export type StorefrontUrlLocation = Pick<Location, 'hostname' | 'origin' | 'protocol'>;

function normalizeBaseUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || /^api[.-]/i.test(parsed.hostname)) {
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function resolveStorefrontBaseUrl(
  location: StorefrontUrlLocation,
  configuredBaseUrl?: string,
): string | null {
  const configured = configuredBaseUrl?.trim();
  if (configured) return normalizeBaseUrl(configured);

  const hostname = location.hostname.toLowerCase();
  if (location.protocol === 'capacitor:' || hostname === 'localhost' || hostname === '127.0.0.1') {
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return normalizeBaseUrl(`${location.protocol}//${hostname}:3000`);
    }
    return null;
  }

  if (hostname.startsWith('app-')) {
    return normalizeBaseUrl(location.origin.replace(/\/\/app-/, '//'));
  }
  if (hostname.startsWith('app.')) {
    return normalizeBaseUrl(location.origin.replace(/\/\/app\./, '//'));
  }
  if (hostname.startsWith('tenant.')) {
    return normalizeBaseUrl(location.origin.replace(/\/\/tenant\./, '//storefront.'));
  }

  return null;
}

export function buildStorefrontUrl(baseUrl: string | null | undefined, tenantSlug: string | null | undefined): string | null {
  const slug = tenantSlug?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !baseUrl) return null;
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return normalizedBase ? `${normalizedBase}/${encodeURIComponent(slug)}` : null;
}
