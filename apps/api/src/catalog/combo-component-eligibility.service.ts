import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getProductConfigurationRoute, type ProductConfigurationRoute } from '@gestor/utils';
import { Prisma } from '@prisma/client';
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
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ProductConfigurationRoute>> {
    const reader = tx ?? this.prisma;
    const ids = [...new Set(productIds)];
    if (!ids.length) return new Map();

    const products = await reader.product.findMany({
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

    const disabledOverrides = await reader.productOptionItemPrice.findMany({
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

  async assertEligibleProductIds(
    tenantId: string,
    productIds: readonly string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const routes = await this.getProductConfigurationRoutes(tenantId, productIds, {}, tx);
    for (const route of routes.values()) {
      if (route !== 'direct') {
        throw new BadRequestException({
          code: COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED,
          message: this.unsupportedMessage,
        });
      }
    }
  }

  /**
   * A combo component may be edited normally while it remains direct. This
   * guard only rejects a direct -> configurable/pizza/combo transition, so
   * legacy incompatible components do not turn unrelated authoring edits into
   * a dead end. It must run through the same transaction that wrote the new
   * catalog state.
   */
  async assertDoesNotInvalidateExistingComboComponents(
    tenantId: string,
    productIds: readonly string[],
    routesBefore: ReadonlyMap<string, ProductConfigurationRoute>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = [...new Set(productIds)];
    if (!ids.length) return;

    const routesAfter = await this.getProductConfigurationRoutes(tenantId, ids, { requireActive: false }, tx);
    const newlyUnsupported = ids.filter(
      (productId) => routesBefore.get(productId) === 'direct' && routesAfter.get(productId) !== 'direct',
    );
    if (!newlyUnsupported.length) return;

    const [bundleReference, slotReference] = await Promise.all([
      tx.comboBundleItem.findFirst({
        where: { tenantId, productId: { in: newlyUnsupported } },
        select: { id: true },
      }),
      tx.comboSlotAllowedItem.findFirst({
        where: { tenantId, productId: { in: newlyUnsupported } },
        select: { id: true },
      }),
    ]);
    if (bundleReference || slotReference) {
      throw new BadRequestException({
        code: COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED,
        message: this.unsupportedMessage,
      });
    }
  }
}
