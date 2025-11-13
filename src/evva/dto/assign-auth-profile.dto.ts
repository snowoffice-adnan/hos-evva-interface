import { IsUUID, IsOptional } from 'class-validator';

export class AssignAuthProfileDto {
  @IsOptional()
  @IsUUID('4', { message: 'mediumId must be a UUID v4' })
  mediumId?: string;

  @IsUUID('4', { message: 'profileId must be a UUID v4' })
  profileId!: string;
}
