import { ChartLine } from 'lucide-react';
import { NavigationHub } from './NavigationHub';

const MANAGEMENT_ITEM_IDS = [
  'analytics.reports',
  'analytics.goals',
  'analytics.performance',
  'analytics.bi',
  'management.employees',
] as const;

export function ManagementPage() {
  return (
    <NavigationHub
      title="Gestão"
      description="Acompanhe os indicadores do negócio, defina metas e encontre as análises e a equipe da sua loja."
      icon={ChartLine}
      itemIds={MANAGEMENT_ITEM_IDS}
    />
  );
}
