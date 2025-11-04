import { IsUUID, IsOptional } from 'class-validator';
import { EmptyToUndefined } from "../../common/decorators/empty-to-undefined.decorator";

export class AssignAuthProfileDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsUUID('4', { message: 'mediumId must be a UUID v4' })
  mediumId?: string;

  @IsUUID('4', { message: 'profileId must be a UUID v4' })
  profileId!: string;
}
