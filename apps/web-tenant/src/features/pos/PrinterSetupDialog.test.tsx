import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolvePrintingCapabilities } from './printing-capabilities';
import { PrinterSetupDialog } from './PrinterSetupDialog';

const props = {
  stations: [],
  onClose: () => undefined,
  onSave: async () => undefined,
  onTest: async () => undefined,
  onBrowserPrint: () => undefined,
};

describe('PrinterSetupDialog platform UI', () => {
  it('goes directly to Bluetooth setup on Android without desktop methods', () => {
    const html = renderToStaticMarkup(<PrinterSetupDialog {...props} capabilities={resolvePrintingCapabilities('android-capacitor')} />);
    expect(html).toContain('Configurar impressora Bluetooth');
    expect(html).toContain('Procurar impressoras');
    expect(html).not.toContain('Impressão do navegador');
    expect(html).not.toContain('Bridge');
    expect(html).not.toContain('USB');
  });

  it('offers only friendly browser and thermal choices on desktop', () => {
    const html = renderToStaticMarkup(<PrinterSetupDialog {...props} capabilities={resolvePrintingCapabilities('desktop-web')} />);
    expect(html).toContain('Impressora térmica');
    expect(html).toContain('Impressão do navegador');
    expect(html).not.toContain('Bluetooth');
    expect(html).not.toContain('Bridge');
    expect(html).not.toContain('QZ Tray');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it('preselects the requested station instead of silently falling back to primary', () => {
    const html = renderToStaticMarkup(<PrinterSetupDialog {...props} stations={[{ id: 'general', name: 'GERAL', slug: 'GENERAL', isActive: true, autoPrintEnabled: true }]} initialStationId="general" capabilities={resolvePrintingCapabilities('desktop-web')} />);
    expect(html).toContain('Impressora de setor');
    expect(html).toContain('value="general" selected=""');
  });

  it('shows the persisted paper width when altering a configured printer', () => {
    const html = renderToStaticMarkup(<PrinterSetupDialog {...props} initialPaperWidth={80} capabilities={resolvePrintingCapabilities('desktop-web')} />);
    expect(html).toContain('Largura do papel');
    expect(html).toContain('checked="" value="80"');
  });
});
