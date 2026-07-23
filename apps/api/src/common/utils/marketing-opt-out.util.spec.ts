import { isMarketingOptOutMessage, normalizeMarketingPhone } from './marketing-opt-out.util';

describe('marketing opt-out normalization', () => {
  it.each(['sair', ' PARAR ', 'Stop', 'cancelar', 'UNSUBSCRIBE', '  SAÍR  '])(
    'recognizes %s as opt-out',
    (content) => expect(isMarketingOptOutMessage(content)).toBe(true),
  );

  it('does not treat normal conversation as opt-out', () => {
    expect(isMarketingOptOutMessage('quero cancelar meu pedido')).toBe(false);
  });

  it('normalizes phone and WhatsApp JID consistently', () => {
    expect(normalizeMarketingPhone('+55 (11) 99999-0000@s.whatsapp.net')).toBe('5511999990000');
  });
});
