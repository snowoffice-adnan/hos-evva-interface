import { MqttService } from './mqtt.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
