import { IsUUID, IsISO8601, IsNotEmpty } from 'class-validator';

export class ExtendAccessDto {
  @IsUUID()
  @IsNotEmpty()
  mediumId!: string;

  @IsISO8601({ strict: true })
  @IsNotEmpty()
  checkIn!: string;

  @IsISO8601({ strict: true })
  @IsNotEmpty()
  checkOut!: string;
}
