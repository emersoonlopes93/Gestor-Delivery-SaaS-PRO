import { IsString, IsOptional, IsEmail, MaxLength, Matches } from 'class-validator';

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
}
