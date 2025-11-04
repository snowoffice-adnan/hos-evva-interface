import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subscribe, Payload, Params } from '@evva/nest-mqtt';
import { Xs3StateService } from './xs3.state.service';
import { Xs3QueriesService } from './xs3.queries.service';
import { createHash } from 'crypto';

type ReaderEvent = {
  t?: string;  // "ky"
  e?: string;  // "on" | "off"
  oid?: string; // EVVA OID (hex)
  atr?: string;
  [k: string]: unknown;
};

@Injectable()
export class Xs3ReaderListener {
  private readonly logger = new Logger(Xs3ReaderListener.name);
  private readonly csUuid: string;

  constructor(
    private readonly config: ConfigService,
    private readonly state: Xs3StateService,
    private readonly queries: Xs3QueriesService,
  ) {
    this.csUuid = this.config.get<string>('codingStationUuid', '');
    if (!this.csUuid) {
      this.logger.error('Missing CODING_STATION_UUID');
    } else {
      this.logger.log(`Listening on readers/1/${this.csUuid}`);
    }
  }

  @Subscribe('readers/1/+')
  async onReaderJson(@Payload() payload: any, @Params() params: string[]) {
    const [uuid] = params ?? [];

    if (!uuid || uuid !== this.csUuid) return;

    const data = coerceJson<ReaderEvent>(payload);
    if (!data) return;

    if (data.t === 'ky' && data.e === 'on') {
      if (data.oid === 'AFFE') {
        this.state.setAffeError();
        return;
      }
      if (typeof data.oid === 'string' && data.oid.length > 0) {
        const oidBuf = Buffer.from(data.oid + '00', 'hex');
        const hwHex = sha256Hex(oidBuf);
        const hwB64 = sha256B64(oidBuf);
        this.state.setHardwareKey(hwHex, hwB64);
        this.logger.log(`Key ON: ${hwHex}`);

        try {
          const mediumId = await this.queries.findMediumIdByHardwareId(hwHex);
          console.log('mediumId', mediumId);
          console.log('hwHex', hwHex);

          this.state.setCurrentMediumId(mediumId);
          if (mediumId) {
            this.logger.log(`Selected mediumId=${mediumId} for hardwareId=${hwHex}`);
          } else {
            this.logger.warn(`No identification-media matched hardwareId=${hwHex}`);
          }
        } catch (e) {
          this.logger.error(`Lookup by hardwareId failed: ${(e as Error).message}`);
        }
      }
    }
  }
}

/* helpers */
function payloadToString(p: any): string {
  if (p == null) return '';
  if (Buffer.isBuffer(p)) return p.toString('utf8');
  if (typeof p === 'string') return p;
  try { return JSON.stringify(p); } catch { return String(p); }
}
function coerceJson<T = any>(p: any): T | null {
  try {
    if (p == null) return null;
    if (typeof p === 'object' && !Buffer.isBuffer(p)) return p as T;
    const s = payloadToString(p).trim();
    if (!s) return null;
    return JSON.parse(s) as T;
  } catch { return null; }
}
function sha256Hex(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}
function sha256B64(buf: Buffer) {
  return createHash('sha256').update(buf).digest('base64');
}
