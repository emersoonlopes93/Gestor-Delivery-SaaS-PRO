"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartValidator = void 0;
class CartValidator {
    static validateProductComplements(product, selectedOptions) {
        if (!product.isAvailable) {
            throw new Error(`O produto ${product.name} não está disponível no momento.`);
        }
        const { complements } = product;
        for (const group of complements) {
            const selectedForGroup = selectedOptions.filter(o => o.groupId === group.id);
            const count = selectedForGroup.length;
            if (count < group.minSelect) {
                throw new Error(`Selecione pelo menos ${group.minSelect} opções em "${group.name}".`);
            }
            if (count > group.maxSelect) {
                throw new Error(`Você pode selecionar no máximo ${group.maxSelect} opções em "${group.name}".`);
            }
            for (const sel of selectedForGroup) {
                const item = group.items.find((i) => i.id === sel.itemId);
                if (!item) {
                    throw new Error(`Opção inválida ou não encontrada no grupo "${group.name}".`);
                }
                if (!item.isAvailable) {
                    throw new Error(`A opção "${item.name}" não está disponível no momento.`);
                }
            }
        }
        for (const opt of selectedOptions) {
            const groupExists = complements.find((g) => g.id === opt.groupId);
            if (!groupExists) {
                throw new Error(`Grupo adicional não reconhecido neste produto.`);
            }
        }
    }
    static validateComboItems(combo, selectedItems) {
        if (!combo.isAvailable) {
            throw new Error(`O combo ${combo.name} não está disponível no momento.`);
        }
        if ((combo.comboMode ?? 'bundle') === 'bundle') {
            return;
        }
        const blocks = combo.blocks ?? [];
        for (const block of blocks) {
            const selectedForBlock = selectedItems.filter(i => i.blockId === block.id);
            const count = selectedForBlock.length;
            if (count < block.minSelect) {
                throw new Error(`Selecione pelo menos ${block.minSelect} itens em "${block.name}".`);
            }
            if (count > block.maxSelect) {
                throw new Error(`Você pode selecionar no máximo ${block.maxSelect} itens em "${block.name}".`);
            }
            for (const sel of selectedForBlock) {
                const item = block.items.find((i) => i.id === sel.blockItemId);
                if (!item) {
                    throw new Error(`O item selecionado não faz parte do bloco "${block.name}".`);
                }
            }
        }
        for (const item of selectedItems) {
            const blockExists = blocks.find((b) => b.id === item.blockId);
            if (!blockExists) {
                throw new Error(`Bloco do combo não reconhecido.`);
            }
        }
    }
}
exports.CartValidator = CartValidator;
//# sourceMappingURL=validator.js.map