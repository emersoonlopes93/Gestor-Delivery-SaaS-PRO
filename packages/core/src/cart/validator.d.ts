import { StorefrontProductPayload, StorefrontComboPayload, CartSelectedComplement, CartSelectedComboItem } from '@gestor/types';
export declare class CartValidator {
    static validateProductComplements(product: StorefrontProductPayload, selectedOptions: CartSelectedComplement[]): void;
    static validateComboItems(combo: StorefrontComboPayload, selectedItems: CartSelectedComboItem[]): void;
}
