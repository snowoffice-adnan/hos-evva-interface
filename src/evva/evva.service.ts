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

type ReaderEvent = {
  t?: string;
  e?: string;
  oid?: string;
  iod?: string;
  atr?: string;
  [k: string]: unknown;
};

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

      // --- Query debug logs ---
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
        const msg = this.coerceJson<ReaderEvent>(payload);

        if (!msg) return;

        if (msg.t === 'ky' && msg.e === 'on') {
          const isAffe = msg.oid === 'AFFE' || msg.iod === 'AFFE';
          if (isAffe) {
            this.state.setAffeError();
            return;
          }

          if (typeof msg.oid === 'string' && msg.oid.length > 0) {
            try {
              const oidBuf = Buffer.from(msg.oid + '00', 'hex');
              const hwHex = createHash('sha256').update(oidBuf).digest('hex');
              const hwB64 = createHash('sha256')
                .update(oidBuf)
                .digest('base64');

              this.state.setHardwareKey(hwHex, hwB64);
              this.logger.log(`Key ON: hardwareId=${hwHex}`);

              // Best-effort lookup of medium by hardwareId
              if (this.sessionToken && this.userId) {
                void this.queries
                  .findMediumIdByHardware(this.sessionToken, this.userId, hwHex)
                  .then((mediumId) => {
                    this.state.setCurrentMediumId(mediumId);

                    if (mediumId) {
                      this.logger.log(
                        `Selected mediumId=${mediumId} for hardwareId=${hwHex}`,
                      );
                    } else {
                      this.logger.warn(
                        `No identification-media matched hardwareId=${hwHex}`,
                      );
                    }
                  })
                  .catch((e: any) => {
                    this.logger.error(
                      `Lookup by hardwareId failed: ${e?.message ?? e}`,
                    );
                  });
              }
            } catch (err: any) {
              this.logger.error(
                `Failed to derive hardwareId from oid='${msg.oid}': ${err.message}`,
              );
            }
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

  private payloadToString(p: any): string {
    if (p == null) return '';
    if (Buffer.isBuffer(p)) return p.toString('utf8');
    if (typeof p === 'string') return p;
    try {
      return JSON.stringify(p);
    } catch {
      return String(p);
    }
  }

  private coerceJson<T = any>(p: any): T | null {
    try {
      if (p == null) return null;
      if (typeof p === 'object' && !Buffer.isBuffer(p)) return p as T;
      const s = this.payloadToString(p).trim();
      if (!s) return null;
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
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

  async getInstallationPointsByAuthorizationProfile(
    authorizationProfileId: string,
  ) {
    if (!this.sessionToken || !this.userId) {
      throw new ServiceUnavailableException('Not logged in yet');
    }

    //
    // 1) Load authorization profile → get installationPointIds
    //
    const profileRes = await this.queryResource('authorization-profiles', {
      filters: [
        { field: 'id', type: 'eq', op: 'eq', value: authorizationProfileId },
      ],
      pageLimit: 1,
    });

    const profile = profileRes?.data?.[0];
    const installationPointIds: string[] =
      profile?.installationPoints?.map((p: any) => p.id) ?? [];

    //
    // 2) Load installation points and filter by profile’s installationPointIds
    //
    const ipRes = await this.queryResource('installation-points', {
      pageLimit: 500,
    });

    const allIps: any[] = Array.isArray(ipRes?.data) ? ipRes.data : [];
    const installationPoints = allIps.filter((ip) =>
      installationPointIds.includes(ip.id),
    );

    if (!installationPoints.length) {
      return [];
    }

    //
    // 3) Load identification-media FILTERED by authorizationProfileId
    //
    const mediaRes = await this.queryResource('identification-media', {
      filters: [
        {
          type: 'eq',
          field: 'authorizationProfileId',
          value: authorizationProfileId,
        },
      ],
      pageLimit: 200,
    });

    const media: any[] = Array.isArray(mediaRes?.data) ? mediaRes.data : [];

    if (!media.length) {
      this.logger.warn(
        `No identification-media with authorizationProfileId=${authorizationProfileId} found`,
      );

      // We can still return the installationPoints, just without bleMac
      return installationPoints.map((ip) => ({
        ...ip,
        bleMac: null,
      }));
    }

    const medium = media[0];

    this.logger.debug(
      `Using medium id=${medium.id} label=${medium.label} for authorizationProfileId=${authorizationProfileId}`,
    );

    const xsMediumId: string =
      medium.xsMediumId ?? medium.id ?? medium.mediumIdentifier?.toString();

    if (!xsMediumId) {
      this.logger.warn(
        `Medium ${medium.id ?? medium.label} does not expose xsMediumId/id; cannot resolve bleMac`,
      );
      return installationPoints.map((ip) => ({
        ...ip,
        bleMac: null,
      }));
    }

    //
    // 4) Load identification-media-access-data and find row by xsMediumId
    //
    const accessRes = await this.queryResource(
      'identification-media-access-data',
      { pageLimit: 500 },
    );

    const rows: any[] = Array.isArray(accessRes?.data) ? accessRes.data : [];

    const row = rows.find(
      (r) =>
        r?.identificationMedium?.xsMediumId === xsMediumId ||
        r?.identificationMedium?.id === xsMediumId ||
        r?.identificationMedium?.mediumIdentifier?.toString() === xsMediumId,
    );

    const bleMac: string | null =
      row?.identificationMedium?.metadata?.accessPoints?.[0]?.bleMac ?? null;

    //
    // 5) Attach bleMac to each installationPoint and return plain array
    //
    return installationPoints.map((ip) => ({
      ...ip,
      bleMac,
    }));
  }
}
