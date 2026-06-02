import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import type {
  CreateOrderItemDTO,
  CreateOrderItemComplementDTO,
  CreateOrderItemComboSelectionDTO,
  CreateOrderItemSelectionGroupDTO,
  CreateOrderItemComboSlotSelectionDTO,
  DeliveryAddressDTO,
  PaymentInput,
  ValidatedLine,
  ValidatedProductLine,
  ValidatedComboLine,
  CheckoutValidationResult,
} from '@gestor/types';
import { CouponsService } from '../promotions/coupons.service';
import { CashbackService } from '../promotions/cashback.service';
import { DeliveryRateService } from '../delivery/delivery-rate.service';
import { AvailabilityService } from '../catalog/publication/availability.service';
import { UpsellsService } from '../catalog/upsells.service';
import { PizzaEngineService } from '../catalog/pizza-engine.service';

type ProductWithData = Prisma.ProductGetPayload<{
  include: {
    complementGroups: { include: { group: { include: { items: true } } } };
    optionGroupLinks: { include: { optionGroup: { include: { items: true } } } };
    category: { select: { id: true, templateType: true, templateConfig: true } };
  };
}>;

type OptionGroupLinkWithData = Prisma.ProductOptionGroupLinkGetPayload<{
  include: { optionGroup: { include: { items: true } } };
}>;

type ComplementGroupWithItems = Prisma.ProductComplementGroupGetPayload<{
  include: { items: true };
}>;

type ComplementGroupLinkWithData = Prisma.ProductComplementGroupLinkGetPayload<{
  include: { group: { include: { items: true } } };
}>;

type ComboSlotWithItems = Prisma.ComboSlotGetPayload<{
  include: { allowedItems: { include: { product: true } } };
}>;

type ProductComboBlockWithItems = Prisma.ProductComboBlockGetPayload<{
  include: { items: { include: { product: true } } };
}>;

