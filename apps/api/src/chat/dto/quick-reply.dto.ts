import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateQuickReplyDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateQuickReplyDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
