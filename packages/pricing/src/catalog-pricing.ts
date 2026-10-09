/**
 * Pure, cross-runtime pricing contract for generic catalog option groups.
 * All money is represented in integer cents and percentages in basis points.
 */
export type OptionGroupSelectionType = 'single' | 'multiple' | 'quantity';
export type PricingAxis = 'primary' | 'secondary';
export type PriceImpactType = 'none' | 'fixed' | 'replace' | 'percentage';

export interface CatalogOptionItem {
  id: string;
  isActive: boolean;
  effectiveIsActive?: boolean;
  allowQuantity: boolean;
  minQty?: number;
  maxQty?: number;
  priceImpactType: PriceImpactType;
  /** Integer cents for fixed and replace impacts. */
  priceImpactValueCents?: number;
  /** Basis points for percentage impacts (10% = 1000). */
  priceImpactBasisPoints?: number;
  /** Product-level override in cents; it never changes priceImpactType. */
  effectivePriceImpactValueCents?: number;
  /** Product-level percentage override in basis points; it never changes priceImpactType. */
  effectivePriceImpactBasisPoints?: number;
}

export interface CatalogOptionGroup {
  id: string;
  selectionType: OptionGroupSelectionType;
  pricingAxis: PricingAxis;
  isActive?: boolean;
  isRequired?: boolean;
  minSelect?: number;
  maxSelect?: number;
  items: CatalogOptionItem[];
}

export interface CatalogSelectedItem {
  optionItemId: string;
  qty: number;
}

export interface CatalogOptionSelection {
  optionGroupId: string;
  items: CatalogSelectedItem[];
}

export interface CatalogOptionPricingInput {
  basePriceCents: number;
  /** A promotion/upsell adjustment already resolved by its own domain rule. */
  upsellDeltaCents?: number;
  optionGroups: CatalogOptionGroup[];
  selections?: CatalogOptionSelection[];
}

export interface CatalogPricingBreakdownItem {
  optionGroupId: string;
  optionItemId: string;
  qty: number;
  priceImpactType: Exclude<PriceImpactType, 'none'>;
  effectiveValue: number;
  totalCents: number;
}

export interface CatalogPricingBreakdown {
  replacements: CatalogPricingBreakdownItem[];
  fixed: CatalogPricingBreakdownItem[];
  percentages: CatalogPricingBreakdownItem[];
}

export interface CatalogPricingResult {
  startingPriceCents: number | null;
  basePriceCents: number;
  upsellAdjustedBasePriceCents: number;
  effectiveBasePriceCents: number;
  upsellDeltaCents: number;
  replacementDeltaCents: number;
  fixedTotalCents: number;
  percentageTotalCents: number;
  adjustmentsTotalCents: number;
  unitPriceCents: number;
  breakdown: CatalogPricingBreakdown;
}

export class CatalogPricingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogPricingValidationError';
  }
}

interface ResolvedSelection {
  group: CatalogOptionGroup;
  item: CatalogOptionItem;
  qty: number;
}

interface ReplaceCandidate {
  groupId: string;
  itemId: string;
}

function invalid(message: string): never {
  throw new CatalogPricingValidationError(message);
}

function assertInteger(value: number, name: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    invalid(`${name} must be a safe integer greater than or equal to ${minimum}.`);
  }
}

function isEligibleGroup(group: CatalogOptionGroup): boolean {
  return group.isActive !== false;
}

function isEligibleItem(item: CatalogOptionItem): boolean {
  return item.isActive && item.effectiveIsActive !== false;
}

function effectiveMinSelect(group: CatalogOptionGroup): number {
  const configured = group.minSelect ?? 0;
  assertInteger(configured, `Group ${group.id} minSelect`);
  return Math.max(group.isRequired ? 1 : 0, configured);
}

function effectiveMaxSelect(group: CatalogOptionGroup): number {
  const fallback = group.selectionType === 'single' ? 1 : group.items.length;
  const configured = group.maxSelect ?? fallback;
  assertInteger(configured, `Group ${group.id} maxSelect`);
  return configured;
}