@Injectable()
export class CheckoutValidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
    private readonly cashbackService: CashbackService,
    private readonly deliveryRateService: DeliveryRateService,
    private readonly availabilityService: AvailabilityService,
    private readonly pizzaEngine: PizzaEngineService,
    private readonly upsellsService: UpsellsService,
  ) {}

  async validate(
    slug: string,
    items: CreateOrderItemDTO[],
    options?: {
      customerId?: string | null;
      couponCode?: string;
      useCashbackAmount?: number;
      deliveryAddress?: DeliveryAddressDTO | null;
      channel?: 'storefront_delivery' | 'storefront_pickup' | 'whatsapp_ai';
      payment?: PaymentInput;
      scheduledFor?: Date;
      timeSlotId?: string;
    },
  ): Promise<CheckoutValidationResult> {
    // 1. Resolve tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant || tenant.status !== 'active') {
      throw new NotFoundException('Loja não encontrada ou inativa.');
    }

    const tenantId = tenant.id;

    // 1.5 Fetch Store Status Context once for performance and global check
    const [settings, operatingHours] = await Promise.all([
      this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { isStorePaused: true, storePauseReason: true, timezone: true },
      }),
      this.prisma.tenantOperatingHours.findMany({
        where: { tenantId },
      }),
    ]);

    const availabilityContext = { settings, operatingHours };
    const checkDate = options?.scheduledFor || new Date();
    const storeStatus = await this.availabilityService.getStoreStatus(tenantId, checkDate, availabilityContext);

    if (!storeStatus.isOpen && !options?.scheduledFor) {
      throw new BadRequestException(storeStatus.message || 'A loja está fechada no momento.');
    }

    // If scheduled, ensure it's a valid open day for the tenant
    if (options?.scheduledFor && !storeStatus.isOpen) {
       throw new BadRequestException(`A loja não estará aberta na data programada (${storeStatus.message}).`);
    }

    // 1.7 Validate Time Slot if provided
    if (options?.timeSlotId) {
      const slot = await this.prisma.timeSlot.findUnique({
        where: { id: options.timeSlotId, tenantId },
      });
      if (!slot || !slot.isActive) {
        throw new BadRequestException('Horário agendado não disponível.');
      }
      if (slot.currentOccupancy >= slot.capacity) {
        throw new BadRequestException('Este horário já atingiu o limite de pedidos.');
      }
    }

    if (items.length === 0) {
      throw new BadRequestException('O pedido deve conter pelo menos 1 item.');
    }

    const validatedLines: ValidatedLine[] = [];
    // whatsapp_ai behaves like storefront_delivery for availability checks,
    // but skips sellableOnline validation so agent can sell any active product.
    const channel = options?.channel ?? 'storefront_delivery';
    const resolvedCheckChannel: 'storefront_delivery' | 'storefront_pickup' | 'pos' =
      channel === 'whatsapp_ai' ? 'storefront_delivery' : channel;
    const checkSellableOnline = channel !== 'whatsapp_ai';

    for (const item of items) {
      if (item.lineType === 'product') {
        const line = await this.validateProductLine(
          tenantId,
          item,
          checkSellableOnline,
          resolvedCheckChannel,
          availabilityContext,
        );
        validatedLines.push(line);
      } else if (item.lineType === 'combo') {
        const line = await this.validateComboLine(tenantId, item, resolvedCheckChannel, availabilityContext);
        validatedLines.push(line);
      } else {
        throw new BadRequestException('Tipo de linha inválido.');
      }
    }

    const itemsSubtotal = validatedLines.reduce((sum, l) => sum + l.lineTotal, 0);

    let discountTotal = 0;
    let couponId: string | null = null;
    let cashbackUsed: number | null = null;

    if (options?.couponCode) {
      const couponVal = await this.couponsService.validateCouponForTotal(
        tenantId,
        options.couponCode,
        itemsSubtotal,
      );
      discountTotal += couponVal.discountAmount;
      couponId = couponVal.couponId;
    }

    if (options?.useCashbackAmount && options.useCashbackAmount > 0 && options.customerId) {
      const balance = await this.cashbackService.getCashbackBalance(tenantId, options.customerId);
      if (balance < options.useCashbackAmount) {
        throw new BadRequestException('Saldo de cashback insuficiente.');
      }
      // Cashback also cannot exceed the subtotal minus coupon discount
      const remainingTotal = itemsSubtotal - discountTotal;
      const appliedCashback = Math.min(options.useCashbackAmount, remainingTotal);
      discountTotal += appliedCashback;
      cashbackUsed = appliedCashback;
    }

    const total = Math.round((itemsSubtotal - discountTotal) * 100) / 100;

    // 5. Calcular taxa de entrega apenas se for delivery ou whatsapp_ai delivery
    const isDelivery = channel === 'storefront_delivery' || channel === 'whatsapp_ai';
    let deliveryFee = 0;

    if (isDelivery && options?.deliveryAddress) {
      const hasCoords = Boolean(options.deliveryAddress.lat && options.deliveryAddress.lng);
      const hasCoverage = await this.deliveryRateService.hasCoverageConfig(tenantId);

      if (hasCoverage) {
        if (hasCoords) {
          // Full calculation with coordinates
          const decision = await this.deliveryRateService.calculateDeliveryDecision({
            tenantId,
            address: options.deliveryAddress,
            distanceKm: null,
          });
          if (!decision.canDeliver) {
            throw new BadRequestException(decision.reason || 'Não entregamos nesta região.');
          }
          deliveryFee = decision.fee ?? 0;
        } else {
          // No coords (whatsapp_ai without Google Maps): try rate by neighborhood/fixed
          const rateResult = await this.deliveryRateService.calculateRate({
            tenantId,
            address: options.deliveryAddress,
            distanceKm: null,
          });
          deliveryFee = rateResult.fee ?? 0;
        }
      } else if (!hasCoords) {
        // No coverage config and no coords: use zero delivery fee (will be adjusted manually)
        deliveryFee = 0;
      } else {
        const rateResult = await this.deliveryRateService.calculateRate({
          tenantId,
          address: options.deliveryAddress,
          distanceKm: null,
        });
        deliveryFee = rateResult.fee ?? 0;
      }
    } else if (isDelivery && channel === 'storefront_delivery' && !options?.deliveryAddress) {
      // storefront_delivery without address is an error
      throw new BadRequestException('Endereço de entrega é obrigatório para pedidos de entrega.');
    }

    const finalTotal = Math.round((total + deliveryFee) * 100) / 100;

    // 6. Validar pagamento
    this.validatePayment(options?.payment, finalTotal);

    return { 
      tenantId, 
      lines: validatedLines, 
      itemsSubtotal, 
      discountTotal, 
      deliveryFee,
      total: finalTotal, 
      couponId, 
      cashbackUsed 
    };
  }

  /**
   * Validate items by direct tenantId (for POS sales).
   * Skips slug resolution and sellableOnline check.
   */
  async validateByTenantId(
    tenantId: string,
    items: CreateOrderItemDTO[],
    options?: { customerId?: string | null; couponCode?: string; useCashbackAmount?: number },
  ): Promise<CheckoutValidationResult> {
    if (items.length === 0) {
      throw new BadRequestException('A venda deve conter pelo menos 1 item.');
    }

    const validatedLines: ValidatedLine[] = [];

    for (const item of items) {
      if (item.lineType === 'product') {
        const line = await this.validateProductLine(tenantId, item, false, 'pos');
        validatedLines.push(line);
      } else if (item.lineType === 'combo') {
        const line = await this.validateComboLine(tenantId, item, 'pos');
        validatedLines.push(line);
      } else {
        throw new BadRequestException('Tipo de linha inválido.');
      }
    }

    const itemsSubtotal = Math.round(validatedLines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;

    let discountTotal = 0;
    let couponId: string | null = null;
    let cashbackUsed: number | null = null;

    if (options?.couponCode) {
      const couponVal = await this.couponsService.validateCouponForTotal(
        tenantId,
        options.couponCode,
        itemsSubtotal,
      );
      discountTotal += couponVal.discountAmount;
      couponId = couponVal.couponId;
    }

    if (options?.useCashbackAmount && options.useCashbackAmount > 0 && options.customerId) {
      const balance = await this.cashbackService.getCashbackBalance(tenantId, options.customerId);
      if (balance < options.useCashbackAmount) {
        throw new BadRequestException('Saldo de cashback insuficiente.');
      }
      // Cashback also cannot exceed the subtotal minus coupon discount
      const remainingTotal = Math.round((itemsSubtotal - discountTotal) * 100) / 100;
      const appliedCashback = Math.min(options.useCashbackAmount, remainingTotal);
      discountTotal += appliedCashback;
      cashbackUsed = appliedCashback;
    }

    const total = Math.round((itemsSubtotal - discountTotal) * 100) / 100;

    // Para POS, taxa de entrega é zero (venda local)
    const deliveryFee = 0;
    const finalTotal = total;

    return { 
      tenantId, 
      lines: validatedLines, 
      itemsSubtotal, 
      discountTotal: Math.round(discountTotal * 100) / 100,
      deliveryFee,
      total: finalTotal, 
      couponId, 
      cashbackUsed 
    };
  }

  private async validateProductLine(
    tenantId: string,
    item: CreateOrderItemDTO,
    checkSellableOnline: boolean = true,
    channel: 'storefront_delivery' | 'storefront_pickup' | 'pos' = 'storefront_delivery',
    context?: { settings?: Prisma.TenantSettingsGetPayload<{ select: { isStorePaused: true, storePauseReason: true, timezone: true } }> | null; operatingHours?: Prisma.TenantOperatingHoursGetPayload<Record<string, never>>[] },
  ): Promise<ValidatedProductLine> {
    if (!item.productId) {
      throw new BadRequestException('productId é obrigatório para linhas do tipo product.');
    }

    const hasNewSelections = item.selections && item.selections.length > 0;

    // Fetch product with legacy complement groups and/or new option groups
    const product = await this.prisma.product.findFirst({
      where: { id: item.productId, tenantId, deletedAt: null },
      include: {
        complementGroups: {
          include: {
            group: {
              include: {
                items: true,
              },
            },
          },
        },
        optionGroupLinks: {
          include: {
            optionGroup: {
              include: {
                items: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        category: {
          select: { id: true, templateType: true, templateConfig: true }
        }
      },
    });

    if (!product) {
      throw new BadRequestException(`Produto não encontrado ou não pertence a esta loja.`);
    }

    const typedProduct = product as ProductWithData;

    const shouldCheckAvailabilityByChannel = channel !== 'pos';

    if (shouldCheckAvailabilityByChannel) {
      await this.availabilityService.assertCanSell({
        tenantId,
        productId: item.productId,
        channel,
        context,
      });
    }
    if (!typedProduct.isActive) {
      throw new BadRequestException(`O produto "${typedProduct.name}" não está ativo.`);
    }
    if (!typedProduct.isAvailable) {
      throw new BadRequestException(`O produto "${typedProduct.name}" não está disponível no momento.`);
    }
    if (checkSellableOnline && !typedProduct.sellableOnline) {
      throw new BadRequestException(`O produto "${typedProduct.name}" não está disponível para venda online.`);
    }

    const basePrice = Number(typedProduct.basePrice);

    let effectiveBasePrice = basePrice;

    // Apply Upsell Discount if applicable
    if (item.sourceUpsellId) {
      const upsell = await this.prisma.upsell.findFirst({
        where: { id: item.sourceUpsellId, tenantId, isActive: true },
        include: { items: true },
      });
      if (upsell) {
        const upsellItem = upsell.items.find((i) => i.productId === item.productId);
        if (upsellItem) {
          effectiveBasePrice = this.upsellsService.calculateUpsellPrice(
            basePrice,
            upsell.pricingType,
            Number(upsell.pricingValue),
          );
        }
      }
    }

    let extrasTotal = 0;
    let unitPrice = 0;
    let composition = '';
    let validatedComplements: Array<{ complementItemId: string; snapshotName: string; snapshotPrice: number }> = [];
    let snapshotCatalogV2Json: unknown | undefined;

    if (hasNewSelections) {
      const pricing = this.validateAndPriceOptionSelections(
        item.selections || [],
        typedProduct.optionGroupLinks,
        typedProduct.name,
        basePrice,
      );

      effectiveBasePrice = pricing.effectiveBasePrice;
      extrasTotal = pricing.extrasTotal;
      unitPrice = pricing.unitPrice;
      composition = pricing.composition;

      const category = typedProduct.category;
      const isPizzaTemplate = category?.templateType === 'pizza';

      if (isPizzaTemplate && item.pizzaComposition) {
        // SPECIAL PIZZA LOGIC
        const res = await this.pizzaEngine.calculatePrice(
          category.id,
          item.pizzaComposition.sizeId,
          item.pizzaComposition.flavors
        );

        effectiveBasePrice = res.calculatedPrice;
        unitPrice = effectiveBasePrice + extrasTotal;
        composition = `Tamanho: ${res.sizeName}; Sabores: ${res.flavors.map(f => `${f.name} (${(f.fraction * 100).toFixed(0)}%)`).join(', ')}`;
        
        // Update composition with options if any
        if (pricing.composition) composition += `; ${pricing.composition}`;
      }

      snapshotCatalogV2Json = {
        version: 'catalog_v2_snapshot_v1',
        channel,
        lineType: 'product',
        capturedAt: new Date().toISOString(),
        product: {
          id: item.productId,
          name: typedProduct.name,
          type: typedProduct.type,
          templateType: category?.templateType,
        },
        quantity: item.quantity,
        notes: item.notes ?? null,
        pricing: {
          basePrice,
          effectiveBasePrice,
          extrasTotal,
          unitPrice,
        },
        selections: pricing.selectionsSnapshot,
        pizzaComposition: item.pizzaComposition ? {
          ...item.pizzaComposition,
          // We could store the full engine result here for UI
          fullEngineResult: await this.pizzaEngine.calculatePrice(
            category.id,
            item.pizzaComposition.sizeId,
            item.pizzaComposition.flavors
          )
        } : null,
        slots: [],
      };

      validatedComplements = [];
    } else {
      // LEGACY FALLBACK
      const complements = item.complements || [];
      const complementGroups = typedProduct.complementGroups;

      validatedComplements = this.validateComplements(
        complements,
        complementGroups,
        typedProduct.name,
      );

      extrasTotal = validatedComplements.reduce((s, c) => s + c.snapshotPrice, 0);
      unitPrice = basePrice + extrasTotal;
      composition = validatedComplements.map(c => c.snapshotName).join(', ');
    }

    const lineTotal = unitPrice * item.quantity;

    return {
      lineType: 'product',
      productId: item.productId,
      name: typedProduct.name,
      image: typedProduct.image || null,
      basePrice,
      effectiveBasePrice,
      extrasTotal,
      unitPrice,
      lineTotal,
      quantity: item.quantity,
      notes: item.notes,
      composition,
      sourceUpsellId: item.sourceUpsellId,
      complements: validatedComplements,
      snapshotCatalogV2Json,
    };
  }

  private validateAndPriceOptionSelections(
    selections: CreateOrderItemSelectionGroupDTO[],
    optionGroupLinks: OptionGroupLinkWithData[],
    productName: string,
    basePrice: number,
  ): {
    effectiveBasePrice: number;
    unitPrice: number;
    extrasTotal: number;
    composition: string;
    selectionsSnapshot: Array<{
      groupId: string;
      groupName: string;
      selectionType: string;
      pricingAxis: string;
      isRequired: boolean;
      minSelect: number;
      maxSelect: number;
      allowQuantity: boolean;
      items: Array<{
        itemId: string;
        name: string;
        qty: number;
        priceImpactType: string;
        priceImpactValue: number;
        appliedAmount: number;
      }>;
    }>;
  } {
    // Build lookup of groups available to this product (respect active group)
    const groupLinkMap = new Map<string, OptionGroupLinkWithData>();
    for (const link of optionGroupLinks) {
      const group = link.optionGroup;
      if (group && group.isActive) {
        groupLinkMap.set(group.id, link);
      }
    }

    // Validate extraneous groups early
    for (const sel of selections) {
      if (!groupLinkMap.has(sel.optionGroupId)) {
        throw new BadRequestException(`Grupo de opções não reconhecido para "${productName}".`);
      }
    }

    // Validate min/max per group (using overrides if present)
    for (const [groupId, link] of groupLinkMap.entries()) {
      const group = link.optionGroup;
      const selectedGroup = selections.find((s) => s.optionGroupId === groupId);
      const selectedCount = selectedGroup ? selectedGroup.items.length : 0;

      const minSelect = link.overrideMinSelect ?? group.minSelect;
      const maxSelect = link.overrideMaxSelect ?? group.maxSelect;
      const isRequired = link.overrideIsRequired ?? group.isRequired;
      const groupName = link.overrideName ?? group.name;

      const effectiveMin = isRequired ? Math.max(1, minSelect) : minSelect;

      if (selectedCount < effectiveMin) {
        throw new BadRequestException(
          `Selecione pelo menos ${effectiveMin} opções em "${groupName}" para "${productName}".`,
        );
      }
      if (selectedCount > maxSelect) {
        throw new BadRequestException(
          `Máximo de ${maxSelect} opções em "${groupName}" para "${productName}".`,
        );
      }
    }

    // Pricing
    let effectiveBasePrice = basePrice;
    let fixedTotal = 0;
    let percentageTotal = 0;

    let hasReplace = false;

    const compositionParts: string[] = [];
    const selectionsSnapshot: Array<{
      groupId: string;
      groupName: string;
      selectionType: string;
      pricingAxis: string;
      isRequired: boolean;
      minSelect: number;
      maxSelect: number;
      allowQuantity: boolean;
      items: Array<{
        itemId: string;
        name: string;
        qty: number;
        priceImpactType: string;
        priceImpactValue: number;
        appliedAmount: number;
      }>;
    }> = [];

    for (const selGroup of selections) {
      const link = groupLinkMap.get(selGroup.optionGroupId);
      if (!link) continue;
      const group = link.optionGroup;
      const groupName = link.overrideName ?? group.name;
      const pricingAxis = link.pricingAxis || 'secondary';

      const selectionType = group.selectionType;
      const isRequired = (link.overrideIsRequired ?? group.isRequired) || false;
      const minSelect = Number((link.overrideMinSelect ?? group.minSelect) ?? 0);
      const maxSelect = Number((link.overrideMaxSelect ?? group.maxSelect) ?? 0);

      const groupItems = group.items;
      const chosenNames: string[] = [];
      let groupAllowQuantity = false;
      const groupSnapshotItems: Array<{
        itemId: string;
        name: string;
        qty: number;
        priceImpactType: string;
        priceImpactValue: number;
        appliedAmount: number;
      }> = [];

      for (const chosen of selGroup.items) {
        const itemRecord = groupItems.find((i) => i.id === chosen.optionItemId);
        if (!itemRecord) {
          throw new BadRequestException(`Opção não encontrada no grupo "${groupName}".`);
        }
        if (!itemRecord.isActive) {
          throw new BadRequestException(`A opção "${itemRecord.name}" não está disponível.`);
        }

        const allowQuantity = itemRecord.allowQuantity || false;
        if (allowQuantity) {
          groupAllowQuantity = true;
        }
        const qty = allowQuantity ? Math.max(1, Number(chosen.qty ?? 1)) : 1;

        const impactType = itemRecord.priceImpactType as 'none' | 'fixed' | 'replace' | 'percentage';
        const impactValue = Number(itemRecord.priceImpactValue);

        let appliedAmount = 0;

        if (impactType === 'replace') {
          if (pricingAxis !== 'primary') {
            throw new BadRequestException(
              `Opção de substituição de preço não permitida fora do eixo principal em "${groupName}".`,
            );
          }
          if (hasReplace) {
            throw new BadRequestException(
              `Mais de uma opção de substituição de preço selecionada para "${productName}".`,
            );
          }
          hasReplace = true;
          effectiveBasePrice = impactValue;
          appliedAmount = 0;
        } else if (impactType === 'fixed') {
          appliedAmount = impactValue * qty;
          fixedTotal += appliedAmount;
        } else if (impactType === 'percentage') {
          appliedAmount = effectiveBasePrice * (impactValue / 100) * qty;
          percentageTotal += appliedAmount;
        }

        groupSnapshotItems.push({
          itemId: chosen.optionItemId,
          name: itemRecord.name,
          qty,
          priceImpactType: impactType,
          priceImpactValue: impactValue,
          appliedAmount,
        });

        chosenNames.push(allowQuantity && qty > 1 ? `${itemRecord.name} x${qty}` : itemRecord.name);
      }

      if (chosenNames.length > 0) {
        compositionParts.push(`${groupName}: ${chosenNames.join(', ')}`);
      }

      if (groupSnapshotItems.length > 0) {
        selectionsSnapshot.push({
          groupId: selGroup.optionGroupId,
          groupName,
          selectionType,
          pricingAxis,
          isRequired,
          minSelect,
          maxSelect,
          allowQuantity: groupAllowQuantity,
          items: groupSnapshotItems,
        });
      }
    }

    const unitPrice = effectiveBasePrice + fixedTotal + percentageTotal;
    const extrasTotal = unitPrice - basePrice;
    const composition = compositionParts.join('; ');
    return { effectiveBasePrice, unitPrice, extrasTotal, composition, selectionsSnapshot };
  }

  private validateComplements(
    selected: CreateOrderItemComplementDTO[],
    productGroups: ComplementGroupLinkWithData[],
    productName: string,
  ): Array<{ complementItemId: string; snapshotName: string; snapshotPrice: number }> {
    const result: Array<{ complementItemId: string; snapshotName: string; snapshotPrice: number }> = [];

    // Build lookup of groups available to this product
    const groupMap = new Map<string, ComplementGroupWithItems>();
    for (const link of productGroups) {
      const group = link.group;
      if (group.isActive) {
        groupMap.set(group.id, group);
      }
    }

    // Check each group for min/max
    for (const [groupId, group] of groupMap.entries()) {
      const selectedForGroup = selected.filter(s => s.groupId === groupId);
      const minSelect = group.minSelect;
      const maxSelect = group.maxSelect;
      const groupName = group.name;

      if (selectedForGroup.length < minSelect) {
        throw new BadRequestException(
          `Selecione pelo menos ${minSelect} opções em "${groupName}" para "${productName}".`,
        );
      }
      if (selectedForGroup.length > maxSelect) {
        throw new BadRequestException(
          `Máximo de ${maxSelect} opções em "${groupName}" para "${productName}".`,
        );
      }

      const groupItems = group.items;

      for (const sel of selectedForGroup) {
        const compItem = groupItems.find(i => i.id === sel.itemId);
        if (!compItem) {
          throw new BadRequestException(`Complemento não encontrado no grupo "${groupName}".`);
        }
        if (!compItem.isActive) {
          throw new BadRequestException(`O complemento "${compItem.name}" não está disponível.`);
        }
        result.push({
          complementItemId: sel.itemId,
          snapshotName: compItem.name,
          snapshotPrice: Number(compItem.additionalPrice),
        });
      }
    }

    // Check for extraneous group references
    for (const sel of selected) {
      if (!groupMap.has(sel.groupId)) {
        throw new BadRequestException(`Grupo de complemento não reconhecido para "${productName}".`);
      }
    }

    return result;
  }

  private async validateComboLine(
    tenantId: string,
    item: CreateOrderItemDTO,
    channel: 'storefront_delivery' | 'storefront_pickup' | 'pos' = 'storefront_delivery',
    context?: { settings?: Prisma.TenantSettingsGetPayload<{ select: { isStorePaused: true, storePauseReason: true, timezone: true } }> | null; operatingHours?: Prisma.TenantOperatingHoursGetPayload<Record<string, never>>[] },
  ): Promise<ValidatedComboLine> {
    const hasNewSlots = Array.isArray(item.slots) && item.slots.length > 0;
    const comboProductId = item.productId || item.comboId;

    if (hasNewSlots) {
      if (!item.productId) {
        throw new BadRequestException('productId é obrigatório para combos no payload novo.');
      }

      const comboProduct = await this.prisma.product.findFirst({
        where: { id: item.productId, tenantId, deletedAt: null },
        include: {
          comboSlots: {
            include: {
              allowedItems: {
                include: { product: true },
              },
            },
            orderBy: { order: 'asc' },
          },
        },
      });

      if (!comboProduct) {
        throw new BadRequestException('Combo não encontrado ou não pertence a esta loja.');
      }

      type ComboWithSlots = Prisma.ProductGetPayload<{
        include: {
          comboSlots: {
            include: {
              allowedItems: {
                include: { product: true },
              },
            },
          },
        },
      }>;

      const typedCombo = comboProduct as ComboWithSlots;

      await this.availabilityService.assertCanSell({
        tenantId,
        productId: item.productId,
        channel,
        context,
      });
      if (!typedCombo.isActive) {
        throw new BadRequestException(`O combo "${typedCombo.name}" não está ativo.`);
      }

      const basePrice = Number(typedCombo.basePrice);
      const validatedSlots = this.validateComboSlots(
        item.slots || [],
        typedCombo.comboSlots,
        typedCombo.name,
      );

      const extrasTotal = validatedSlots.reduce((s, c) => s + c.additionalPrice, 0);
      const unitPrice = basePrice + extrasTotal;
      const lineTotal = unitPrice * item.quantity;
      const composition = validatedSlots
        .map((s) => `${s.slotName}: ${s.productName}`)
        .join('; ');

      const slotsSnapshot = this.buildSlotsSnapshotFromValidated(validatedSlots);

      return {
        lineType: 'combo',
        comboId: item.productId,
        name: typedCombo.name,
        image: typedCombo.image || null,
        basePrice,
        effectiveBasePrice: basePrice,
        extrasTotal,
        unitPrice,
        lineTotal,
        quantity: item.quantity,
        notes: item.notes,
        composition,
        comboSelections: [],
        snapshotCatalogV2Json: {
          version: 'catalog_v2_snapshot_v1',
          channel,
          lineType: 'combo',
          capturedAt: new Date().toISOString(),
          product: {
            id: item.productId,
            name: typedCombo.name,
            type: typedCombo.type,
          },
          quantity: item.quantity,
          notes: item.notes ?? null,
          pricing: {
            basePrice,
            effectiveBasePrice: basePrice,
            extrasTotal,
            unitPrice,
          },
          selections: [],
          slots: slotsSnapshot,
        },
      };
    }

    if (comboProductId) {
      const comboProduct = await this.prisma.product.findFirst({
        where: { id: comboProductId, tenantId, deletedAt: null, type: 'combo' },
        include: {
          comboBundleItems: {
            include: { product: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (comboProduct) {
        type ComboWithBundle = Prisma.ProductGetPayload<{
          include: {
            comboBundleItems: {
              include: { product: true },
            },
          },
        }>;

        const typedCombo = comboProduct as ComboWithBundle;

        await this.availabilityService.assertCanSell({
          tenantId,
          productId: comboProductId,
          channel,
        });

        if (!typedCombo.isActive) {
          throw new BadRequestException(`O combo "${typedCombo.name}" não está ativo.`);
        }

        const comboMode = typedCombo.comboMode ?? 'bundle';
        if (comboMode === 'bundle') {
          const bundleItems = typedCombo.comboBundleItems ?? [];
          const subtotal = bundleItems.reduce((sum, bundleItem) => {
            const product = bundleItem.product;
            if (!product || !product.isActive || product.deletedAt != null) return sum;
            return sum + Number(product.basePrice) * Math.max(1, bundleItem.qty ?? 1);
          }, 0);

          const pricingType = typedCombo.comboPricingType ?? 'fixed_price';
          const pricingValue = Number(typedCombo.comboPricingValue ?? 0);
          let finalPrice = subtotal;

          if (pricingType === 'fixed_price') {
            finalPrice = pricingValue;
          } else if (pricingType === 'discount_percent') {
            finalPrice = subtotal * (1 - Math.min(100, Math.max(0, pricingValue)) / 100);
          } else if (pricingType === 'discount_amount') {
            finalPrice = subtotal - Math.max(0, pricingValue);
          }

          finalPrice = Math.max(0, Number(finalPrice.toFixed(2)));
          const discountTotal = Math.max(0, Number((subtotal - finalPrice).toFixed(2)));
          const basePrice = Number(typedCombo.basePrice);
          const unitPrice = finalPrice;
          const lineTotal = unitPrice * item.quantity;
          const composition = bundleItems
            .map((bundleItem) => {
              const product = bundleItem.product;
              const qty = Math.max(1, bundleItem.qty ?? 1);
              return `${product?.name ?? 'Item'} x${qty}`;
            })
            .join('; ');

          return {
            lineType: 'combo',
            comboId: comboProductId,
            name: typedCombo.name,
            image: typedCombo.image || null,
            basePrice,
            effectiveBasePrice: basePrice,
            extrasTotal: 0,
            unitPrice,
            lineTotal,
            quantity: item.quantity,
            notes: item.notes,
            composition,
            comboSelections: [],
            snapshotCatalogV2Json: {
              version: 'catalog_v2_snapshot_v1',
              channel,
              lineType: 'combo',
              capturedAt: new Date().toISOString(),
              product: {
                id: comboProductId,
                name: typedCombo.name,
                type: typedCombo.type,
                comboMode: 'bundle',
              },
              quantity: item.quantity,
              notes: item.notes ?? null,
              pricing: {
                basePrice,
                effectiveBasePrice: basePrice,
                extrasTotal: 0,
                unitPrice,
                pricingType,
                pricingValue,
                itemsSubtotal: Number(subtotal.toFixed(2)),
                discountTotal,
                finalPrice: unitPrice,
              },
              selections: [],
              slots: [],
              bundleItems: bundleItems.map((bundleItem) => {
                const product = bundleItem.product;
                const qty = Math.max(1, bundleItem.qty ?? 1);
                const unit = Number(product?.basePrice ?? 0);
                return {
                  productId: bundleItem.productId,
                  name: product?.name ?? 'Item',
                  qty,
                  unitPrice: unit,
                  subtotal: Number((unit * qty).toFixed(2)),
                };
              }),
            },
          };
        }
      }
    }

    // LEGACY FALLBACK
    if (!item.comboId) {
      throw new BadRequestException('comboId é obrigatório para combos legados sem bundle.');
    }
    const combo = await this.prisma.productCombo.findFirst({
      where: { id: item.comboId, tenantId, deletedAt: null },
      include: {
        blocks: {
          include: {
            items: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!combo) {
      throw new BadRequestException('Combo não encontrado ou não pertence a esta loja.');
    }

    type LegacyCombo = Prisma.ProductComboGetPayload<{
      include: {
        blocks: {
          include: {
            items: {
              include: { product: true },
            },
          },
        },
      },
    }>;

    const typedComboLegacy = (combo as unknown) as LegacyCombo;

    if (!typedComboLegacy.isActive) {
      throw new BadRequestException(`O combo "${typedComboLegacy.name}" não está ativo.`);
    }

    const basePrice = Number(typedComboLegacy.basePrice);
    const selections = item.comboSelections || [];
    const blocks = typedComboLegacy.blocks;

    const validatedSelections = this.validateComboBlocks(
      selections,
      blocks,
      typedComboLegacy.name,
    );

    const extrasTotal = validatedSelections.reduce((s, c) => s + c.snapshotAdditionalPrice, 0);
    const unitPrice = basePrice + extrasTotal;
    const lineTotal = unitPrice * item.quantity;
    const composition = validatedSelections.map(s => `${s.snapshotBlockName}: ${s.snapshotProductName}`).join('; ');

    return {
      lineType: 'combo',
      comboId: item.comboId,
      name: combo['name'] as string,
      image: (combo['image'] as string | null) || null,
      basePrice,
      effectiveBasePrice: basePrice,
      extrasTotal,
      unitPrice,
      lineTotal,
      quantity: item.quantity,
      notes: item.notes,
      composition,
      comboSelections: validatedSelections,
    };
  }

  private buildSlotsSnapshotFromValidated(
    validatedSelections: Array<{
      slotId: string;
      slotName: string;
      isRequired: boolean;
      minSelect: number;
      maxSelect: number;
      productId: string;
      productName: string;
      qty: number;
      additionalPrice: number;
    }>,
  ) {
    const map = new Map<
      string,
      {
        slotName: string;
        isRequired: boolean;
        minSelect: number;
        maxSelect: number;
        items: Array<{ productId: string; name: string; qty: number; additionalPrice: number }>;
      }
    >();
    for (const sel of validatedSelections) {
      if (!map.has(sel.slotId)) {
        map.set(sel.slotId, {
          slotName: sel.slotName,
          isRequired: sel.isRequired,
          minSelect: sel.minSelect,
          maxSelect: sel.maxSelect,
          items: [],
        });
      }
      map.get(sel.slotId)!.items.push({
        productId: sel.productId,
        name: sel.productName,
        qty: sel.qty,
        additionalPrice: sel.additionalPrice,
      });
    }
    return Array.from(map.entries()).map(([slotId, v]) => ({
      slotId,
      slotName: v.slotName,
      isRequired: v.isRequired,
      minSelect: v.minSelect,
      maxSelect: v.maxSelect,
      items: v.items,
    }));
  }

  private validateComboSlots(
    selected: CreateOrderItemComboSlotSelectionDTO[],
    slots: ComboSlotWithItems[],
    comboName: string,
  ): Array<{
    slotId: string;
    slotName: string;
    isRequired: boolean;
    minSelect: number;
    maxSelect: number;
    productId: string;
    productName: string;
    qty: number;
    additionalPrice: number;
  }> {
    const result: Array<{
      slotId: string;
      slotName: string;
      isRequired: boolean;
      minSelect: number;
      maxSelect: number;
      productId: string;
      productName: string;
      qty: number;
      additionalPrice: number;
    }> = [];

    const slotMap = new Map<string, ComboSlotWithItems>();
    for (const slot of slots) {
      slotMap.set(slot.id, slot);
    }

    for (const sel of selected) {
      if (!slotMap.has(sel.comboSlotId)) {
        throw new BadRequestException(`Slot não reconhecido no combo "${comboName}".`);
      }
    }

    for (const [slotId, slot] of slotMap.entries()) {
      const selectedForSlot = selected.find((s) => s.comboSlotId === slotId);
      const items = selectedForSlot ? selectedForSlot.items : [];

      const minSelect = Number(slot.minSelect);
      const maxSelect = Number(slot.maxSelect);
      const isRequired = Boolean(slot.isRequired);
      const slotName = slot.name;

      const effectiveMin = isRequired ? Math.max(1, minSelect) : minSelect;

      const normalizedItems = new Map<string, number>();
      for (const chosen of items) {
        const qty = Math.max(1, Number(chosen.qty ?? 1));
        normalizedItems.set(chosen.productId, (normalizedItems.get(chosen.productId) ?? 0) + qty);
      }

      const totalQty = Array.from(normalizedItems.values()).reduce((s, v) => s + v, 0);

      if (totalQty < effectiveMin) {
        throw new BadRequestException(
          `Selecione pelo menos ${effectiveMin} itens em "${slotName}" no combo "${comboName}".`,
        );
      }
      if (totalQty > maxSelect) {
        throw new BadRequestException(
          `Máximo de ${maxSelect} itens em "${slotName}" no combo "${comboName}".`,
        );
      }

      const allowedItems = slot.allowedItems;

      for (const [productId, qty] of normalizedItems.entries()) {
        const allowed = allowedItems.find(
          (a) => a.productId === productId,
        );
        if (!allowed) {
          throw new BadRequestException(`Item não permitido no slot "${slotName}".`);
        }
        const product = allowed.product;
        if (!product.isActive || product.deletedAt !== null) {
          throw new BadRequestException(
            `O produto "${product.name}" do slot "${slotName}" não está disponível.`,
          );
        }

        if (qty > maxSelect) {
          throw new BadRequestException(
            `Quantidade inválida em "${slotName}" no combo "${comboName}".`,
          );
        }

        result.push({
          slotId,
          slotName,
          isRequired,
          minSelect: effectiveMin,
          maxSelect,
          productId,
          productName: product.name,
          qty,
          additionalPrice: Number(allowed.additionalPrice) * qty,
        });
      }
    }

    return result;
  }

  private validateComboBlocks(
    selected: CreateOrderItemComboSelectionDTO[],
    blocks: ProductComboBlockWithItems[],
    comboName: string,
  ): Array<{
    comboBlockItemId: string;
    snapshotBlockName: string;
    snapshotProductName: string;
    snapshotAdditionalPrice: number;
  }> {
    const result: Array<{
      comboBlockItemId: string;
      snapshotBlockName: string;
      snapshotProductName: string;
      snapshotAdditionalPrice: number;
    }> = [];

    const blockMap = new Map<string, ProductComboBlockWithItems>();
    for (const block of blocks) {
      blockMap.set(block.id, block);
    }

    for (const [blockId, block] of blockMap.entries()) {
      const selectedForBlock = selected.filter(s => s.blockId === blockId);
      const minSelect = block.minSelect;
      const maxSelect = block.maxSelect;
      const blockName = block.name;

      if (selectedForBlock.length < minSelect) {
        throw new BadRequestException(
          `Selecione pelo menos ${minSelect} itens em "${blockName}" no combo "${comboName}".`,
        );
      }
      if (selectedForBlock.length > maxSelect) {
        throw new BadRequestException(
          `Máximo de ${maxSelect} itens em "${blockName}" no combo "${comboName}".`,
        );
      }

      const blockItems = block.items;

      for (const sel of selectedForBlock) {
        const blockItem = blockItems.find(i => i.id === sel.blockItemId);
        if (!blockItem) {
          throw new BadRequestException(`Item não reconhecido no bloco "${blockName}".`);
        }

        const product = blockItem.product;
        if (!product.isActive || product.deletedAt !== null) {
          throw new BadRequestException(`O produto "${product.name}" do bloco "${blockName}" não está disponível.`);
        }

        result.push({
          comboBlockItemId: sel.blockItemId,
          snapshotBlockName: blockName,
          snapshotProductName: product.name,
          snapshotAdditionalPrice: Number(blockItem.additionalPrice),
        });
      }
    }

    // Extraneous block check
    for (const sel of selected) {
      if (!blockMap.has(sel.blockId)) {
        throw new BadRequestException(`Bloco não reconhecido no combo "${comboName}".`);
      }
    }

    return result;
  }

  private validatePayment(payment: PaymentInput | undefined, total: number) {
    if (!payment || !payment.method) {
      throw new BadRequestException('Forma de pagamento é obrigatória.');
    }

    if (payment.method === 'cash') {
      if (!payment.changeFor) {
        throw new BadRequestException('Para pagamento em dinheiro, informe o troco.');
      }
      if (payment.changeFor < total) {
        throw new BadRequestException(
          `O valor para troco (${payment.changeFor}) deve ser maior ou igual ao total do pedido (${total}).`,
        );
      }
    }
  }

  private isDistanceRuleMatch(
    rule: { minDistanceKm?: number | null; maxDistanceKm?: number | null; minKm?: number | null; maxKm?: number | null },
    distanceKm: number,
  ): boolean {
    const min = rule.minDistanceKm ?? rule.minKm;
    const max = rule.maxDistanceKm ?? rule.maxKm;

    return (min == null || distanceKm >= min) && (max == null || distanceKm <= max);
  }
}
