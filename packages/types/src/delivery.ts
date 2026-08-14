import {
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { DriverStatus, DriverVehicleType } from './enums';

export enum DriverShiftStatus {
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export enum DriverPayMode {
  DRIVER_RATE_TABLE = 'DRIVER_RATE_TABLE', NORMAL_DELIVERY_FEE = 'NORMAL_DELIVERY_FEE',
  PERCENTAGE_NORMAL_FEE = 'PERCENTAGE_NORMAL_FEE', FIXED = 'FIXED',
}
export enum DriverLedgerEntryType {
  DAILY_RATE = 'DAILY_RATE', DELIVERY_FEE = 'DELIVERY_FEE', TIP_CASH = 'TIP_CASH',
  BONUS = 'BONUS', ADJUSTMENT = 'ADJUSTMENT',
}
export interface DriverPayRateTierDTO { upToKm: number | null; amount: number }
export interface DriverPaySettingsDTO {
  mode: DriverPayMode; dailyRate: number; fixedAmount: number; percentage: number;
  rateTable: DriverPayRateTierDTO[]; payFailedAttempt: boolean; currency: string;
}
export class UpdateDriverPaySettingsDTO {
  @IsEnum(DriverPayMode) mode!: DriverPayMode;
  @IsNumber() @Min(0) dailyRate!: number;
  @IsNumber() @Min(0) fixedAmount!: number;
  @IsNumber() @Min(0) @Max(100) percentage!: number;
  @IsArray() rateTable!: DriverPayRateTierDTO[];
  @IsBoolean() payFailedAttempt!: boolean;
}

export enum DeliveryRunStatus {
  PENDING_ACCEPTANCE = 'PENDING_ACCEPTANCE',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  RETURNING = 'RETURNING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum DeliveryStopStatus {
  PENDING = 'PENDING',
  CURRENT = 'CURRENT',
  ARRIVED = 'ARRIVED',
  DELIVERED = 'DELIVERED',
  FAILED_ATTEMPT = 'FAILED_ATTEMPT',
  RETURN_TO_STORE = 'RETURN_TO_STORE',
  RETURNED_TO_STORE = 'RETURNED_TO_STORE',
  CANCELLED = 'CANCELLED',
}

export const ACTIVE_DELIVERY_RUN_STATUSES: readonly DeliveryRunStatus[] = [
  DeliveryRunStatus.PENDING_ACCEPTANCE,
  DeliveryRunStatus.ASSIGNED,
  DeliveryRunStatus.IN_PROGRESS,
  DeliveryRunStatus.RETURNING,
];

export const OPEN_DELIVERY_STOP_STATUSES: readonly DeliveryStopStatus[] = [
  DeliveryStopStatus.PENDING,
  DeliveryStopStatus.CURRENT,
  DeliveryStopStatus.ARRIVED,
  DeliveryStopStatus.FAILED_ATTEMPT,
  DeliveryStopStatus.RETURN_TO_STORE,
];

export class CreateDeliveryRunDTO {
  @IsString()
  driverId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  orderIds!: string[];
}

export class ReorderDeliveryStopsDTO {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  stopIds!: string[];
}

export class DeliveryRunReasonDTO {
  @IsString()
  @MaxLength(255)
  reason!: string;
}

export class UpdateDeliveryRunSettingsDTO {
  @IsBoolean()
  requiresAcceptance!: boolean;
}

export type SmartDispatchMode = 'OFF' | 'ASSISTED';
export class UpdateSmartDispatchSettingsDTO {
  @IsIn(['OFF', 'ASSISTED']) mode!: SmartDispatchMode;
  @IsBoolean() useQueue!: boolean;
  @IsBoolean() bypassDistantDrivers!: boolean;
  @IsNumber() @Min(0.1) @Max(50) distanceThresholdKm!: number;
  @IsBoolean() autoCarona!: boolean;
  @IsInt() @Min(1) @Max(10) maxStops!: number;
  @IsNumber() @Min(0.1) @Max(50) groupingRadiusKm!: number;
}

export interface SmartDispatchDriverDTO {
  driverId: string; name: string; queuePosition: number; distanceKm: number | null;
  status: 'eligible' | 'bypassed_distance' | 'bypassed_stale_location' | 'unavailable'; reason: string | null;
}
export interface SmartDispatchSuggestionDTO {
  driver: SmartDispatchDriverDTO | null;
  queue: SmartDispatchDriverDTO[];
  orderIds: string[];
  reasons: string[];
  manualFallback: boolean;
}

export interface DeliveryStopDTO {
  id: string;
  orderId: string;
  sequence: number;
  status: DeliveryStopStatus;
  attempts: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: Record<string, unknown> | null;
  arrivedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  returnRequiredAt: string | null;
  returnedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  payAmount: number | null;
  payCurrency: string | null;
}

/** Store/origin coordinates when the tenant has a geocoded store address. */
export interface DeliveryRunOriginDTO {
  lat: number;
  lng: number;
  label: string;
}

export interface DeliveryRunDTO {
  id: string;
  driverId: string;
  driverName: string;
  status: DeliveryRunStatus;
  version: number;
  assignedAt: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  returningAt: string | null;
  completedAt: string | null;
  createdAt: string;
  origin?: DeliveryRunOriginDTO | null;
  kds?: {
    blocked: boolean;
    blockingOrdersCount: number;
    blockingOrderNumbers: string[];
    overrideApplied: boolean;
    overrideAt: string | null;
  };
  stops: DeliveryStopDTO[];
}

export interface DriverShiftDTO {
  id: string;
  status: DriverShiftStatus;
  startedAt: string;
  endedAt: string | null;
  dailyRate: number;
  currency: string;
}

export interface DriverWorkStateDTO {
  shift: DriverShiftDTO | null;
  activeRun: DeliveryRunDTO | null;
  trackingRequired: boolean;
  availability: DriverStatus;
}

export const DRIVER_LOCATION_SOURCES = ['foreground', 'background'] as const;
export type DriverLocationSource = typeof DRIVER_LOCATION_SOURCES[number];

export class DriverLocationPointDTO {
  @IsString()
  @MaxLength(128)
  eventKey!: string;

  @IsISO8601({ strict: true })
  recordedAt!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsNumber()
  @Min(0)
  @Max(10_000)
  @IsOptional()
  accuracy?: number;

  @IsNumber()
  @Min(0)
  @Max(360)
  @IsOptional()
  heading?: number;

  @IsNumber()
  @Min(0)
  @Max(150)
  @IsOptional()
  speed?: number;

  @IsIn(DRIVER_LOCATION_SOURCES)
  source!: DriverLocationSource;
}

export class DriverLocationBatchDTO {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DriverLocationPointDTO)
  points!: DriverLocationPointDTO[];
}

export interface DriverLocationIngestResultDTO {
  acknowledgedEventKeys: string[];
  persistedEventKeys: string[];
  duplicateEventKeys: string[];
  sampledOutEventKeys: string[];
}

export interface DeliveryRunLocationPointDTO {
  lat: number;
  lng: number;
  recordedAt: string;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  source: DriverLocationSource;
}

export interface DeliveryRunLocationHistoryDTO {
  runId: string;
  driverId: string;
  shiftId: string;
  startedAt: string | null;
  completedAt: string | null;
  detailedAvailable: boolean;
  retainedUntil: string | null;
  points: DeliveryRunLocationPointDTO[];
}

export interface DeliveryRunSettingsDTO {
  requiresAcceptance: boolean;
}

export interface DeliveryRunBuilderDataDTO {
  drivers: DriverDTO[];
  orders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    address: string;
    createdAt: string;
  }>;
}

