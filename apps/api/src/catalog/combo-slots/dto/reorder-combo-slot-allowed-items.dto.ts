import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ReorderComboSlotAllowedItemsDto {
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  orderedAllowedItemIds!: string[];
}
