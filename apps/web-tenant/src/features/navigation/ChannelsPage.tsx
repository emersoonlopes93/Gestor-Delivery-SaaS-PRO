import { Link2 } from 'lucide-react';
import { NavigationHub } from './NavigationHub';

const CHANNEL_ITEM_IDS = [
  'settings.storefront',
  'settings.integrations',
  'whatsapp.inbox',
  'whatsapp.config',
  'crm.customers',
  'crm.dashboard',
  'crm.promotions',
  'campaigns.home',
  'marketing.automations',
] as const;

const CHANNEL_SECTIONS = [
  {
    id: 'sales-channels',
    label: 'Onde você vende',
    description: 'Cuide da sua loja própria e das integrações com marketplaces.',
    itemIds: ['settings.storefront', 'settings.integrations'],
    emphasis: 'primary' as const,
  },
  {
    id: 'customer-relationships',
    label: 'Relacionamento',
    description: 'Atenda clientes e organize o histórico de cada contato.',
    itemIds: ['whatsapp.inbox', 'whatsapp.config', 'crm.customers', 'crm.dashboard'],
    emphasis: 'secondary' as const,
  },
  {
    id: 'marketing-channels',
    label: 'Marketing',
    description: 'Planeje ações para atrair, engajar e reativar clientes.',
    itemIds: ['crm.promotions', 'campaigns.home', 'marketing.automations'],
    emphasis: 'secondary' as const,
  },
] as const;

export function ChannelsPage() {
  return (
    <NavigationHub
      title="Canais e Relacionamento"
      description="Escolha a área para cuidar dos canais de venda e do relacionamento com clientes."
      icon={Link2}
      itemIds={CHANNEL_ITEM_IDS}
      sections={CHANNEL_SECTIONS}
    />
  );
}
