import { IsString, IsEmail, IsOptional, IsNumber } from 'class-validator';

export class CreatePixPaymentDto {
  @IsString()
  orderId!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  @IsOptional()
  customerName?: string;
}

export class CreateCardPaymentDto {
  @IsString()
  orderId!: string;

  @IsString()
  token!: string;

  @IsString()
  paymentMethodId!: string;

  @IsString()
  issuerId!: string;

  @IsNumber()
  installments!: number;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  @IsOptional()
  customerName?: string;
}

export class CreatePreferenceDto {
  @IsString()
  orderId!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  customerName!: string;

  @IsString()
  returnUrl!: string;

  @IsString()
  paymentMethod!: string;
}

export class WebhookDto {
  @IsString()
  action!: string;

  @IsString()
  api_version!: string;

  @IsString()
  data!: {
    id: string;
  };

  @IsString()
  date_created!: string;

  @IsString()
  id!: string;

  @IsString()
  live_mode!: string; // Mantido como string pois vem do webhook como string

  @IsString()
  type!: string;

  @IsString()
  user_id!: string;
}
