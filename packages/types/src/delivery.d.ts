import { DriverStatus, DriverVehicleType } from './enums';
export declare class CreateDriverDTO {
    name: string;
    phone: string;
    vehicleType?: DriverVehicleType;
    notes?: string;
}
export declare class UpdateDriverDTO {
    name?: string;
    phone?: string;
    isActive?: boolean;
    status?: DriverStatus;
    vehicleType?: DriverVehicleType;
    notes?: string;
}
export interface DriverDTO {
    id: string;
    tenantId: string;
    name: string;
    phone: string;
    isActive: boolean;
    status: DriverStatus;
    vehicleType: DriverVehicleType;
    notes?: string | null;
    currentLat?: number | null;
    currentLng?: number | null;
    lastLocationAt?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
}
