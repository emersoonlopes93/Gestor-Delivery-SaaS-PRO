export type FeatureStatus = 'stable' | 'beta' | 'internal' | 'coming_soon' | 'legacy';
export type FeatureOperationalStatus = 'enabled' | 'disabled' | 'beta' | 'internal' | 'coming_soon';

export type FeatureDecisionReason =
  | 'essential'
  | 'unknown_feature'
  | 'global_disabled'
  | 'global_beta'
  | 'global_internal'
  | 'coming_soon'
  | 'plan_not_allowed'
  | 'tenant_disabled'
  | 'tenant_enabled_override'
  | 'missing_permission'
  | 'beta_disabled'
  | 'env_disabled'
  | 'enabled';

export type CatalogFeatureKey =
  | 'auth'
  | 'tenant'
  | 'session'
  | 'rbac'
  | 'audit_log'
  | 'saas_admin'
  | 'tenant_settings'
  | 'onboarding'
  | 'billing_status'
  | 'catalog_core'
  | 'storefront_core'
  | 'checkout_core'
  | 'orders_core'
  | 'upload_core'
  | 'health_check'
  | 'feature_control_center'
  | 'delivery_radius'
  | 'delivery_zones_advanced'
  | 'delivery_live_map'
  | 'delivery_neighborhood'
  | 'pizza_template'
  | 'base_menus'
  | 'base_media'
  | 'upsells'
  | 'crm_enterprise'
  | 'campaigns'
  | 'whatsapp_connect'
  | 'whatsapp_advanced'
  | 'ifood_marketplace'
  | 'marketplace_orders'
  | 'inventory_advanced'
  | 'finance_advanced'
  | 'bi_advanced'
  | 'goals'
  | 'kds'
  | 'pos'
  | 'printing'
  | 'cashback'
  | 'loyalty'
  | 'coupons'
  | 'scheduling'
  | 'ai_agent'
  | 'franchise'
  | 'admin_integrations'
  | 'dine_in'
  | 'push_notifications';

export type BillingEntitlementKey =
  | 'ai_agent'
  | 'campaigns'
  | 'ifood_integration'
  | 'advanced_reports'
  | 'custom_domain'
  | 'priority_support';

export type BillingEntitlementFlagKey =
  | 'canUseAiAgent'
  | 'canUseIfoodIntegration'
  | 'canUseAdvancedReports'
  | 'canUseCampaigns'
  | 'canUseCustomDomain'
  | 'canUsePrioritySupport';

export type FeatureCatalogEntry = {
  key: CatalogFeatureKey;
  name: string;
  description?: string;
  category: string;
  essential: boolean;
  canDisable: boolean;
  status: FeatureStatus;
  moduleKey?: string;
  requiredPermission?: string | string[];
  envFallbackKey?: string;
  billingEntitlementKey?: BillingEntitlementKey;
  billingEntitlementFlagKey?: BillingEntitlementFlagKey;
};

export type ModuleCatalogEntry = {
  key: string;
  name: string;
  description?: string;
};

