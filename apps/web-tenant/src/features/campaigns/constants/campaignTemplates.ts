export interface CampaignTemplate {
  id: string;
  name: string;
  category: 'promotional' | 'informational' | 'recovery' | 'retention';
  description: string;
  messageTemplate: string;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'promo_relampago',
    name: 'Promoção Relâmpago',
    category: 'promotional',
    description: 'Oferta rápida com duração limitada.',
    messageTemplate: 'Olá {{nome}}! ⚡\n\nTemos uma PROMOÇÃO RELÂMPAGO exclusiva para você. Acesse agora e garanta seu desconto antes que acabe!\n\nPeça já: {{link_cardapio}}\n\nPara não receber mais mensagens, responda SAIR.',
  },
  {
    id: 'loja_aberta',
    name: 'Loja Aberta Hoje',
    category: 'informational',
    description: 'Avisa que a loja iniciou as atividades.',
    messageTemplate: 'Olá {{nome}}! 🍔\n\nJá estamos abertos e prontos para preparar o seu pedido! Faça seu pedido agora mesmo e garanta entrega rápida.\n\nCardápio: {{link_cardapio}}\n\nPara não receber mais promoções, responda SAIR.',
  },
  {
    id: 'combo_dia',
    name: 'Combo do Dia',
    category: 'promotional',
    description: 'Divulga o prato especial ou combo de hoje.',
    messageTemplate: 'Fome, {{nome}}? 😋\n\nExperimente o nosso Combo do Dia! Preparamos algo delicioso com um desconto especial. Não perca!\n\nConfira: {{link_cardapio}}\n\nPara não receber mais mensagens, responda SAIR.',
  },
  {
    id: 'novo_produto',
    name: 'Novo Produto no Cardápio',
    category: 'informational',
    description: 'Apresenta novidade no menu.',
    messageTemplate: 'Novidade deliciosa na área, {{nome}}! 🎉\n\nAcabamos de lançar uma super novidade no cardápio. Venha ser um dos primeiros a experimentar!\n\nPeça aqui: {{link_cardapio}}\n\nPara não receber mais novidades, responda SAIR.',
  },
  {
    id: 'cliente_inativo',
    name: 'Cliente Inativo',
    category: 'recovery',
    description: 'Mensagem para quem não compra há algum tempo.',
    messageTemplate: 'Estamos com saudade, {{nome}}! ❤️\n\nFaz um tempinho que você não pede com a gente. Que tal matar essa vontade hoje? Preparamos um cupom especial para o seu retorno: {{cupom}}.\n\nAproveite: {{link_cardapio}}\n\nPara não receber mais mensagens, responda SAIR.',
  },
  {
    id: 'agradecimento_pos_pedido',
    name: 'Agradecimento Pós-Pedido',
    category: 'retention',
    description: 'Agradece a preferência recente.',
    messageTemplate: 'Oi {{nome}}, tudo bem? 😊\n\nMuito obrigado por ter feito o pedido #{{pedido}} com a gente! Esperamos que tenha gostado. Estamos sempre aqui para preparar o seu prato favorito.\n\nPara não receber mais mensagens, responda SAIR.',
  },
  {
    id: 'pedido_avaliacao',
    name: 'Pedido de Avaliação',
    category: 'retention',
    description: 'Pede feedback após a compra.',
    messageTemplate: 'Olá {{nome}}! ⭐\n\nSua opinião é muito importante para nós! Se você gostou do pedido recente, avalie a nossa loja. Demora só um minutinho!\n\nAgradecemos muito a sua preferência.\n\nPara não receber mais mensagens, responda SAIR.',
  },
  {
    id: 'final_de_semana',
    name: 'Sextou / Final de Semana',
    category: 'promotional',
    description: 'Alerta de fim de semana.',
    messageTemplate: 'Sextou, {{nome}}! 🥳\n\nNão vai para a cozinha hoje, né? O final de semana pede a nossa comida! Já estamos aceitando pedidos.\n\nPeça no link: {{link_cardapio}}\n\nPara cancelar o recebimento, responda SAIR.',
  },
  {
    id: 'horario_especial',
    name: 'Aviso de Feriado / Horário Especial',
    category: 'informational',
    description: 'Comunica horários diferenciados.',
    messageTemplate: 'Aviso Importante, {{nome}}! ⏰\n\nHoje funcionaremos em horário especial. Aproveite para fazer o seu pedido antes de encerrarmos.\n\nAcesse nosso cardápio: {{link_cardapio}}\n\nPara cancelar avisos, responda SAIR.',
  },
  {
    id: 'branco',
    name: 'Começar do Zero (Em Branco)',
    category: 'informational',
    description: 'Crie sua mensagem do zero sem um template base.',
    messageTemplate: 'Olá {{nome}}!\n\n[Sua mensagem aqui]\n\nPara não receber mais mensagens, responda SAIR.',
  }
];
