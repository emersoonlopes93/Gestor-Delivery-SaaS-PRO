import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrinterOverviewCard } from './PrinterOverviewCard';

const actions = { onConfigure: () => undefined, onTest: () => undefined, onToggleAutoPrint: () => undefined };

describe('PrinterOverviewCard', () => {
  it('renders the simple empty state', () => {
    const html = renderToStaticMarkup(<PrinterOverviewCard device={null} status="Não configurada" testing={false} {...actions} />);
    expect(html).toContain('Configurar impressora');
    expect(html).not.toContain('QZ Tray');
    expect(html).not.toContain('Bridge');
  });

  it('renders persisted state without a misleading ready label', () => {
    const device = { id: 'p1', name: 'Epson TM-T20', connectionType: 'QZ_TRAY', isPrimary: true, isActive: true, autoPrintEnabled: true };
    const html = renderToStaticMarkup(<PrinterOverviewCard device={device} status="Configurada" testing={true} {...actions} />);
    expect(html).toContain('Epson TM-T20');
    expect(html).toContain('Configurada');
    expect(html).toContain('Imprimindo…');
    expect(html).not.toContain('Pronta');
  });
});
