import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import mqtt, { MqttClient } from 'mqtt';
import * as fs from 'fs';
import * as path from 'path';
import evvaConfig from '../config/evva.config';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client!: MqttClient;

  constructor(
    @Inject(evvaConfig.KEY)
    private readonly cfg: ConfigType<typeof evvaConfig>,
  ) {}

  private resolvePath(p: string) {
    if (!p) return '';
    if (path.isAbsolute(p)) return p;
    return path.join(process.cwd(), p);
  }

  async onModuleInit() {
    const mqttCfg = this.cfg.mqtt;

    const host = mqttCfg.host;
    const port = mqttCfg.port;
    const clientId = mqttCfg.clientId;

    const cert = fs.readFileSync(this.resolvePath(mqttCfg.certPath));
    const key = fs.readFileSync(this.resolvePath(mqttCfg.keyPath));
    const ca = fs.readFileSync(this.resolvePath(mqttCfg.caPath));

    this.logger.log(
      `Connecting mqtts://${host}:${port} (clientId=${clientId})`,
    );
    this.logger.log(`TLS loaded -> cert:${!!cert} key:${!!key} ca:${!!ca}`);

    const options: mqtt.IClientOptions = {
      protocol: 'mqtts',
      host,
      port,
      clientId,
      protocolVersion: 4,
      cert,
      key,
      ca,
      rejectUnauthorized: false,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 3000,
      resubscribe: false,
    };

    this.client = mqtt.connect(options as any);

    this.client.on('connect', () => this.logger.log(`MQTT connected`));
    this.client.on('reconnect', () => this.logger.warn('MQTT reconnecting...'));
    this.client.on('close', () => this.logger.warn('MQTT connection closed'));
    this.client.on('end', () => this.logger.warn('MQTT ended'));
    this.client.on('error', (err) =>
      this.logger.error(`MQTT error: ${err.message}`),
    );
    this.client.on('message', (topic, payload) => {
      this.logger.debug(`<= [${topic}] ${payload.toString()}`);
    });
  }

  onModuleDestroy() {
    if (this.client) this.client.end(true);
  }

  getClient(): MqttClient {
    return this.client;
  }

  async subscribe(topic: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.subscribe(topic, { qos: 1 }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  async publish(topic: string, payload: any): Promise<void> {
    const message =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    await new Promise<void>((resolve, reject) => {
      this.client.publish(topic, message, { qos: 1 }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }
}
