import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ReorderProductOptionGroupLinksDto {
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  orderedLinkIds!: string[];
}
