import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MqttService } from '../mqtt/mqtt.service';
import { StateService } from './state.service';
import { MssConfirmDto } from './dto/mss-confirm.dto';

@Injectable()
export class EvvaSmartphoneService {
  private readonly logger = new Logger(EvvaSmartphoneService.name);

  constructor(
    private readonly mqtt: MqttService,
    private readonly state: StateService,
  ) {}

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

  async confirmSmartphoneUpdate(
    sessionToken: string,
    userId: string,
    dto: MssConfirmDto,
  ) {
    if (!sessionToken) throw new Error('Not logged in yet');
    if (!userId) throw new Error('Not logged in yet (missing userId)');

    const commandId = uuidv4();
    const payload = {
      commandId,
      mediumId: dto.mediumId,
      transactionId: dto.transactionId,
      token: sessionToken,
    };

    this.logger.log(
      `PUB ConfirmSmartphoneUpdateMapi medium=${dto.mediumId} tx=${dto.transactionId}`,
    );

    await this.mqtt.publish(
      'xs3/1/mss/cmd/ConfirmSmartphoneUpdateMapi',
      payload,
    );

    const { topic, payload: buf } = await this.waitForMessage((topic, buf) => {
      if (topic === `xs3/1/${userId}/err`) return true;
      if (topic !== 'xs3/1/mss/ces/SmartphoneUpdateConfirmed') return false;

      try {
        const msg = JSON.parse(buf.toString());
        return msg?.commandId === commandId;
      } catch {
        return false;
      }
    }, 500);

    const msg = JSON.parse(buf.toString());

    if (topic === `xs3/1/${userId}/err`) {
      throw new Error(msg.reason || msg.error || 'EVVA returned an error');
    }

    return {
      command: 'ConfirmSmartphoneUpdateMapi',
      commandId,
      payload,
      event: msg,
    };
  }

  async confirmSmartphoneRevoke(
    sessionToken: string,
    userId: string,
    dto: MssConfirmDto,
  ) {
    if (!sessionToken) throw new Error('Not logged in yet');
    if (!userId) throw new Error('Not logged in yet (missing userId)');

    const commandId = uuidv4();
    const payload = {
      commandId,
      mediumId: dto.mediumId,
      transactionId: dto.transactionId,
      token: sessionToken,
    };

    this.logger.log(
      `PUB ConfirmSmartphoneRevokeMapi medium=${dto.mediumId} tx=${dto.transactionId}`,
    );

    await this.mqtt.publish(
      'xs3/1/mss/cmd/ConfirmSmartphoneRevokeMapi',
      payload,
    );

    const { topic, payload: buf } = await this.waitForMessage((topic, buf) => {
      if (topic === `xs3/1/${userId}/err`) return true;
      if (topic !== 'xs3/1/mss/ces/SmartphoneRevokeConfirmed') return false;

      try {
        const msg = JSON.parse(buf.toString());
        return msg?.commandId === commandId;
      } catch {
        return false;
      }
    }, 500);

    const msg = JSON.parse(buf.toString());

    if (topic === `xs3/1/${userId}/err`) {
      throw new Error(msg.reason || msg.error || 'EVVA returned an error');
    }

    return {
      command: 'ConfirmSmartphoneRevokeMapi',
      commandId,
      payload,
      event: msg,
    };
  }

  async revokeSmartphone(
    sessionToken: string,
    userId: string,
    mediumId?: string,
  ) {
    if (!sessionToken) throw new Error('Not logged in yet');
    if (!userId) throw new Error('Not logged in yet (missing userId)');

    const id = mediumId ?? this.state.snapshot.mediumId;
    if (!id) {
      throw new ServiceUnavailableException(
        'mediumId is required (no current medium in state)',
      );
    }

    const commandId = uuidv4();
    const payload = {
      commandId,
      id,
      token: sessionToken,
    };

    this.logger.log(`PUB RevokeSmartphoneMapi id=${id}`);

    await this.mqtt.publish('xs3/1/cmd/RevokeSmartphoneMapi', payload);

    const { topic, payload: buf } = await this.waitForMessage((topic, buf) => {
      if (topic === `xs3/1/${userId}/err`) return true;
      if (topic !== 'xs3/1/ces/MediumRevoked') return false;

      try {
        const msg = JSON.parse(buf.toString());
        return !(msg?.mediumId && msg.mediumId !== id);
      } catch {
        return false;
      }
    }, 5000);

    const msg = JSON.parse(buf.toString());

    if (topic === `xs3/1/${userId}/err`) {
      throw new Error(msg.reason || msg.error || 'EVVA returned an error');
    }

    return {
      command: 'RevokeSmartphoneMapi',
      commandId,
      payload,
      event: msg,
    };
  }
}
