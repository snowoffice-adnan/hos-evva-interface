import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

import { MqttService } from '../mqtt/mqtt.service';
import { StateService } from './state.service';

import { MobileServiceMode } from './dto/set-mobile-service-mode.dto';
import { MssConfirmDto } from './dto/mss-confirm.dto';
import { EvvaQueryService } from './evva-query.service';
import { EvvaAccessService } from './evva-access.service';
import { EvvaSmartphoneService } from './evva-smartphone.service';

@Injectable()
export class EvvaService implements OnModuleInit {
  private readonly logger = new Logger(EvvaService.name);

  private sessionToken: string | null = null;
  private userId: string | null = null;

  constructor(
    private readonly cfg: ConfigService,
    private readonly mqtt: MqttService,
    private readonly state: StateService,
    private readonly queries: EvvaQueryService,
    private readonly access: EvvaAccessService,
    private readonly smartphone: EvvaSmartphoneService,
  ) {}

  async onModuleInit() {
    // subscribe before publishing login
    await this.mqtt.subscribe('xs3/1/+/LoggedIn');
    await this.mqtt.subscribe('xs3/1/+/q');
    await this.mqtt.subscribe('xs3/1/+/err');
    // subscribe to system events to observe command confirmations
    await this.mqtt.subscribe('xs3/1/ces/#');
    await this.mqtt.subscribe('xs3/1/mss/ces/#');
    await this.mqtt.subscribe('readers/1/+');

    const client = this.mqtt.getClient();

    client.on('message', (topic, payload) => {
      const s = payload.toString();

      // --- Login handling ---
      if (/^xs3\/1\/[^/]+\/LoggedIn$/.test(topic)) {
        try {
          const data = JSON.parse(s);
          const m = topic.match(/^xs3\/1\/([^/]+)\/LoggedIn$/);
          this.userId = m?.[1] ?? null;

          const token =
            data?.sessionToken ??
            data?.token ??
            data?.event?.token ??
            data?.payload?.token ??
            null;

          this.sessionToken = token;
          this.logger.log(
            `LoggedIn → userId=${this.userId ?? '(unknown)'} | token=${
              token ? '(received)' : '(missing)'
            }`,
          );

          if (!this.sessionToken) {
            this.logger.warn(
              `LoggedIn payload didn’t include a token. Raw: ${s}`,
            );
          }
        } catch (e: any) {
          this.logger.error(`LoggedIn parse error: ${e.message}. Raw: ${s}`);
        }
      }

      // --- Query debug logs (optional, kept like before) ---
      if (/^xs3\/1\/[^/]+\/q$/.test(topic)) {
        try {
          const res = JSON.parse(s);
          this.logger.log(`QUERY OK (requestId=${res.requestId ?? 'n/a'})`);
          this.logger.debug(JSON.stringify(res.response, null, 2));
        } catch (e: any) {
          this.logger.error(`Query parse error: ${e.message}. Raw: ${s}`);
        }
      }

      if (/^xs3\/1\/[^/]+\/err$/.test(topic)) {
        this.logger.warn(`QUERY ERR: ${s}`);
      }

      // --- Reader events → StateService ---
      if (/^readers\/1\/.+$/.test(topic)) {
        let msg: any;
        try {
          msg = JSON.parse(s);
        } catch {
          msg = undefined;
        }

        // Example key event: { t: 'ky', e: 'on', iod: 'AFFE', oid: '...' }
        if (msg && msg.t === 'ky' && msg.e === 'on' && msg.iod === 'AFFE') {
          this.state.setAffeError();
        }

        // Hardware derivation from oid
        if (msg && typeof msg.oid === 'string' && msg.oid.length > 0) {
          try {
            const oidBuf = Buffer.from(msg.oid + '00', 'hex');
            const hwHex = createHash('sha256').update(oidBuf).digest('hex');
            const hwB64 = createHash('sha256').update(oidBuf).digest('base64');
            this.state.setHardwareKey(hwHex, hwB64);

            // Resolve medium by hardwareId and cache it (best-effort)
            if (this.sessionToken && this.userId) {
              void this.queries
                .findMediumIdByHardware(this.sessionToken, this.userId, hwHex)
                .then((mediumId) => this.state.setCurrentMediumId(mediumId))
                .catch(() => {
                  /* ignore lookup errors */
                });
            }
          } catch {
            // ignore bad oid
          }
        }
      }

      if (topic === 'xs3/1/ces/MediumChanged') {
        this.logger.debug(`EVENT MediumChanged: ${s}`);
      }
    });

    // Kick off login
    await this.loginWithFallback();
  }

