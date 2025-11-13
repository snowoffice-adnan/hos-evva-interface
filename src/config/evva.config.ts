import { registerAs } from '@nestjs/config';

export default registerAs('evva', () => {
  return {
    mqtt: {
      host: process.env.MQTT_HOST ?? '',
      port: parseInt(process.env.MQTT_PORT ?? '11883', 10),
      clientId:
        process.env.MQTT_CLIENT_ID ??
        `evva-${Math.random().toString(16).slice(2)}`,
      token: process.env.MQTT_TOKEN ?? '',
      certPath: process.env.MQTT_CERT_PATH ?? '',
      keyPath: process.env.MQTT_KEY_PATH ?? '',
      caPath: process.env.MQTT_CA_PATH ?? '',
      protocolVersion: 4,
    },
    xs3: {
      username: process.env.XS3_USERNAME ?? '',
      password: process.env.XS3_PASSWORD ?? '',
    },
  };
});