function validateGroupConfiguration(group: CatalogOptionGroup): void {
  const min = effectiveMinSelect(group);
  const max = effectiveMaxSelect(group);
  if (group.selectionType === 'single' && (min > 1 || max > 1)) {
    invalid(`Single group ${group.id} must have minSelect and maxSelect at most 1.`);
  }
  if (min > max) invalid(`Group ${group.id} minSelect cannot exceed maxSelect.`);

  const itemIds = new Set<string>();
  for (const item of group.items) {
    if (itemIds.has(item.id)) invalid(`Group ${group.id} contains duplicate item ${item.id}.`);
    itemIds.add(item.id);
    if (isEligibleItem(item)) validateItemConfiguration(group, item);
  }
}

function validateItemConfiguration(group: CatalogOptionGroup, item: CatalogOptionItem): void {
  const minQty = item.minQty ?? 1;
  const maxQty = item.maxQty ?? Number.MAX_SAFE_INTEGER;
  assertInteger(minQty, `Item ${item.id} minQty`, 1);
  assertInteger(maxQty, `Item ${item.id} maxQty`, 1);
  if (minQty > maxQty) invalid(`Item ${item.id} minQty cannot exceed maxQty.`);
  if (item.priceImpactType === 'replace' && group.pricingAxis !== 'primary') {
    invalid(`Replace item ${item.id} must belong to a primary group.`);
  }
  if (item.priceImpactType === 'fixed' || item.priceImpactType === 'replace') {
    assertInteger(effectiveCents(item), `Item ${item.id} effective price impact`);
  }
  if (item.priceImpactType === 'percentage') {
    assertInteger(effectiveBasisPoints(item), `Item ${item.id} effective percentage basis points`);
  }
}

function effectiveCents(item: CatalogOptionItem): number {
  return item.effectivePriceImpactValueCents ?? item.priceImpactValueCents ?? 0;
}

function effectiveBasisPoints(item: CatalogOptionItem): number {
  return item.effectivePriceImpactBasisPoints ?? item.priceImpactBasisPoints ?? 0;
}

function roundHalfUp(numerator: number, divisor: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(divisor) || divisor <= 0) {
    invalid('Percentage calculation exceeds safe integer precision.');
  }
  return Math.floor((numerator + Math.floor(divisor / 2)) / divisor);
}

function itemTotalCents(item: CatalogOptionItem, qty: number, effectiveBasePriceCents: number): number {
  if (item.priceImpactType === 'fixed') return effectiveCents(item) * qty;
  if (item.priceImpactType === 'percentage') {
    return roundHalfUp(effectiveBasePriceCents * effectiveBasisPoints(item), 10_000) * qty;
  }
  return 0;
}

function validateInputConfiguration(input: CatalogOptionPricingInput): void {
  assertInteger(input.basePriceCents, 'basePriceCents');
  assertInteger(input.upsellDeltaCents ?? 0, 'upsellDeltaCents', Number.MIN_SAFE_INTEGER);
  if (input.basePriceCents + (input.upsellDeltaCents ?? 0) < 0) {
    invalid('upsellDeltaCents cannot make the base price negative.');
  }

  const groupIds = new Set<string>();
  for (const group of input.optionGroups) {
    if (groupIds.has(group.id)) invalid(`Duplicate option group ${group.id}.`);
    groupIds.add(group.id);
    if (isEligibleGroup(group)) validateGroupConfiguration(group);
  }
}

function resolveSelections(input: CatalogOptionPricingInput): ResolvedSelection[] {
  const groupsById = new Map(input.optionGroups.map((group) => [group.id, group]));
  const selectionsByGroup = new Map<string, CatalogOptionSelection>();
  for (const selection of input.selections ?? []) {
    if (selectionsByGroup.has(selection.optionGroupId)) {
      invalid(`Duplicate selection for option group ${selection.optionGroupId}.`);
    }
    selectionsByGroup.set(selection.optionGroupId, selection);
  }

  const resolved: ResolvedSelection[] = [];
  for (const [groupId, selection] of selectionsByGroup) {
    const group = groupsById.get(groupId);
    if (!group || !isEligibleGroup(group)) invalid(`Selection references unavailable group ${groupId}.`);
    const itemIds = new Set<string>();
    if (selection.items.length === 0) invalid(`Selection for group ${groupId} cannot be empty.`);
    for (const selected of selection.items) {
      if (itemIds.has(selected.optionItemId)) invalid(`Duplicate item ${selected.optionItemId} in group ${groupId}.`);
      itemIds.add(selected.optionItemId);
      assertInteger(selected.qty, `Quantity for item ${selected.optionItemId}`, 1);
      const item = group.items.find((candidate) => candidate.id === selected.optionItemId);
      if (!item || !isEligibleItem(item)) invalid(`Selection references unavailable item ${selected.optionItemId}.`);
      validateSelectedItem(group, item, selected.qty);
      resolved.push({ group, item, qty: selected.qty });
    }
  }

  for (const group of input.optionGroups.filter(isEligibleGroup)) {
    const groupSelections = resolved.filter((selection) => selection.group.id === group.id);
    const count = groupSelections.length;
    const min = effectiveMinSelect(group);
    const max = effectiveMaxSelect(group);
    if (count < min || count > max) {
      invalid(`Group ${group.id} requires between ${min} and ${max} distinct selections.`);
    }
  }
  return resolved;
}