export class CreateDriverDTO {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(20)
  phone!: string;

  @IsEnum(DriverVehicleType)
  @IsOptional()
  vehicleType?: DriverVehicleType;

  @IsString()
  @IsOptional()
  notes?: string;
  @IsBoolean() @IsOptional() payOverrideEnabled?: boolean;
  @IsEnum(DriverPayMode) @IsOptional() payMode?: DriverPayMode;
  @IsNumber() @Min(0) @IsOptional() dailyRate?: number;
  @IsNumber() @Min(0) @IsOptional() payFixedAmount?: number;
  @IsNumber() @Min(0) @Max(100) @IsOptional() payPercentage?: number;
  @IsArray() @IsOptional() payRateTable?: DriverPayRateTierDTO[];
  @IsBoolean() @IsOptional() payFailedAttempt?: boolean;
}

export class UpdateDriverDTO {
  @IsString()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEnum(DriverStatus)
  @IsOptional()
  status?: DriverStatus;

  @IsEnum(DriverVehicleType)
  @IsOptional()
  vehicleType?: DriverVehicleType;

  @IsString()
  @IsOptional()
  notes?: string;
  @IsBoolean() @IsOptional() payOverrideEnabled?: boolean;
  @IsEnum(DriverPayMode) @IsOptional() payMode?: DriverPayMode;
  @IsNumber() @Min(0) @IsOptional() dailyRate?: number;
  @IsNumber() @Min(0) @IsOptional() payFixedAmount?: number;
  @IsNumber() @Min(0) @Max(100) @IsOptional() payPercentage?: number;
  @IsArray() @IsOptional() payRateTable?: DriverPayRateTierDTO[];
  @IsBoolean() @IsOptional() payFailedAttempt?: boolean;
}

