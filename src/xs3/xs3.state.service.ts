import { Injectable } from '@nestjs/common';

@Injectable()
export class Xs3StateService {
  private hwHex: string | null = null;
  private hwB64: string | null = null;
  private currentMediumId: string | null = null;
  private affeError = false;

  setHardwareKey(hex: string, b64: string) {
    this.hwHex = hex;
    this.hwB64 = b64;
  }
  setCurrentMediumId(mediumId: string | null) {
    this.currentMediumId = mediumId;
  }
  setAffeError() {
    this.affeError = true;
  }

  get snapshot() {
    return {
      mediumId: this.currentMediumId,
      hardwareIdHex: this.hwHex,
      hardwareIdB64: this.hwB64,
      affeError: this.affeError,
    };
  }
}
