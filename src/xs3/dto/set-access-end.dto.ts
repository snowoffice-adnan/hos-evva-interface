import { IsISO8601, IsUUID, IsOptional } from 'class-validator';
import { EmptyToUndefined } from '../../common/decorators/empty-to-undefined.decorator';

export class SetAccessEndDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsUUID('4', { message: 'mediumId must be a UUID v4' })
  mediumId?: string;

  @IsISO8601({}, { message: 'checkOut must be an ISO datetime' })
  checkOut!: string;
}