  private async loginWithFallback() {
    const username = this.cfg.get<string>('XS3_USERNAME', '');
    const password = this.cfg.get<string>('XS3_PASSWORD', '');

    this.logger.log('Publishing Login with {name,password}…');
    await this.mqtt.publish('xs3/1/cmd/Login', { name: username, password });

    setTimeout(async () => {
      if (this.sessionToken) return;
      this.logger.warn(
        'No LoggedIn yet → retry Login with {username,password}…',
      );
      await this.mqtt.publish('xs3/1/cmd/Login', { username, password });
    }, 2000);
  }

  async queryResource(resource: string, params: any = {}): Promise<any> {
    if (!this.sessionToken || !this.userId) {
      throw new Error('Not logged in yet');
    }
    return this.queries.queryResource(
      this.sessionToken,
      this.userId,
      resource,
      params,
    );
  }

  async setAccessEndAt(id: string, checkOutISO: string) {
    if (!this.sessionToken) throw new Error('Not logged in yet');
    return this.access.setAccessEndAt(this.sessionToken, id, checkOutISO);
  }

  async setAccessBeginAt(id: string, checkInISO: string) {
    if (!this.sessionToken) throw new Error('Not logged in yet');
    return this.access.setAccessBeginAt(this.sessionToken, id, checkInISO);
  }

  async extendAccess(mediumId: string, checkIn: string, checkOut: string) {
    if (!this.sessionToken || !this.userId) {
      throw new Error('Not logged in yet');
    }

    return this.access.extendAccess(
      this.sessionToken,
      this.userId,
      mediumId,
      checkIn,
      checkOut,
    );
  }

  async setMobileServiceMode(mobileServiceMode: MobileServiceMode) {
    if (!this.sessionToken) throw new Error('Not logged in yet');

    const commandId = uuidv4();
    const payload = {
      commandId,
      token: this.sessionToken,
      mobileServiceMode, // "XMS" | "SELF_SERVICE"
    };

    this.logger.log(`PUB SetMobileServiceModeMapi mode=${mobileServiceMode}`);

    try {
      await this.mqtt.publish('xs3/1/cmd/SetMobileServiceModeMapi', payload);
      return {
        command: 'SetMobileServiceModeMapi',
        commandId,
        payload,
      };
    } catch (e: any) {
      return {
        command: 'SetMobileServiceModeMapi',
        commandId,
        payload,
        status: 'error',
        error: e?.message ?? String(e),
      };
    }
  }

  async confirmSmartphoneUpdate(dto: MssConfirmDto) {
    if (!this.sessionToken || !this.userId) {
      throw new Error('Not logged in yet');
    }
    return this.smartphone.confirmSmartphoneUpdate(
      this.sessionToken,
      this.userId,
      dto,
    );
  }

  async confirmSmartphoneRevoke(dto: MssConfirmDto) {
    if (!this.sessionToken || !this.userId) {
      throw new Error('Not logged in yet');
    }
    return this.smartphone.confirmSmartphoneRevoke(
      this.sessionToken,
      this.userId,
      dto,
    );
  }

  async revokeSmartphone(mediumId?: string) {
    if (!this.sessionToken || !this.userId) {
      throw new Error('Not logged in yet');
    }
    return this.smartphone.revokeSmartphone(
      this.sessionToken,
      this.userId,
      mediumId,
    );
  }

  async assignAuthorizationProfile(
    mediumId: string | undefined,
    profileId: string,
  ) {
    if (!this.sessionToken) throw new Error('Not logged in yet');

    const id = mediumId ?? this.state.snapshot.mediumId;
    if (!id) {
      throw new ServiceUnavailableException(
        'mediumId is required (no current medium in state)',
      );
    }

    return this.access.assignAuthorizationProfile(
      this.sessionToken,
      id,
      profileId,
    );
  }

  async withdrawAuthorizationProfile(
    mediumId: string | undefined,
    profileId: string,
  ) {
    if (!this.sessionToken) throw new Error('Not logged in yet');

    const id = mediumId ?? this.state.snapshot.mediumId;
    if (!id) {
      throw new ServiceUnavailableException(
        'mediumId is required (no current medium in state)',
      );
    }

    return this.access.withdrawAuthorizationProfile(
      this.sessionToken,
      id,
      profileId,
    );
  }

  async program(
    mediumId: string | undefined,
    checkIn: string,
    checkOut: string,
    profileId: string,
  ) {
    if (!this.sessionToken) throw new Error('Not logged in yet');

    const id = mediumId ?? this.state.snapshot.mediumId;
    if (!id) {
      throw new ServiceUnavailableException(
        'mediumId is required (no current medium in state)',
      );
    }

    return this.access.program(
      this.sessionToken,
      id,
      checkIn,
      checkOut,
      profileId,
    );
  }
}
