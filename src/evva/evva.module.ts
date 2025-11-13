import { Module } from '@nestjs/common';
import { MqttModule } from '../mqtt/mqtt.module';
import { EvvaService } from './evva.service';
import { StateService } from './state.service';
import { EvvaController } from './evva.controller';
import { EvvaQueryService } from './evva-query.service';
import { EvvaAccessService } from './evva-access.service';
import { EvvaSmartphoneService } from './evva-smartphone.service';

@Module({
  imports: [MqttModule],
  providers: [
    EvvaService,
    StateService,
    EvvaQueryService,
    EvvaAccessService,
    EvvaSmartphoneService,
  ],
  controllers: [EvvaController],
  exports: [EvvaService, StateService],
})
export class EvvaModule {}
