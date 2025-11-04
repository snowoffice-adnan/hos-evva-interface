import { IsISO8601, IsUUID, IsOptional } from 'class-validator';
import { EmptyToUndefined } from '../../common/decorators/empty-to-undefined.decorator';

export class SetAccessBeginDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsUUID('4', { message: 'mediumId must be a UUID v4' })
  mediumId?: string;

  @IsISO8601({}, { message: 'checkIn must be an ISO datetime' })
  checkIn!: string;
}