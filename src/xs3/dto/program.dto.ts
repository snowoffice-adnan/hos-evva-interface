import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { EmptyToUndefined } from "../../common/decorators/empty-to-undefined.decorator";

export class ProgramDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsUUID('4', { message: 'mediumId must be a UUID v4' })
  mediumId?: string;

  @IsISO8601({}, { message: 'checkIn must be an ISO datetime' })
  checkIn!: string;

  @IsISO8601({}, { message: 'checkOut must be an ISO datetime' })
  checkOut!: string;

  @IsUUID('4', { message: 'profileId must be a UUID v4' })
  profileId!: string;
}