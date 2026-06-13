export interface CampaignTemplate {
  id: string;
  name: string;
  category: 'promotional' | 'informational' | 'recovery' | 'retention';
  description: string;
  messageTemplate: string;
}

export const CAMPAIGN_STATUS_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'status_loja_aberta',
    name: 'Loja Aberta',
    category: 'informational',
    description: 'Avisa no Status que a loja está aceitando pedidos.',
    messageTemplate: 'Já estamos abertos! 🍔🚀\nFaça seu pedido agora pelo nosso link na bio ou mande um Oi.',
  },
  {
    id: 'status_combo_dia',
    name: 'Combo do Dia',
    category: 'promotional',
    description: 'Divulga o prato especial ou combo no Status.',
    messageTemplate: '🔥 Combo Especial do Dia! 🔥\nAproveite essa delícia com desconto exclusivo. Peça já pelo link!',
  },
  {
    id: 'status_novo_produto',
    name: 'Novidade no Cardápio',
    category: 'informational',
    description: 'Apresenta um novo prato ou produto.',
    messageTemplate: '✨ NOVIDADE NO CARDÁPIO! ✨\nVenha experimentar nosso lançamento. Já disponível para pedidos!',
  },
  {
    id: 'status_promo_relampago',
    name: 'Promoção Relâmpago',
    category: 'promotional',
    description: 'Oferta com duração limitada no Status.',
    messageTemplate: '⚡ PROMOÇÃO RELÂMPAGO! ⚡\nSó nas próximas horas. Corre pra garantir o seu pedido com desconto!',
  },
  {
    id: 'status_bastidores',
    name: 'Bastidores / Preparo',
    category: 'retention',
    description: 'Mostra o dia a dia da cozinha.',
    messageTemplate: 'Saindo mais uma delícia por aqui! 👨‍🍳🔥\nTudo preparado com muito carinho para vocês.',
  },
  {
    id: 'status_branco',
    name: 'Começar do Zero (Em Branco)',
    category: 'informational',
    description: 'Crie seu Status do zero.',
    messageTemplate: 'Seu texto aqui...',
  }
];
