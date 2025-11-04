import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientService } from '@evva/nest-xs3-api-client';
import { MqttBrokerConnectOptions } from '@evva/nest-xs3-api-client/dist/broker/mqtt/mqtt-broker-connect.options';
import { promises as fs } from 'fs';

@Injectable()
export class Xs3Client implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Xs3Client.name);
  private connecting = false;
  private connected = false;

  constructor(
      private readonly cfg: ConfigService,
      private readonly client: ClientService,
  ) {}

  // ─────────── lifecycle ───────────

  async onModuleInit() {
    try {
      await this.connect();
    } catch (e: any) {
      this.logger.error(`XS3 initial connect failed: ${e?.message ?? e}`);
    }
  }

  async onModuleDestroy() {
    try {
      await this.disconnect();
    } catch (e) {
      // ignore
    }
  }

  // ─────────── public API ───────────

  async connect(): Promise<boolean> {
    if (this.connecting) return this.connected;
    this.connecting = true;

    try {
      const host = this.getCfg('mqtt.host', 'MQTT_HOST', '');
      const port = Number(this.getCfg('mqtt.port', 'MQTT_PORT', 11883));
      const clientId = this.getCfg('mqtt.clientId', 'MQTT_CLIENT_ID', '');
      const token = this.getCfg('mqtt.token', 'MQTT_TOKEN', '');

      const certPath = this.getCfg('mqtt.certPath', 'MQTT_CERT_PATH', '');
      const keyPath = this.getCfg('mqtt.keyPath', 'MQTT_KEY_PATH', '');
      const caPath = this.getCfg('mqtt.caPath', 'MQTT_CA_PATH', '');

      if (!host || !clientId) {
        this.logger.warn('Missing mqtt.host and/or mqtt.clientId → skipping XS3 connect');
        this.connected = false;
        return false;
      }

      // read certs only if paths are present; otherwise use empty buffers
      const [cert, key, certCA] = await Promise.all([
        this.readMaybe(certPath),
        this.readMaybe(keyPath),
        this.readMaybe(caPath),
      ]);

      const options: MqttBrokerConnectOptions = {
        host,
        port,
        clientId,
        token,
        cert,
        key,
        certCA,
      };

      const ok = await this.client.connect(options);
      this.connected = ok;

      if (ok) this.logger.log(`Connected to XS3 MQTT at ${host}:${port}`);
      else this.logger.error('Failed to connect to XS3 MQTT');

      return ok;
    } finally {
      this.connecting = false;
    }
  }

  /** Disconnect safely. */
  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
    } catch (e) {
      // ignore
    } finally {
      this.connected = false;
    }
  }

  /** Reconnect convenience. */
  async reconnect(): Promise<boolean> {
    await this.disconnect();
    return this.connect();
  }

  /** expose the raw client for queries/commands */
  get io() {
    return this.client;
  }

  // ─────────── helpers ───────────

  /** Tries config key first (nest config), then env var fallback, else default. */
  private getCfg<T = any>(configKey: string, envKey: string, fallback: any): T {
    const v = this.cfg.get<T>(configKey);
    if (v !== undefined && v !== null && (typeof v !== 'string' || v !== '')) return v;
    // env fallback (note: env is always string | undefined)
    const env = process.env[envKey];
    return (env as unknown as T) ?? fallback;
  }

  /** Read file if path is set; otherwise return empty buffer. */
  private async readMaybe(path: string): Promise<Buffer> {
    if (!path) return Buffer.alloc(0);
    try {
      return await fs.readFile(path);
    } catch (e: any) {
      this.logger.warn(`Cannot read file ${path}: ${e?.message ?? e}`);
      return Buffer.alloc(0);
    }
  }
}
