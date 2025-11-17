import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MqttService } from '../mqtt/mqtt.service';
import { EvvaQueryService } from './evva-query.service';

type EntityType =
  | 'PERSON'
  | 'IDENTIFICATION_MEDIUM'
  | 'ZONE'
  | 'INSTALLATION_POINT'
  | 'AUTHORIZATION_PROFILE';

@Injectable()
export class EvvaAccessService {
  private readonly logger = new Logger(EvvaAccessService.name);

  constructor(
    private readonly mqtt: MqttService,
    private readonly queries: EvvaQueryService,
  ) {}

  // ----- helpers -----

  private formatLocalMinute(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d as any)) {
      return iso.slice(0, 16);
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const HH = pad(d.getHours());
    const MM = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${HH}:${MM}`;
  }

  private validateAccessWindow(checkIn: string, checkOut: string) {
    const beginAt = new Date(checkIn);
    const endAt = new Date(checkOut);

    if (!+beginAt || !+endAt) {
      throw new ServiceUnavailableException(
        'checkIn/checkOut must be valid ISO 8601 timestamps',
      );
    }
    if (endAt <= beginAt) {
      throw new ServiceUnavailableException(
        'checkOut must be strictly after checkIn',
      );
    }
    if (endAt <= new Date()) {
      throw new ServiceUnavailableException('checkOut must be in the future');
    }
  }

  private waitForMediumChanged(
    mediumId: string,
    timeoutMs = 500,
  ): Promise<any> {
    const client = this.mqtt.getClient();

    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        client.off('message', onMsg);
        reject(new Error('Timeout waiting for MediumChanged'));
      }, timeoutMs);

      const onMsg = (topic: string, buf: Buffer) => {
        if (topic !== 'xs3/1/ces/MediumChanged') return;
        try {
          const msg = JSON.parse(buf.toString());
          const id =
            msg?.id ??
            msg?.mediumId ??
            msg?.event?.id ??
            msg?.event?.mediumId ??
            msg?.payload?.id ??
            msg?.payload?.mediumId;
          if (id && id === mediumId) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            client.off('message', onMsg);
            resolve(msg);
          }
        } catch {
          // ignore parse errors
        }
      };

      client.on('message', onMsg);
    });
  }

  async setAccessEndAt(sessionToken: string, id: string, checkOutISO: string) {
    if (!sessionToken) throw new Error('Not logged in yet');

    const commandId = uuidv4();
    const accessEndAt = this.formatLocalMinute(checkOutISO);
    const payload = { commandId, id, token: sessionToken, accessEndAt };

    this.logger.log(`PUB SetAccessEndAtMapi id=${id} end=${accessEndAt}`);
    try {
      await this.mqtt.publish('xs3/1/cmd/SetAccessEndAtMapi', payload);
      const event = await this.waitForMediumChanged(id, 500).catch(() => null);
      return { status: 'ok', commandId, payload, event };
    } catch (e: any) {
      return {
        status: 'error',
        commandId,
        payload,
        error: e?.message ?? String(e),
      };
    }
  }

  async setAccessBeginAt(sessionToken: string, id: string, checkInISO: string) {
    if (!sessionToken) throw new Error('Not logged in yet');

    const commandId = uuidv4();
    const accessBeginAt = this.formatLocalMinute(checkInISO);
    const payload = { commandId, id, token: sessionToken, accessBeginAt };

    this.logger.log(`PUB SetAccessBeginAtMapi id=${id} begin=${accessBeginAt}`);
    try {
      await this.mqtt.publish('xs3/1/cmd/SetAccessBeginAtMapi', payload);
      const event = await this.waitForMediumChanged(id, 500).catch(() => null);
      return { status: 'ok', commandId, payload, event };
    } catch (e: any) {
      return {
        status: 'error',
        commandId,
        payload,
        error: e?.message ?? String(e),
      };
    }
  }

  async extendAccess(
    sessionToken: string,
    userId: string,
    mediumId: string,
    checkIn: string,
    checkOut: string,
  ) {
    const id = mediumId;
    this.validateAccessWindow(checkIn, checkOut);

    const end = await this.setAccessEndAt(sessionToken, id, checkOut);
    const begin = await this.setAccessBeginAt(sessionToken, id, checkIn);

    let smartphoneAccess: any = null;
    try {
      const mediumRes = await this.queries.queryResource(
        sessionToken,
        userId,
        'identification-media',
        {
          filters: [{ field: 'id', type: 'eq', op: 'eq', value: id }],
          pageLimit: 1,
        },
      );
      const medium = mediumRes?.data?.[0] ?? null;

      if (medium?.mediumType === 'SMARTPHONE') {
        const xsMediumId =
          medium?.xsMediumId ??
          medium?.xsId ??
          medium?.identificationMedium?.xsMediumId ??
          id;

        const finalRes = await this.queries.queryResource(
          sessionToken,
          userId,
          'identification-media-access-data',
          {
            filters: [
              {
                type: 'eq',
                field: 'identificationMedium.xsMediumId',
                value: xsMediumId,
              },
            ],
            pageLimit: 200,
          },
        );

        if (Array.isArray(finalRes?.data)) {
          smartphoneAccess =
            finalRes.data.find(
              (r: any) => r?.identificationMedium?.xsMediumId === xsMediumId,
            ) ??
            finalRes.data[0] ??
            null;
        } else {
          smartphoneAccess = finalRes ?? null;
        }
      }
    } catch {
      // ignore enrichment failures
    }

    const hasError = begin.status === 'error' || end.status === 'error';
    const overallStatus = hasError ? 'error' : 'ok';
    const message = hasError
      ? 'One or more operations failed'
      : 'Access window extended successfully';

    return {
      error: hasError,
      message,
      statusCode: hasError ? 400 : 200,
      smartphoneAccess,
      raw: {
        overallStatus,
        results: { begin, end },
      },
    };
  }

  async assignAuthorizationProfile(
    sessionToken: string,
    mediumId: string,
    profileId: string,
  ) {
    if (!sessionToken) throw new Error('Not logged in yet');

    const commandId = uuidv4();
    const payload = {
      commandId,
      id: mediumId,
      authorizationProfileId: profileId,
      token: sessionToken,
    };

    this.logger.log(
      `PUB AssignAuthorizationProfileToMediumMapi id=${mediumId} profile=${profileId}`,
    );

    try {
      await this.mqtt.publish(
        'xs3/1/cmd/AssignAuthorizationProfileToMediumMapi',
        payload,
      );
      return {
        command: 'AssignAuthorizationProfileToMediumMapi',
        commandId,
        payload,
      };
    } catch (e: any) {
      return {
        command: 'AssignAuthorizationProfileToMediumMapi',
        commandId,
        payload,
        status: 'error',
        error: e?.message ?? String(e),
      };
    }
  }

  async withdrawAuthorizationProfile(
    sessionToken: string,
    mediumId: string,
    profileId: string,
  ) {
    if (!sessionToken) throw new Error('Not logged in yet');

    const commandId = uuidv4();
    const payload = {
      commandId,
      id: mediumId,
      authorizationProfileId: profileId,
      token: sessionToken,
    };

    this.logger.log(
      `PUB WithdrawAuthorizationProfileFromMediumMapi id=${mediumId} profile=${profileId}`,
    );

    try {
      await this.mqtt.publish(
        'xs3/1/cmd/WithdrawAuthorizationProfileFromMediumMapi',
        payload,
      );
      return {
        command: 'WithdrawAuthorizationProfileFromMediumMapi',
        commandId,
        payload,
      };
    } catch (e: any) {
      return {
        command: 'WithdrawAuthorizationProfileFromMediumMapi',
        commandId,
        payload,
        status: 'error',
        error: e?.message ?? String(e),
      };
    }
  }

  async program(
    sessionToken: string,
    mediumId: string,
    checkIn: string,
    checkOut: string,
    profileId: string,
  ) {
    const id = mediumId;
    this.validateAccessWindow(checkIn, checkOut);

    const end = await this.setAccessEndAt(sessionToken, id, checkOut);
    const begin = await this.setAccessBeginAt(sessionToken, id, checkIn);
    const assign = await this.assignAuthorizationProfile(
      sessionToken,
      id,
      profileId,
    );

    return {
      mediumId: id,
      checkIn,
      checkOut,
      profileId,
      results: {
        end,
        begin,
        assign,
      },
    };
  }

  async addEntityMetadataDefinition(
    sessionToken: string,
    entityType: EntityType,
    names: string[],
  ) {
    if (!sessionToken) throw new Error('Not logged in yet');

    const commandId = uuidv4();
    const payload = {
      commandId,
      entityType,
      names,
      token: sessionToken,
    };

    this.logger.log(
      `PUB AddEntityMetadataDefinitionMapi entityType=${entityType} names=${names.join(
        ',',
      )}`,
    );

    try {
      await this.mqtt.publish(
        'xs3/1/cmd/AddEntityMetadataDefinitionMapi',
        payload,
      );

      return {
        command: 'AddEntityMetadataDefinitionMapi',
        commandId,
        payload,
      };
    } catch (e: any) {
      return {
        command: 'AddEntityMetadataDefinitionMapi',
        commandId,
        payload,
        status: 'error',
        error: e?.message ?? String(e),
      };
    }
  }

  async changeInstallationPointMetadataValue(
    sessionToken: string,
    installationPointId: string,
    metadataId: string,
    value: string,
  ) {
    if (!sessionToken) throw new Error('Not logged in yet');

    const commandId = uuidv4();
    const payload = {
      commandId,
      id: installationPointId,
      metadataId,
      token: sessionToken,
      value,
    };

    this.logger.log(
      `PUB ChangeInstallationPointMetadataValueMapi id=${installationPointId} metadataId=${metadataId} value=${value}`,
    );

    try {
      await this.mqtt.publish(
        'xs3/1/cmd/ChangeInstallationPointMetadataValueMapi',
        payload,
      );

      return {
        command: 'ChangeInstallationPointMetadataValueMapi',
        commandId,
        payload,
      };
    } catch (e: any) {
      return {
        command: 'ChangeInstallationPointMetadataValueMapi',
        commandId,
        payload,
        status: 'error',
        error: e?.message ?? String(e),
      };
    }
  }

  async deleteEntityMetadataDefinition(
    sessionToken: string,
    entityType:
      | 'PERSON'
      | 'IDENTIFICATION_MEDIUM'
      | 'ZONE'
      | 'INSTALLATION_POINT'
      | 'AUTHORIZATION_PROFILE',
    names: string[],
  ) {
    if (!sessionToken) throw new Error('Not logged in yet');

    const commandId = uuidv4();
    const payload = {
      commandId,
      entityType,
      names,
      token: sessionToken,
    };

    this.logger.log(
      `PUB DeleteEntityMetadataDefinitionMapi entityType=${entityType} names=${names.join(
        ',',
      )}`,
    );

    try {
      await this.mqtt.publish(
        'xs3/1/cmd/DeleteEntityMetadataDefinitionMapi',
        payload,
      );
      return {
        command: 'DeleteEntityMetadataDefinitionMapi',
        commandId,
        payload,
      };
    } catch (e: any) {
      return {
        command: 'DeleteEntityMetadataDefinitionMapi',
        commandId,
        payload,
        status: 'error',
        error: e?.message ?? String(e),
      };
    }
  }
}