function validateSelectedItem(group: CatalogOptionGroup, item: CatalogOptionItem, qty: number): void {
  const minQty = item.minQty ?? 1;
  const maxQty = item.maxQty ?? Number.MAX_SAFE_INTEGER;
  if (qty < minQty || qty > maxQty) invalid(`Quantity for item ${item.id} is outside its allowed range.`);
  if (group.selectionType === 'single' && qty !== 1) invalid(`Single group ${group.id} only accepts quantity 1.`);
  if (group.selectionType === 'multiple' && qty !== 1) invalid(`Multiple group ${group.id} only accepts quantity 1.`);
  if (qty > 1 && (group.selectionType !== 'quantity' || !item.allowQuantity)) {
    invalid(`Item ${item.id} does not allow a quantity greater than 1 in this group.`);
  }
  if (item.priceImpactType === 'replace' && qty !== 1) invalid(`Replace item ${item.id} must have quantity 1.`);
}

function resolveWithoutStartingPrice(input: CatalogOptionPricingInput): Omit<CatalogPricingResult, 'startingPriceCents'> {
  validateInputConfiguration(input);
  const selections = resolveSelections(input);
  const upsellDeltaCents = input.upsellDeltaCents ?? 0;
  const upsellAdjustedBasePriceCents = input.basePriceCents + upsellDeltaCents;
  const replacements = selections.filter(({ item }) => item.priceImpactType === 'replace');
  if (replacements.length > 1) invalid('Only one replace item can be selected.');

  const replace = replacements[0];
  const effectiveBasePriceCents = replace ? effectiveCents(replace.item) : upsellAdjustedBasePriceCents;
  const replacementDeltaCents = effectiveBasePriceCents - upsellAdjustedBasePriceCents;
  const breakdown: CatalogPricingBreakdown = { replacements: [], fixed: [], percentages: [] };
  if (replace) {
    breakdown.replacements.push({
      optionGroupId: replace.group.id,
      optionItemId: replace.item.id,
      qty: replace.qty,
      priceImpactType: 'replace',
      effectiveValue: effectiveBasePriceCents,
      totalCents: replacementDeltaCents,
    });
  }

  let fixedTotalCents = 0;
  let percentageTotalCents = 0;
  for (const selection of selections) {
    if (selection.item.priceImpactType === 'fixed') {
      const totalCents = itemTotalCents(selection.item, selection.qty, effectiveBasePriceCents);
      fixedTotalCents += totalCents;
      breakdown.fixed.push({
        optionGroupId: selection.group.id,
        optionItemId: selection.item.id,
        qty: selection.qty,
        priceImpactType: 'fixed',
        effectiveValue: effectiveCents(selection.item),
        totalCents,
      });
    }
    if (selection.item.priceImpactType === 'percentage') {
      const totalCents = itemTotalCents(selection.item, selection.qty, effectiveBasePriceCents);
      percentageTotalCents += totalCents;
      breakdown.percentages.push({
        optionGroupId: selection.group.id,
        optionItemId: selection.item.id,
        qty: selection.qty,
        priceImpactType: 'percentage',
        effectiveValue: effectiveBasisPoints(selection.item),
        totalCents,
      });
    }
  }
  const adjustmentsTotalCents = fixedTotalCents + percentageTotalCents;
  const unitPriceCents = effectiveBasePriceCents + adjustmentsTotalCents;
  assertInteger(unitPriceCents, 'unitPriceCents');
  return {
    basePriceCents: input.basePriceCents,
    upsellAdjustedBasePriceCents,
    effectiveBasePriceCents,
    upsellDeltaCents,
    replacementDeltaCents,
    fixedTotalCents,
    percentageTotalCents,
    adjustmentsTotalCents,
    unitPriceCents,
    breakdown,
  };
}