const CORE_FEATURES: readonly FeatureCatalogEntry[] = [
  {
    key: 'auth',
    name: 'Autenticacao',
    description: 'Login, logout e fluxo basico de autenticacao.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'tenant',
    name: 'Tenant',
    description: 'Contexto multi-tenant e identificacao da operacao.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'session',
    name: 'Sessao',
    description: 'Sessao autenticada do usuario tenant.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'rbac',
    name: 'RBAC',
    description: 'Permissoes e perfis de acesso.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'audit_log',
    name: 'Audit Log',
    description: 'Trilha minima de auditoria.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'saas_admin',
    name: 'SaaS Admin',
    description: 'Painel administrativo central da plataforma.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'tenant_settings',
    name: 'Configuracoes da Loja',
    description: 'Configuracoes essenciais do tenant.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'onboarding',
    name: 'Onboarding',
    description: 'Fluxo de ativacao inicial da loja.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'billing_status',
    name: 'Billing Status',
    description: 'Estado comercial e bloqueio financeiro do tenant.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'catalog_core',
    name: 'Catalogo Base',
    description: 'Categorias, produtos, combos e adicionais essenciais.',
    category: 'catalog',
    essential: true,
    canDisable: false,
    status: 'stable',
    moduleKey: 'catalog',
    requiredPermission: 'catalog.read',
  },
  {
    key: 'storefront_core',
    name: 'Storefront Base',
    description: 'Cardapio publico e vitrine da loja.',
    category: 'storefront',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'checkout_core',
    name: 'Checkout Base',
    description: 'Checkout minimo para criacao de pedidos.',
    category: 'checkout',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'orders_core',
    name: 'Pedidos Base',
    description: 'Criacao e operacao minima de pedidos.',
    category: 'orders',
    essential: true,
    canDisable: false,
    status: 'stable',
    moduleKey: 'orders',
    requiredPermission: 'orders.read',
  },
  {
    key: 'upload_core',
    name: 'Upload Base',
    description: 'Uploads essenciais de midia e arquivos.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'health_check',
    name: 'Health Check',
    description: 'Endpoints e verificacoes de saude.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
  {
    key: 'feature_control_center',
    name: 'Feature Control Center',
    description: 'Camada central de governanca de features.',
    category: 'core',
    essential: true,
    canDisable: false,
    status: 'stable',
  },
] as const;

const OPTIONAL_FEATURES: readonly FeatureCatalogEntry[] = [
  {
    key: 'delivery_radius',
    name: 'Entrega por Raio',
    description: 'Taxas de entrega por raio e distancia.',
    category: 'delivery',
    essential: false,
    canDisable: true,
    status: 'stable',
    moduleKey: 'delivery',
    requiredPermission: 'delivery.manage',
  },
  {
    key: 'delivery_zones_advanced',
    name: 'Zonas Avancadas de Entrega',
    description: 'Poligonos, areas bloqueadas e zonas especiais.',
    category: 'delivery',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'delivery',
    requiredPermission: 'delivery.manage',
  },
  {
    key: 'delivery_live_map',
    name: 'Mapa de Entrega em Tempo Real',
    description: 'Mapa operacional e visao ao vivo de entregas.',
    category: 'delivery',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'delivery',
    requiredPermission: 'delivery.read',
    envFallbackKey: 'VITE_FEATURE_DELIVERY_LIVE_MAP',
  },
  {
    key: 'delivery_neighborhood',
    name: 'Entrega por Bairro',
    description: 'Regras por bairro ou regiao.',
    category: 'delivery',
    essential: false,
    canDisable: true,
    status: 'coming_soon',
    moduleKey: 'delivery',
    requiredPermission: 'delivery.manage',
  },
  {
    key: 'pizza_template',
    name: 'Template Pizza',
    description: 'Fluxos e recursos especializados para pizza.',
    category: 'catalog',
    essential: false,
    canDisable: true,
    status: 'beta',
    requiredPermission: 'catalog.read',
  },
  {
    key: 'base_menus',
    name: 'Cardapios Base',
    description: 'Importacao e uso de cardapios base do SaaS.',
    category: 'catalog',
    essential: false,
    canDisable: true,
    status: 'stable',
    requiredPermission: 'catalog.create',
  },
  {
    key: 'base_media',
    name: 'Galeria Base',
    description: 'Biblioteca base de midia e imagens.',
    category: 'catalog',
    essential: false,
    canDisable: true,
    status: 'stable',
    requiredPermission: 'catalog.update',
  },
  {
    key: 'upsells',
    name: 'Upsells',
    description: 'Sugestoes e configuracao de upsell.',
    category: 'catalog',
    essential: false,
    canDisable: true,
    status: 'beta',
    requiredPermission: 'catalog.read',
    envFallbackKey: 'VITE_FEATURE_UPSELLS',
  },
  {
    key: 'crm_enterprise',
    name: 'CRM Enterprise',
    description: 'Dashboard, pipeline e automacoes de CRM.',
    category: 'crm',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'crm',
    requiredPermission: 'crm.read',
    envFallbackKey: 'VITE_FEATURE_CRM_ADVANCED',
  },
  {
    key: 'campaigns',
    name: 'Campanhas',
    description: 'Campanhas de marketing e automacoes comerciais.',
    category: 'crm',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'campaigns',
    requiredPermission: 'crm.read',
    envFallbackKey: 'VITE_FEATURE_CAMPAIGNS',
    billingEntitlementKey: 'campaigns',
    billingEntitlementFlagKey: 'canUseCampaigns',
  },
  {
    key: 'whatsapp_connect',
    name: 'WhatsApp Connect',
    description: 'Conexao operacional com provedor de WhatsApp.',
    category: 'whatsapp',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'whatsapp',
    requiredPermission: 'settings.manage',
    envFallbackKey: 'VITE_FEATURE_WHATSAPP_CONNECT',
  },
  {
    key: 'whatsapp_advanced',
    name: 'WhatsApp Advanced',
    description: 'Inbox, orquestracao e automacoes avancadas.',
    category: 'whatsapp',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'whatsapp',
    requiredPermission: 'orders.read',
    envFallbackKey: 'VITE_FEATURE_WHATSAPP_ADVANCED',
  },
  {
    key: 'ifood_marketplace',
    name: 'Marketplace iFood',
    description: 'Integracao operacional com iFood.',
    category: 'marketplace',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'marketplace',
    requiredPermission: 'settings.manage',
    billingEntitlementKey: 'ifood_integration',
    billingEntitlementFlagKey: 'canUseIfoodIntegration',
  },
  {
    key: 'marketplace_orders',
    name: 'Pedidos de Marketplace',
    description: 'Listagem e reprocessamento de pedidos de marketplace.',
    category: 'marketplace',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'marketplace',
    requiredPermission: 'orders.read',
  },
  {
    key: 'inventory_advanced',
    name: 'Estoque Avancado',
    description: 'Ingredientes, fichas tecnicas e contagens.',
    category: 'inventory',
    essential: false,
    canDisable: true,
    status: 'stable',
    moduleKey: 'inventory',
    requiredPermission: 'inventory.read',
    envFallbackKey: 'VITE_FEATURE_INVENTORY_ADVANCED',
  },
  {
    key: 'finance_advanced',
    name: 'Financeiro Avancado',
    description: 'Fluxo de caixa, contas e transacoes.',
    category: 'finance',
    essential: false,
    canDisable: true,
    status: 'stable',
    moduleKey: 'finance',
    requiredPermission: 'finance.read',
    envFallbackKey: 'VITE_FEATURE_FINANCE_ADVANCED',
  },
  {
    key: 'bi_advanced',
    name: 'Business Intelligence',
    description: 'Dashboards e analises avancadas.',
    category: 'analytics',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'bi',
    requiredPermission: 'reports.read',
    envFallbackKey: 'VITE_FEATURE_BI_ADVANCED',
    billingEntitlementKey: 'advanced_reports',
    billingEntitlementFlagKey: 'canUseAdvancedReports',
  },
  {
    key: 'push_notifications',
    name: 'Notificações Push',
    description: 'Envio de push notifications via web-push.',
    category: 'notifications',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'notifications',
    envFallbackKey: 'VITE_FEATURE_PUSH_NOTIFICATIONS',
  },
  {
    key: 'goals',
    name: 'Metas',
    description: 'Metas gerenciais e acompanhamento.',
    category: 'analytics',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'goals',
    requiredPermission: 'goals.read',
    envFallbackKey: 'VITE_FEATURE_GOALS',
  },
  {
    key: 'kds',
    name: 'KDS',
    description: 'Kitchen Display System.',
    category: 'operations',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'kds',
    requiredPermission: 'kds.use',
  },
  {
    key: 'pos',
    name: 'PDV',
    description: 'Ponto de venda e operacao presencial.',
    category: 'operations',
    essential: false,
    canDisable: true,
    status: 'stable',
    moduleKey: 'pos',
    requiredPermission: 'pos.read',
  },
  {
    key: 'printing',
    name: 'Impressao',
    description: 'Spooler, estacoes e impressao operacional.',
    category: 'operations',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'printing',
    requiredPermission: 'printing.read',
  },
  {
    key: 'cashback',
    name: 'Cashback',
    description: 'Beneficios financeiros para clientes.',
    category: 'crm',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'crm',
    requiredPermission: 'crm.manage_loyalty_cashback',
  },
  {
    key: 'loyalty',
    name: 'Fidelidade',
    description: 'Carteiras, selos e fidelidade.',
    category: 'crm',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'crm',
    requiredPermission: 'crm.manage_loyalty_cashback',
  },
  {
    key: 'coupons',
    name: 'Cupons',
    description: 'Cupons e promocoes comerciais.',
    category: 'crm',
    essential: false,
    canDisable: true,
    status: 'stable',
    moduleKey: 'crm',
    requiredPermission: 'crm.manage_coupons',
  },
  {
    key: 'scheduling',
    name: 'Agendamento',
    description: 'Agendamento e horarios programados.',
    category: 'operations',
    essential: false,
    canDisable: true,
    status: 'beta',
    requiredPermission: 'scheduling.view',
  },
  {
    key: 'dine_in',
    name: 'Consumo no Local',
    description: 'Mesas, comandas e operacao presencial.',
    category: 'operations',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'pos_tables',
    requiredPermission: 'pos.read',
  },
  {
    key: 'ai_agent',
    name: 'Agente IA',
    description: 'Atendimento e assistencia automatizada por IA.',
    category: 'ai',
    essential: false,
    canDisable: true,
    status: 'beta',
    moduleKey: 'ai_agent',
    requiredPermission: 'settings.manage',
    envFallbackKey: 'VITE_FEATURE_AI_AGENT',
    billingEntitlementKey: 'ai_agent',
    billingEntitlementFlagKey: 'canUseAiAgent',
  },
  {
    key: 'franchise',
    name: 'Franquias',
    description: 'Recursos de franquia e redes.',
    category: 'admin',
    essential: false,
    canDisable: true,
    status: 'beta',
    envFallbackKey: 'VITE_FEATURE_FRANCHISE',
  },
  {
    key: 'admin_integrations',
    name: 'Integracoes Admin',
    description: 'Marketplace e integracoes globais do SaaS Admin.',
    category: 'admin',
    essential: false,
    canDisable: true,
    status: 'beta',
    envFallbackKey: 'VITE_FEATURE_ADMIN_INTEGRATIONS',
  },
] as const;

export const FEATURE_CATALOG = [...CORE_FEATURES, ...OPTIONAL_FEATURES] as const;

export const FEATURE_CATALOG_BY_KEY: Readonly<Record<CatalogFeatureKey, FeatureCatalogEntry>> =
  FEATURE_CATALOG.reduce<Record<CatalogFeatureKey, FeatureCatalogEntry>>((acc, feature) => {
    acc[feature.key] = feature;
    return acc;
  }, {} as Record<CatalogFeatureKey, FeatureCatalogEntry>);

export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  { key: 'catalog', name: 'Catalogo', description: 'Produtos, categorias, combos e adicionais.' },
  { key: 'orders', name: 'Pedidos', description: 'Gestao e operacao de pedidos.' },
  { key: 'delivery', name: 'Entrega', description: 'Logistica e configuracao de entrega.' },
  { key: 'pos', name: 'PDV', description: 'Ponto de venda presencial.' },
  { key: 'cash', name: 'Caixa', description: 'Operacao de caixa.' },
  { key: 'crm', name: 'CRM', description: 'Clientes, promocoes e fidelizacao.' },
  { key: 'promotions', name: 'Promocoes', description: 'Promocoes e beneficios comerciais.' },
  { key: 'inventory', name: 'Estoque', description: 'Controle de estoque e fichas tecnicas.' },
  { key: 'reports', name: 'Relatorios', description: 'Relatorios gerenciais e analiticos.' },
  { key: 'goals', name: 'Metas', description: 'Metas e indicadores.' },
  { key: 'whatsapp', name: 'WhatsApp', description: 'Conexao e operacao via WhatsApp.' },
  { key: 'ai_agent', name: 'Agente IA', description: 'Assistente automatizado de IA.' },
  { key: 'purchasing', name: 'Compras', description: 'Compras e fornecedores.' },
  { key: 'finance', name: 'Financeiro', description: 'Contas e fluxo financeiro.' },
  { key: 'campaigns', name: 'Campanhas', description: 'Campanhas e automacoes comerciais.' },
  { key: 'bi', name: 'Business Intelligence', description: 'Analises avancadas.' },
  { key: 'employees', name: 'Funcionarios', description: 'Equipe e operacao interna.' },
  { key: 'kds', name: 'KDS', description: 'Kitchen Display System.' },
  { key: 'printing', name: 'Impressao', description: 'Impressao operacional.' },
  { key: 'pos_tables', name: 'Mesas', description: 'Mesas e comandas do PDV.' },
  { key: 'marketplace', name: 'Marketplace', description: 'Integracoes com marketplaces.' },
] as const;

export const MODULE_CATALOG_BY_KEY: Readonly<Record<string, ModuleCatalogEntry>> =
  MODULE_CATALOG.reduce<Record<string, ModuleCatalogEntry>>((acc, moduleEntry) => {
    acc[moduleEntry.key] = moduleEntry;
    return acc;
  }, {});

export function getFeatureCatalogEntry(key: string): FeatureCatalogEntry | undefined {
  return FEATURE_CATALOG.find((feature) => feature.key === key);
}

export function getAllCatalogFeatureKeys(): CatalogFeatureKey[] {
  return FEATURE_CATALOG.map((feature) => feature.key);
}

export function featureStatusToOperationalStatus(status: FeatureStatus): FeatureOperationalStatus {
  switch (status) {
    case 'stable':
      return 'enabled';
    case 'beta':
      return 'beta';
    case 'internal':
      return 'internal';
    case 'coming_soon':
      return 'coming_soon';
    case 'legacy':
    default:
      return 'disabled';
  }
}
