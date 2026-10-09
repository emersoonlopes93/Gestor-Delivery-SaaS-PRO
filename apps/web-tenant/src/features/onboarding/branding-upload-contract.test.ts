import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('onboarding branding upload contract', () => {
  it('uses direct logo upload without the image library', () => {
    const identity = source('./steps/Step1Identity.tsx');
    expect(identity).toContain('/upload/image?type=logo');
    expect(identity).not.toContain('ImagePickerModal');
    expect(identity).not.toContain('Selecionar da Biblioteca');
  });

  it('uses storefront background upload without the image library', () => {
    const storefront = source('./steps/Step7Storefront.tsx');
    expect(storefront).toContain('/upload/storefront-background');
    expect(storefront).not.toContain('ImagePickerModal');
  });

  it('preserves the menu item image library', () => {
    const product = source('./steps/Step5Product.tsx');
    expect(product).toContain('ImagePickerModal');
  });

  it('keeps business segment editable in settings', () => {
    const settings = source('../settings/SettingsPage.tsx');
    expect(settings).toContain('business-segment');
    expect(settings).toContain("businessSegment: settings.businessSegment ?? null");
  });
});
