import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ReorderOptionItemsDto {
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  orderedItemIds!: string[];
}
