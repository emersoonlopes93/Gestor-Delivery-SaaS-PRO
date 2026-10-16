import { ChartLine } from 'lucide-react';
import { NavigationHub } from './NavigationHub';

const MANAGEMENT_ITEM_IDS = [
  'analytics.reports',
  'analytics.goals',
  'analytics.bi',
  'management.employees',
] as const;

const MANAGEMENT_SECTIONS = [
  {
    id: 'management-priorities',
    label: 'Decisões prioritárias',
    description: 'Comece pelo que orienta as próximas decisões da sua loja.',
    itemIds: ['analytics.reports', 'analytics.goals'],
    emphasis: 'primary' as const,
  },
  {
    id: 'management-support',
    label: 'Apoio à gestão',
    description: 'Aprofunde análises e organize as pessoas que fazem a operação acontecer.',
    itemIds: ['analytics.bi', 'management.employees'],
    emphasis: 'secondary' as const,
  },
] as const;

export function ManagementPage() {
  return (
    <NavigationHub
      title="Gestão"
      description="Organize sua leitura do negócio e escolha com clareza o que revisar a seguir."
      icon={ChartLine}
      itemIds={MANAGEMENT_ITEM_IDS}
      sections={MANAGEMENT_SECTIONS}
    />
  );
}
