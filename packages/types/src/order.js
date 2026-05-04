"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOrderDTO = exports.CreateOrderItemDTO = exports.PizzaCompositionDTO = exports.PizzaCompositionFlavorDTO = exports.CreateOrderItemComboSlotSelectionDTO = exports.CreateOrderItemComboSlotSelectionItemDTO = exports.CreateOrderItemSelectionGroupDTO = exports.CreateOrderItemSelectionItemDTO = exports.CreateOrderItemComboSelectionDTO = exports.CreateOrderItemComplementDTO = exports.DeliveryAddressDTO = exports.ORDER_STATUS_TRANSITIONS = exports.PaymentInput = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const enums_1 = require("./enums");
class PaymentInput {
}
exports.PaymentInput = PaymentInput;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], PaymentInput.prototype, "method", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], PaymentInput.prototype, "changeFor", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PaymentInput.prototype, "cardToken", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PaymentInput.prototype, "paymentMethodId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PaymentInput.prototype, "issuerId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], PaymentInput.prototype, "installments", void 0);
exports.ORDER_STATUS_TRANSITIONS = {
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
class DeliveryAddressDTO {
}
exports.DeliveryAddressDTO = DeliveryAddressDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "street", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "number", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "complement", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "neighborhood", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "city", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "state", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "zipCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], DeliveryAddressDTO.prototype, "reference", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], DeliveryAddressDTO.prototype, "lat", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], DeliveryAddressDTO.prototype, "lng", void 0);
class CreateOrderItemComplementDTO {
}
exports.CreateOrderItemComplementDTO = CreateOrderItemComplementDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderItemComplementDTO.prototype, "groupId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderItemComplementDTO.prototype, "itemId", void 0);
class CreateOrderItemComboSelectionDTO {
}
exports.CreateOrderItemComboSelectionDTO = CreateOrderItemComboSelectionDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderItemComboSelectionDTO.prototype, "blockId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderItemComboSelectionDTO.prototype, "blockItemId", void 0);
class CreateOrderItemSelectionItemDTO {
}
exports.CreateOrderItemSelectionItemDTO = CreateOrderItemSelectionItemDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderItemSelectionItemDTO.prototype, "optionItemId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateOrderItemSelectionItemDTO.prototype, "qty", void 0);
class CreateOrderItemSelectionGroupDTO {
}
exports.CreateOrderItemSelectionGroupDTO = CreateOrderItemSelectionGroupDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderItemSelectionGroupDTO.prototype, "optionGroupId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateOrderItemSelectionItemDTO),
    __metadata("design:type", Array)
], CreateOrderItemSelectionGroupDTO.prototype, "items", void 0);
class CreateOrderItemComboSlotSelectionItemDTO {
}
exports.CreateOrderItemComboSlotSelectionItemDTO = CreateOrderItemComboSlotSelectionItemDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderItemComboSlotSelectionItemDTO.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateOrderItemComboSlotSelectionItemDTO.prototype, "qty", void 0);
class CreateOrderItemComboSlotSelectionDTO {
}
exports.CreateOrderItemComboSlotSelectionDTO = CreateOrderItemComboSlotSelectionDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderItemComboSlotSelectionDTO.prototype, "comboSlotId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateOrderItemComboSlotSelectionItemDTO),
    __metadata("design:type", Array)
], CreateOrderItemComboSlotSelectionDTO.prototype, "items", void 0);
class PizzaCompositionFlavorDTO {
}
exports.PizzaCompositionFlavorDTO = PizzaCompositionFlavorDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], PizzaCompositionFlavorDTO.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], PizzaCompositionFlavorDTO.prototype, "fraction", void 0);
class PizzaCompositionDTO {
}
exports.PizzaCompositionDTO = PizzaCompositionDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], PizzaCompositionDTO.prototype, "sizeId", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PizzaCompositionFlavorDTO),
    __metadata("design:type", Array)
], PizzaCompositionDTO.prototype, "flavors", void 0);
class CreateOrderItemDTO {
}
exports.CreateOrderItemDTO = CreateOrderItemDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "lineType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "comboId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], CreateOrderItemDTO.prototype, "quantity", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateOrderItemComplementDTO),
    __metadata("design:type", Array)
], CreateOrderItemDTO.prototype, "complements", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateOrderItemComboSelectionDTO),
    __metadata("design:type", Array)
], CreateOrderItemDTO.prototype, "comboSelections", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateOrderItemSelectionGroupDTO),
    __metadata("design:type", Array)
], CreateOrderItemDTO.prototype, "selections", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => PizzaCompositionDTO),
    __metadata("design:type", PizzaCompositionDTO)
], CreateOrderItemDTO.prototype, "pizzaComposition", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateOrderItemComboSlotSelectionDTO),
    __metadata("design:type", Array)
], CreateOrderItemDTO.prototype, "slots", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderItemDTO.prototype, "sourceUpsellId", void 0);
class CreateOrderDTO {
}
exports.CreateOrderDTO = CreateOrderDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateOrderItemDTO),
    __metadata("design:type", Array)
], CreateOrderDTO.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "customerName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "customerPhone", void 0);
__decorate([
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "customerEmail", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "fulfillmentType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeliveryAddressDTO),
    __metadata("design:type", DeliveryAddressDTO)
], CreateOrderDTO.prototype, "deliveryAddress", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "tableId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "couponCode", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateOrderDTO.prototype, "useCashbackAmount", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => PaymentInput),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", PaymentInput)
], CreateOrderDTO.prototype, "payment", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "returnUrl", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "scheduledFor", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDTO.prototype, "timeSlotId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateOrderDTO.prototype, "estimatedDuration", void 0);
//# sourceMappingURL=order.js.map