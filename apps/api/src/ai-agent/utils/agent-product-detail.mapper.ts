import type {
  StorefrontComboPayload,
  StorefrontProductPayload,
} from '@gestor/types';

export interface AgentProductOption {
  id: string;
  name: string;
  additionalPrice: number;
}

export interface AgentProductOptionGroup {
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: AgentProductOption[];
}

export interface AgentProductDetailResult {
  type: 'product';
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  isAvailable: boolean;
  category: string | null;
  optionGroups: AgentProductOptionGroup[];
}

export interface AgentComboBlockItem {
  productId: string;
  name: string;
  additionalPrice: number;
}

export interface AgentComboBlock {
  name: string;
  minSelect: number;
  maxSelect: number;
  items: AgentComboBlockItem[];
}

export interface AgentComboDetailResult {
  type: 'combo';
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  isAvailable: boolean;
  comboMode?: string;
  blocks: AgentComboBlock[];
  bundleItems?: Array<{
    productId: string;
    name: string;
    qty: number;
    unitPrice: number;
  }>;
}

export function mapStorefrontProductToAgentDetail(
  product: StorefrontProductPayload,
  categoryName: string | null,
): AgentProductDetailResult {
  const optionGroups: AgentProductOptionGroup[] = [];

  for (const complement of product.complements) {
    const activeItems = complement.items.filter((item) => item.isAvailable);
    optionGroups.push({
      name: complement.name,
      required: complement.isRequired,
      minSelect: complement.minSelect,
      maxSelect: complement.maxSelect,
      options: activeItems.map((item) => ({
        id: item.id,
        name: item.name,
        additionalPrice: item.additionalPrice,
      })),
    });
  }

  for (const link of product.optionGroupLinks) {
    const group = link.optionGroup;
    if (!group.isActive) {
      continue;
    }
    const activeItems = group.items.filter((item) => item.isActive);
    optionGroups.push({
      name: link.overrideName ?? group.name,
      required: link.overrideIsRequired ?? group.isRequired,
      minSelect: link.overrideMinSelect ?? group.minSelect,
      maxSelect: link.overrideMaxSelect ?? group.maxSelect,
      options: activeItems.map((item) => ({
        id: item.id,
        name: item.name,
        additionalPrice:
          item.priceImpactType === 'fixed' || item.priceImpactType === 'replace'
            ? item.priceImpactValue
            : 0,
      })),
    });
  }

  return {
    type: 'product',
    id: product.id,
    name: product.name,
    description: product.longDescription ?? product.shortDescription ?? null,
    basePrice: product.basePrice,
    isAvailable: product.isAvailable,
    category: categoryName,
    optionGroups,
  };
}

export function mapStorefrontComboToAgentDetail(
  combo: StorefrontComboPayload,
): AgentComboDetailResult {
  const blocks: AgentComboBlock[] = (combo.blocks ?? []).map((block) => ({
    name: block.name,
    minSelect: block.minSelect,
    maxSelect: block.maxSelect,
    items: block.items.map((item) => ({
      productId: item.productId,
      name: item.productName,
      additionalPrice: item.additionalPrice,
    })),
  }));

  return {
    type: 'combo',
    id: combo.id,
    name: combo.name,
    description: combo.description ?? null,
    basePrice: combo.basePrice,
    isAvailable: combo.isAvailable,
    comboMode: combo.comboMode,
    blocks,
    bundleItems: combo.bundleItems?.map((item) => ({
      productId: item.productId,
      name: item.productName,
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
  };
}
