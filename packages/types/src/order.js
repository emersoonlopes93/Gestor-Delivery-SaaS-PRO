// ============================================================
// ORDER DOMAIN TYPES — Phase 4
// ============================================================
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from './enums';
export class PaymentInput {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], PaymentInput.prototype, "method", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Object)
], PaymentInput.prototype, "changeFor", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], PaymentInput.prototype, "cardToken", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], PaymentInput.prototype, "paymentMethodId", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], PaymentInput.prototype, "issuerId", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], PaymentInput.prototype, "installments", void 0);
// --- Valid status transitions ---
export const ORDER_STATUS_TRANSITIONS = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready_for_pickup', 'ready_for_delivery', 'cancelled'],
    ready_for_pickup: ['completed'],
    ready_for_delivery: ['out_for_delivery'],
    out_for_delivery: ['completed'],
    completed: [],
    cancelled: [],
    draft: ['confirmed', 'cancelled'],
};
// --- DTOs de Entrada (Checkout) ---
export class DeliveryAddressDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "street", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "number", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "complement", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "neighborhood", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "city", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "state", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "zipCode", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "reference", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], DeliveryAddressDTO.prototype, "lat", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], DeliveryAddressDTO.prototype, "lng", void 0);
export class CreateOrderItemComplementDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderItemComplementDTO.prototype, "groupId", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderItemComplementDTO.prototype, "itemId", void 0);
export class CreateOrderItemComboSelectionDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderItemComboSelectionDTO.prototype, "blockId", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderItemComboSelectionDTO.prototype, "blockItemId", void 0);
export class CreateOrderItemSelectionItemDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderItemSelectionItemDTO.prototype, "optionItemId", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], CreateOrderItemSelectionItemDTO.prototype, "qty", void 0);
export class CreateOrderItemSelectionGroupDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderItemSelectionGroupDTO.prototype, "optionGroupId", void 0);
__decorate([
    IsArray(),
    IsNotEmpty(),
    ValidateNested({ each: true }),
    Type(() => CreateOrderItemSelectionItemDTO),
    __metadata("design:type", Array)
], CreateOrderItemSelectionGroupDTO.prototype, "items", void 0);
export class CreateOrderItemComboSlotSelectionItemDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderItemComboSlotSelectionItemDTO.prototype, "productId", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], CreateOrderItemComboSlotSelectionItemDTO.prototype, "qty", void 0);
export class CreateOrderItemComboSlotSelectionDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderItemComboSlotSelectionDTO.prototype, "comboSlotId", void 0);
__decorate([
    IsArray(),
    IsNotEmpty(),
    ValidateNested({ each: true }),
    Type(() => CreateOrderItemComboSlotSelectionItemDTO),
    __metadata("design:type", Array)
], CreateOrderItemComboSlotSelectionDTO.prototype, "items", void 0);
export class PizzaCompositionFlavorDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], PizzaCompositionFlavorDTO.prototype, "productId", void 0);
__decorate([
    IsNumber(),
    IsNotEmpty(),
    __metadata("design:type", Number)
], PizzaCompositionFlavorDTO.prototype, "fraction", void 0);
export class PizzaCompositionDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], PizzaCompositionDTO.prototype, "sizeId", void 0);
__decorate([
    IsArray(),
    ValidateNested({ each: true }),
    Type(() => PizzaCompositionFlavorDTO),
    __metadata("design:type", Array)
], PizzaCompositionDTO.prototype, "flavors", void 0);
export class CreateOrderItemDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "lineType", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "productId", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "comboId", void 0);
__decorate([
    IsNumber(),
    IsNotEmpty(),
    __metadata("design:type", Number)
], CreateOrderItemDTO.prototype, "quantity", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "notes", void 0);
__decorate([
    IsArray(),
    IsOptional(),
    ValidateNested({ each: true }),
    Type(() => CreateOrderItemComplementDTO),
    __metadata("design:type", Array)
], CreateOrderItemDTO.prototype, "complements", void 0);
__decorate([
    IsArray(),
    IsOptional(),
    ValidateNested({ each: true }),
    Type(() => CreateOrderItemComboSelectionDTO),
    __metadata("design:type", Array)
], CreateOrderItemDTO.prototype, "comboSelections", void 0);
__decorate([
    IsArray(),
    IsOptional(),
    ValidateNested({ each: true }),
    Type(() => CreateOrderItemSelectionGroupDTO),
    __metadata("design:type", Array)
], CreateOrderItemDTO.prototype, "selections", void 0);
__decorate([
    IsOptional(),
    ValidateNested(),
    Type(() => PizzaCompositionDTO),
    __metadata("design:type", PizzaCompositionDTO)
], CreateOrderItemDTO.prototype, "pizzaComposition", void 0);
__decorate([
    IsArray(),
    IsOptional(),
    ValidateNested({ each: true }),
    Type(() => CreateOrderItemComboSlotSelectionDTO),
    __metadata("design:type", Array)
], CreateOrderItemDTO.prototype, "slots", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "sourceUpsellId", void 0);
export class CreateOrderDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "idempotencyKey", void 0);
__decorate([
    IsArray(),
    IsNotEmpty(),
    ValidateNested({ each: true }),
    Type(() => CreateOrderItemDTO),
    __metadata("design:type", Array)
], CreateOrderDTO.prototype, "items", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "customerName", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "customerPhone", void 0);
__decorate([
    IsEmail(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "customerEmail", void 0);
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "fulfillmentType", void 0);
__decorate([
    IsOptional(),
    ValidateNested(),
    Type(() => DeliveryAddressDTO),
    __metadata("design:type", DeliveryAddressDTO)
], CreateOrderDTO.prototype, "deliveryAddress", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "tableId", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "notes", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "couponCode", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], CreateOrderDTO.prototype, "useCashbackAmount", void 0);
__decorate([
    ValidateNested(),
    Type(() => PaymentInput),
    IsNotEmpty(),
    __metadata("design:type", PaymentInput)
], CreateOrderDTO.prototype, "payment", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "returnUrl", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "scheduledFor", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "timeSlotId", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], CreateOrderDTO.prototype, "estimatedDuration", void 0);
//# sourceMappingURL=order.js.map