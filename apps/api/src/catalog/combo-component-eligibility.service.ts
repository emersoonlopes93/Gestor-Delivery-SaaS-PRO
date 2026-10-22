import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getProductConfigurationRoute, type ProductConfigurationRoute } from '@gestor/utils';
import { PrismaService } from '../database/prisma.service';

export const COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED = 'COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED';

/**
 * A combo snapshot currently preserves only a component product id and quantity.
 * Do not allow it to point at a product whose sale needs an individual
 * configuration; nested configuration needs its own snapshot contract.
 */
@Injectable()
export class ComboComponentEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly unsupportedMessage =
    'O produto selecionado exige configuração individual e ainda não pode ser usado dentro deste combo. Escolha um produto simples.';

  async getProductConfigurationRoutes(
    tenantId: string,
    productIds: readonly string[],
    options: { requireActive?: boolean } = {},
  ): Promise<Map<string, ProductConfigurationRoute>> {
    const ids = [...new Set(productIds)];
    if (!ids.length) return new Map();

    const products = await this.prisma.product.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        type: true,
        isActive: true,
        category: { select: { templateType: true } },
        optionGroupLinks: {
          where: {
            optionGroup: {
              isActive: true,
              deletedAt: null,
              items: { some: { isActive: true, deletedAt: null } },
            },
          },
          select: {
            id: true,
            optionGroup: {
              select: {
                items: {
                  where: { isActive: true, deletedAt: null },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (products.length !== ids.length) throw new NotFoundException('Produto não encontrado para vínculo.');

    const disabledOverrides = await this.prisma.productOptionItemPrice.findMany({
      where: { tenantId, productId: { in: ids }, isActive: false },
      select: { productId: true, optionItemId: true },
    });
    const disabledByProduct = new Map<string, Set<string>>();
    for (const override of disabledOverrides) {
      const disabled = disabledByProduct.get(override.productId) ?? new Set<string>();
      disabled.add(override.optionItemId);
      disabledByProduct.set(override.productId, disabled);
    }

    const routes = new Map<string, ProductConfigurationRoute>();
    for (const product of products) {
      if (options.requireActive !== false && !product.isActive) {
        throw new BadRequestException('Produto inativo não pode ser vinculado.');
      }
      const disabled = disabledByProduct.get(product.id) ?? new Set<string>();
      const activeOptionGroupCount = product.optionGroupLinks.filter((link) =>
        link.optionGroup.items.some((item) => !disabled.has(item.id)),
      ).length;
      const route = getProductConfigurationRoute({
        type: product.type,
        categoryTemplateType: product.category?.templateType,
        activeOptionGroupCount,
      });
      routes.set(product.id, route);
    }
    return routes;
  }

  async assertEligibleProductIds(tenantId: string, productIds: readonly string[]): Promise<void> {
    const routes = await this.getProductConfigurationRoutes(tenantId, productIds);
    for (const route of routes.values()) {
      if (route !== 'direct') {
        throw new BadRequestException({
          code: COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED,
          message: this.unsupportedMessage,
        });
      }
    }
  }
}
