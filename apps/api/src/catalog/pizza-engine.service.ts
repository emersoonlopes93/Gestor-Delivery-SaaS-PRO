import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PizzaTemplateConfigSchema } from '@gestor/types';

export interface PizzaCompositionFlavor {
  productId: string;
  name?: string;
  fraction: number;
  priceAtSize: number;
}

export interface PizzaComposition {
  sizeId: string;
  sizeName: string;
  flavors: PizzaCompositionFlavor[];
  strategy: string;
  calculatedPrice: number;
}

@Injectable()
export class PizzaEngineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the final price for a pizza based on its composition and category strategy.
   */
  async calculatePrice(categoryId: string, sizeId: string, flavorSelections: { productId: string, fraction: number }[]) {
    const category = await this.prisma.tenantClient.productCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, tenantId: true, templateConfig: true, templateType: true }
    });

    if (!category || category.templateType !== 'pizza') {
      throw new BadRequestException('Esta categoria não utiliza o template de Pizza.');
    }

    const configData = category.templateConfig;
    const validation = PizzaTemplateConfigSchema.safeParse(configData);
    
    if (!validation.success) {
      console.warn('Invalid pizza template config, using defaults', validation.error);
    }

    const config = validation.success ? validation.data : { pricingStrategy: 'highest' as const };
    const strategy = config.pricingStrategy;

    if (flavorSelections.length < 1) {
      throw new BadRequestException('Selecione pelo menos 1 sabor para a pizza.');
    }
    if (flavorSelections.length > 2) {
      throw new BadRequestException('Selecione no máximo 2 sabores para a pizza.');
    }
    if (!sizeId) {
      throw new BadRequestException('O tamanho selecionado não está disponível para esta pizza.');
    }
    for (const flavor of flavorSelections) {
      if (!flavor.productId) {
        throw new BadRequestException('Sabor inválido.');
      }
    }

    // Validate fractions
    const totalFraction = flavorSelections.reduce((sum, f) => sum + f.fraction, 0);
    if (Math.abs(totalFraction - 1) > 0.01) {
      throw new BadRequestException('A soma das frações dos sabores deve ser igual a 1 (100%).');
    }

    const flavorIds = Array.from(new Set(flavorSelections.map((flavor) => flavor.productId)));

    // A size must be active and from the same tenant. Its structural
    // authorization is checked against every selected pizza flavor below.
    const size = await this.prisma.tenantClient.optionItem.findUnique({
      where: { id: sizeId },
      select: {
        id: true,
        tenantId: true,
        optionGroupId: true,
        name: true,
        isActive: true,
        deletedAt: true,
        optionGroup: {
          select: { isActive: true, deletedAt: true },
        },
      }
    });

    if (
      !size ||
      size.tenantId !== category.tenantId ||
      !size.isActive ||
      size.deletedAt !== null ||
      !size.optionGroup.isActive ||
      size.optionGroup.deletedAt !== null
    ) {
      throw new BadRequestException('O tamanho selecionado não está disponível para esta pizza.');
    }

    const flavors = await this.prisma.tenantClient.product.findMany({
      where: {
        tenantId: category.tenantId,
        id: { in: flavorIds },
        categoryId,
        deletedAt: null,
        isActive: true,
        isAvailable: true,
      },
      select: { id: true },
    });
    if (flavors.length !== flavorIds.length) {
      throw new BadRequestException('Um ou mais sabores não estão disponíveis para esta pizza.');
    }

    const sizeLinks = await this.prisma.tenantClient.productOptionGroupLink.findMany({
      where: {
        tenantId: category.tenantId,
        productId: { in: flavorIds },
        optionGroupId: size.optionGroupId,
        pricingAxis: 'primary',
      },
      select: { productId: true },
    });
    const authorizedFlavorIds = new Set(sizeLinks.map((link) => link.productId));
    if (flavorIds.some((flavorId) => !authorizedFlavorIds.has(flavorId))) {
      throw new BadRequestException('O tamanho selecionado não está disponível para esta pizza.');
    }

    const priceRecords = await this.prisma.tenantClient.productOptionItemPrice.findMany({
      where: {
        tenantId: category.tenantId,
        productId: { in: flavorIds },
        optionItemId: sizeId,
      },
      select: { productId: true, isActive: true },
    });
    if (priceRecords.some((record) => record.isActive === false)) {
      throw new BadRequestException('O tamanho selecionado não está disponível para esta pizza.');
    }

    // Get prices for each flavor at the selected size
    const flavorsWithPrices: PizzaCompositionFlavor[] = await Promise.all(
      flavorSelections.map(async (f) => {
        const product = await this.prisma.tenantClient.product.findUnique({
          where: { id: f.productId },
          select: { name: true, basePrice: true, categoryId: true }
        });

        if (!product || product.categoryId !== categoryId) {
          throw new BadRequestException(`Sabor ${f.productId} inválido ou pertence a outra categoria.`);
        }

        const priceRecord = await this.prisma.tenantClient.productOptionItemPrice.findUnique({
          where: {
            productId_optionItemId: {
              productId: f.productId,
              optionItemId: sizeId,
            },
          },
        });

        const priceAtSize = priceRecord ? Number(priceRecord.price) : Number(product.basePrice);

        return {
          productId: f.productId,
          name: product.name,
          fraction: f.fraction,
          priceAtSize: priceAtSize,
        };
      })
    );

    const prices = flavorsWithPrices.map(f => f.priceAtSize);
    let calculatedPrice = 0;

    switch (strategy) {
      case 'highest':
        calculatedPrice = Math.max(...prices);
        break;
      case 'lowest':
        calculatedPrice = Math.min(...prices);
        break;
      case 'average':
        calculatedPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        break;
      case 'sum_halves':
        calculatedPrice = flavorsWithPrices.reduce((sum, f) => sum + (f.priceAtSize * f.fraction), 0);
        break;
      default:
        calculatedPrice = Math.max(...prices);
    }

    const composition: PizzaComposition = {
      sizeId,
      sizeName: size.name,
      flavors: flavorsWithPrices,
      strategy,
      calculatedPrice: Number(calculatedPrice.toFixed(2)),
    };

    return composition;
  }
}
