import { IsEnum, IsOptional } from 'class-validator';

export class UpsertPublicationDto {
  @IsEnum(['draft', 'published'])
  @IsOptional()
  publicationStatus?: 'draft' | 'published';

  @IsEnum(['active', 'inactive', 'hidden', 'sold_out_manual'])
  @IsOptional()
  operationalStatus?: 'active' | 'inactive' | 'hidden' | 'sold_out_manual';
}
