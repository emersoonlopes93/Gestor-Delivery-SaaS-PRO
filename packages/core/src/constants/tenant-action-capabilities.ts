export const TENANT_ACTION_CAPABILITIES = {
  'baseMenu.import': {
    enabled: false,
    reason: 'release_disabled',
    source: 'initial_go_live_release_policy',
    code: 'BASE_MENU_IMPORT_DISABLED',
    message: 'A importacao de cardapio base esta temporariamente indisponivel.',
  },
  'branches.create': {
    enabled: false,
    reason: 'release_disabled',
    source: 'initial_go_live_release_policy',
    code: 'BRANCH_CREATION_TEMPORARILY_DISABLED',
    message: 'A criação de novas filiais está temporariamente indisponível.',
  },
} as const;

export type TenantActionCapabilityKey = keyof typeof TENANT_ACTION_CAPABILITIES;
