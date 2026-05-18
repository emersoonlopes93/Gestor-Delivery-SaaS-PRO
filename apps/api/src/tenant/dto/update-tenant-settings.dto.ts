import { IsString, IsOptional, IsEmail, MaxLength, Matches, IsNumber, IsArray, IsBoolean } from 'class-validator';

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  businessPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  businessEmail?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  complement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsArray()
  paymentMethods?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pixKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankAgency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  @Matches(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, {
    message: 'CNPJ inválido. Use o formato XX.XXX.XXX/XXXX-XX ou apenas números.',
  })
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  razaoSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  inscricaoEstadual?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxRegime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  standardCfop?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  standardNcm?: string;

  @IsOptional()
  whatsappNotificationsEnabled?: boolean;

  @IsOptional()
  notificationTemplates?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  audioNotificationEnabled?: boolean;

  @IsOptional()
  @IsString()
  newOrderSound?: string;

  @IsOptional()
  @IsString()
  cancellationSound?: string;

  @IsOptional()
  @IsNumber()
  notificationVolume?: number;
}
