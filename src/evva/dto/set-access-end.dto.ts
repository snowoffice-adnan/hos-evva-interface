import { IsISO8601, IsUUID, IsOptional } from 'class-validator';

export class SetAccessEndDto {
  @IsOptional()
  @IsUUID('4', { message: 'mediumId must be a UUID v4' })
  mediumId?: string;

  @IsISO8601({}, { message: 'checkOut must be an ISO datetime' })
  checkOut!: string;
}
