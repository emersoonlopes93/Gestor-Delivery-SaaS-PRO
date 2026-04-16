import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ReorderComboSlotsDto {
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  orderedSlotIds!: string[];
}
