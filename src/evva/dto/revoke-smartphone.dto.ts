import { IsUUID } from 'class-validator';

export class RevokeSmartphoneDto {
  @IsUUID('4', { message: 'mediumId must be a UUID v4' })
  mediumId!: string;
}
