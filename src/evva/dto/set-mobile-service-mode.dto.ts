import { IsEnum } from 'class-validator';

export enum MobileServiceMode {
  XMS = 'XMS',
  SELF_SERVICE = 'SELF_SERVICE',
}

export class SetMobileServiceModeDto {
  @IsEnum(MobileServiceMode, {
    message: 'mobileServiceMode must be one of: XMS, SELF_SERVICE',
  })
  mobileServiceMode!: MobileServiceMode;
}
