import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantBillingResolverService } from '../../billing/tenant-billing-resolver.service';

interface ModuleAccess {
  id: string;
  module: string;
  enabled: boolean;
}

type ModuleAccessRow = {
  id: string;
  module: string;
  enabled: boolean;
};

@Injectable()
export class AdminModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
  ) {}

  /**
   * Lista todos os módulos disponíveis no sistema.
   */
  getAvailableModules() {
    return [
      { key: 'catalog', name: 'Catálogo', description: 'Produtos, categorias, combos e complementos' },
      { key: 'orders', name: 'Pedidos', description: 'Gestão de pedidos e operação' },
      { key: 'delivery', name: 'Entrega', description: 'Logística e entregadores' },
      { key: 'pos', name: 'PDV', description: 'Ponto de venda presencial' },
      { key: 'cash', name: 'Caixa', description: 'Gestão de caixa e movimentações' },
      { key: 'crm', name: 'CRM', description: 'Clientes, promoções e cashback' },
      { key: 'inventory', name: 'Estoque', description: 'Controle de ingredientes e receitas' },
      { key: 'reports', name: 'Relatórios', description: 'Relatórios gerenciais' },
      { key: 'whatsapp', name: 'WhatsApp', description: 'Conexão e automação via WhatsApp' },
      { key: 'ai_agent', name: 'Agente IA', description: 'Assistente virtual inteligente' },
      { key: 'purchasing', name: 'Compras', description: 'Gestão de compras e fornecedores' },
      { key: 'finance', name: 'Financeiro', description: 'Contas, transações e fluxo de caixa' },
      { key: 'campaigns', name: 'Campanhas', description: 'Marketing pesado e envio em massa' },
      { key: 'goals', name: 'Metas', description: 'Acompanhamento de metas gerenciais' },
      { key: 'bi', name: 'Business Intelligence', description: 'Análises e relatórios avançados' },
      { key: 'employees', name: 'Funcionários', description: 'Controle de ponto e equipe' },
      { key: 'kds', name: 'KDS', description: 'Kitchen Display System (Telas de Cozinha)' },
      { key: 'printing', name: 'Impressões', description: 'Impressão direta e roteamento' },
      { key: 'pos_tables', name: 'Mesas (PDV)', description: 'Gestão de mesas e comandas' },
      { key: 'marketplace', name: 'Marketplace', description: 'Integração com iFood e outros' },
    ];
  }

  /**
   * Obtém configuração de módulos de um tenant.
   */
  async getTenantModules(tenantId: string) {
    const entitlements = await this.tenantBillingResolver.resolveTenantEntitlements(tenantId);
    const access = await this.prisma.$queryRaw<ModuleAccessRow[]>`
      SELECT id, module, enabled
      FROM tenant_module_access
      WHERE tenant_id = ${tenantId}
    `;

    const available = this.getAvailableModules();
    
    return available.map((module) => ({
      ...module,
      enabled: entitlements.allowAllModules
        || entitlements.includedModules.includes(module.key)
        || access.find((a) => a.module === module.key)?.enabled
        || false,
      accessId: access.find((a) => a.module === module.key)?.id,
      source: entitlements.allowAllModules || entitlements.includedModules.includes(module.key) ? entitlements.source : 'legacy_access',
    }));
  }

  /**
   * Atualiza configuração de módulos de um tenant.
   */
  async updateTenantModules(tenantId: string, modules: { module: string; enabled: boolean }[]) {
    const result: Array<{ id: string; tenantId: string; module: string; enabled: boolean }> = [];

    for (const { module, enabled } of modules) {
      const rows = await this.prisma.$queryRaw<ModuleAccessRow[]>`
        INSERT INTO tenant_module_access (id, tenant_id, module, enabled, created_at, updated_at)
        VALUES (gen_random_uuid(), ${tenantId}, ${module}, ${enabled}, NOW(), NOW())
        ON CONFLICT (tenant_id, module)
        DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
        RETURNING id, module, enabled
      `;

      const row = rows[0];
      if (row) {
        result.push({ id: row.id, tenantId, module: row.module, enabled: row.enabled });
      }
    }

    return result;
  }

  /**
   * Verifica se um tenant tem acesso a um módulo.
   */
  async hasModuleAccess(tenantId: string, module: string): Promise<boolean> {
    const entitlements = await this.tenantBillingResolver.resolveTenantEntitlements(tenantId);
    if (entitlements.allowAllModules || entitlements.includedModules.includes(module)) {
      return true;
    }

    const rows = await this.prisma.$queryRaw<Pick<ModuleAccess, 'enabled'>[]>`
      SELECT enabled
      FROM tenant_module_access
      WHERE tenant_id = ${tenantId} AND module = ${module}
      LIMIT 1
    `;

    const access = rows[0];

    // Se não houver configuração, assume que o módulo está desabilitado
    return access?.enabled ?? false;
  }
}
