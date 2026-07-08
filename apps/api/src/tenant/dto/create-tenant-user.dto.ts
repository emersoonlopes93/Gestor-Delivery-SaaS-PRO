import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayMinSize,
} from 'class-validator';

export class CreateTenantUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  roles!: string[];

  @IsString()
  @IsOptional()
  ownerConfirmationText?: string;

  @IsString()
  @IsOptional()
  actorUserId?: string;
}
