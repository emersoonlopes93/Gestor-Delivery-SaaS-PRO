// ============================================================
// PROMOTIONS & CASHBACK DOMAIN TYPES — Phase 8
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
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsEnum, IsDateString } from 'class-validator';
export class CreateCouponDTO {
}
__decorate([
    IsString(),
    IsNotEmpty(),
    __metadata("design:type", String)
], CreateCouponDTO.prototype, "code", void 0);
__decorate([
    IsEnum(['percentage', 'fixed']),
    __metadata("design:type", String)
], CreateCouponDTO.prototype, "type", void 0);
__decorate([
    IsNumber(),
    IsNotEmpty(),
    __metadata("design:type", Number)
], CreateCouponDTO.prototype, "value", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], CreateCouponDTO.prototype, "minOrderValue", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], CreateCouponDTO.prototype, "usageLimit", void 0);
__decorate([
    IsDateString(),
    IsOptional(),
    __metadata("design:type", String)
], CreateCouponDTO.prototype, "expiresAt", void 0);
__decorate([
    IsBoolean(),
    IsOptional(),
    __metadata("design:type", Boolean)
], CreateCouponDTO.prototype, "isActive", void 0);
export class UpdateCouponDTO {
}
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], UpdateCouponDTO.prototype, "minOrderValue", void 0);
__decorate([
    IsNumber(),
    IsOptional(),
    __metadata("design:type", Number)
], UpdateCouponDTO.prototype, "usageLimit", void 0);
__decorate([
    IsDateString(),
    IsOptional(),
    __metadata("design:type", String)
], UpdateCouponDTO.prototype, "expiresAt", void 0);
__decorate([
    IsBoolean(),
    IsOptional(),
    __metadata("design:type", Boolean)
], UpdateCouponDTO.prototype, "isActive", void 0);
//# sourceMappingURL=promotions.js.map