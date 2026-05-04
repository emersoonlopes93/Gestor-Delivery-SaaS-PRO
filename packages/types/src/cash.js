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
exports.CreateCashMovementDTO = exports.CloseCashSessionDTO = exports.OpenCashSessionDTO = void 0;
const class_validator_1 = require("class-validator");
// ============================================================
// CASH SESSION ENUMS
// ============================================================
const enums_1 = require("./enums");
// ============================================================
// CASH DTOs — Input
// ============================================================
class OpenCashSessionDTO {
    openingAmount;
}
exports.OpenCashSessionDTO = OpenCashSessionDTO;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], OpenCashSessionDTO.prototype, "openingAmount", void 0);
class CloseCashSessionDTO {
    closingAmountDeclared;
    notes;
}
exports.CloseCashSessionDTO = CloseCashSessionDTO;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CloseCashSessionDTO.prototype, "closingAmountDeclared", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CloseCashSessionDTO.prototype, "notes", void 0);
class CreateCashMovementDTO {
    type;
    amount;
    description;
}
exports.CreateCashMovementDTO = CreateCashMovementDTO;
__decorate([
    (0, class_validator_1.IsEnum)(enums_1.CashMovementType),
    __metadata("design:type", String)
], CreateCashMovementDTO.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01),
    __metadata("design:type", Number)
], CreateCashMovementDTO.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCashMovementDTO.prototype, "description", void 0);
//# sourceMappingURL=cash.js.map