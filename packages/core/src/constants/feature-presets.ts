import { FEATURE_CATALOG, type CatalogFeatureKey } from './features';

export type FeaturePresetKey =
  | 'mvp_minimo'
  | 'mvp_pizzaria'
  | 'mvp_restaurante'
  | 'interno_teste'
  | 'full_platform';

export type FeaturePresetEntry = {
  key: FeaturePresetKey;
  name: string;
  description: string;
  enabledFeatures: CatalogFeatureKey[];
  disabledFeatures: CatalogFeatureKey[];
};

const OPTIONAL_KEYS = FEATURE_CATALOG.filter((feature) => !feature.essential).map((feature) => feature.key);

const MVP_DISABLED: CatalogFeatureKey[] = [
  'order_manager_v2',
  'crm_enterprise',
  'campaigns',
  'whatsapp_connect',
  'whatsapp_advanced',
  'ifood_marketplace',
  'marketplace_orders',
  'inventory_advanced',
  'finance_advanced',
  'bi_advanced',
  'goals',
  'kds',
  'pos',
  'printing',
  'cashback',
  'loyalty',
  'delivery_neighborhood',
  'delivery_zones_advanced',
  'delivery_live_map',
  'upsells',
  'ai_agent',
  'franchise',
  'admin_integrations',
];

export const FEATURE_PRESETS: readonly FeaturePresetEntry[] = [
  {
    key: 'mvp_minimo',
    name: 'MVP Minimo',
    description: 'Baseline enxuta para piloto MVP com operacao essencial.',
    enabledFeatures: ['delivery_radius', 'base_menus', 'base_media', 'scheduling'],
    disabledFeatures: MVP_DISABLED,
  },
  {
    key: 'mvp_pizzaria',
    name: 'MVP Pizzaria',
    description: 'Preset focado em delivery por raio, pizza template e operacao enxuta.',
    enabledFeatures: ['delivery_radius', 'pizza_template', 'base_menus', 'base_media', 'scheduling'],
    disabledFeatures: MVP_DISABLED,
  },
  {
    key: 'mvp_restaurante',
    name: 'MVP Restaurante',
    description: 'Preset focado em restaurante com entrega por raio e dine-in opcional.',
    enabledFeatures: ['delivery_radius', 'base_menus', 'base_media', 'scheduling', 'dine_in'],
    disabledFeatures: MVP_DISABLED,
  },
  {
    key: 'interno_teste',
    name: 'Interno Teste',
    description: 'Libera features estaveis, beta e internas para uso assistido do time.',
    enabledFeatures: OPTIONAL_KEYS.filter((featureKey) => featureKey !== 'delivery_neighborhood'),
    disabledFeatures: ['delivery_neighborhood'],
  },
  {
    key: 'full_platform',
    name: 'Full Platform',
    description: 'Ativa tudo que ja esta estavel ou beta, sem liberar coming soon.',
    enabledFeatures: FEATURE_CATALOG
      .filter((feature) => !feature.essential && (feature.status === 'stable' || feature.status === 'beta'))
      .map((feature) => feature.key),
    disabledFeatures: FEATURE_CATALOG
      .filter((feature) => !feature.essential && (feature.status === 'coming_soon' || feature.status === 'internal' || feature.status === 'legacy'))
      .map((feature) => feature.key),
  },
] as const;

export const FEATURE_PRESET_BY_KEY: Readonly<Record<FeaturePresetKey, FeaturePresetEntry>> =
  FEATURE_PRESETS.reduce<Record<FeaturePresetKey, FeaturePresetEntry>>((acc, preset) => {
    acc[preset.key] = preset;
    return acc;
  }, {} as Record<FeaturePresetKey, FeaturePresetEntry>);
