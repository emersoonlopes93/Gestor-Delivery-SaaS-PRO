import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateOrderItemDTO,
  CreateOrderItemComplementDTO,
  CreateOrderItemComboSelectionDTO,
  CreateOrderItemSelectionGroupDTO,
  CreateOrderItemComboSlotSelectionDTO,
  DeliveryAddressDTO,
} from '@gestor/types';
import { CouponsService } from '../promotions/coupons.service';
import { CashbackService } from '../promotions/cashback.service';
import { DeliveryRateService } from '../delivery/delivery-rate.service';

interface ValidatedProductLine {
  lineType: 'product';
  productId: string;
  name: string;
  image: string | null;
  basePrice: number;
  extrasTotal: number;
  unitPrice: number;
  lineTotal: number;
  quantity: number;
  notes?: string;
  composition: string;
  complements: Array<{
    complementItemId: string;
    snapshotName: string;
    snapshotPrice: number;
  }>;
}

interface ValidatedComboLine {
  lineType: 'combo';
  comboId: string;
  name: string;
  image: string | null;
  basePrice: number;
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
  ) {}

  async validate(
    slug: string,
    items: CreateOrderItemDTO[],
    options?: { 
      customerId?: string | null; 
      couponCode?: string; 
      useCashbackAmount?: number;
      deliveryAddress?: DeliveryAddressDTO | null;
    },
  ): Promise<CheckoutValidationResult> {
    // 1. Resolve tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant || tenant.status !== 'active') {
      throw new NotFoundException('Loja não encontrada ou inativa.');
    }

    if (items.length === 0) {
      throw new BadRequestException('O pedido deve conter pelo menos 1 item.');
    }

    const tenantId = tenant.id;
    const validatedLines: ValidatedLine[] = [];

    for (const item of items) {
      if (item.lineType === 'product') {
        const line = await this.validateProductLine(tenantId, item, true);
        validatedLines.push(line);
      } else if (item.lineType === 'combo') {
        const line = await this.validateComboLine(tenantId, item);
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
        const line = await this.validateProductLine(tenantId, item, false);
        validatedLines.push(line);
      } else if (item.lineType === 'combo') {
        const line = await this.validateComboLine(tenantId, item);
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
      },
    }) as Record<string, unknown> | null;

    if (!product) {
      throw new BadRequestException(`Produto não encontrado ou não pertence a esta loja.`);
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

    let extrasTotal = 0;
    let unitPrice = 0;
    let composition = '';
    let validatedComplements: Array<{ complementItemId: string; snapshotName: string; snapshotPrice: number }> = [];

    if (hasNewSelections) {
      const pricing = this.validateAndPriceOptionSelections(
        item.selections || [],
        product['optionGroupLinks'] as Array<Record<string, unknown>>,
        product['name'] as string,
        basePrice,
      );

      extrasTotal = pricing.extrasTotal;
      unitPrice = pricing.unitPrice;
      composition = pricing.composition;
      // Snapshot compatibility: keep complements empty until a dedicated snapshot table exists.
      validatedComplements = [];
    } else {
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
      extrasTotal,
      unitPrice,
      lineTotal,
      quantity: item.quantity,
      notes: item.notes,
      composition,
      complements: validatedComplements,
    };
  }

  private validateAndPriceOptionSelections(
    selections: CreateOrderItemSelectionGroupDTO[],
    optionGroupLinks: Array<Record<string, unknown>>,
    productName: string,
    basePrice: number,
  ): { unitPrice: number; extrasTotal: number; composition: string } {
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

    for (const selGroup of selections) {
      const link = groupLinkMap.get(selGroup.optionGroupId);
      if (!link) continue;
      const group = link['optionGroup'] as Record<string, unknown>;
      const groupName =
        (link['overrideName'] as string | null | undefined) ?? (group['name'] as string);
      const pricingAxis = (link['pricingAxis'] as 'primary' | 'secondary') || 'secondary';

      const groupItems = group['items'] as Array<Record<string, unknown>>;
      const chosenNames: string[] = [];

      for (const chosen of selGroup.items) {
        const itemRecord = groupItems.find((i) => (i['id'] as string) === chosen.optionItemId);
        if (!itemRecord) {
          throw new BadRequestException(`Opção não encontrada no grupo "${groupName}".`);
        }
        if (!(itemRecord['isActive'] as boolean)) {
          throw new BadRequestException(`A opção "${itemRecord['name']}" não está disponível.`);
        }

        const allowQuantity = !!itemRecord['allowQuantity'];
        const qty = allowQuantity ? Math.max(1, Number(chosen.qty ?? 1)) : 1;

        const impactType = itemRecord['priceImpactType'] as 'none' | 'fixed' | 'replace' | 'percentage';
        const impactValue = Number(itemRecord['priceImpactValue']);

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
        } else if (impactType === 'fixed') {
          fixedTotal += impactValue * qty;
        } else if (impactType === 'percentage') {
          percentageTotal += effectiveBasePrice * (impactValue / 100) * qty;
        }

        chosenNames.push(allowQuantity && qty > 1 ? `${itemRecord['name']} x${qty}` : (itemRecord['name'] as string));
      }

      if (chosenNames.length > 0) {
        compositionParts.push(`${groupName}: ${chosenNames.join(', ')}`);
      }
    }

    const unitPrice = effectiveBasePrice + fixedTotal + percentageTotal;
    const extrasTotal = unitPrice - basePrice;
    const composition = compositionParts.join('; ');
    return { unitPrice, extrasTotal, composition };
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
  ): Promise<ValidatedComboLine> {
    const hasNewSlots = Array.isArray(item.slots) && item.slots.length > 0;

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
      if (!(comboProduct['isActive'] as boolean)) {
        throw new BadRequestException(`O combo "${comboProduct['name']}" não está ativo.`);
      }

      const basePrice = Number(comboProduct['basePrice']);
      const validatedSelections = this.validateComboSlots(
        item.slots || [],
        comboProduct['comboSlots'] as Array<Record<string, unknown>>,
        comboProduct['name'] as string,
      );

      const extrasTotal = validatedSelections.reduce((s, c) => s + c.snapshotAdditionalPrice, 0);
      const unitPrice = basePrice + extrasTotal;
      const lineTotal = unitPrice * item.quantity;
      const composition = validatedSelections
        .map((s) => `${s.snapshotBlockName}: ${s.snapshotProductName}`)
        .join('; ');

      return {
        lineType: 'combo',
        comboId: item.productId,
        name: comboProduct['name'] as string,
        image: (comboProduct['image'] as string | null) || null,
        basePrice,
        extrasTotal,
        unitPrice,
        lineTotal,
        quantity: item.quantity,
        notes: item.notes,
        composition,
        comboSelections: [],
      };
    }

    if (!item.comboId) {
      throw new BadRequestException('comboId é obrigatório para linhas do tipo combo.');
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
      extrasTotal,
      unitPrice,
      lineTotal,
      quantity: item.quantity,
      notes: item.notes,
      composition,
      comboSelections: validatedSelections,
    };
  }

  private validateComboSlots(
    selected: CreateOrderItemComboSlotSelectionDTO[],
    slots: Array<Record<string, unknown>>,
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
      const minSelect = slot['minSelect'] as number;
      const maxSelect = slot['maxSelect'] as number;
      const isRequired = slot['isRequired'] as boolean;
      const slotName = slot['name'] as string;

      const effectiveMin = isRequired ? Math.max(1, minSelect) : minSelect;

      if (items.length < effectiveMin) {
        throw new BadRequestException(
          `Selecione pelo menos ${effectiveMin} itens em "${slotName}" no combo "${comboName}".`,
        );
      }
      if (items.length > maxSelect) {
        throw new BadRequestException(
          `Máximo de ${maxSelect} itens em "${slotName}" no combo "${comboName}".`,
        );
      }

      const allowedItems = slot['allowedItems'] as Array<Record<string, unknown>>;

      for (const chosen of items) {
        const allowed = allowedItems.find(
          (a) => (a['productId'] as string) === chosen.productId,
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
        result.push({
          comboBlockItemId: allowed['id'] as string,
          snapshotBlockName: slotName,
          snapshotProductName: product['name'] as string,
          snapshotAdditionalPrice: Number(allowed['additionalPrice']),
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
}