function minimumItemQuantity(item: CatalogOptionItem): number {
  return item.minQty ?? 1;
}

function buildMinimumSelections(input: CatalogOptionPricingInput, candidate?: ReplaceCandidate): CatalogOptionSelection[] {
  const candidateGroup = candidate ? input.optionGroups.find((group) => group.id === candidate.groupId) : undefined;
  const candidateItem = candidateGroup?.items.find((item) => item.id === candidate?.itemId);
  if (candidate && (!candidateGroup || !candidateItem || !isEligibleGroup(candidateGroup) || !isEligibleItem(candidateItem))) {
    invalid('Starting price candidate is unavailable.');
  }
  const candidateBasePriceCents = candidateItem
    ? effectiveCents(candidateItem)
    : input.basePriceCents + (input.upsellDeltaCents ?? 0);
  const selections: CatalogOptionSelection[] = [];

  for (const group of input.optionGroups.filter(isEligibleGroup)) {
    const min = effectiveMinSelect(group);
    const max = effectiveMaxSelect(group);
    const isCandidateGroup = candidate?.groupId === group.id;
    const chosen: CatalogSelectedItem[] = isCandidateGroup && candidate
      ? [{ optionItemId: candidate.itemId, qty: 1 }]
      : [];
    const needed = min - chosen.length;
    if (needed < 0 || chosen.length > max) invalid(`Group ${group.id} cannot include the replace candidate.`);
    if (needed === 0 && chosen.length === 0) continue;

    const alternatives = group.items
      .filter((item) => isEligibleItem(item) && item.priceImpactType !== 'replace' && item.id !== candidate?.itemId)
      .map((item) => ({
        item,
        qty: minimumItemQuantity(item),
        totalCents: itemTotalCents(item, minimumItemQuantity(item), candidateBasePriceCents),
      }))
      .filter(({ item, qty }) => {
        try {
          validateSelectedItem(group, item, qty);
          return true;
        } catch (error: unknown) {
          if (error instanceof CatalogPricingValidationError) return false;
          throw error;
        }
      })
      .sort((left, right) => left.totalCents - right.totalCents || left.item.id.localeCompare(right.item.id));
    if (alternatives.length < needed) invalid(`Group ${group.id} has no valid minimum configuration.`);
    for (const alternative of alternatives.slice(0, needed)) {
      chosen.push({ optionItemId: alternative.item.id, qty: alternative.qty });
    }
    if (chosen.length > 0) selections.push({ optionGroupId: group.id, items: chosen });
  }
  return selections;
}

/** Returns the lowest valid purchasable configuration, or null when none exists. */
export function getCatalogStartingPrice(input: CatalogOptionPricingInput): number | null {
  validateInputConfiguration(input);
  const candidates: Array<ReplaceCandidate | undefined> = [undefined];
  for (const group of input.optionGroups.filter(isEligibleGroup)) {
    if (group.pricingAxis !== 'primary') continue;
    for (const item of group.items.filter(isEligibleItem)) {
      if (item.priceImpactType === 'replace') candidates.push({ groupId: group.id, itemId: item.id });
    }
  }

  let startingPriceCents: number | null = null;
  for (const candidate of candidates) {
    try {
      const selections = buildMinimumSelections(input, candidate);
      const result = resolveWithoutStartingPrice({ ...input, selections });
      if (startingPriceCents === null || result.unitPriceCents < startingPriceCents) {
        startingPriceCents = result.unitPriceCents;
      }
    } catch (error: unknown) {
      if (!(error instanceof CatalogPricingValidationError)) throw error;
    }
  }
  return startingPriceCents;
}

export function resolveCatalogOptionPricing(input: CatalogOptionPricingInput): CatalogPricingResult {
  const result = resolveWithoutStartingPrice(input);
  return { ...result, startingPriceCents: getCatalogStartingPrice(input) };
}
