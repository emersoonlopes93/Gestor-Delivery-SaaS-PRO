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
exports.CreatePosOrderDTO = exports.PosFulfillmentType = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const order_1 = require("./order");
// ============================================================
// POS ENUMS
// ============================================================
const enums_1 = require("./enums");
var PosFulfillmentType;
(function (PosFulfillmentType) {
    PosFulfillmentType["DINE_IN"] = "dine_in";
    PosFulfillmentType["PICKUP"] = "pickup";
    PosFulfillmentType["DELIVERY"] = "delivery";
    PosFulfillmentType["TABLE"] = "table";
})(PosFulfillmentType || (exports.PosFulfillmentType = PosFulfillmentType = {}));
// ============================================================
// POS DTOs — Input
// ============================================================
class CreatePosOrderDTO {
}
exports.CreatePosOrderDTO = CreatePosOrderDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Items cannot be empty' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => order_1.CreateOrderItemDTO),
    __metadata("design:type", Array)
], CreatePosOrderDTO.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "customerName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "customerPhone", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(PosFulfillmentType),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "fulfillmentType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "tableNumber", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(enums_1.PaymentMethod),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "paymentMethod", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreatePosOrderDTO.prototype, "discountTotal", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "couponCode", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreatePosOrderDTO.prototype, "useCashbackAmount", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreatePosOrderDTO.prototype, "deliveryFee", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreatePosOrderDTO.prototype, "deliveryAddress", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "waiterId", void 0);
//# sourceMappingURL=pos.js.map