export default () => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),

    mqtt: {
        host: process.env.MQTT_HOST!,
        port: parseInt(process.env.MQTT_PORT ?? '11883', 10),
        clientId: process.env.MQTT_CLIENT_ID!,
        token: process.env.MQTT_TOKEN!,
        certPath: process.env.MQTT_CERT_PATH!,
        keyPath: process.env.MQTT_KEY_PATH!,
        caPath: process.env.MQTT_CA_PATH!,
        autoSubscribe: true,
    },

    codingStationUuid: process.env.CODING_STATION_UUID!,

});
