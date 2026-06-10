import { Injectable } from '@nestjs/common';
import { FractionalPricingRule } from '@gestor/types';

export interface FractionalItem {
  id: string;
  name?: string;
  price: number;
  fraction: number; // e.g. 0.5 for 1/2
}

export interface FractionalPricingResult {
  ruleApplied: FractionalPricingRule;
  calculatedPrice: number;
  calculationDetails: string;
}

@Injectable()
export class FractionalPricingEngine {
  /**
   * Calculates the final price of a fractional product based on the applied rule.
   * @param items Array of chosen items with their individual prices and fractions.
   * @param rule The FractionalPricingRule to apply.
   * @param fixedPrice Optional fixed price used only if rule is FIXED_PRICE.
   */
  public calculate(
    items: FractionalItem[],
    rule: FractionalPricingRule,
    fixedPrice?: number,
  ): FractionalPricingResult {
    if (!items || items.length === 0) {
      return {
        ruleApplied: rule,
        calculatedPrice: 0,
        calculationDetails: 'No items provided',
      };
    }

    // Ensure total fraction is roughly 1 (100%)
    const _totalFraction = items.reduce((sum, item) => sum + item.fraction, 0);
    // Note: We might want to allow > 1 in some edge cases, but mathematically this engine
    // operates best when resolving a single unified product price. 
    // We will just process the math regardless of the sum to stay pure.

    let finalPrice = 0;
    let details = '';
    const prices = items.map((i) => i.price);

    switch (rule) {
      case FractionalPricingRule.HIGHEST_PRICE: {
        finalPrice = Math.max(...prices);
        details = `Math.max(${prices.join(', ')})`;
        break;
      }

      case FractionalPricingRule.AVERAGE_PRICE: {
        const sum = prices.reduce((a, b) => a + b, 0);
        finalPrice = sum / prices.length;
        details = `(${prices.join(' + ')}) / ${prices.length}`;
        break;
      }

      case FractionalPricingRule.PROPORTIONAL: {
        finalPrice = items.reduce((acc, item) => acc + item.price * item.fraction, 0);
        details = items.map((i) => `(${i.price} * ${i.fraction})`).join(' + ');
        break;
      }

      case FractionalPricingRule.BASE_PLUS_DIFFERENCE: {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const difference = maxPrice - minPrice;
        finalPrice = minPrice + difference;
        details = `Min(${minPrice}) + Diff(${difference})`;
        break;
      }

      case FractionalPricingRule.FIXED_PRICE: {
        finalPrice = fixedPrice || 0;
        details = `FixedPrice(${finalPrice})`;
        break;
      }

      default: {
        // Fallback to highest
        finalPrice = Math.max(...prices);
        details = `Fallback Max(${prices.join(', ')})`;
        break;
      }
    }

    return {
      ruleApplied: rule,
      calculatedPrice: Number(finalPrice.toFixed(2)),
      calculationDetails: details,
    };
  }
}
