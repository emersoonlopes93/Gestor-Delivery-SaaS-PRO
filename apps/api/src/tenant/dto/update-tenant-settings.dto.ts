import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';

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
  @MaxLength(500)
  logoUrl?: string;
}
