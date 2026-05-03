import { StorefrontProductPayload, StorefrontComboPayload, CartSelectedComplement, CartSelectedComboItem } from '@gestor/types';
export declare class CartValidator {
    /**
     * Validates if a cart line complement configuration is valid for a given product.
     * Throws an error with a user-friendly message if invalid.
     */
    static validateProductComplements(product: StorefrontProductPayload, selectedOptions: CartSelectedComplement[]): void;
    /**
     * Validates if a cart line combo configuration is valid for a given combo.
     */
    static validateComboItems(combo: StorefrontComboPayload, selectedItems: CartSelectedComboItem[]): void;
}
//# sourceMappingURL=validator.d.ts.map