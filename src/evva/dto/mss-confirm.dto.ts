import { IsUUID } from 'class-validator';

export class MssConfirmDto {
  @IsUUID('4', { message: 'mediumId must be a UUID v4' })
  mediumId!: string;

  @IsUUID('4', { message: 'transactionId must be a UUID v4' })
  transactionId!: string;
}
