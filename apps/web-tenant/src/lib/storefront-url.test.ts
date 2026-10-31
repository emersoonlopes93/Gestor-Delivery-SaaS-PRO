import { describe, expect, it } from 'vitest';
import { buildStorefrontUrl, resolveStorefrontBaseUrl } from './storefront-url';

describe('storefront public URL', () => {
  it('prefers the configured storefront origin and normalizes its trailing slash', () => {
    const base = resolveStorefrontBaseUrl(
      { origin: 'https://app.example.test', hostname: 'app.example.test', protocol: 'https:' },
      'https://preview.example.test/',
    );
    expect(buildStorefrontUrl(base, 'loja-a')).toBe('https://preview.example.test/loja-a');
  });

  it('uses the local storefront port without deriving an API URL', () => {
    const base = resolveStorefrontBaseUrl(
      { origin: 'http://localhost:5173', hostname: 'localhost', protocol: 'http:' },
    );
    expect(base).toBe('http://localhost:3000');
  });

  it('does not invent a base URL in Capacitor or accept an API origin', () => {
    expect(resolveStorefrontBaseUrl(
      { origin: 'capacitor://localhost', hostname: 'localhost', protocol: 'capacitor:' },
    )).toBeNull();
    expect(resolveStorefrontBaseUrl(
      { origin: 'https://app.example.test', hostname: 'app.example.test', protocol: 'https:' },
      'https://api.example.test/api/v1',
    )).toBeNull();
  });

  it('keeps tenant switches and unsafe slugs from reusing a prior public URL', () => {
    const base = 'https://pedehub.example.test';
    expect(buildStorefrontUrl(base, 'loja-a')).toBe('https://pedehub.example.test/loja-a');
    expect(buildStorefrontUrl(base, 'loja-b')).toBe('https://pedehub.example.test/loja-b');
    expect(buildStorefrontUrl(base, '../api')).toBeNull();
  });
});
