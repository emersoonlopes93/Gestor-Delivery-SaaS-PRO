import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface ModuleAccess {
  id: string;
  module: string;
  enabled: boolean;
}

@Injectable()
export class AdminModulesService {
  constructor(private readonly prisma: PrismaService) {}

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
      { key: 'reports', name: 'Relatórios', description: 'Relatórios gerenciais e metas' },
    ];
  }

  /**
   * Obtém configuração de módulos de um tenant.
   */
  async getTenantModules(tenantId: string) {
    // Usar any temporariamente devido ao Prisma Client desatualizado
    const access: ModuleAccess[] = await (this.prisma as any).tenantModuleAccess.findMany({
      where: { tenantId },
    });

    const available = this.getAvailableModules();
    
    return available.map(module => ({
      ...module,
      enabled: access.find((a: ModuleAccess) => a.module === module.key)?.enabled ?? false,
      accessId: access.find((a: ModuleAccess) => a.module === module.key)?.id,
    }));
  }

  /**
   * Atualiza configuração de módulos de um tenant.
   */
  async updateTenantModules(tenantId: string, modules: { module: string; enabled: boolean }[]) {
    const result = [];
    const prismaAny = this.prisma as any;

    for (const { module, enabled } of modules) {
      const existing = await prismaAny.tenantModuleAccess.findUnique({
        where: { tenantId_module: { tenantId, module } },
      });

      if (existing) {
        const updated = await prismaAny.tenantModuleAccess.update({
          where: { id: existing.id },
          data: { enabled },
        });
        result.push(updated);
      } else {
        const created = await prismaAny.tenantModuleAccess.create({
          data: { tenantId, module, enabled },
        });
        result.push(created);
      }
    }

    return result;
  }

  /**
   * Verifica se um tenant tem acesso a um módulo.
   */
  async hasModuleAccess(tenantId: string, module: string): Promise<boolean> {
    const prismaAny = this.prisma as any;
    const access = await prismaAny.tenantModuleAccess.findUnique({
      where: { tenantId_module: { tenantId, module } },
    });

    // Se não houver configuração, assume que o módulo está desabilitado
    return access?.enabled ?? false;
  }
}
