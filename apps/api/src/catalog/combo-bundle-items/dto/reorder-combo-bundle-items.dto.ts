import { IsArray, IsString } from 'class-validator';

export class ReorderComboBundleItemsDto {
  @IsArray()
  @IsString({ each: true })
  orderedItemIds!: string[];
}