export class UpdateDriverOperationalStatusDTO {
  @IsIn([DriverStatus.available, DriverStatus.offline])
  status!: DriverStatus.available | DriverStatus.offline;
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
  pin?: string; // Temporário para exibir uma vez após criação/reset
}

export interface DriverDTO {
  payOverrideEnabled?: boolean;
  payMode?: DriverPayMode | null;
  dailyRate?: number | null;
  payFixedAmount?: number | null;
  payPercentage?: number | null;
  payRateTable?: DriverPayRateTierDTO[] | null;
  payFailedAttempt?: boolean | null;
}

export interface DriverEarningsSummaryDTO {
  shiftId: string; shiftStatus: DriverShiftStatus; deliveryFees: number; cashTips: number;
  dailyRate: number; dailyRatePreview: boolean; adjustments: number; totalEarnings: number;
  receivedDirectly: number; dueFromStore: number; currency: string;
  eligibleCashTipOrders: DriverEarningsOrderDTO[];
}
export interface DriverEarningsOrderDTO {
  orderId: string; orderNumber: string; customerName: string;
}
export class DriverCashTipDTO { @IsString() orderId!: string; @IsNumber() @Min(0.01) amount!: number }
export class TenantCashTipDTO extends DriverCashTipDTO { @IsString() driverId!: string }
export class DriverAdjustmentDTO {
  @IsString() driverId!: string; @IsNumber() amount!: number;
  @IsString() @MaxLength(255) reason!: string;
}

export enum DriverSettlementMethod {
  PIX = 'PIX', CASH = 'CASH', BANK_TRANSFER = 'BANK_TRANSFER', OTHER = 'OTHER',
}

export enum DriverShiftPaymentStatus {
  PENDING = 'PENDING', PAID = 'PAID',
}

export class CreateDriverSettlementDTO {
  @IsString() driverId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(31) @ArrayUnique() @IsString({ each: true }) shiftIds!: string[];
  @IsEnum(DriverSettlementMethod) paymentMethod!: DriverSettlementMethod;
  @IsISO8601({ strict: true }) @IsOptional() paidAt?: string;
  @IsString() @MaxLength(500) @IsOptional() notes?: string;
  @IsString() @MaxLength(160) idempotencyKey!: string;
}

export class DriverSettlementListQueryDTO {
  @IsEnum(DriverShiftPaymentStatus) @IsOptional() status?: DriverShiftPaymentStatus;
  @IsISO8601({ strict: true }) @IsOptional() from?: string;
  @IsISO8601({ strict: true }) @IsOptional() to?: string;
}

export interface DriverSettlementShiftDTO {
  shiftId: string;
  startedAt: string;
  endedAt: string;
  grossEarnings: number;
  receivedDirectly: number;
  amountDue: number;
  currency: string;
  status: DriverShiftPaymentStatus;
  settlementId: string | null;
}

export interface DriverSettlementHistoryDTO {
  id: string;
  driverId: string;
  amount: number;
  currency: string;
  paymentMethod: DriverSettlementMethod;
  paidAt: string;
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  shifts: DriverSettlementShiftDTO[];
}

export interface DriverSettlementSummaryDTO {
  driverId: string;
  currentDue: number;
  pendingShiftCount: number;
  currency: string;
  lastPayment: DriverSettlementHistoryDTO | null;
}
