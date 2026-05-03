var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum, Min, } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDTO } from './order';
// ============================================================
// POS ENUMS
// ============================================================
import { PaymentMethod } from './enums';
export var PosFulfillmentType;
(function (PosFulfillmentType) {
    PosFulfillmentType["DINE_IN"] = "dine_in";
    PosFulfillmentType["PICKUP"] = "pickup";
    PosFulfillmentType["DELIVERY"] = "delivery";
    PosFulfillmentType["TABLE"] = "table";
})(PosFulfillmentType || (PosFulfillmentType = {}));
// ============================================================
// POS DTOs — Input
// ============================================================
export class CreatePosOrderDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "idempotencyKey", void 0);
__decorate([
    IsArray(),
    IsNotEmpty({ message: 'Items cannot be empty' }),
    ValidateNested({ each: true }),
    Type(() => CreateOrderItemDTO),
    __metadata("design:type", Array)
], CreatePosOrderDTO.prototype, "items", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "customerName", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "customerPhone", void 0);
__decorate([
    IsEnum(PosFulfillmentType),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "fulfillmentType", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "tableNumber", void 0);
__decorate([
    IsEnum(PaymentMethod),
    IsOptional(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "paymentMethod", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    Min(0),
    __metadata("design:type", Number)
], CreatePosOrderDTO.prototype, "discountTotal", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "notes", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "couponCode", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    Min(0),
    __metadata("design:type", Number)
], CreatePosOrderDTO.prototype, "useCashbackAmount", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    Min(0),
    __metadata("design:type", Number)
], CreatePosOrderDTO.prototype, "deliveryFee", void 0);
__decorate([
    IsOptional(),
    __metadata("design:type", Object)
], CreatePosOrderDTO.prototype, "deliveryAddress", void 0);
__decorate([
    IsString(),
    IsOptional(),
    __metadata("design:type", String)
], CreatePosOrderDTO.prototype, "waiterId", void 0);
//# sourceMappingURL=pos.js.map