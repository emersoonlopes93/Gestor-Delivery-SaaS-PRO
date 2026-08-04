import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsUUID } from 'class-validator';

export class BulkSetCategoryActiveDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsBoolean()
  isActive!: boolean;
}
