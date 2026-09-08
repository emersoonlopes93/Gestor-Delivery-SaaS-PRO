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

export function ChannelsPage() {
  return (
    <NavigationHub
      title="Canais e Relacionamento"
      description="Escolha a área para cuidar dos canais de venda e do relacionamento com clientes."
      icon={Link2}
      itemIds={CHANNEL_ITEM_IDS}
    />
  );
}
