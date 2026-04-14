import { IsLatitude, IsLongitude } from 'class-validator';

export class UpdateDriverLocationDTO {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}
