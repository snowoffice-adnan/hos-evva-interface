import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MqttModule } from './mqtt/mqtt.module';
import { EvvaModule } from './evva/evva.module';
import evvaConfig from './config/evva.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [evvaConfig],
    }),
    MqttModule,
    EvvaModule,
  ],
})
export class AppModule {}
