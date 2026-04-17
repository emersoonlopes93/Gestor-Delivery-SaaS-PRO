import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateOrderItemDTO,
  CreateOrderItemComplementDTO,
  CreateOrderItemComboSelectionDTO,
  CreateOrderItemSelectionGroupDTO,
  CreateOrderItemComboSlotSelectionDTO,
  DeliveryAddressDTO,
  PaymentInput,
} from '@gestor/types';
import { CouponsService } from '../promotions/coupons.service';
import { CashbackService } from '../promotions/cashback.service';
import { DeliveryRateService } from '../delivery/delivery-rate.service';
import { AvailabilityService } from './availability.service';
import { UpsellsService } from '../catalog/upsells.service';
import { PizzaEngineService } from '../catalog/pizza-engine.service';

interface ValidatedProductLine {
  lineType: 'product';
  productId: string;
  name: string;
  image: string | null;
  basePrice: number;
  effectiveBasePrice: number;
  extrasTotal: number;
  unitPrice: number;
  lineTotal: number;
  quantity: number;
  notes?: string;
  composition: string;
  sourceUpsellId?: string;
  complements: Array<{
    complementItemId: string;
    snapshotName: string;
    snapshotPrice: number;
  }>;

  snapshotCatalogV2Json?: unknown;
}

interface ValidatedComboLine {
  lineType: 'combo';
  comboId: string;
  name: string;
  image: string | null;
  basePrice: number;
  effectiveBasePrice: number;
  extrasTotal: number;
  unitPrice: number;
  lineTotal: number;
  quantity: number;
  notes?: string;
  composition: string;
  comboSelections: Array<{
    comboBlockItemId: string;
    snapshotBlockName: string;
    snapshotProductName: string;
    snapshotAdditionalPrice: number;
  }>;

  snapshotCatalogV2Json?: unknown;
}

export type ValidatedLine = ValidatedProductLine | ValidatedComboLine;

