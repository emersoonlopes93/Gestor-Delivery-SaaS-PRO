import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateComboBundleItemDto } from './dto/create-combo-bundle-item.dto';
import { UpdateComboBundleItemDto } from './dto/update-combo-bundle-item.dto';
import { ProductsService } from '../products/products.service';

@Injectable()
export class ComboBundleItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly productsService: ProductsService,
  ) {}

  private getRequiredTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new NotFoundException('Tenant context não encontrado');
    return tenantId;
  }

  private async ensureComboProduct(tenantId: string, comboProductId: string) {
    const combo = await this.prisma.tenantClient.product.findFirst({
      where: { id: comboProductId, tenantId, deletedAt: null },
      select: { id: true, type: true, comboMode: true },
    });
    if (!combo) throw new NotFoundException('Combo não encontrado.');
    if (combo.type !== 'combo') throw new BadRequestException('Produto informado não é combo.');
    if (combo.comboMode !== 'bundle') {
      throw new BadRequestException('Este combo não está em modo bundle.');
    }
    return combo;
  }

  private async assertProductCanBeLinked(tenantId: string, comboProductId: string, productId: string) {
    if (productId === comboProductId) {
      throw new BadRequestException('Um combo não pode vincular ele mesmo.');
    }

    const product = await this.prisma.tenantClient.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: { id: true, isActive: true, type: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado para vínculo.');
    if (!product.isActive) throw new BadRequestException('Produto inativo não pode ser vinculado.');
    if (product.type === 'combo') throw new BadRequestException('Não é permitido vincular outro combo no bundle.');
    return product;
  }

  async list(comboProductId: string) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureComboProduct(tenantId, comboProductId);
    return this.prisma.tenantClient.comboBundleItem.findMany({
      where: { tenantId, comboProductId },
      orderBy: { sortOrder: 'asc' },
      include: { product: true },
    });
  }

  async create(comboProductId: string, dto: CreateComboBundleItemDto) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureComboProduct(tenantId, comboProductId);
    await this.assertProductCanBeLinked(tenantId, comboProductId, dto.productId);

    const item = await this.prisma.tenantClient.comboBundleItem.create({
      data: {
        tenantId,
        comboProductId,
        productId: dto.productId,
        qty: Math.max(1, dto.qty ?? 1),
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { product: true },
    });

    await this.productsService.recalculateComboBundlePrice(comboProductId);
    return item;
  }

  async update(comboProductId: string, id: string, dto: UpdateComboBundleItemDto) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureComboProduct(tenantId, comboProductId);

    const current = await this.prisma.tenantClient.comboBundleItem.findFirst({
      where: { id, tenantId, comboProductId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Item do bundle não encontrado.');

    const updated = await this.prisma.tenantClient.comboBundleItem.update({
      where: { id },
      data: {
        qty: dto.qty,
        sortOrder: dto.sortOrder,
      },
      include: { product: true },
    });

    await this.productsService.recalculateComboBundlePrice(comboProductId);
    return updated;
  }

  async remove(comboProductId: string, id: string) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureComboProduct(tenantId, comboProductId);

    const current = await this.prisma.tenantClient.comboBundleItem.findFirst({
      where: { id, tenantId, comboProductId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Item do bundle não encontrado.');

    await this.prisma.tenantClient.comboBundleItem.delete({ where: { id } });
    await this.productsService.recalculateComboBundlePrice(comboProductId);
    return { success: true };
  }

  async reorder(comboProductId: string, orderedItemIds: string[]) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureComboProduct(tenantId, comboProductId);

    const all = await this.prisma.tenantClient.comboBundleItem.findMany({
      where: { tenantId, comboProductId },
      select: { id: true },
    });
    const existingIds = new Set(all.map((i) => i.id));
    if (orderedItemIds.length !== all.length) {
      throw new BadRequestException('Lista de ordenação incompleta.');
    }
    for (const id of orderedItemIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException('Item inválido na ordenação.');
      }
    }

    await this.prisma.$transaction(
      orderedItemIds.map((id, index) =>
        this.prisma.tenantClient.comboBundleItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    await this.productsService.recalculateComboBundlePrice(comboProductId);
    return this.list(comboProductId);
  }

  async pricingSummary(comboProductId: string) {
    const tenantId = this.getRequiredTenantId();
    const combo = await this.prisma.tenantClient.product.findFirst({
      where: { id: comboProductId, tenantId, deletedAt: null, type: 'combo' },
      include: {
        comboBundleItems: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!combo) throw new NotFoundException('Combo não encontrado.');
    if (combo.comboMode !== 'bundle') throw new BadRequestException('Resumo disponível apenas para combo bundle.');

    const subtotal = combo.comboBundleItems.reduce((sum, item) => {
      if (!item.product || item.product.deletedAt || !item.product.isActive) return sum;
      return sum + Number(item.product.basePrice) * Math.max(1, item.qty);
    }, 0);

    const pricingType = (combo.comboPricingType ?? 'fixed_price') as 'fixed_price' | 'discount_percent' | 'discount_amount';
    const pricingValue = Number(combo.comboPricingValue ?? 0);
    const result = this.productsService.calculateComboBundleFinalPrice(subtotal, pricingType, pricingValue);

    return {
      comboProductId,
      comboMode: combo.comboMode,
      pricingType,
      pricingValue,
      subtotal: result.subtotal,
      discountTotal: result.discountTotal,
      finalPrice: result.finalPrice,
      items: combo.comboBundleItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name ?? 'Produto removido',
        qty: item.qty,
        unitPrice: item.product ? Number(item.product.basePrice) : 0,
        subtotal: item.product ? Number(item.product.basePrice) * item.qty : 0,
      })),
    };
  }
}
