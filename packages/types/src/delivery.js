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
exports.UpdateDriverDTO = exports.CreateDriverDTO = void 0;
const class_validator_1 = require("class-validator");
const enums_1 = require("./enums");
class CreateDriverDTO {
}
exports.CreateDriverDTO = CreateDriverDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(150),
    __metadata("design:type", String)
], CreateDriverDTO.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], CreateDriverDTO.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(enums_1.DriverVehicleType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateDriverDTO.prototype, "vehicleType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateDriverDTO.prototype, "notes", void 0);
class UpdateDriverDTO {
}
exports.UpdateDriverDTO = UpdateDriverDTO;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(150),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDriverDTO.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDriverDTO.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdateDriverDTO.prototype, "isActive", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(enums_1.DriverStatus),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDriverDTO.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(enums_1.DriverVehicleType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDriverDTO.prototype, "vehicleType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDriverDTO.prototype, "notes", void 0);
//# sourceMappingURL=delivery.js.map