export interface CheckoutValidationResult {
  tenantId: string;
  lines: ValidatedLine[];
  itemsSubtotal: number;
  discountTotal: number;
  deliveryFee: number;
  total: number; // Subtotal - discount + deliveryFee
  couponId?: string | null;
  cashbackUsed?: number | null;
}

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
      channel?: 'storefront_delivery' | 'storefront_pickup';
      payment?: PaymentInput;
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
    const storeStatus = await this.availabilityService.getStoreStatus(tenantId, new Date(), availabilityContext);

    if (!storeStatus.isOpen) {
      throw new BadRequestException(storeStatus.message || 'A loja está fechada no momento.');
    }

    if (items.length === 0) {
      throw new BadRequestException('O pedido deve conter pelo menos 1 item.');
    }

    const validatedLines: ValidatedLine[] = [];
    const channel = options?.channel ?? 'storefront_delivery';

    for (const item of items) {
      if (item.lineType === 'product') {
        const line = await this.validateProductLine(tenantId, item, true, channel, availabilityContext);
        validatedLines.push(line);
      } else if (item.lineType === 'combo') {
        const line = await this.validateComboLine(tenantId, item, channel, availabilityContext);
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

    const total = itemsSubtotal - discountTotal;

    // 5. Calcular taxa de entrega
    const hasCoverage = await this.deliveryRateService.hasCoverageConfig(tenantId);
    const decision = hasCoverage
      ? await this.deliveryRateService.calculateDeliveryDecision({
          tenantId,
          address: options?.deliveryAddress,
          distanceKm: null,
        })
      : null;

    if (decision && !decision.canDeliver) {
      throw new BadRequestException(decision.reason || 'Não entregamos nesta região.');
    }

    const deliveryFeeCalculation = decision
      ? { fee: decision.fee }
      : await this.deliveryRateService.calculateRate({
          tenantId,
          address: options?.deliveryAddress,
          distanceKm: null,
        });

    const deliveryFee = deliveryFeeCalculation.fee;

    const finalTotal = total + deliveryFee;

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

    const total = itemsSubtotal - discountTotal;

    // Para POS, taxa de entrega é zero (venda local)
    const deliveryFee = 0;
    const finalTotal = total;

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

  private async validateProductLine(
    tenantId: string,
    item: CreateOrderItemDTO,
    checkSellableOnline: boolean = true,
    channel: 'storefront_delivery' | 'storefront_pickup' | 'pos' = 'storefront_delivery',
    context?: { settings?: any; operatingHours?: any[] },
  ): Promise<ValidatedProductLine> {
    if (!item.productId) {
      throw new BadRequestException('productId é obrigatório para linhas do tipo product.');
    }

    const hasNewSelections = Array.isArray(item.selections) && item.selections.length > 0;

    // Fetch product with legacy complement groups and/or new option groups
    const product = await (this.prisma as unknown as Record<string, { findFirst: (...args: unknown[]) => Promise<Record<string, unknown> | null> }>)['product'].findFirst({
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
    }) as Record<string, any> | null;

    if (!product) {
      throw new BadRequestException(`Produto não encontrado ou não pertence a esta loja.`);
    }

    if (hasNewSelections) {
      await this.availabilityService.assertCanSell({
        tenantId,
        productId: item.productId,
        channel,
        context,
      });
    }
    if (!(product['isActive'] as boolean)) {
      throw new BadRequestException(`O produto "${product['name']}" não está ativo.`);
    }
    if (!(product['isAvailable'] as boolean)) {
      throw new BadRequestException(`O produto "${product['name']}" não está disponível no momento.`);
    }
    if (checkSellableOnline && !(product['sellableOnline'] as boolean)) {
      throw new BadRequestException(`O produto "${product['name']}" não está disponível para venda online.`);
    }

    const basePrice = Number(product['basePrice']);

    let effectiveBasePrice = basePrice;

    // Apply Upsell Discount if applicable
    if (item.sourceUpsellId) {
      const upsell = await (this.prisma as any).upsell.findFirst({
        where: { id: item.sourceUpsellId, tenantId, isActive: true },
        include: { items: true },
      });
      if (upsell) {
        const upsellItem = (upsell.items as any[]).find((i) => i.productId === item.productId);
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
        product['optionGroupLinks'] as Array<Record<string, unknown>>,
        product['name'] as string,
        basePrice,
      );

      effectiveBasePrice = pricing.effectiveBasePrice;
      extrasTotal = pricing.extrasTotal;
      unitPrice = pricing.unitPrice;
      composition = pricing.composition;

      const category = product['category'];
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
          name: product['name'],
          type: product['type'],
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
      const complementGroups = product['complementGroups'] as Array<Record<string, unknown>>;

      validatedComplements = this.validateComplements(
        complements,
        complementGroups,
        product['name'] as string,
      );

      extrasTotal = validatedComplements.reduce((s, c) => s + c.snapshotPrice, 0);
      unitPrice = basePrice + extrasTotal;
      composition = validatedComplements.map(c => c.snapshotName).join(', ');
    }

    const lineTotal = unitPrice * item.quantity;

    return {
      lineType: 'product',
      productId: item.productId,
      name: product['name'] as string,
      image: (product['image'] as string | null) || null,
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
    optionGroupLinks: Array<Record<string, unknown>>,
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
    const groupLinkMap = new Map<string, Record<string, unknown>>();
    for (const link of optionGroupLinks) {
      const group = link['optionGroup'] as Record<string, unknown>;
      if (group && (group['isActive'] as boolean)) {
        groupLinkMap.set(group['id'] as string, link);
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
      const group = link['optionGroup'] as Record<string, unknown>;
      const selectedGroup = selections.find((s) => s.optionGroupId === groupId);
      const selectedCount = selectedGroup ? selectedGroup.items.length : 0;

      const minSelect = (link['overrideMinSelect'] as number | null | undefined) ?? (group['minSelect'] as number);
      const maxSelect = (link['overrideMaxSelect'] as number | null | undefined) ?? (group['maxSelect'] as number);
      const isRequired = (link['overrideIsRequired'] as boolean | null | undefined) ?? (group['isRequired'] as boolean);
      const groupName =
        (link['overrideName'] as string | null | undefined) ?? (group['name'] as string);

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
      const group = link['optionGroup'] as Record<string, unknown>;
      const groupName =
        (link['overrideName'] as string | null | undefined) ?? (group['name'] as string);
      const pricingAxis = (link['pricingAxis'] as 'primary' | 'secondary') || 'secondary';

      const selectionType = group['selectionType'] as string;
      const isRequired = ((link['overrideIsRequired'] as boolean | null | undefined) ?? (group['isRequired'] as boolean)) || false;
      const minSelect = Number(((link['overrideMinSelect'] as number | null | undefined) ?? (group['minSelect'] as number)) ?? 0);
      const maxSelect = Number(((link['overrideMaxSelect'] as number | null | undefined) ?? (group['maxSelect'] as number)) ?? 0);

      const groupItems = group['items'] as Array<Record<string, unknown>>;
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
        const itemRecord = groupItems.find((i) => (i['id'] as string) === chosen.optionItemId);
        if (!itemRecord) {
          throw new BadRequestException(`Opção não encontrada no grupo "${groupName}".`);
        }
        if (!(itemRecord['isActive'] as boolean)) {
          throw new BadRequestException(`A opção "${itemRecord['name']}" não está disponível.`);
        }

        const allowQuantity = (itemRecord['allowQuantity'] as boolean) || false;
        if (allowQuantity) {
          groupAllowQuantity = true;
        }
        const qty = allowQuantity ? Math.max(1, Number(chosen.qty ?? 1)) : 1;

        const impactType = itemRecord['priceImpactType'] as 'none' | 'fixed' | 'replace' | 'percentage';
        const impactValue = Number(itemRecord['priceImpactValue']);

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
          name: itemRecord['name'] as string,
          qty,
          priceImpactType: impactType,
          priceImpactValue: impactValue,
          appliedAmount,
        });

        chosenNames.push(allowQuantity && qty > 1 ? `${itemRecord['name']} x${qty}` : (itemRecord['name'] as string));
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
    productGroups: Array<Record<string, unknown>>,
    productName: string,
  ): Array<{ complementItemId: string; snapshotName: string; snapshotPrice: number }> {
    const result: Array<{ complementItemId: string; snapshotName: string; snapshotPrice: number }> = [];

    // Build lookup of groups available to this product
    const groupMap = new Map<string, Record<string, unknown>>();
    for (const link of productGroups) {
      const group = link['group'] as Record<string, unknown>;
      if (group['isActive'] as boolean) {
        groupMap.set(group['id'] as string, group);
      }
    }

    // Check each group for min/max
    for (const [groupId, group] of groupMap.entries()) {
      const selectedForGroup = selected.filter(s => s.groupId === groupId);
      const minSelect = group['minSelect'] as number;
      const maxSelect = group['maxSelect'] as number;
      const groupName = group['name'] as string;

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

      const groupItems = group['items'] as Array<Record<string, unknown>>;

      for (const sel of selectedForGroup) {
        const compItem = groupItems.find(i => (i['id'] as string) === sel.itemId);
        if (!compItem) {
          throw new BadRequestException(`Complemento não encontrado no grupo "${groupName}".`);
        }
        if (!(compItem['isActive'] as boolean)) {
          throw new BadRequestException(`O complemento "${compItem['name']}" não está disponível.`);
        }
        result.push({
          complementItemId: sel.itemId,
          snapshotName: compItem['name'] as string,
          snapshotPrice: Number(compItem['additionalPrice']),
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
    context?: { settings?: any; operatingHours?: any[] },
  ): Promise<ValidatedComboLine> {
    const hasNewSlots = Array.isArray(item.slots) && item.slots.length > 0;
    const comboProductId = item.productId || item.comboId;

    if (hasNewSlots) {
      if (!item.productId) {
        throw new BadRequestException('productId é obrigatório para combos no payload novo.');
      }

      const comboProduct = await (this.prisma as unknown as Record<string, { findFirst: (...args: unknown[]) => Promise<Record<string, unknown> | null> }>)['product'].findFirst({
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
      }) as Record<string, unknown> | null;

      if (!comboProduct) {
        throw new BadRequestException('Combo não encontrado ou não pertence a esta loja.');
      }

      await this.availabilityService.assertCanSell({
        tenantId,
        productId: item.productId,
        channel,
        context,
      });
      if (!(comboProduct['isActive'] as boolean)) {
        throw new BadRequestException(`O combo "${comboProduct['name']}" não está ativo.`);
      }

      const basePrice = Number(comboProduct['basePrice']);
      const validatedSlots = this.validateComboSlots(
        item.slots || [],
        comboProduct['comboSlots'] as Array<Record<string, unknown>>,
        comboProduct['name'] as string,
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
        name: comboProduct['name'] as string,
        image: (comboProduct['image'] as string | null) || null,
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
            name: comboProduct['name'],
            type: comboProduct['type'],
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
      const comboProduct = await (this.prisma as unknown as Record<string, { findFirst: (...args: unknown[]) => Promise<Record<string, unknown> | null> }>)['product'].findFirst({
        where: { id: comboProductId, tenantId, deletedAt: null, type: 'combo' },
        include: {
          comboBundleItems: {
            include: { product: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }) as Record<string, unknown> | null;

      if (comboProduct) {
        await this.availabilityService.assertCanSell({
          tenantId,
          productId: comboProductId,
          channel,
        });

        if (!(comboProduct['isActive'] as boolean)) {
          throw new BadRequestException(`O combo "${comboProduct['name']}" não está ativo.`);
        }

        const comboMode = (comboProduct['comboMode'] as 'bundle' | 'slot' | null) ?? 'bundle';
        if (comboMode === 'bundle') {
          const bundleItems = (comboProduct['comboBundleItems'] as Array<Record<string, unknown>>) ?? [];
          const subtotal = bundleItems.reduce((sum, bundleItem) => {
            const product = bundleItem['product'] as Record<string, unknown> | undefined;
            if (!product || !(product['isActive'] as boolean) || product['deletedAt'] != null) return sum;
            return sum + Number(product['basePrice']) * Math.max(1, Number(bundleItem['qty'] ?? 1));
          }, 0);

          const pricingType = ((comboProduct['comboPricingType'] as string | null) ?? 'fixed_price') as 'fixed_price' | 'discount_percent' | 'discount_amount';
          const pricingValue = Number(comboProduct['comboPricingValue'] ?? 0);
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
          const basePrice = Number(comboProduct['basePrice']);
          const unitPrice = finalPrice;
          const lineTotal = unitPrice * item.quantity;
          const composition = bundleItems
            .map((bundleItem) => {
              const product = bundleItem['product'] as Record<string, unknown> | undefined;
              const qty = Math.max(1, Number(bundleItem['qty'] ?? 1));
              return `${product?.['name'] ?? 'Item'} x${qty}`;
            })
            .join('; ');

          return {
            lineType: 'combo',
            comboId: comboProductId,
            name: comboProduct['name'] as string,
            image: (comboProduct['image'] as string | null) || null,
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
                name: comboProduct['name'],
                type: comboProduct['type'],
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
                const product = bundleItem['product'] as Record<string, unknown> | undefined;
                const qty = Math.max(1, Number(bundleItem['qty'] ?? 1));
                const unit = Number(product?.['basePrice'] ?? 0);
                return {
                  productId: bundleItem['productId'],
                  name: product?.['name'] ?? 'Item',
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
    const combo = await (this.prisma as unknown as Record<string, { findFirst: (...args: unknown[]) => Promise<Record<string, unknown> | null> }>)['productCombo'].findFirst({
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
    }) as Record<string, unknown> | null;

    if (!combo) {
      throw new BadRequestException('Combo não encontrado ou não pertence a esta loja.');
    }
    if (!(combo['isActive'] as boolean)) {
      throw new BadRequestException(`O combo "${combo['name']}" não está ativo.`);
    }

    const basePrice = Number(combo['basePrice']);
    const selections = item.comboSelections || [];
    const blocks = combo['blocks'] as Array<Record<string, unknown>>;

    const validatedSelections = this.validateComboBlocks(
      selections,
      blocks,
      combo['name'] as string,
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
    slots: Array<Record<string, unknown>>,
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

    const slotMap = new Map<string, Record<string, unknown>>();
    for (const slot of slots) {
      slotMap.set(slot['id'] as string, slot);
    }

    for (const sel of selected) {
      if (!slotMap.has(sel.comboSlotId)) {
        throw new BadRequestException(`Slot não reconhecido no combo "${comboName}".`);
      }
    }

    for (const [slotId, slot] of slotMap.entries()) {
      const selectedForSlot = selected.find((s) => s.comboSlotId === slotId);
      const items = selectedForSlot ? selectedForSlot.items : [];

      const minSelect = Number(slot['minSelect'] as number);
      const maxSelect = Number(slot['maxSelect'] as number);
      const isRequired = Boolean(slot['isRequired'] as boolean);
      const slotName = slot['name'] as string;

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

      const allowedItems = slot['allowedItems'] as Array<Record<string, unknown>>;

      for (const [productId, qty] of normalizedItems.entries()) {
        const allowed = allowedItems.find(
          (a) => (a['productId'] as string) === productId,
        );
        if (!allowed) {
          throw new BadRequestException(`Item não permitido no slot "${slotName}".`);
        }
        const product = allowed['product'] as Record<string, unknown>;
        if (!(product['isActive'] as boolean) || product['deletedAt'] !== null) {
          throw new BadRequestException(
            `O produto "${product['name']}" do slot "${slotName}" não está disponível.`,
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
          productName: product['name'] as string,
          qty,
          additionalPrice: Number(allowed['additionalPrice']) * qty,
        });
      }
    }

    return result;
  }

  private validateComboBlocks(
    selected: CreateOrderItemComboSelectionDTO[],
    blocks: Array<Record<string, unknown>>,
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

    const blockMap = new Map<string, Record<string, unknown>>();
    for (const block of blocks) {
      blockMap.set(block['id'] as string, block);
    }

    for (const [blockId, block] of blockMap.entries()) {
      const selectedForBlock = selected.filter(s => s.blockId === blockId);
      const minSelect = block['minSelect'] as number;
      const maxSelect = block['maxSelect'] as number;
      const blockName = block['name'] as string;

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

      const blockItems = block['items'] as Array<Record<string, unknown>>;

      for (const sel of selectedForBlock) {
        const blockItem = blockItems.find(i => (i['id'] as string) === sel.blockItemId);
        if (!blockItem) {
          throw new BadRequestException(`Item não reconhecido no bloco "${blockName}".`);
        }

        const product = blockItem['product'] as Record<string, unknown>;
        if (!(product['isActive'] as boolean) || product['deletedAt'] !== null) {
          throw new BadRequestException(`O produto "${product['name']}" do bloco "${blockName}" não está disponível.`);
        }

        result.push({
          comboBlockItemId: sel.blockItemId,
          snapshotBlockName: blockName,
          snapshotProductName: product['name'] as string,
          snapshotAdditionalPrice: Number(blockItem['additionalPrice']),
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
}
