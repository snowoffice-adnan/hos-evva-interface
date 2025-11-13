import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MqttService } from '../mqtt/mqtt.service';

@Injectable()
export class EvvaQueryService {
  private readonly logger = new Logger(EvvaQueryService.name);

  constructor(private readonly mqtt: MqttService) {}

  private waitForMessage(
    filter: (topic: string, payload: Buffer) => boolean,
    timeoutMs: number,
  ): Promise<{ topic: string; payload: Buffer }> {
    const client = this.mqtt.getClient();

    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = (timer: NodeJS.Timeout) => {
        client.off('message', onMsg);
        clearTimeout(timer);
      };

      const onMsg = (topic: string, payload: Buffer) => {
        if (settled) return;
        if (!filter(topic, payload)) return;
        settled = true;
        cleanup(timer);
        resolve({ topic, payload });
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup(timer);
        reject(new Error('Timeout waiting for MQTT message'));
      }, timeoutMs);

      client.on('message', onMsg);
    });
  }

  async queryResource(
    sessionToken: string,
    userId: string,
    resource: string,
    params: any = {},
  ): Promise<any> {
    if (!sessionToken) throw new Error('Not logged in yet (missing token)');
    if (!userId) throw new Error('Not logged in yet (missing userId)');

    const requestId = uuidv4();

    const payload = {
      requestId,
      token: sessionToken,
      resource,
      params: {
        pageOffset: 0,
        pageLimit: 100,
        sort: 'name',
        ...params,
      },
    };

    this.logger.log(`PUB Query resource=${resource} requestId=${requestId}`);
    await this.mqtt.publish('xs3/1/q', payload);

    const { topic, payload: buf } = await this.waitForMessage((topic, buf) => {
      const isOk = topic === `xs3/1/${userId}/q`;
      const isErr = topic === `xs3/1/${userId}/err`;
      if (!isOk && !isErr) return false;

      try {
        const data = JSON.parse(buf.toString());
        return data.requestId === requestId;
      } catch {
        return false;
      }
    }, 5000);

    const data = JSON.parse(buf.toString());
    if (topic.endsWith('/err')) {
      throw new Error(data?.message || 'EVVA query error');
    }
    return data.response;
  }

  async findMediumIdByHardware(
    sessionToken: string,
    userId: string,
    hardwareIdHex: string,
  ): Promise<string | null> {
    try {
      const res = await this.queryResource(
        sessionToken,
        userId,
        'identification-media',
        {
          filters: [
            { field: 'hardwareId', type: 'eq', op: 'eq', value: hardwareIdHex },
          ],
          pageLimit: 1,
        },
      );
      const row = res?.data?.[0];
      return row?.id ?? row?.xsMediumId ?? null;
    } catch {
      return null;
    }
  }
}
