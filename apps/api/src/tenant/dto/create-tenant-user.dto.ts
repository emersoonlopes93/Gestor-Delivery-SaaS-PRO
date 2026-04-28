import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsBoolean, IsArray } from 'class-validator';

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
  @IsOptional()
  roles?: string[]; // Array of role slugs
}
