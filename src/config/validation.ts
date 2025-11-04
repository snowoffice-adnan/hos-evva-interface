// src/config/validation.ts
import * as Joi from 'joi';

export default Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('production'),
    PORT: Joi.number().default(3000),

    MQTT_HOST: Joi.string().when('ENABLE_MQTT', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
    MQTT_PORT: Joi.number().when('ENABLE_MQTT', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
    MQTT_CLIENT_ID: Joi.string().when('ENABLE_MQTT', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
    MQTT_TOKEN: Joi.string().when('ENABLE_MQTT', { is: true, then: Joi.required(), otherwise: Joi.optional() }),

    MQTT_CERT_PATH: Joi.string().when('ENABLE_MQTT', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
    MQTT_KEY_PATH: Joi.string().when('ENABLE_MQTT', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
    MQTT_CA_PATH: Joi.string().when('ENABLE_MQTT', { is: true, then: Joi.required(), otherwise: Joi.optional() }),

    CODING_STATION_UUID: Joi.string().when('ENABLE_MQTT', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
});
